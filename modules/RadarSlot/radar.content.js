/**
 * 雷达功能内容脚本插槽
 * 负责商品列表页的关键词筛选、关注按钮渲染与关注列表同步
 */
class RadarSlotContent {
    constructor() {
        this.config = { enabled: false, keywords: "0次" };  // 雷达配置：开关与关键词
        this.followedItemIds = new Set();                     // 已关注商品 ID 集合
        this.isSyncing = false;                                // 关注列表同步锁
        this.toastTimer = null;                                // Toast 防抖计时器
        this.lastSyncTime = 0;                                 // 最后一次同步的时间戳
    }

    async init() {
        const res = await chrome.storage.local.get(['filterEnabled', 'keywords', 'followedItemIds']);
        this.config.enabled = res.filterEnabled || false;
        this.config.keywords = res.keywords ?? "0次";
        this.followedItemIds = new Set(res.followedItemIds || []);

        const path = window.location.pathname;
        const isListPage = path.includes('/market') && !path.includes('/item');

        if (isListPage) {
            this.autoSyncFollowList();
            document.addEventListener('visibilitychange', () => {
                if (document.visibilityState === 'visible') this.autoSyncFollowList();
            });
        }
    }

    onMessage(req, sender, sendResponse) {
        if (req.action === "updateConfig") {
            this.config = req.config;
            this.renderRadar();
        } else if (req.action === "refreshFollowUI") {
            chrome.storage.local.get('followedItemIds').then(res => {
                this.followedItemIds = new Set(res.followedItemIds || []);
                document.querySelectorAll('.helper-follow-btn').forEach(btn => btn.remove());
                this.renderRadar();
            });
        } else if (req.action === "forceSyncFollow") {
            this.autoSyncFollowList(true);
            window.ContentEngine.showToast('📡 接收到控制台指令，正在手动校准雷达...');
        }
    }

    onDomUpdate() {
        this.renderRadar();
    }

    /**
     * 渲染雷达筛选 UI
     * 解析关键词、筛选卡片、添加关注按钮、显示结果统计
     * 支持语法：+必须包含 -必须排除 空格=或
     */
    renderRadar() {
        const safeKeywords = this.config.keywords.replace(/＋/g, '+').replace(/－/g, '-').toLowerCase();
        const rawKeywords = safeKeywords.split(/\s+/).filter(Boolean);
        const isActive = this.config.enabled && rawKeywords.length > 0;

        const mustHave = rawKeywords.filter(k => k.startsWith('+')).map(k => k.slice(1)).filter(Boolean);
        const mustNotHave = rawKeywords.filter(k => k.startsWith('-')).map(k => k.slice(1)).filter(Boolean);
        const shouldHave = rawKeywords.filter(k => !k.startsWith('+') && !k.startsWith('-'));

        const items = document.querySelectorAll('.el-card.card-block');
        let targetCount = 0;

        items.forEach(item => {
            const itemUrl = item.querySelector('a')?.href;
            if (!itemUrl) return;

            if (item.style.position !== 'relative') {
                item.style.position = 'relative';
            }

            const existingFollowBtn = item.querySelector('.helper-follow-btn');
            if (existingFollowBtn && existingFollowBtn.dataset.url !== itemUrl) {
                existingFollowBtn.remove();
            }
            if (!item.querySelector('.helper-follow-btn')) {
                this.addFollowButton(item, itemUrl);
            }

            if (!isActive) {
                item.classList.remove('helper-card-inactive', 'helper-card-active');
            } else {
                const text = item.innerText.toLowerCase();
                let isMatch = true;

                if (mustNotHave.length > 0 && mustNotHave.some(word => text.includes(word))) {
                    isMatch = false;
                } else if (mustHave.length > 0 && mustHave.some(word => !text.includes(word))) {
                    isMatch = false;
                } else if (shouldHave.length > 0 && !shouldHave.some(word => text.includes(word))) {
                    isMatch = false;
                }

                if (!isMatch) {
                    item.classList.add('helper-card-inactive');
                    item.classList.remove('helper-card-active');
                } else {
                    item.classList.add('helper-card-active');
                    item.classList.remove('helper-card-inactive');
                    targetCount++;
                }
            }
        });

        if (isActive && items.length > 0) {
            if (this.toastTimer) clearTimeout(this.toastTimer);
            this.toastTimer = setTimeout(() => {
                window.ContentEngine.showToast(`📡 雷达扫描完毕：发现 <b style="color:#00E676;font-size:18px;margin:0 4px;">${targetCount}</b> 件目标卡片`);
            }, 500);
        }
    }

