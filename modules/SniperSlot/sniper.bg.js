import { sleep, rand, TabManager, extractCardId } from '../../core/Utils.bg.js';
import { LogSystem } from '../../core/BgEngine.js';

/**
 * 压哨狙击核心配置
 */
const CONFIG = {
    // 绝杀阶段配置（严格控制在浏览器 Service Worker 30秒活跃生命周期内）
    SNIPER_WAKEUP_AHEAD_MS: 20000,  // 提前唤醒时间（毫秒）
    SNIPER_WAKEUP_RANDOM_MS: 2000,  // 唤醒时间的随机防风控漂移量（毫秒）
    
    // 侦查阶段配置（前置解耦，用于排雷与全局状态校验）
    SCOUT_WAKEUP_AHEAD_MS: 90000,   // 提前唤醒执行全局侦查时间（毫秒）
    SCOUT_WAKEUP_RANDOM_MS: 5000,   // 侦查闹钟的随机漂移量（毫秒）
    
    // 开火参数配置
    SNIPER_TRIGGER_SEC_MIN: 2,      // 最小触发倒计时（秒）
    SNIPER_TRIGGER_SEC_MAX: 3,      // 最大触发倒计时（秒）
    SNIPER_FIRE_DELAY_MS: 150       // 填入出价与提交动作间的 DOM 渲染延迟（毫秒）
};

/**
 * 战前侦查沙盒：执行预算核准与熔断判定
 * @param {Object} tasksObj - 当前所有待处理的狙击任务字典
 * @returns {Array} 被判定为无效需取消的任务列表
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

        // 熔断机制：当前价格超过目标价 1.5 倍，触发物理退订（取消关注）
        if (currentPrice > matchedTask.price * 1.5) {
            canceledItems.push({ url: matchedUrl, reason: 'melted', price: currentPrice });
            const unfollowBtn = row.querySelector('a.kt-hrborder[onclick^="deleteatt"]');
            if (unfollowBtn) {
                const originalConfirm = window.confirm;
                window.confirm = () => true;
                try { unfollowBtn.click(); } catch (e) { }
                finally { window.confirm = originalConfirm; }
            }
        } 
        // 越线机制：当前价格超出预算，仅放弃出价任务
        else if (currentPrice > matchedTask.price) {
            canceledItems.push({ url: matchedUrl, reason: 'overBudget', price: currentPrice });
        }
    });
    return canceledItems;
}

/**
 * 装填沙盒：获取页面实时倒计时与当前价格进行校验
 * @param {number} targetPrice - 目标最高出价
 * @returns {Object} 包含状态码与剩余时间的校验结果
 */
