/**
 * 雷达功能 Popup 面板插槽
 * 提供雷达开关、关键词输入与关注列表同步功能
 */
export class RadarSlotPopup {
    render() {
        this.el = document.createElement('div');
        this.el.className = 'control-group radar-slot-group';
        this.el.innerHTML = `
            <div class="switch-row">
              <span class="switch-label">🔥 启用雷达筛选</span>
              <label class="ios-switch">
                <input type="checkbox" class="filter-enabled">
                <span class="slider"></span>
              </label>
            </div>
            <label style="font-size: 12px; font-weight: bold; color: #555;">筛选关键词 (支持高级语法):</label>
            <input type="search" class="filter-keywords" placeholder="例：0次 +科比 +特卡 -评级">
            <div class="hint" style="background: #f8f9fa; padding: 8px; border-radius: 6px; margin-top: 6px; border: 1px dashed #e0e0e0;">
              <div style="margin-bottom: 4px; color: #666;">
                <b>语法：</b>空格=或 | <span style="color:#4CAF50;">+=且</span> | <span style="color:#d32f2f;">-=排除</span>
              </div>
              <div style="color: #333;">
                <b>例句：</b><code style="background: #e3f2fd; color: #1565c0; padding: 2px 4px; border-radius: 3px;">科比 +特卡 -评级</code><br>
              </div>
            </div>
            <div style="text-align: right; margin-top: 12px;">
                <span class="sync-follow-btn" title="雷达会在后台自动执行，除非网络异常，无需手动干预" style="font-size: 11px; color: #999; cursor: pointer; border-bottom: 1px dashed #ccc; padding-bottom: 1px; transition: color 0.2s;">⚡️ 关注列表同步已开启 (点击校准)</span>
            </div>
        `;
        return this.el;
    }

    async init(engine) {
        this.engine = engine;
        this.checkbox = this.el.querySelector('.filter-enabled');
        this.input = this.el.querySelector('.filter-keywords');
        this.syncBtn = this.el.querySelector('.sync-follow-btn');

        const res = await chrome.storage.local.get(['filterEnabled', 'keywords']);
        this.checkbox.checked = res.filterEnabled || false;
        this.input.value = res.keywords ?? "0次";
        this.updateUIStatus();

        const debounce = (func, wait) => {
            let timeout;
            return (...args) => { clearTimeout(timeout); timeout = setTimeout(() => func(...args), wait); };
        };
        this.checkbox.addEventListener('change', () => this.saveAndNotify());
        this.input.addEventListener('input', debounce(() => this.saveAndNotify(), 500));

        this.syncBtn.addEventListener('click', () => this.handleSync());
    }

    /**
     * 保存配置并通知内容脚本更新
     */
    async saveAndNotify() {
        const config = { enabled: this.checkbox.checked, keywords: this.input.value };
        await chrome.storage.local.set({ filterEnabled: config.enabled, keywords: config.keywords });
        this.updateUIStatus();

        const tabs = await chrome.tabs.query({ active: true, currentWindow: true });
        if (tabs[0]?.url?.includes("cardhobby.com.cn")) {
            chrome.tabs.sendMessage(tabs[0].id, { action: "updateConfig", config }).catch(() => { });
        }
    }

    /**
     * 更新 UI 状态显示
     */
    updateUIStatus() {
        if (this.checkbox.checked) {
            this.engine.updateStatus("雷达运行中...", "#00c853");
        } else {
            this.engine.updateStatus("雷达已关闭", "#999");
        }
    }

    /**
     * 手动触发关注列表同步
     */
    async handleSync() {
        const originalText = this.syncBtn.innerText;
        this.syncBtn.innerText = "⏳ 校准指令已发送...";
        this.syncBtn.style.color = "#FF9800";
        this.syncBtn.style.pointerEvents = "none";

        try {
            const tabs = await chrome.tabs.query({ active: true, currentWindow: true });
            if (tabs[0]?.url?.includes("cardhobby.com.cn")) {
                chrome.tabs.sendMessage(tabs[0].id, { action: "forceSyncFollow" }).catch(() => { });
                setTimeout(() => {
                    this.syncBtn.innerText = `✅ 数据已同步至最新`;
                    this.syncBtn.style.color = "#4CAF50";
                }, 500);
            } else {
                alert("请在卡淘页面下执行此操作！");
            }
        } catch (err) {
            this.syncBtn.innerText = "❌ 通信失败";
            this.syncBtn.style.color = "#f44336";
        } finally {
            setTimeout(() => {
                this.syncBtn.innerText = originalText;
                this.syncBtn.style.color = "#999";
                this.syncBtn.style.pointerEvents = "auto";
            }, 2000);
        }
    }
}