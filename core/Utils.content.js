/**
 * 内容脚本工具函数库
 * 挂载到 window 对象供页面脚本调用
 */
window.CHH_Utils = {
    /**
     * 延时等待
     * @param {number} ms - 等待毫秒数
     * @returns {Promise} Promise 对象
     */
    sleep: ms => new Promise(r => setTimeout(r, ms)),
    
    /**
     * 生成指定范围内的随机整数
     * @param {number} min - 最小值（包含）
     * @param {number} max - 最大值（包含）
     * @returns {number} 随机整数
     */
    rand: (min, max) => Math.floor(Math.random() * (max - min + 1)) + min,
    
    /**
     * 从 URL 中提取卡片 ID
     * 优先匹配 id=xxx 或 /item/xxx 模式，否则取最长数字串
     * @param {string} url - 商品 URL
     * @returns {string|null} 卡片 ID
     */
    extractCardId: url => url?.match(/(?:id=|\/item\/)(\d+)/)?.[1] || url?.match(/\d+/g)?.reduce((a, b) => a.length > b.length ? a : b)
};