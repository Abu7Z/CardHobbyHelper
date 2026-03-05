/**
 * 压哨狙击功能内容脚本插槽
 * 在关注列表页添加狙击设置 UI，处理任务取消通知
 */
class SniperSlotContent {
    init() {
    }

    onMessage(req, sender, sendResponse) {
        if (req.action === "sniperCanceled") {
            this.handleSniperCanceled(req.data.url, req.data.reason);
        }
    }

    onDomUpdate() {
        const currentUrl = window.location.href.toLowerCase();
        
        if (currentUrl.includes('/market/followcard')) {
            if (currentUrl.includes('status=-1')) {
                document.querySelectorAll('.sniper-box-container').forEach(el => el.remove());
                return;
            }
            this.initSniperUI();
        }
    }

    /**
     * 初始化狙击 UI
     * 为关注列表中的每件商品添加狙击设置面板
     */
    async initSniperUI() {
        // 将异步获取操作提取到循环外部，全局仅查询 1 次
        const { sniperTasks = {} } = await chrome.storage.local.get('sniperTasks');

        document.querySelectorAll('.clearfix.kt-content-list').forEach(row => {
            const titleLink = row.querySelector('a.kt-title');
            const cols = row.querySelectorAll('.col-xs-2.text-center');
            if (!titleLink || cols.length < 3) return;

            const itemUrl = titleLink.href;
            const itemTitle = titleLink.innerText;
            const endTimeStr = (cols[1].innerText.match(/\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}/) || [""])[0];
            
            if (!endTimeStr) return;

            const existingPanel = row.querySelector('.sniper-box-container');

            if (row.dataset.sniperInjected === itemUrl && existingPanel) {
                return; 
            }

            if (existingPanel) {
                existingPanel.remove();
            }
            
            row.classList.remove('helper-card-melted');

            row.dataset.sniperInjected = itemUrl; 

            const sniperBox = document.createElement('div');
            sniperBox.className = 'sniper-box-container';
            sniperBox.innerHTML = `
                <div class="sniper-title">压哨狙击系统</div>
                <input type="number" class="sniper-price-input" placeholder="最高目标价" min="0.1" step="0.1">
                <button class="sniper-add-btn">🎯 锁定</button>
            `;

            const input = sniperBox.querySelector('.sniper-price-input');
            const btn = sniperBox.querySelector('.sniper-add-btn');

            const updateBtnState = (isLocked) => {
                btn.innerHTML = isLocked ? "❌ 取消" : "🎯 锁定";
                btn.dataset.status = isLocked ? "locked" : "ready";
                btn.classList.toggle('locked', isLocked);
                sniperBox.classList.toggle('locked', isLocked);
            };

            // 直接使用外部查好的总任务字典进行 O(1) 匹配
            const task = sniperTasks[itemUrl];
            if (task) input.value = task.price;
            updateBtnState(!!task);

            // 点击事件的回调仍然保留实时读取，以防用户在多个标签页中并发修改
            btn.addEventListener('click', async (e) => {
                e.stopPropagation();
                const { sniperTasks: tasks = {} } = await chrome.storage.local.get('sniperTasks');
                
                if (btn.dataset.status === "locked") {
                    delete tasks[itemUrl];
                    await chrome.storage.local.set({ sniperTasks: tasks });
                    updateBtnState(false);
                    input.value = ""; 
                    window.ContentEngine.showToast("🛑 狙击任务已成功手动取消！");
                    const targetId = window.CHH_Utils.extractCardId(itemUrl);
                    chrome.runtime.sendMessage({ action: "writeLog", type: "info", msg: `🛑 [手动取消] 已撤销对卡片 [${targetId}] 的压哨狙击任务。` });
                    chrome.runtime.sendMessage({ action: "cancelSniper", url: itemUrl }).catch(() => {});
                } else {
                    const price = parseFloat(input.value);
                    if (isNaN(price) || price <= 0) {
                        input.classList.add('shake-error');
                        setTimeout(() => input.classList.remove('shake-error'), 400);
                        return window.ContentEngine.showToast("⚠️ 请输入有效的最高狙击价格！");
                    }
                    if (!endTimeStr) return window.ContentEngine.showToast("❌ 无法提取截止时间！");

                    const newTask = { url: itemUrl, title: itemTitle, price, endTimeStr };
                    tasks[itemUrl] = newTask;
                    await chrome.storage.local.set({ sniperTasks: tasks });
                    
                    updateBtnState(true);
                    window.ContentEngine.showToast(`🎯 狙击任务已装填！<br><span style="font-size:14px;color:#FFC107;">将在 ${endTimeStr} 压哨执行 ￥${price}</span>`, true);
                    const targetId = window.CHH_Utils.extractCardId(itemUrl);
                    chrome.runtime.sendMessage({ action: "writeLog", type: "success", msg: `🎯 [手动锁定] 狙击卡片 [${targetId}]，最高限价 ￥${price}` });
                    chrome.runtime.sendMessage({ action: "scheduleSniper", task: newTask }).catch(() => {});
                }
            });
            
            cols[2].appendChild(sniperBox);
        });
    }

    /**
     * 处理狙击任务取消事件
     * 更新 UI 并显示提示消息
     * @param {string} targetUrl - 商品 URL
     * @param {string} reason - 取消原因
     */
    handleSniperCanceled(targetUrl, reason) {
        const targetId = window.CHH_Utils.extractCardId(targetUrl);
        if (!targetId) return;

        document.querySelectorAll('.clearfix.kt-content-list').forEach(row => {
            const link = row.querySelector('a.kt-title');
            if (link && link.href.includes(`id=${targetId}`)) {
                const btn = row.querySelector('.sniper-add-btn');
                const input = row.querySelector('.sniper-price-input');
                const box = row.querySelector('.sniper-box-container'); 
                
                if (btn) {
                    btn.innerHTML = "🎯 锁定";
                    btn.dataset.status = "ready";
                    btn.classList.remove('locked');
                }
                if (input) input.value = ""; 
                if (box) box.classList.remove('locked');

                if (reason === 'melted') {
                    window.ContentEngine.showToast(`💔 系统侦查：卡片溢价超50%，已替您自动【取消关注】！`, true);
                    row.classList.add('helper-card-melted'); 
                } else if (reason === 'overBudget') {
                    window.ContentEngine.showToast(`⚠️ 系统侦查：卡片超预算，已放弃狙击（保留关注）。`);
                } else {
                    window.ContentEngine.showToast(`🛑 狙击任务已成功手动取消！`);
                }
            }
        });
    }
}
window.SniperSlotContent = SniperSlotContent;