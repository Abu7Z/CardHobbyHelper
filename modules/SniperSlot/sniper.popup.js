/**
 * 压哨狙击功能 Popup 面板插槽
 * 提供全局开关与任务统计显示
 */
export class SniperSlotPopup {
    render() {
        this.el = document.createElement('div');
        this.el.className = 'control-group sniper-slot-group';
        this.el.innerHTML = `
            <div class="switch-row">
              <span class="switch-label">🎯 全局狙击总开关</span>
              <label class="ios-switch">
                <input type="checkbox" class="sniper-enabled" checked>
                <span class="slider"></span>
              </label>
            </div>
            <div class="hint" style="margin-top: 10px; padding-top: 10px; border-top: 1px dashed #eee;">
              <div style="display: flex; justify-content: space-between; margin-bottom: 6px;">
                <span>当前埋伏任务:</span>
                <span class="sniper-count" style="font-weight: bold; color: #d32f2f;">0 件</span>
              </div>
              <div style="display: flex; justify-content: space-between;">
                <span>最早开火时间:</span>
                <span class="sniper-earliest" style="font-weight: bold; color: #555;">暂无任务</span>
              </div>
            </div>
        `;
        return this.el;
    }

    async init() {
        this.checkbox = this.el.querySelector('.sniper-enabled');
        this.countEl = this.el.querySelector('.sniper-count');
        this.earliestEl = this.el.querySelector('.sniper-earliest');

        const res = await chrome.storage.local.get(['sniperEnabled', 'sniperTasks']);
        this.checkbox.checked = res.sniperEnabled ?? true;
        this.updateSniperStats(res.sniperTasks || {});

        this.checkbox.addEventListener('change', async () => {
            const isEnabled = this.checkbox.checked;
            await chrome.storage.local.set({ sniperEnabled: isEnabled });
            chrome.runtime.sendMessage({ action: "toggleGlobalSniper", enabled: isEnabled }).catch(() => {});
        });

        setInterval(async () => {
            const { sniperTasks } = await chrome.storage.local.get('sniperTasks');
            this.updateSniperStats(sniperTasks || {});
        }, 1000);
    }

    /**
     * 更新狙击任务统计信息
     * @param {Object} tasksObj - 任务对象
     */
    updateSniperStats(tasksObj) {
        const tasks = Object.values(tasksObj);
        this.countEl.innerText = `${tasks.length} 件`;
        if (tasks.length > 0) {
            const sorted = tasks.sort((a, b) => new Date(a.endTimeStr.replace(/-/g, '/')) - new Date(b.endTimeStr.replace(/-/g, '/')));
            this.earliestEl.innerText = sorted[0].endTimeStr;
            this.earliestEl.style.color = '#d32f2f';
        } else {
            this.earliestEl.innerText = '暂无排队任务';
            this.earliestEl.style.color = '#999';
        }
    }
}