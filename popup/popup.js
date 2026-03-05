/**
 * Popup 面板入口文件
 * 初始化并启动 Popup 引擎，根据配置注册各功能模块
 */
import '../core/config.js';
import { PopupEngine } from '../core/PopupEngine.js';
import { SystemSlotPopup } from '../core/SystemSlot.popup.js';
import { RadarSlotPopup } from '../modules/RadarSlot/radar.popup.js';
import { SniperSlotPopup } from '../modules/SniperSlot/sniper.popup.js';

const engine = new PopupEngine();

if (globalThis.CHH_FEATURES.Radar) engine.register(new RadarSlotPopup());
if (globalThis.CHH_FEATURES.Sniper) engine.register(new SniperSlotPopup());

engine.register(new SystemSlotPopup());
engine.start();