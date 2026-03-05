import { sleep, rand, TabManager, extractCardId } from '../../core/Utils.bg.js';
import { LogSystem } from '../../core/BgEngine.js';

/**
 * 压哨狙击功能配置参数
 */
const CONFIG = {
    SNIPER_WAKEUP_AHEAD_MS: 45000,  // 提前唤醒时间（毫秒）
    SNIPER_WAKEUP_RANDOM_MS: 5000,   // 唤醒时间随机偏移（毫秒）
    SNIPER_TRIGGER_SEC_MIN: 3,       // 最小触发倒计时（秒）
    SNIPER_TRIGGER_SEC_MAX: 4,       // 最大触发倒计时（秒）
    SNIPER_FIRE_DELAY_MS: 150        // 出价前延迟（毫秒）
};

/**
 * 全局侦查沙盒函数（必须在类外部定义）
 * 潜入关注列表页，扫描当前价格，判断是否熔断或超预算
 * @param {Object} tasksObj - 狙击任务对象
 * @returns {Array} 被取消的任务列表
 */
function performGlobalScoutingSandbox(tasksObj) {
    const canceledItems = [];
    document.querySelectorAll('.clearfix.kt-content-list').forEach(row => {
        const currentId = row.querySelector('a.kt-title')?.href?.match(/id=(\d+)/)?.[1];
        if (!currentId) return;

        const matchedUrl = Object.keys(tasksObj).find(t => t.includes(`id=${currentId}`));
        if (!matchedUrl) return;

        const matchedTask = tasksObj[matchedUrl];
        const priceCol = row.querySelectorAll('.col-xs-2.text-center')[0];
        if (!priceCol) return;

        const priceMatch = priceCol.innerText.match(/￥\s*([\d,]+\.?\d*)/);
        if (!priceMatch) return;

        const currentPrice = parseFloat(priceMatch[1].replace(/,/g, ''));

        if (currentPrice > matchedTask.price * 1.5) {
            canceledItems.push({ url: matchedUrl, reason: 'melted', price: currentPrice });
            const unfollowBtn = row.querySelector('a.kt-hrborder[onclick^="deleteatt"]');
            if (unfollowBtn) {
                const originalConfirm = window.confirm;
                window.confirm = () => true;
                try { unfollowBtn.click(); } catch (e) { }
                finally { window.confirm = originalConfirm; }
            }
        } else if (currentPrice > matchedTask.price) {
            canceledItems.push({ url: matchedUrl, reason: 'overBudget', price: currentPrice });
        }
    });
    return canceledItems;
}

/**
 * 绝杀出价沙盒函数（必须在类外部定义）
 * 潜入详情页，监控倒计时，在最后几秒钟压哨出价
 * @param {number} targetPrice - 目标出价
 * @param {Object} cfg - 配置参数
 * @returns {Object} 执行结果状态
 */