async function prepareSniperSandbox(targetPrice) {
    const localSleep = ms => new Promise(r => setTimeout(r, ms));
    let retries = 40; 
    
    // 轮询机制：等待 DOM 渲染完成，最长等待 20 秒 (40 * 500ms)
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

                    // 临近结标时的最终状态兜底校验
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
 * 绝杀沙盒：无视页面生命周期，执行瞬时出价指令
 * @param {number} targetPrice - 最终目标出价
 * @param {number} delay - 设值与提交间的缓冲时间
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

        // 模拟原生输入事件触发 Vue/React 视图更新
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
        this.scoutPromise = null; // 全局侦查异步锁，防并发执行
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
            // 清理任务对应的全生命周期闹钟
            chrome.alarms.clear(`scout_${req.url}`);
            chrome.alarms.clear(`sniper_${req.url}`);
            this.broadcastToTabs("sniperCanceled", { url: req.url, reason: 'manual' });
            return true;
        } else if (req.action === "toggleGlobalSniper") {
            if (!req.enabled) {
                chrome.alarms.getAll(alarms => {
                    alarms.forEach(a => { 
                        if (a.name.startsWith('sniper_') || a.name.startsWith('scout_')) {
                            chrome.alarms.clear(a.name); 
                        }
                    });
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

    /**
     * 注册任务调度闹钟（采取双闹钟解耦架构）
     * @param {Object} task - 目标狙击任务对象
     */
    async scheduleSniperTask(task) {
        const endT = new Date(task.endTimeStr.replace(/-/g, '/') + ' GMT+0800').getTime();
        
        // 调度 1：侦查闹钟（处理全局并发状态更新与熔断机制）
        let scoutTime = endT - CONFIG.SCOUT_WAKEUP_AHEAD_MS + rand(-CONFIG.SCOUT_WAKEUP_RANDOM_MS, CONFIG.SCOUT_WAKEUP_RANDOM_MS);
        chrome.alarms.create(`scout_${task.url}`, { when: Math.max(Date.now() + 2000, scoutTime) });

        // 调度 2：绝杀闹钟（独占单线进程进行秒级高频出价）
        let fireTime = endT - CONFIG.SNIPER_WAKEUP_AHEAD_MS + rand(-CONFIG.SNIPER_WAKEUP_RANDOM_MS, CONFIG.SNIPER_WAKEUP_RANDOM_MS);
        chrome.alarms.create(`sniper_${task.url}`, { when: Math.max(Date.now() + 4000, fireTime) });
        
        LogSystem.write('info', `🎯 [狙击就绪] 卡片 [${extractCardId(task.url)}] 已锁定，计划开火价 ￥${task.price}`);
    }

    /**
     * 系统闹钟事件分发路由
     * 根据闹钟前缀派发至不同处理管道，避免主线程阻塞
     */
    async handleAlarm(alarm) {
        if (alarm.name.startsWith('scout_')) {
            await this.performGlobalScouting();
        } else if (alarm.name.startsWith('sniper_')) {
            const targetUrl = alarm.name.replace('sniper_', '');
            await this.executeFinalStrike(targetUrl);
        }
    }

    /**
     * 全局状态侦查进程
     * 获取关注列表快照，校验任务有效性，防风控与溢价熔断拦截
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

                // 基于目标域动态推断同源 Origin，保障 Auth Cookie 通行
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
                    // 同步清理内存与残留时序闹钟
                    chrome.alarms.clear(`scout_${item.url}`);
                    chrome.alarms.clear(`sniper_${item.url}`);
                    delete sniperTasks[item.url];
                    
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
     * 绝杀出价主进程
     * 托管底层 Service Worker 高精度定时器，规避前台 DOM 渲染节流限制
     * @param {string} targetUrl - 目标商品页 URL
     */
    async executeFinalStrike(targetUrl) {
        const { sniperTasks = {} } = await chrome.storage.local.get('sniperTasks');
        const task = sniperTasks[targetUrl];
        if (!task) return;

        // 任务出栈：防止 SW 意外重置引发的队列重复调度
        delete sniperTasks[targetUrl];
        await chrome.storage.local.set({ sniperTasks });

        const targetId = extractCardId(targetUrl) || '未知';
        LogSystem.write('info', `🚀 [开启冲锋] 任务已出库并锁定，正在对卡片 [${targetId}] 执行沙盒装填...`);

        let tabId = null;
        try {
            // 设置 5000ms 强制超时限流，保障 HTML 核心结构渲染后快速干预
            const tab = await TabManager.createSecure(targetUrl, true, 5000);
            tabId = tab.id;

            const prepResults = await chrome.scripting.executeScript({
                target: { tabId },
                args: [task.price],
                world: 'MAIN',
                func: prepareSniperSandbox
            });

            const prep = prepResults[0]?.result;

            // 结标前最终数据校验异常兜底
            if (prep?.status === 'melted' || prep?.status === 'overBudget') {
                LogSystem.write('warn', `🚫 [战术撤退] 目标 [${targetId}] 临近结标前价格越线，放弃狙击。`);
                this.broadcastToTabs("sniperCanceled", { url: targetUrl, reason: prep.status });
                return;
            }

            if (prep?.status === 'ready') {
                // 计算后台绝对时间戳误差与目标潜伏等待量
                const triggerSec = rand(CONFIG.SNIPER_TRIGGER_SEC_MIN, CONFIG.SNIPER_TRIGGER_SEC_MAX);
                const waitMs = prep.remainingMs - (triggerSec * 1000);

                LogSystem.write('info', `⏳ [高精度潜伏] 目标 [${targetId}] 将在后台倒数 ${Math.max(0, waitMs/1000).toFixed(1)} 秒后拔枪...`);
                if (waitMs > 0) await sleep(waitMs);

                // 强制跨域执行视图触发
                const fireResults = await chrome.scripting.executeScript({
                    target: { tabId },
                    args: [task.price, CONFIG.SNIPER_FIRE_DELAY_MS],
                    world: 'MAIN',
                    func: fireSniperSandbox
                });

                const res = fireResults[0]?.result;
                if (res?.status === 'success') LogSystem.write('success', `💥 [绝杀成功] 卡片 [${targetId}] 已于最后 ${triggerSec} 秒完成出价！`);
            }
        } catch (err) {
            LogSystem.write('error', `🚨 [绝杀中断] 运行异常: ${err.message}`);
        } finally {
            // 保留 8s 窗口供出价 XHR 响应完成
            if (tabId) setTimeout(() => chrome.tabs.remove(tabId).catch(() => { }), 8000);
        }
    }
}