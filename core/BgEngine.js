import { TabManager } from './Utils.bg.js';

/**
 * 日志系统
 * 采用队列机制异步写入，防止频繁写入 storage 导致性能问题
 * 最多保留 200 条最新日志
 */
export class LogSystem {
    static isWriting = false;  // 写入锁，防止并发写入冲突
    static queue = [];         // 日志待写入队列

    /**
     * 记录日志
     * @param {string} type - 日志类型（success/error/info/warn）
     * @param {string} msg - 日志内容
     */
    static async write(type, msg) {
        const time = new Date().toLocaleTimeString('zh-CN', { hour12: false });
        this.queue.push({ time, type, msg });
        console.log(`%c[${type.toUpperCase()}] ${msg}`, `color: ${type==='error'?'#f44336':type==='success'?'#00E676':'#FF9800'}`);
        this.processQueue();
    }

    /**
     * 处理日志队列（异步批量写入）
     * 自动循环直到队列为空
     */
    static async processQueue() {
        if (this.isWriting || this.queue.length === 0) return;
        this.isWriting = true;
        try {
            const { appLogs = [] } = await chrome.storage.local.get('appLogs');
            while (this.queue.length > 0) appLogs.unshift(this.queue.shift());
            if (appLogs.length > 200) appLogs.length = 200; 
            await chrome.storage.local.set({ appLogs });
        } catch (e) {
            console.error("日志写入异常:", e);
        } finally {
            this.isWriting = false;
            if (this.queue.length > 0) this.processQueue();
        }
    }
}

/**
 * Background 后台服务引擎
 * 采用插槽模式管理各功能模块，统一处理消息分发
 */
export class BackgroundEngine {
    constructor() {
        this.slots = [];  // 已注册的功能插槽列表
    }

    /**
     * 注册功能插槽
     * @param {Object} slotInstance - 插槽实例，需实现 init/onMessage 方法
     * @returns {BackgroundEngine} 引擎实例（支持链式调用）
     */
    register(slotInstance) {
        this.slots.push(slotInstance);
        if (typeof slotInstance.init === 'function') slotInstance.init();
        return this;
    }

    /**
     * 启动后台引擎
     * 注册全局消息监听器，分发消息到各插槽
     */
    start() {
        chrome.runtime.onMessage.addListener((req, sender, sendResponse) => {
            if (req.action === "writeLog") {
                LogSystem.write(req.type, req.msg);
                return false;
            }
            let isAsync = false;
            for (const slot of this.slots) {
                if (typeof slot.onMessage === 'function') {
                    if (slot.onMessage(req, sender, sendResponse)) isAsync = true;
                }
            }
            return isAsync;
        });

        LogSystem.write('success', '🚀 [系统架构] Background 基座启动，插槽挂载完毕。');
    }
}