async function executeSniperBidSandbox(targetPrice, cfg) {
    const log = (msg, isErr = false) => console.log(`%c[压哨猎手] ${msg}`, `color: ${isErr ? '#f44336' : '#FF9800'}; background: #222; padding: 4px 8px; border-radius: 4px;`);
    const localSleep = ms => new Promise(r => setTimeout(r, ms));

    try {
        let retries = 30;
        while (retries-- > 0) {
            if (document.querySelector('.countdown') && document.getElementById('price') && typeof window.sendBid === 'function') break;
            await localSleep(500);
        }

        const priceInput = document.getElementById('price');
        if (!priceInput) throw new Error("DOM 未就绪");

        let initialPrice = 0;
        const currentPriceEl = document.getElementById('currentPrice');
        if (currentPriceEl && currentPriceEl.innerText) {
            initialPrice = parseFloat(currentPriceEl.innerText.replace(/,/g, ''));
        }

        const minBid = parseFloat(priceInput.getAttribute('min')) || 0;
        if (initialPrice === 0 || minBid > initialPrice) {
            initialPrice = minBid;
        }

        if (initialPrice > 0) {
            if (initialPrice > targetPrice * 1.5) {
                log(`🛑 初始侦查熔断！当前价已达 ¥${initialPrice}`, true);
                return { status: 'canceled', reason: 'melted' };
            }
            if (initialPrice > targetPrice) {
                log(`🛑 初始侦查超预算！当前价已达 ¥${initialPrice}`, true);
                return { status: 'canceled', reason: 'overBudget' };
            }
        }

        const triggerSecond = Math.floor(Math.random() * (cfg.maxSec - cfg.minSec + 1)) + cfg.minSec;
        const checkSecond = triggerSecond + Math.floor(Math.random() * 2) + 2;

        log(`🎯 潜伏中... 将在剩余 [ ${checkSecond} ] 秒时进行最终价格核准，并在 [ ${triggerSecond} ] 秒时拔枪`);

        return new Promise((resolve) => {
            let hasSeenValidTime = false;
            let missingCount = 0;
            let hasCheckedPrice = false;

            const timer = setInterval(() => {
                const els = document.querySelectorAll('.countdown strong');
                if (els.length >= 4) {
                    missingCount = 0;
                    const d = parseInt(els[0].innerText, 10);
                    const h = parseInt(els[1].innerText, 10);
                    const m = parseInt(els[2].innerText, 10);
                    const s = parseInt(els[3].innerText, 10);

                    if (isNaN(d) || isNaN(h) || isNaN(m) || isNaN(s)) return;

                    const totalSeconds = d * 86400 + h * 3600 + m * 60 + s;
                    if (totalSeconds > 10) hasSeenValidTime = true;

                    if (hasSeenValidTime) {
                        if (totalSeconds <= checkSecond && totalSeconds > triggerSecond && !hasCheckedPrice) {
                            hasCheckedPrice = true;

                            let finalPrice = 0;
                            const finalPriceEl = document.getElementById('currentPrice');
                            if (finalPriceEl && finalPriceEl.innerText) {
                                finalPrice = parseFloat(finalPriceEl.innerText.replace(/,/g, ''));
                            }
                            const currentMinBid = parseFloat(priceInput.getAttribute('min')) || 0;
                            if (finalPrice === 0 || currentMinBid > finalPrice) {
                                finalPrice = currentMinBid;
                            }

                            if (finalPrice > 0) {
                                if (finalPrice > targetPrice * 1.5) {
                                    clearInterval(timer);
                                    log(`🚨 战术撤退！潜伏期现价突变至 ¥${finalPrice}，触发熔断`, true);
                                    return resolve({ status: 'canceled', reason: 'melted' });
                                }
                                if (finalPrice > targetPrice) {
                                    clearInterval(timer);
                                    log(`🚨 战术撤退！潜伏期现价 ¥${finalPrice} 已超预算，放弃开火`, true);
                                    return resolve({ status: 'canceled', reason: 'overBudget' });
                                }
                            }
                            log(`✅ 战前校验通过！当前价 ¥${finalPrice}，弹药装填完毕...`);
                        }

                        if (totalSeconds <= triggerSecond && totalSeconds > 0) {
                            clearInterval(timer);
                            log(`💥 压哨点到达！目标价 ¥${targetPrice} 瞬间开火！`);

                            priceInput.value = targetPrice;
                            typeof window.sendPrice === 'function' ? window.sendPrice(priceInput) : priceInput.dispatchEvent(new Event('input', { bubbles: true }));

                            setTimeout(() => { if (typeof window.sendBid === 'function') window.sendBid(); }, cfg.delayMs);
                            setTimeout(() => resolve({ status: 'success' }), 5000);
                        } else if (totalSeconds <= 0) {
                            clearInterval(timer);
                            resolve({ status: 'ended' });
                        }
                    }
                } else if (hasSeenValidTime && ++missingCount > 60) {
                    clearInterval(timer);
                    log(`⚠️ 倒计时元素丢失，判定结束！`, true);
                    resolve({ status: 'ended' });
                }
            }, 50);

            setTimeout(() => {
                clearInterval(timer);
                log(`🚨 执行超时，触发强制回收！`, true);
                resolve({ status: 'timeout' });
            }, 90000);
        });
    } catch (e) { return { status: 'error', reason: e.message }; }
}

/**
 * 压哨狙击功能后台插槽
 * 使用 chrome.alarms 定时唤醒，战前侦查，详情页压哨出价
 */
export class SniperSlotBg {
    constructor() {
        this.isGlobalScouting = false;  // 全局侦查进行中标志
    }

    init() {
        chrome.alarms.onAlarm.addListener((alarm) => this.handleAlarm(alarm));
        this.restoreSniperAlarms();
    }

