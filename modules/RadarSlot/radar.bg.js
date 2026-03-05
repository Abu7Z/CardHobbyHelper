import { sleep, TabManager } from '../../core/Utils.bg.js';
import { LogSystem } from '../../core/BgEngine.js'; 
/**
 * 雷达功能后台插槽
 * 处理静默关注/取消关注卡片的后台任务
 */
export class RadarSlotBg {
    onMessage(req, sender, sendResponse) {
        if (req.action === "followCard") {
            this.executeSilentFollow(req.url, req.itemId);
            return true; 
        }
        if (req.action === "unfollowCard") {
            this.executeSilentUnfollow(req.url, req.itemId);
            return true;
        }
        return false;
    }

    /**
     * 静默执行关注操作
     * 在后台创建标签页，注入脚本执行关注后关闭
     * @param {string} url - 商品详情页 URL
     * @param {string} itemId - 商品 ID
     */
    async executeSilentFollow(url, itemId) {
        let tabId = null;
        try {
            const tab = await TabManager.createSecure(url, false);
            tabId = tab.id;
            await sleep(1000);
            await chrome.scripting.executeScript({
                target: { tabId },
                world: 'MAIN',
                args: [itemId],
                func: (id) => {
                    if (typeof window.setAttention !== 'function') return;
                    const originalAlert = window.alert;
                    window.alert = () => {}; 
                    try { window.setAttention(id, 1, id); } catch(e) {} 
                    finally { setTimeout(() => window.alert = originalAlert, 800); }
                }
            });
            await sleep(1000);
        } catch (err) {
            LogSystem.write('error', `❌ [雷达异常] 静默关注卡片 [${itemId}] 失败: ${err.message}`);
        } finally {
            if (tabId) chrome.tabs.remove(tabId).catch(() => {});
        }
    }

    /**
     * 静默执行取消关注操作
     * 在后台创建标签页，注入脚本执行取消关注后关闭
     * @param {string} url - 商品详情页 URL
     * @param {string} itemId - 商品 ID
     */
    async executeSilentUnfollow(url, itemId) {
        let tabId = null;
        try {
            const tab = await TabManager.createSecure(url, false);
            tabId = tab.id;
            await sleep(1000);
            await chrome.scripting.executeScript({
                target: { tabId },
                world: 'MAIN',
                args: [itemId],
                func: (id) => {
                    if (typeof window.deleteatt === 'function') {
                        const originalConfirm = window.confirm;
                        window.confirm = () => true; 
                        try { window.deleteatt(id, 1); } catch(e) {} 
                        finally { setTimeout(() => window.confirm = originalConfirm, 800); }
                    } else if (typeof window.setAttention === 'function') {
                        const originalAlert = window.alert;
                        window.alert = () => {}; 
                        try { window.setAttention(id, 0, id); } catch(e) {} 
                        finally { setTimeout(() => window.alert = originalAlert, 800); }
                    }
                }
            });
            await sleep(1000);
        } catch (err) {
            LogSystem.write('error', `❌ [雷达异常] 静默取消关注卡片 [${itemId}] 失败: ${err.message}`);
        } finally {
            if (tabId) chrome.tabs.remove(tabId).catch(() => {});
        }
    }
}