/**
 * 系统通用功能插槽（Popup 面板）
 * 提供查看日志等系统级功能入口
 */
export class SystemSlotPopup {
    render() {
        this.el = document.createElement('div');
        this.el.innerHTML = `<button class="btn-dark view-logs-btn">📋 查看系统运行日志</button>`;
        return this.el;
    }

    async init() {
        this.btn = this.el.querySelector('.view-logs-btn');
        this.btn.addEventListener('click', () => {
            chrome.tabs.create({ url: 'logs/logs.html' });
        });
    }
}