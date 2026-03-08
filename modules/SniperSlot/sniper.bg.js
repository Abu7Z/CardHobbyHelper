import { sleep, rand, TabManager, extractCardId } from '../../core/Utils.bg.js';
import { LogSystem } from '../../core/BgEngine.js';

/**
 * 压哨狙击核心配置
 */
const CONFIG = {
    SNIPER_WAKEUP_AHEAD_MS: 45000,  // 提前唤醒时间
    SNIPER_WAKEUP_RANDOM_MS: 5000,  // 随机漂移量（防风控）
    SNIPER_TRIGGER_SEC_MIN: 3,      // 最小触发倒计时
    SNIPER_TRIGGER_SEC_MAX: 4,      // 最大触发倒计时
    SNIPER_FIRE_DELAY_MS: 150       // 填价后开火延迟
};

/**
 * 战前侦查沙盒：执行预算核准与熔断判定
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
        const priceMatch = priceCol?.innerText.match(/￥\s*([\d,]+\.?\d*)/);
        if (!priceMatch) return;

        const currentPrice = parseFloat(priceMatch[1].replace(/,/g, ''));

        // 熔断逻辑：溢价超 1.5 倍则执行物理退订
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
 * 装填沙盒：获取实时倒计时初值并交还后台计时
 */
async function prepareSniperSandbox(targetPrice) {
    const localSleep = ms => new Promise(r => setTimeout(r, ms));
    let retries = 40; 
    while (retries-- > 0) {
        const els = document.querySelectorAll('.countdown strong');
        const priceInput = document.getElementById('price');
        if (els.length >= 4 && priceInput && typeof window.sendBid === 'function') {
            const d = parseInt(els[0].innerText, 10);
            const h = parseInt(els[1].innerText, 10);
            const m = parseInt(els[2].innerText, 10);
            const s = parseInt(els[3].innerText, 10);
            
            if (!isNaN(d) && !isNaN(h) && !isNaN(m) && !isNaN(s)) {
                const totalSeconds = d * 86400 + h * 3600 + m * 60 + s;
                if (totalSeconds > 0) {
                    let currentPrice = 0;
                    const cpEl = document.getElementById('currentPrice');
                    if (cpEl) currentPrice = parseFloat(cpEl.innerText.replace(/,/g, ''));
                    const minBid = parseFloat(priceInput.getAttribute('min')) || 0;
                    if (currentPrice === 0 || minBid > currentPrice) currentPrice = minBid;

                    if (currentPrice > targetPrice * 1.5) return { status: 'melted', currentPrice };
                    if (currentPrice > targetPrice) return { status: 'overBudget', currentPrice };

                    return { status: 'ready', remainingMs: totalSeconds * 1000 };
                }
            }
        }
        await localSleep(500);
    }
    return { status: 'timeout' };
}

/**
 * 绝杀沙盒：绕过页面渲染节流，强制执行瞬时出价
 */
async function fireSniperSandbox(targetPrice, delay) {
    try {
        const priceInput = document.getElementById('price');
        let finalPrice = 0;
        const cpEl = document.getElementById('currentPrice');
        if (cpEl) finalPrice = parseFloat(cpEl.innerText.replace(/,/g, ''));
        const currentMinBid = parseFloat(priceInput?.getAttribute('min')) || 0;
        if (finalPrice === 0 || currentMinBid > finalPrice) finalPrice = currentMinBid;

        if (finalPrice > targetPrice) return { status: 'canceled', reason: 'overBudget' };

        priceInput.value = targetPrice;
        typeof window.sendPrice === 'function' ? window.sendPrice(priceInput) : priceInput.dispatchEvent(new Event('input', { bubbles: true }));

        await new Promise(r => setTimeout(r, delay));
        if (typeof window.sendBid === 'function') window.sendBid();
        
        return { status: 'success' };
    } catch (e) {
        return { status: 'error', reason: e.message };
    }
}

