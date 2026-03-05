/**
 * 后台工具函数库
 * 提供通用工具方法与标签页管理功能
 */

/**
 * 延时等待
 * @param {number} ms - 等待毫秒数
 * @returns {Promise} Promise 对象
 */
export const sleep = ms => new Promise(r => setTimeout(r, ms));

/**
 * 生成指定范围内的随机整数
 * @param {number} min - 最小值（包含）
 * @param {number} max - 最大值（包含）
 * @returns {number} 随机整数
 */
export const rand = (min, max) => Math.floor(Math.random() * (max - min + 1)) + min;

/**
 * 从 URL 中提取卡片 ID
 * 优先匹配 id=xxx 或 /item/xxx 模式，否则取最长数字串
 * @param {string} url - 商品 URL
 * @returns {string|null} 卡片 ID
 */
export const extractCardId = url => url?.match(/(?:id=|\/item\/)(\d+)/)?.[1] || url?.match(/\d+/g)?.reduce((a, b) => a.length > b.length ? a : b);

/**
 * 标签页管理器
 * 提供安全的标签页创建与等待加载功能
 */
export class TabManager {
    /**
     * 等待标签页加载完成
     * @param {number} tabId - 标签页 ID
     * @param {number} timeoutMs - 超时时间（毫秒）
     * @returns {Promise} Promise 对象
     */
    static async waitForComplete(tabId, timeoutMs = 15000) {
        return new Promise((resolve) => {
            let isResolved = false;
            const finish = () => {
                if (isResolved) return;
                isResolved = true;
                clearTimeout(timeoutId);
                chrome.tabs.onUpdated.removeListener(listener);
                resolve();
            };
            const timeoutId = setTimeout(finish, timeoutMs);
            const listener = (tid, info) => { if (tid === tabId && info.status === 'complete') finish(); };
            chrome.tabs.onUpdated.addListener(listener);
            chrome.tabs.get(tabId).then(tab => { if (tab && tab.status === 'complete') finish(); }).catch(() => {});
        });
    }

    /**
     * 安全创建标签页并等待加载完成
     * @param {string} url - 目标 URL
     * @param {boolean} active - 是否激活标签页
     * @param {number} timeout - 超时时间（毫秒）
     * @returns {Promise<chrome.tabs.Tab>} 创建的标签页对象
     */
    static async createSecure(url, active = true, timeout = 15000) {
        const tab = await chrome.tabs.create({ url, active });
        await this.waitForComplete(tab.id, timeout);
        return tab;
    }
}