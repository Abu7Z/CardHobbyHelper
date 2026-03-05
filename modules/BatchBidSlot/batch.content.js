/**
 * 批量出价功能内容脚本插槽
 * 为雷达筛选出的卡片添加复选框，提供批量出价控制面板
 */
class BatchBidSlotContent {
    constructor() {
        this.selectedItems = new Set();  // 已选中的商品 URL 集合
    }

    init() {
    }

    onMessage(req, sender, sendResponse) {
        if (req.action === "biddingProgress") {
            window.ContentEngine.showToast(`⏳ 幽灵手批量执行中... <br><span style="color:#00E676;font-size:24px;font-weight:900;">${req.current} / ${req.total}</span>`, true);
        } else if (req.action === "biddingComplete") {
            window.ContentEngine.showToast(`🎉 所有批量出价任务已圆满完成！`, false);
        } else if (req.action === "updateConfig") {
            if (!req.config.enabled) {
                this.selectedItems.clear();
                this.updatePanelUI();
            }
            requestAnimationFrame(() => {
                this.renderCheckboxes();
            });
        }
    }

    onDomUpdate() {
        this.renderCheckboxes();
    }

    /**
     * 渲染复选框 UI
     * 为雷达激活的卡片添加选择框
     */
    renderCheckboxes() {
        const items = document.querySelectorAll('.el-card.card-block');
        let hasActiveCards = false;

        items.forEach(item => {
            const itemUrl = item.querySelector('a')?.href;
            if (!itemUrl) return; 

            const isActive = item.classList.contains('helper-card-active');
            let existingCheckbox = item.querySelector('.helper-checkbox');

            if (existingCheckbox && existingCheckbox.dataset.url !== itemUrl) {
                existingCheckbox.remove();
                existingCheckbox = null;
            }

            if (!isActive) {
                if (existingCheckbox) existingCheckbox.remove();
                this.selectedItems.delete(itemUrl);
            } else {
                hasActiveCards = true;
                if (!existingCheckbox) {
                    const checkbox = document.createElement('input');
                    Object.assign(checkbox, { type: 'checkbox', className: 'helper-checkbox' });
                    checkbox.dataset.url = itemUrl; 
                    checkbox.checked = this.selectedItems.has(itemUrl);
                    
                    checkbox.addEventListener('change', (e) => {
                        e.stopPropagation();
                        
                        // 安全容量拦截
                        if (e.target.checked && this.selectedItems.size >= 18) {
                            e.target.checked = false; // 撤销本次勾选UI状态
                            return alert("⚠️ 单次最多只能勾选 18 件商品！\n请分批执行批量出价。");
                        }

                        e.target.checked ? this.selectedItems.add(itemUrl) : this.selectedItems.delete(itemUrl);
                        this.updatePanelUI();
                    });
                    checkbox.addEventListener('click', e => e.stopPropagation());
                    item.appendChild(checkbox);
                } else {
                    existingCheckbox.checked = this.selectedItems.has(itemUrl);
                }
            }
        });

        this.toggleControlPanel(hasActiveCards);
        this.updatePanelUI();
    }

    /**
     * 显示/隐藏批量出价控制面板
     * @param {boolean} show - 是否显示面板
     */
    toggleControlPanel(show) {
        let panel = document.getElementById('helper-panel');
        if (!panel) {
            panel = document.createElement('div');
            panel.id = 'helper-panel';
            panel.className = 'helper-panel';
            panel.innerHTML = `
                <div class="helper-panel-header">
                    <div class="helper-panel-title">⚡️ 猎手控制台</div>
                    <div class="helper-panel-toggle" title="收起/展开">−</div>
                </div>
                <div class="helper-panel-body">
                    <div class="helper-panel-info">已选中 <span id="helper-count">0</span> 件商品</div>
                    <div class="helper-panel-controls">
                        <div class="helper-price-wrapper">
                            <span class="currency">¥</span>
                            <input type="number" id="helper-price" value="2.11" min="0.1" step="0.1">
                        </div>
                        <button id="helper-btn">🚀 批量出价</button>
                    </div>
                </div>
            `;
            document.body.appendChild(panel);
            
            panel.querySelector('.helper-panel-toggle').addEventListener('click', (e) => {
                e.stopPropagation();
                panel.classList.toggle('collapsed');
            });
            panel.addEventListener('click', () => {
                if (panel.classList.contains('collapsed')) panel.classList.remove('collapsed');
            });

            panel.querySelector('#helper-btn').addEventListener('click', () => {
                const price = parseFloat(document.getElementById('helper-price').value);
                if (isNaN(price) || price <= 0) return alert("⚠️ 请输入有效的出价金额！");
                if (this.selectedItems.size === 0) return alert("⚠️ 请先勾选商品");
                
                if (confirm(`【最终确认】\n即将对 ${this.selectedItems.size} 件商品出价：¥${price}\n\n执行期间会为您自动切换页面，是否开始执行？`)) {
                    chrome.runtime.sendMessage({ action: "addToQueue", tasks: Array.from(this.selectedItems).map(url => ({url, price})) });
                    window.ContentEngine.showToast("🚀 任务启动...", true);
                    chrome.runtime.sendMessage({ action: "writeLog", type: "info", msg: `🚀 [批量出价] 已启动，统一目标价 ¥${price}` });
                    
                    this.selectedItems.clear();
                    document.querySelectorAll('.helper-checkbox').forEach(c => c.checked = false);
                    this.updatePanelUI();
                }
            });
        }
        panel.style.display = show ? "block" : "none";
    }

    /**
     * 更新面板选中数量显示
     */
    updatePanelUI() {
        const el = document.getElementById('helper-count');
        if (el) el.innerText = this.selectedItems.size;
    }
}
window.BatchBidSlotContent = BatchBidSlotContent;