    onMessage(req, sender, sendResponse) {
        if (req.action === "scheduleSniper") {
            this.scheduleSniperTask(req.task);
            return true;
        } else if (req.action === "cancelSniper") {
            chrome.alarms.clear(`sniper_${req.url}`);
            this.broadcastToTabs("sniperCanceled", { url: req.url, reason: 'manual' });
            return true;
        } else if (req.action === "toggleGlobalSniper") {
            if (req.enabled) {
                this.restoreSniperAlarms();
            } else {
                chrome.alarms.getAll(alarms => {
                    alarms.forEach(a => { if (a.name.startsWith('sniper_')) chrome.alarms.clear(a.name); });
                });
                LogSystem.write('warn', '🛑 [总控拦截] 全局狙击总开关已关闭，所有后台排队闹钟已被销毁！');
            }
            return true;
        }
        return false;
    }

    /**
     * 向关注列表页广播消息
     * @param {string} action - 消息动作
     * @param {Object} data - 消息数据
     */
    async broadcastToTabs(action, data) {
        const tabs = await chrome.tabs.query({ url: "*://*.cardhobby.com.cn/market/followcard*" });
        tabs.forEach(tab => chrome.tabs.sendMessage(tab.id, { action, data }).catch(() => { }));
    }

    /**
     * 恢复保存的狙击任务闹钟
     * 扩展重启后重新设置定时器
     */
    async restoreSniperAlarms() {
        const { sniperTasks = {}, sniperEnabled = true } = await chrome.storage.local.get(['sniperTasks', 'sniperEnabled']);
        if (!sniperEnabled) return;

        let needSave = false;
        const now = Date.now();

        for (const [url, task] of Object.entries(sniperTasks)) {
            const endT = new Date(task.endTimeStr.replace(/-/g, '/')).getTime();
            if (endT <= now) {
                delete sniperTasks[url];
                needSave = true;
            } else {
                this.scheduleSniperTask(task);
            }
        }
        if (needSave) await chrome.storage.local.set({ sniperTasks });
    }

    /**
     * 安排单个狙击任务
     * @param {Object} task - 任务对象
     */
    async scheduleSniperTask(task) {
        const { sniperEnabled = true } = await chrome.storage.local.get('sniperEnabled');
        if (!sniperEnabled) return;

        const endT = new Date(task.endTimeStr.replace(/-/g, '/')).getTime();
        if (endT <= Date.now()) return;
        let alarmTime = endT - CONFIG.SNIPER_WAKEUP_AHEAD_MS + rand(-CONFIG.SNIPER_WAKEUP_RANDOM_MS, CONFIG.SNIPER_WAKEUP_RANDOM_MS);
        if (alarmTime < Date.now()) alarmTime = Date.now() + 2000;
        chrome.alarms.create(`sniper_${task.url}`, { when: alarmTime });
        const targetId = extractCardId(task.url) || '未知';
        LogSystem.write('info', `🎯 [狙击装填] 卡片 [${targetId}] 将在 ${task.endTimeStr} 执行，目标价 ￥${task.price}`);
    }

    /**
     * 处理闹钟唤醒事件
     * @param {Object} alarm - 闹钟对象
     */
    async handleAlarm(alarm) {
        if (!alarm.name.startsWith('sniper_')) return;

        const { sniperEnabled = true } = await chrome.storage.local.get('sniperEnabled');
        if (!sniperEnabled) {
            LogSystem.write('error', `🛑 [唤醒拦截] 全局狙击已关闭，拦截非法唤醒任务: ${alarm.name}`);
            return;
        }

        const targetUrl = alarm.name.replace('sniper_', '');
        LogSystem.write('info', `⏰ [压哨唤醒] 时间到！正在对卡片 [${extractCardId(targetUrl) || '未知'}] 展开战前侦查...`);

        await this.performGlobalScouting();
        await this.executeFinalStrike(targetUrl);
    }

