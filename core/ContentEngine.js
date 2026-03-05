/**
 * 网页内容脚本引擎
 * 管理功能插槽，监听 DOM 变化与消息，统一分发事件
 */
class ContentEngine {
    constructor() {
        this.slots = [];              // 已注册的功能插槽列表
        this.observer = null;          // MutationObserver DOM 变化监听器
        this.isProcessingDOM = false;  // DOM 处理锁，防止递归触发
    }

    /**
     * 注册功能插槽
     * @param {Object} slotInstance - 插槽实例，需实现 init/onMessage/onDomUpdate 方法
     * @returns {ContentEngine} 引擎实例（支持链式调用）
     */
    register(slotInstance) {
        this.slots.push(slotInstance);
        return this;
    }

    /**
     * 启动内容脚本引擎
     * 初始化插槽、注册消息监听、启动 DOM 观察器
     */
    start() {
        for (const slot of this.slots) {
            if (typeof slot.init === 'function') slot.init();
        }

        chrome.runtime.onMessage.addListener((req, sender, sendResponse) => {
            for (const slot of this.slots) {
                if (typeof slot.onMessage === 'function') slot.onMessage(req, sender, sendResponse);
            }
        });

        this.observer = new MutationObserver(() => {
            if (this.isProcessingDOM) return;
            this.isProcessingDOM = true;
            this.observer.disconnect();

            for (const slot of this.slots) {
                if (typeof slot.onDomUpdate === 'function') slot.onDomUpdate();
            }

            this.observer.observe(document.body, { childList: true, subtree: true });
            this.isProcessingDOM = false;
        });

        this.observer.observe(document.body, { childList: true, subtree: true });
        for (const slot of this.slots) {
            if (typeof slot.onDomUpdate === 'function') slot.onDomUpdate();
        }
    }

    /**
     * 显示 Toast 提示消息
     * @param {string} htmlMsg - 提示内容（支持 HTML）
     * @param {boolean} isSticky - 是否持续显示不自动消失
     */
    static showToast(htmlMsg, isSticky = false) {
        let toast = document.getElementById('helper-toast');
        if (!toast) {
            toast = document.createElement('div');
            toast.id = 'helper-toast';
            toast.className = 'helper-toast';
            document.body.appendChild(toast);
        }
        toast.innerHTML = htmlMsg;
        toast.classList.remove('show');
        void toast.offsetWidth; 
        toast.classList.add('show');
        
        if (this.toastTimeout) clearTimeout(this.toastTimeout);
        if (!isSticky) this.toastTimeout = setTimeout(() => toast.classList.remove('show'), 3500);
    }
}
window.ContentEngine = ContentEngine;