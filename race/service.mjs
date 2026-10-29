import { isRunning, startAttempt, scoreUpdate, topTen } from './model.mjs';
export const demo = new URLSearchParams(location.search).get('demo') === '1';
let connectionPromise;
export async function createService() {
  if (!connectionPromise) connectionPromise = demo ? Promise.resolve(new DemoService()) : import('./firebase-service.mjs').then(({ FirebaseService }) => FirebaseService.connect());
  return connectionPromise;
}
export function friendlyError(error) {
  const code = error?.code || '';
  if (code.includes('permission-denied')) return '資料庫拒絕操作：請確認競賽仍在進行，並已發布最新版競賽規則。';
  if (code.includes('unauthorized-domain')) return '此網址尚未加入 Firebase Authentication 的授權網域。';
  if (/network|unavailable|offline/.test(code)) return '目前無法連上伺服器，遊戲已暫停；重新連線後才能繼續。';
  return error?.message || '連線發生問題，請重新整理後再試。';
}
const DEMO_KEY = 'fishball-race-v2-demo';
export class DemoService {
  constructor() {
    this.uid = sessionStorage.getItem('fishball-demo-uid') || crypto.randomUUID();
    sessionStorage.setItem('fishball-demo-uid', this.uid);
    this.listeners = new Set();
    this.channel = new BroadcastChannel(DEMO_KEY);
    this.channel.onmessage = () => this.notify();
    window.addEventListener('storage', e => { if (e.key === DEMO_KEY) this.notify(); });
    this.host = location.pathname.endsWith('fishball-race-admin.html');
    this.email = '本機示範主持人';
    this.clockUncertainty = 0;
  }
  now() { return Date.now(); }
  state() { return JSON.parse(localStorage.getItem(DEMO_KEY) || '{"control":null,"players":{}}'); }
  async mutate(fn) {
    return navigator.locks.request(DEMO_KEY, () => {
      const state = this.state(), result = fn(state);
      localStorage.setItem(DEMO_KEY, JSON.stringify(state));
      this.notify(); this.channel.postMessage('changed');
      return result;
    });
  }
  notify() { for (const cb of this.listeners) cb(); }
  watchRace(cb) { const fn = () => cb(this.state().control); this.listeners.add(fn); fn(); return () => this.listeners.delete(fn); }
  watchTop(roundId, cb) { const fn = () => cb(topTen(Object.values(this.state().players[roundId] || {}))); this.listeners.add(fn); fn(); return () => this.listeners.delete(fn); }
  async finalTop(roundId) { return topTen(Object.values(this.state().players[roundId] || {})); }
  async startRace(duration) {
    if (!this.host) throw new Error('請使用管理操控頁面。');
    return this.mutate(s => {
      if (isRunning(s.control, this.now())) throw new Error('競賽正在進行，請先重置再開新場次。');
      s.control = { roundId: crypto.randomUUID(), status: 'running', startedAt: this.now(), endsAt: this.now() + duration * 1000, duration };
    });
  }
  async stopRace(expectedRoundId) {
    if (!this.host) throw new Error('請使用管理操控頁面。');
    return this.mutate(s => {
      if (s.control?.roundId !== expectedRoundId) throw new Error('場次已變更，請確認目前場次後再操作。');
      if (!isRunning(s.control, this.now())) throw new Error('本場競賽已截止。');
      s.control = { ...s.control, scheduledEndsAt: s.control.endsAt, status: 'stopped', stoppedAt: this.now(), endsAt: this.now(), stoppedBy: this.uid };
    });
  }
  async resetRace(expectedRoundId) {
    if (!this.host) throw new Error('請使用管理操控頁面。');
    return this.mutate(s => {
      if (expectedRoundId !== undefined && (s.control?.roundId ?? null) !== expectedRoundId) throw new Error('場次已變更，請確認目前場次後再操作。');
      s.control = { roundId: null, status: 'ready', endsAt: null };
    });
  }
  async startPlayer(roundId, id, name) {
    return this.mutate(s => {
      this.assertActive(s, roundId);
      s.players[roundId] ||= {};
      const previous = s.players[roundId][id];
      return s.players[roundId][id] = { ...startAttempt(previous, name, this.uid), id };
    });
  }
  async report(roundId, id, attempt, score, level, finished) {
    return this.mutate(s => {
      this.assertActive(s, roundId);
      const previous = s.players[roundId]?.[id];
      return s.players[roundId][id] = { ...scoreUpdate(previous, attempt, score, level, finished), id };
    });
  }
  assertActive(s, roundId) {
    if (!navigator.onLine) throw new Error('目前離線，請重新連線。');
    if (s.control?.roundId !== roundId || !isRunning(s.control, this.now())) throw new Error('競賽已截止或已重置，成績不再更新。');
  }
}

