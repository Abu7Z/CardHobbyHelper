/**
 * Background Service Worker 入口文件
 * 初始化并启动后台服务引擎，根据配置注册各功能模块
 */
console.log(
    "%c 🛑 提醒 %c\n本插件 (卡淘猎手) 为完全免费的开源工具。\n原作者 GitHub: https://github.com/Abu7Z/CardHobbyHelper",
    "color: white; background: #f44336; font-size: 14px; padding: 4px; border-radius: 4px;",
    "color: #d32f2f; font-size: 12px; font-weight: bold;"
);

import './core/config.js';
import { BackgroundEngine } from './core/BgEngine.js';
import { RadarSlotBg } from './modules/RadarSlot/radar.bg.js';
import { BatchBidSlotBg } from './modules/BatchBidSlot/batch.bg.js';
import { SniperSlotBg } from './modules/SniperSlot/sniper.bg.js';

const bgEngine = new BackgroundEngine();

if (globalThis.CHH_FEATURES.Radar) bgEngine.register(new RadarSlotBg());
if (globalThis.CHH_FEATURES.BatchBid) bgEngine.register(new BatchBidSlotBg());
if (globalThis.CHH_FEATURES.Sniper) bgEngine.register(new SniperSlotBg());

bgEngine.start();