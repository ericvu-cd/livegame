export const MIN_SCORE = -100000;
export const MAX_DURATION = 10800;
export function normalizeName(value) {
  const name = String(value ?? '').normalize('NFKC').replace(/[\u0000-\u001f\u007f]/g, '').trim().replace(/\s+/g, ' ');
  if (!name || [...name].length > 20) throw new Error('請輸入 1–20 個字的名字。');
  return name;
}
export function durationSeconds(minutes, seconds) {
  const m = Number(minutes), s = Number(seconds), total = m * 60 + s;
  if (!Number.isInteger(m) || !Number.isInteger(s) || m < 0 || s < 0 || s > 59 || total < 10 || total > MAX_DURATION) throw new Error('競賽時間請設定為 10 秒至 180 分鐘。');
  return total;
}
export function isRunning(race, now) { return !!race && race.status === 'running' && Number.isFinite(race.endsAt) && now < race.endsAt; }
export function formatClock(ms) {
  const s = Math.max(0, Math.ceil(ms / 1000));
  return String(Math.floor(s / 60)).padStart(2, '0') + ':' + String(s % 60).padStart(2, '0');
}
export function startAttempt(previous, name, deviceId) {
  const previousDevice=previous?.deviceId??previous?.ownerUid;
  if (previous && (previous.name !== name || previousDevice !== deviceId)) throw new Error('玩家識別資料不符，請重新加入。');
  // A reload banks the last acknowledged score of an unfinished attempt.
  const completedBestScore = previous ? Math.max(previous.completedBestScore, previous.currentScore) : MIN_SCORE;
  return { deviceId, name, currentScore: 0, completedBestScore, bestScore: Math.max(completedBestScore, 0), attempt: (previous?.attempt ?? 0) + 1, phase: 'playing', level: 1 };
}
export function scoreUpdate(previous, attempt, score, level, finished = false) {
  if (!previous || previous.attempt !== attempt || previous.phase !== 'playing') throw new Error('本局已結束或已在其他分頁重新開始。');
  if (!Number.isInteger(score) || score < MIN_SCORE || score > 1000000 || !Number.isInteger(level) || level < 1 || level > 10) throw new Error('成績格式不正確。');
  const completedBestScore = finished ? Math.max(previous.completedBestScore, score) : previous.completedBestScore;
  return { ...previous, currentScore: score, completedBestScore, bestScore: Math.max(completedBestScore, score), level, phase: finished ? 'finished' : 'playing' };
}
export function topTen(players) { return [...players].sort((a,b) => b.bestScore - a.bestScore || (a.id < b.id ? -1 : a.id > b.id ? 1 : 0)).slice(0,10); }