    /**
     * 添加关注/取消关注按钮
     * @param {HTMLElement} parent - 父容器元素
     * @param {string} url - 商品 URL
     */
    addFollowButton(parent, url) {
        const itemId = window.CHH_Utils.extractCardId(url);
        if (!itemId) return;

        const isFollowed = this.followedItemIds.has(itemId);
        const btn = document.createElement('div');
        Object.assign(btn, {
            className: `helper-follow-btn ${isFollowed ? 'success' : ''}`,
            innerHTML: isFollowed ? '✅ 已关注' : '❤️ 关注'
        });
        btn.dataset.url = url;

        btn.addEventListener('mouseenter', () => {
            if (isFollowed && !btn.classList.contains('processing')) {
                btn.innerHTML = '❌ 取消';
                btn.style.background = '#d32f2f';
                btn.style.borderColor = 'transparent';
            }
        });

        btn.addEventListener('mouseleave', () => {
            if (isFollowed && !btn.classList.contains('processing')) {
                btn.innerHTML = '✅ 已关注';
                btn.style.background = '';
                btn.style.borderColor = 'rgba(255,255,255,0.4)';
            }
        });

        btn.addEventListener('click', (e) => {
            e.stopPropagation(); e.preventDefault();
            if (btn.classList.contains('processing')) return;
            btn.classList.add('processing');

            if (isFollowed) {
                btn.innerHTML = '⏳ 取消中...';
                chrome.runtime.sendMessage({ action: "unfollowCard", itemId, url }).catch(() => { });
                setTimeout(() => {
                    this.followedItemIds.delete(itemId);
                    chrome.storage.local.set({ followedItemIds: Array.from(this.followedItemIds) });
                    btn.innerHTML = '❤️ 关注';
                    btn.classList.remove('processing', 'success');
                    window.ContentEngine.showToast('💔 已解除关注');
                }, 1200);
            } else {
                btn.innerHTML = '⏳ 关注中...';
                chrome.runtime.sendMessage({ action: "followCard", itemId, url }).catch(() => { });
                setTimeout(() => {
                    this.followedItemIds.add(itemId);
                    chrome.storage.local.set({ followedItemIds: Array.from(this.followedItemIds) });
                    btn.innerHTML = '✅ 已关注';
                    btn.classList.remove('processing');
                    btn.classList.add('success');
                    window.ContentEngine.showToast('❤️ 已成功关注');
                }, 1200);
            }
        });
        parent.appendChild(btn);
    }

    /**
     * 自动同步关注列表
     * 拉取关注页面解析已关注 ID，更新本地缓存
     */
    async autoSyncFollowList(force = false) {
        if (this.isSyncing) return;

        // 增加 30 秒缓存节流，防封控（除非是控制台手动强制同步）
        if (!force && Date.now() - this.lastSyncTime < 30000) {
            return;
        }

        this.isSyncing = true;
        try {
            const response = await fetch('/market/followcard');
            this.lastSyncTime = Date.now();
            const html = await response.text();

            const regex = /deleteatt\((\d+)/g;
            const ids = new Set();
            let match;
            while ((match = regex.exec(html)) !== null) ids.add(match[1]);

            const idArray = Array.from(ids);
            this.followedItemIds = new Set(idArray);
            await chrome.storage.local.set({ followedItemIds: idArray });

            if (this.config.enabled) {
                document.querySelectorAll('.helper-follow-btn').forEach(btn => btn.remove());
                this.renderRadar();
            }
            chrome.runtime.sendMessage({ action: "writeLog", type: 'success', msg: `🔄 [关注雷达] 关注库已静默校准，当前关注库共 ${idArray.length} 件。` });
        } catch (err) {
            chrome.runtime.sendMessage({ action: "writeLog", type: 'error', msg: `❌ [网络波动] 关注雷达拉取关注失败。` });
        } finally {
            setTimeout(() => { this.isSyncing = false; }, 1000);
        }
    }
}
window.RadarSlotContent = RadarSlotContent;