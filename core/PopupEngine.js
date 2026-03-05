/**
 * Popup 插件面板引擎
 * 采用插槽模式管理各功能模块的渲染与初始化
 */
export class PopupEngine {
    constructor() {
        this.slots = [];               // 已注册的插槽实例列表
        this.container = null;         // 模块容器 DOM 元素
        this.statusMsgEl = null;       // 状态消息显示元素
    }

    /**
     * 注册功能插槽
     * @param {Object} slotInstance - 插槽实例，需实现 render/init 方法
     * @returns {PopupEngine} 引擎实例（支持链式调用）
     */
    register(slotInstance) {
        this.slots.push(slotInstance);
        return this;
    }

    /**
     * 启动引擎，执行两阶段初始化流程
     * 1. 渲染阶段：调用各插槽 render() 生成 DOM
     * 2. 初始化阶段：调用各插槽 init() 绑定事件
     */
    async start() {
        this.container = document.getElementById('modules-container');
        this.statusMsgEl = document.getElementById('statusMsg');

        // 1. 渲染阶段：先统一完成所有 DOM 构建
        for (const slot of this.slots) {
            if (typeof slot.render === 'function') {
                const domElement = slot.render();
                if (domElement) {
                    this.container.appendChild(domElement);
                }
            }
        }

        // 2. 初始化阶段：再统一执行事件绑定等逻辑
        for (const slot of this.slots) {
            if (typeof slot.init === 'function') {
                await slot.init(this);
            }
        }
    }

    /**
     * 更新全局状态消息
     * @param {string} msg - 状态消息文本
     * @param {string} color - 文字颜色（默认灰色）
     */
    updateStatus(msg, color = '#888') {
        if (this.statusMsgEl) {
            this.statusMsgEl.innerText = msg;
            this.statusMsgEl.style.color = color;
        }
    }
}