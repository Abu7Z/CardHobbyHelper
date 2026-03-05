import { sleep, rand, TabManager } from '../../core/Utils.bg.js';
import { LogSystem } from '../../core/BgEngine.js';

/**
 * 批量出价功能配置参数
 */
const CONFIG = {
    MIN_VIEW_TIME: 1000,   // 最小浏览时间（毫秒）
    MAX_VIEW_TIME: 2000,   // 最大浏览时间（毫秒）
    COOLDOWN_MIN: 2000,    // 任务间最小冷却时间（毫秒）
    COOLDOWN_MAX: 3000     // 任务间最大冷却时间（毫秒）
};

/**
 * 出价沙盒函数（必须在类外部定义）
 * 独立作用域，注入到详情页执行实际出价操作
 * @param {number} targetPrice - 目标出价金额
 */
async function executeDirectBidSandbox(targetPrice) {
    const localSleep = ms => new Promise(r => setTimeout(r, ms));
    try {
        let retries = 20;
        while (retries-- > 0) {
            if (document.getElementById('price') && typeof window.sendBid === 'function') break;
            await localSleep(500);
        }
        const priceInput = document.getElementById('price');
        if (!priceInput) return;

        priceInput.value = targetPrice;
        typeof window.sendPrice === 'function' ? window.sendPrice(priceInput) : priceInput.dispatchEvent(new Event('input', { bubbles: true }));

        await localSleep(500);
        window.sendBid();
        await localSleep(3000);
    } catch (e) {
    }
}

/**
 * 批量出价功能后台插槽
 * 管理出价任务队列，依次打开详情页执行出价
 */
export class BatchBidSlotBg {
    constructor() {
        this.bidQueue = [];         
        this.isRunning = false;     
        this.totalTasks = 0;
        this.completedTasks = 0;
        this.listTabId = null;
    }

    onMessage(req, sender, sendResponse) {
        if (req.action === "addToQueue") {
            if (sender.tab) this.listTabId = sender.tab.id;
            
            // 前端已保证绝对安全数量
            this.bidQueue.push(...req.tasks);
            this.totalTasks += req.tasks.length;
            
            if (!this.isRunning) this.processQueue();
            return true;
        }
        return false;
    }

    async processQueue() {
        if (this.bidQueue.length === 0) {
            this.isRunning = false;
            if (this.listTabId) {
                chrome.tabs.sendMessage(this.listTabId, { action: "biddingComplete" }).catch(() => {});
                this.listTabId = null;
                this.totalTasks = this.completedTasks = 0;
            }
            return;
        }
        
        this.isRunning = true;
        const task = this.bidQueue.shift();
        let tabId = null;

        if (this.listTabId) {
            chrome.tabs.sendMessage(this.listTabId, { 
                action: "biddingProgress", 
                current: this.completedTasks + 1, 
                total: this.totalTasks 
            }).catch(() => {});
        }

        try {
            const tab = await TabManager.createSecure(task.url, true);
            tabId = tab.id;
            
            await sleep(rand(CONFIG.MIN_VIEW_TIME, CONFIG.MAX_VIEW_TIME));
            
            await chrome.scripting.executeScript({
                target: { tabId },
                func: executeDirectBidSandbox,
                args: [task.price],
                world: 'MAIN' 
            });
            
            await sleep(3000); 
        } catch (error) {
            LogSystem.write('error', `批量出价打开标签页异常: ${error.message}`);
        } finally {
            this.completedTasks++;
            if (tabId) chrome.tabs.remove(tabId).catch(() => {});
            setTimeout(() => this.processQueue(), rand(CONFIG.COOLDOWN_MIN, CONFIG.COOLDOWN_MAX));
        }
    }
}