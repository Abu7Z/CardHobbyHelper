/**
 * 日志查看页面脚本
 * 展示系统运行日志，支持清空操作与实时更新
 */
'use strict';

document.addEventListener('DOMContentLoaded', async () => {
    const logBox = document.getElementById('logBox');
    const clearBtn = document.getElementById('clearLogsBtn');

    /**
     * 渲染日志列表
     * 使用 DocumentFragment 优化大量日志的渲染性能
     */
    async function renderLogs() {
        try {
            const { appLogs = [] } = await chrome.storage.local.get('appLogs');
            logBox.innerHTML = '';
            
            if (appLogs.length === 0) {
                logBox.innerHTML = '<div class="empty-state">暂无运行日志，系统静默待命中...</div>';
                return;
            }

            const fragment = document.createDocumentFragment();
            appLogs.forEach(log => {
                const el = document.createElement('div');
                el.className = `log-item ${log.type}`;
                el.innerHTML = `
                    <div class="log-time">[${log.time}]</div>
                    <div class="log-msg">${log.msg}</div>
                `;
                fragment.appendChild(el);
            });
            
            logBox.appendChild(fragment);
        } catch (error) {
            logBox.innerHTML = '<div class="empty-state" style="color:#f44336;">读取日志失败，请重试</div>';
        }
    }

    clearBtn.addEventListener('click', async () => {
        if (confirm('确定要清空所有运行记录吗？清空后无法恢复。')) {
            await chrome.storage.local.set({ appLogs: [] });
            renderLogs();
        }
    });

    renderLogs();

    /**
     * 监听 storage 变化，实现日志热更新
     * 无需刷新页面即可显示新日志
     */
    chrome.storage.onChanged.addListener((changes, area) => {
        if (area === 'local' && changes.appLogs) {
            renderLogs();
        }
    });
});