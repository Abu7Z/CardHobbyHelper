/**
 * Content Script 入口文件
 * 初始化并启动内容脚本引擎，根据配置注册各功能模块
 */
const contentEngine = new window.ContentEngine();

if (globalThis.CHH_FEATURES.Radar) contentEngine.register(new window.RadarSlotContent());
if (globalThis.CHH_FEATURES.BatchBid) contentEngine.register(new window.BatchBidSlotContent());
if (globalThis.CHH_FEATURES.Sniper) contentEngine.register(new window.SniperSlotContent());

contentEngine.start();