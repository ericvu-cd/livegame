import { initializeApp } from 'https://www.gstatic.com/firebasejs/10.12.2/firebase-app.js';
import { getFirestore, connectFirestoreEmulator, doc, collection, getDocFromServer, getDocsFromServer, onSnapshot, runTransaction, setDoc, serverTimestamp, query, orderBy, limit } from 'https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js';
import { firebaseConfig, paths } from './config.mjs';
import { isRunning, startAttempt, scoreUpdate } from './model.mjs';
const role = location.pathname.endsWith('fishball-race-admin.html') ? 'host' : location.pathname.endsWith('fishball-race-board.html') ? 'display' : 'player';
// The emulator switch is accepted on loopback only, never on a hosted website.
const emulator = ['localhost','127.0.0.1'].includes(location.hostname) && new URLSearchParams(location.search).get('emulator') === '1';
export class FirebaseService {
  static async connect() {
    const service = new FirebaseService();
    await service.syncClock();
    return service;
  }
  constructor() {
    const config = emulator ? { ...firebaseConfig, projectId: 'demo-fishball-race-v2', apiKey: 'demo-key', authDomain: 'localhost' } : firebaseConfig;
    this.app = initializeApp(config, 'fishball-race-' + role + '-v2');
    this.auth = null;
    this.clockId = crypto.randomUUID();
    try { this.deviceId = localStorage.getItem('fishball-race-device-v2') || crypto.randomUUID(); localStorage.setItem('fishball-race-device-v2',this.deviceId); } catch { this.deviceId = crypto.randomUUID(); }
    this.db = getFirestore(this.app);
    if (emulator) {
      connectFirestoreEmulator(this.db, '127.0.0.1', 8089);
    }
    this.controlRef = doc(this.db, paths.control);
    this.clockUncertainty = 250;
    this.host = role === 'host';
    this.clockAnchor = null;
  }
  get uid() { return this.deviceId; }
  now() {
    if (!this.clockAnchor) throw new Error('尚未完成伺服器時間同步。');
    return this.clockAnchor.server + performance.now() - this.clockAnchor.local;
  }
  async syncClock() {
    const before = performance.now();
    const ref = doc(this.db, paths.clocks, this.clockId);
    await setDoc(ref, { at: serverTimestamp() });
    const snapshot = await getDocFromServer(ref);
    const after = performance.now(), at = snapshot.data().at.toMillis();
    // Anchor to a monotonic clock; changing device wall time cannot extend a round.
    this.clockAnchor = { server: at + (after - before) / 2, local: after };
    this.clockUncertainty = Math.ceil((after - before) / 2) + 50;
  }
  decodeRace(data) {
    const startedAt = data?.startedAt?.toMillis() ?? null;
    const stoppedAt = data?.stoppedAt?.toMillis() ?? null;
    const scheduledEndsAt = startedAt === null ? null : startedAt + data.duration * 1000;
    return data ? { ...data, startedAt, stoppedAt, scheduledEndsAt, endsAt: data.status === 'stopped' ? stoppedAt : scheduledEndsAt } : null;
  }
  watchRace(cb, error) {
    return onSnapshot(this.controlRef, { includeMetadataChanges: true }, snap => {
      if (!snap.metadata.hasPendingWrites) cb(this.decodeRace(snap.exists() ? snap.data() : null), { cached: snap.metadata.fromCache });
    }, error);
  }
  topQuery(roundId) {
    return query(collection(this.db, paths.rounds, roundId, 'players'), orderBy('bestScore', 'desc'), limit(10));
  }
  watchTop(roundId, cb, error) {
    return onSnapshot(this.topQuery(roundId), { includeMetadataChanges: true }, snap => {
      cb(snap.docs.map(d => ({ ...d.data(), id: d.id })), { cached: snap.metadata.fromCache });
    }, error);
  }
  async finalTop(roundId) {
    const snap = await getDocsFromServer(this.topQuery(roundId));
    return snap.docs.map(d => ({ ...d.data(), id: d.id }));
  }
  async startRace(duration) {
    if (!this.host) throw new Error('請使用管理操控頁面。');
    await this.syncClock();
    const roundId = crypto.randomUUID();
    await runTransaction(this.db, async tx => {
      const snap = await tx.get(this.controlRef);
      if (isRunning(this.decodeRace(snap.data()), this.now())) throw new Error('競賽正在進行，請先重置再開新場次。');
      const race = { roundId, status: 'running', startedAt: serverTimestamp(), duration, hostUid: this.uid };
      tx.set(doc(this.db, paths.rounds, roundId), race);
      tx.set(this.controlRef, race);
    });
  }
  async stopRace(expectedRoundId) {
    if (!this.host) throw new Error('請使用管理操控頁面。');
    await runTransaction(this.db, async tx => {
      const snap = await tx.get(this.controlRef), data = snap.data(), race = this.decodeRace(data);
      if (!race || race.roundId !== expectedRoundId) throw new Error('場次已變更，請確認目前場次後再操作。');
      if (!isRunning(race, this.now())) throw new Error('本場競賽已截止。');
      tx.set(this.controlRef, { ...data, status: 'stopped', stoppedAt: serverTimestamp(), stoppedBy: this.uid });
    });
  }
  async resetRace(expectedRoundId) {
    if (!this.host) throw new Error('請使用管理操控頁面。');
    // Switch the active round instead of deleting an unlimited number of players.
    await runTransaction(this.db, async tx => {
      const snap = await tx.get(this.controlRef);
      if (expectedRoundId !== undefined && (snap.data()?.roundId ?? null) !== expectedRoundId) throw new Error('場次已變更，請確認目前場次後再操作。');
      tx.set(this.controlRef, { roundId: null, status: 'ready', startedAt: null, duration: 0, hostUid: this.uid });
    });
  }
  async writePlayer(roundId, id, fn) {
    if (!navigator.onLine) throw new Error('目前離線，請重新連線。');
    const playerRef = doc(this.db, paths.rounds, roundId, 'players', id);
    return runTransaction(this.db, async tx => {
      const [control, previous] = await Promise.all([tx.get(this.controlRef), tx.get(playerRef)]);
      const race = this.decodeRace(control.data());
      if (race?.roundId !== roundId || !isRunning(race, this.now())) throw new Error('競賽已截止或已重置，成績不再更新。');
      const data = fn(previous.exists() ? previous.data() : null);
      delete data.id; delete data.updatedAt;
      tx.set(playerRef, { ...data, updatedAt: serverTimestamp() });
      return { ...data, id };
    }, { maxAttempts: 3 });
  }
  async startPlayer(roundId, id, name) { return this.writePlayer(roundId, id, previous => startAttempt(previous, name, this.deviceId)); }
  async report(roundId, id, attempt, score, level, finished) { return this.writePlayer(roundId, id, previous => scoreUpdate(previous, attempt, score, level, finished)); }
}