    /**
     * 执行全局侦查
     * 扫描关注列表，取消超预算或熔断的任务
     */
    async performGlobalScouting() {
        // 1. 检查锁：如果有其他任务正在侦查，则跳过本次侦查
        if (this.isGlobalScouting) return;

        // 2. 立即同步加锁，杜绝并发竞争
        this.isGlobalScouting = true;

        let tabId = null;
        let isTempTab = false;

        try {
            // 获取任务的异步操作放在加锁之后
            const { sniperTasks = {} } = await chrome.storage.local.get('sniperTasks');
            // 注意：因为已经加锁，即使这里 return，也会执行 finally 释放锁
            if (Object.keys(sniperTasks).length === 0) return;

            const tabs = await chrome.tabs.query({ url: "*://*.cardhobby.com.cn/market/followcard*" });
            if (tabs.length > 0) {
                tabId = tabs[0].id;
                await chrome.tabs.reload(tabId);
                await TabManager.waitForComplete(tabId, 8000);
            } else {
                const tab = await TabManager.createSecure("https://www.cardhobby.com.cn/market/followcard", false);
                tabId = tab.id;
                isTempTab = true;
            }

            await sleep(1500);

            const scoutResults = await chrome.scripting.executeScript({
                target: { tabId },
                args: [sniperTasks],
                world: 'MAIN',
                func: performGlobalScoutingSandbox
            });

            const canceledItems = scoutResults[0]?.result || [];
            if (canceledItems.length > 0) {
                for (const item of canceledItems) {
                    delete sniperTasks[item.url];
                    chrome.alarms.clear(`sniper_${item.url}`);
                    this.broadcastToTabs("sniperCanceled", { url: item.url, reason: item.reason });
                    const targetId = extractCardId(item.url) || '未知';
                    if (item.reason === 'melted') {
                        LogSystem.write('error', `💔 [侦查熔断] 卡片 [${targetId}] 现价 ￥${item.price} 溢价超1.5倍，已放弃并取消关注！`);
                    } else {
                        LogSystem.write('warn', `⚠️ [预算不足] 卡片 [${targetId}] 现价 ￥${item.price} 超出目标价，已自动放弃本次狙击。`);
                    }
                }
                await chrome.storage.local.set({ sniperTasks });
            }
        } finally {
            // 3. 确保任何情况下（抛出异常、早期 return），锁和临时标签页都会被清理
            if (isTempTab && tabId) chrome.tabs.remove(tabId).catch(() => { });
            this.isGlobalScouting = false;
        }
    }

    /**
     * 执行最终绝杀
     * 打开详情页，注入沙盒脚本等待倒计时出价
     * @param {string} targetUrl - 目标商品 URL
     */
    async executeFinalStrike(targetUrl) {
        const { sniperTasks = {} } = await chrome.storage.local.get('sniperTasks');
        const task = sniperTasks[targetUrl];

        if (!task) {
            LogSystem.write('warn', `🛑 [战术终止] 目标已在侦查中被剔除，终止详情页绝杀进程！`);
            return;
        }

        LogSystem.write('info', `🚀 [开启冲锋] 侦查通过，正在对卡片 [${extractCardId(targetUrl) || '未知'}] 执行沙盒绝杀注入...`);
        let tabId = null;
        const sniperCfg = {
            minSec: CONFIG.SNIPER_TRIGGER_SEC_MIN,
            maxSec: CONFIG.SNIPER_TRIGGER_SEC_MAX,
            delayMs: CONFIG.SNIPER_FIRE_DELAY_MS
        };

        try {
            const tab = await TabManager.createSecure(targetUrl, true);
            tabId = tab.id;

            const injectionResults = await chrome.scripting.executeScript({
                target: { tabId },
                args: [task.price, sniperCfg],
                world: 'MAIN',
                func: executeSniperBidSandbox
            });

            const result = injectionResults[0]?.result;
            const targetId = extractCardId(targetUrl) || '未知';
            if (result) {
                if (result.status === 'success') {
                    LogSystem.write('success', `💥 [绝杀捷报] 卡片 [${targetId}] 压哨开火成功！已顺利提交出价。`);
                } else if (result.status === 'canceled') {
                    LogSystem.write('warn', `🛑 [沙盒拦截] 卡片 [${targetId}] 在最后关头因 [${result.reason === 'melted' ? '熔断' : '超预算'}] 放弃开火。`);
                    this.broadcastToTabs("sniperCanceled", { url: targetUrl, reason: result.reason });
                } else if (result.status === 'timeout' || result.status === 'error') {
                    LogSystem.write('error', `🚨 [执行异常] 卡片 [${targetId}] 压哨程序等待倒计时超时或出错。`);
                }
            }
            if (result && result.status === 'canceled') {
                this.broadcastToTabs("sniperCanceled", { url: targetUrl, reason: result.reason });
            }
        } catch (error) {
            if (!error.message?.includes("Frame with ID 0 was removed")) {
                console.error(`[狙击异常]`, error);
            }
        } finally {
            delete sniperTasks[targetUrl];
            await chrome.storage.local.set({ sniperTasks });
            if (tabId) setTimeout(() => chrome.tabs.remove(tabId).catch(() => { }), 8000);
        }
    }
}