export class SniperSlotBg {
    constructor() {
        this.scoutPromise = null; // 异步侦查锁
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
            if (!req.enabled) {
                chrome.alarms.getAll(alarms => {
                    alarms.forEach(a => { if (a.name.startsWith('sniper_')) chrome.alarms.clear(a.name); });
                });
                LogSystem.write('warn', '🛑 [总控拦截] 全局狙击总开关已关闭，清理所有待命闹钟。');
            } else {
                this.restoreSniperAlarms();
            }
            return true;
        }
        return false;
    }

    async broadcastToTabs(action, data) {
        const tabs = await chrome.tabs.query({ url: "*://*.cardhobby.com.cn/market/followcard*" });
        tabs.forEach(tab => chrome.tabs.sendMessage(tab.id, { action, data }).catch(() => { }));
    }

    async restoreSniperAlarms() {
        const { sniperTasks = {}, sniperEnabled = true } = await chrome.storage.local.get(['sniperTasks', 'sniperEnabled']);
        if (!sniperEnabled) return;

        let needSave = false;
        const now = Date.now();
        for (const [url, task] of Object.entries(sniperTasks)) {
            const endT = new Date(task.endTimeStr.replace(/-/g, '/') + ' GMT+0800').getTime();
            if (endT <= now) {
                delete sniperTasks[url];
                needSave = true;
            } else {
                this.scheduleSniperTask(task);
            }
        }
        if (needSave) await chrome.storage.local.set({ sniperTasks });
    }

    async scheduleSniperTask(task) {
        const endT = new Date(task.endTimeStr.replace(/-/g, '/') + ' GMT+0800').getTime();
        let alarmTime = endT - CONFIG.SNIPER_WAKEUP_AHEAD_MS + rand(-CONFIG.SNIPER_WAKEUP_RANDOM_MS, CONFIG.SNIPER_WAKEUP_RANDOM_MS);
        chrome.alarms.create(`sniper_${task.url}`, { when: Math.max(Date.now() + 2000, alarmTime) });
        LogSystem.write('info', `🎯 [狙击就绪] 卡片 [${extractCardId(task.url)}] 已锁定，计划开火价 ￥${task.price}`);
    }

    async handleAlarm(alarm) {
        if (!alarm.name.startsWith('sniper_')) return;
        const targetUrl = alarm.name.replace('sniper_', '');
        await this.performGlobalScouting();
        await this.executeFinalStrike(targetUrl);
    }

    /**
     * 高可用侦查：支持并发任务共享，动态 Origin 适配防止 404
     */
    async performGlobalScouting() {
        if (this.scoutPromise) {
            try { await this.scoutPromise; } catch (e) {}
            return;
        }

        this.scoutPromise = (async () => {
            let tabId = null;
            try {
                const { sniperTasks = {} } = await chrome.storage.local.get('sniperTasks');
                const taskUrls = Object.keys(sniperTasks);
                if (taskUrls.length === 0) return;

                // 动态提取 Origin 以确保 Cookie 域匹配，根治 404/登录失效问题
                const scoutUrl = `${new URL(taskUrls[0]).origin}/market/followcard`;
                const tab = await TabManager.createSecure(scoutUrl, false);
                tabId = tab.id;
                await sleep(1500);

                const results = await chrome.scripting.executeScript({
                    target: { tabId },
                    args: [sniperTasks],
                    world: 'MAIN',
                    func: performGlobalScoutingSandbox
                });

                const canceledItems = results[0]?.result || [];
                for (const item of canceledItems) {
                    delete sniperTasks[item.url];
                    chrome.alarms.clear(`sniper_${item.url}`);
                    this.broadcastToTabs("sniperCanceled", { url: item.url, reason: item.reason });
                    LogSystem.write(item.reason === 'melted' ? 'error' : 'warn', `🚫 [侦查拦截] 卡片 [${extractCardId(item.url)}] 已被剔除：${item.reason === 'melted' ? '熔断' : '超预算'}`);
                }
                await chrome.storage.local.set({ sniperTasks });
            } catch (err) {
                LogSystem.write('warn', `⚠️ [侦查受阻] 降级执行盲狙逻辑: ${err.message}`);
            } finally {
                if (tabId) chrome.tabs.remove(tabId).catch(() => { });
            }
        })();

        try { await this.scoutPromise; } finally { this.scoutPromise = null; }
    }

    /**
     * 时间轴剥离执行：后台控制精准计时，规避标签页降频节流
     */
    async executeFinalStrike(targetUrl) {
        // 1. 立即获取并锁定任务，防止并发
        const { sniperTasks = {} } = await chrome.storage.local.get('sniperTasks');
        const task = sniperTasks[targetUrl];
        if (!task) return;

        // 2. 立即从 storage 中移除，防止 SW 重启后 restoreSniperAlarms 重复调度
        delete sniperTasks[targetUrl];
        await chrome.storage.local.set({ sniperTasks });

        const targetId = extractCardId(targetUrl) || '未知';
        LogSystem.write('info', `🚀 [开启冲锋] 任务已出库并锁定，正在对卡片 [${targetId}] 执行沙盒装填...`);

        let tabId = null;
        try {
            const tab = await TabManager.createSecure(targetUrl, true);
            tabId = tab.id;

            // 阶段一：同步页面时间戳
            const prepResults = await chrome.scripting.executeScript({
                target: { tabId },
                args: [task.price],
                world: 'MAIN',
                func: prepareSniperSandbox
            });

            const prep = prepResults[0]?.result;
            if (prep?.status === 'ready') {
                const triggerSec = rand(CONFIG.SNIPER_TRIGGER_SEC_MIN, CONFIG.SNIPER_TRIGGER_SEC_MAX);
                const waitMs = prep.remainingMs - (triggerSec * 1000);

                LogSystem.write('info', `⏳ [高精度潜伏] 目标 [${extractCardId(targetUrl)}] 将在后台倒数 ${Math.max(0, waitMs/1000).toFixed(1)} 秒后拔枪...`);
                if (waitMs > 0) await sleep(waitMs);

                // 阶段二：瞬间注入开火（受后台 SW 保护，无视标签页状态）
                const fireResults = await chrome.scripting.executeScript({
                    target: { tabId },
                    args: [task.price, CONFIG.SNIPER_FIRE_DELAY_MS],
                    world: 'MAIN',
                    func: fireSniperSandbox
                });

                const res = fireResults[0]?.result;
                if (res?.status === 'success') LogSystem.write('success', `💥 [绝杀成功] 卡片 [${extractCardId(targetUrl)}] 已于最后 ${triggerSec} 秒完成出价！`);
            }
        } catch (err) {
            LogSystem.write('error', `🚨 [绝杀中断] 运行异常: ${err.message}`);
        } finally {
            if (tabId) setTimeout(() => chrome.tabs.remove(tabId).catch(() => { }), 8000);
        }
    }
}