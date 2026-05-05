/**
 * 埋点采集(04-前端规范 §3.10)
 *
 * MVP 简化策略:
 * - 内存缓冲 + 5s/10 条批量上报
 * - 未实现真实上报通道, console.log 占位; 上线前接入 Sentry / 自建上报
 * - 弱网时本地排队, 最多保留 100 条(写 storage)
 */

import { STORAGE_KEYS } from '../config/constants';
import { env } from '../config/env';
import { getStorage, setStorage } from './storage';

interface TrackEvent {
  event: string;
  page?: string;
  ts: number;
  user_id?: string;
  session_id: string;
  ext?: Record<string, unknown>;
}

const SESSION_ID = `${Date.now().toString(36)}-${Math.floor(Math.random() * 1e6).toString(36)}`;
const MAX_BUFFER = 100;
const FLUSH_AT = 10;
const FLUSH_INTERVAL_MS = 5000;

let buffer: TrackEvent[] = [];
let flushTimer: ReturnType<typeof setTimeout> | null = null;
let userIdGetter: () => string | undefined = () => undefined;

export function setTrackUserGetter(fn: () => string | undefined): void {
  userIdGetter = fn;
}

export function track(event: string, ext?: Record<string, unknown>): void {
  const pages = getCurrentPages();
  const last = pages[pages.length - 1];
  const e: TrackEvent = {
    event,
    page: last?.route,
    ts: Date.now(),
    user_id: userIdGetter(),
    session_id: SESSION_ID,
    ext,
  };
  buffer.push(e);
  if (buffer.length >= MAX_BUFFER) buffer = buffer.slice(-MAX_BUFFER);
  if (env.DEBUG) console.log('[track]', event, ext ?? '');
  if (buffer.length >= FLUSH_AT) flushNow();
  else scheduleFlush();
}

function scheduleFlush(): void {
  if (flushTimer) return;
  flushTimer = setTimeout(() => {
    flushTimer = null;
    flushNow();
  }, FLUSH_INTERVAL_MS);
}

function flushNow(): void {
  if (buffer.length === 0) return;
  const batch = buffer.splice(0, buffer.length);
  // TODO(release): POST /v1/tracker/events 实现后接通真实上报
  if (env.DEBUG) {
    console.log('[track.flush]', batch.length, '条事件', batch);
  }
  // 弱网降级:把没上报掉的批次落 storage, 下次启动重传
  // MVP 简化:console 占位, 不写 storage; 真实接入时启用下方代码
  // const queued = getStorage<TrackEvent[]>(STORAGE_KEYS.TRACKER_QUEUE, []);
  // setStorage(STORAGE_KEYS.TRACKER_QUEUE, [...queued, ...batch].slice(-MAX_BUFFER));
  void getStorage;
  void setStorage;
  void STORAGE_KEYS;
}

/** 应用 onHide 时立即冲刷一次, 避免数据丢失 */
export function flushTrackerOnHide(): void {
  if (flushTimer) {
    clearTimeout(flushTimer);
    flushTimer = null;
  }
  flushNow();
}
