import { createService, demo, friendlyError } from './service.mjs';
import { durationSeconds, isRunning, formatClock } from './model.mjs';
import { pageURL } from './navigation.mjs';
const $=id=>document.getElementById(id);
let service,race=null,busy=false,confirmed=false;
const boardURL=pageURL('fishball-race-board.html'),playURL=pageURL('fishball-race.html');
$('board-link').href=boardURL.href;$('board-url').textContent=boardURL.href;
$('play-link').href=playURL.href;$('play-url').textContent=playURL.href;
if(demo)$('demo-label').hidden=false;
try{
  const stored=JSON.parse(localStorage.getItem('fishball-race-admin-duration')||'null');
  if(stored){durationSeconds(stored.minutes,stored.seconds);$('duration-minutes').value=stored.minutes;$('duration-seconds').value=stored.seconds;}
}catch{}
function notice(text='',error=false){$('notice').textContent=text;$('notice').classList.toggle('error',error);}
function connection(ok,text){$('connection').textContent=text;$('connection').classList.toggle('offline',!ok);}
function tick(){
  if(!service)return;
  const live=isRunning(race,service.now()),hasRound=!!race?.roundId;
  const authorized=service.host&&confirmed&&navigator.onLine&&!busy;
  $('admin-status').textContent=live?'競賽進行中':race?.status==='stopped'?'已手動停止':hasRound?'時間到 · 已結束':'等待開始';
  $('admin-status').dataset.state=live?'running':hasRound?'ended':'ready';
  $('admin-clock').textContent=hasRound?formatClock(race.endsAt-service.now()):'--:--';
  $('admin-clock').classList.toggle('urgent',live&&race.endsAt-service.now()<30000);
  $('admin-round').textContent=hasRound?'#'+race.roundId.slice(0,8):'尚未開賽';
  $('start-btn').disabled=!authorized||live;
  $('start-btn').textContent=hasRound?'▶ 開始新一場':'▶ 開始競賽';
  $('stop-btn').disabled=!authorized||!live;
  $('reset-btn').disabled=!authorized||!hasRound;
  $('duration-minutes').disabled=busy||live||!service.host;
  $('duration-seconds').disabled=busy||live||!service.host;
}
function hostUI(){tick();}
async function act(work,success){
  if(busy||!service)return;busy=true;tick();
  try{await work();notice(success||'');}catch(error){notice(friendlyError(error),true);}finally{busy=false;hostUI();}
}
$('start-btn').addEventListener('click',()=>{
  void act(async()=>{
    const minutes=$('duration-minutes').value,seconds=$('duration-seconds').value;
    await service.startRace(durationSeconds(minutes,seconds));
    try{localStorage.setItem('fishball-race-admin-duration',JSON.stringify({minutes,seconds}));}catch{}
  },'競賽已開始，展示端與玩家端會自動同步。');
});
$('stop-btn').addEventListener('click',()=>{
  const roundId=race?.roundId;
  if(!roundId||!confirm('立即停止本場競賽？所有玩家會停止計分，並保留最終排名。'))return;
  void act(()=>service.stopRace(roundId),'本場已停止，最終成績已鎖定。');
});
$('reset-btn').addEventListener('click',()=>{
  const roundId=race?.roundId;
  if(!roundId||!confirm('重置本場排行榜？展示榜會清空，所有玩家將回到等待畫面。'))return;
  void act(()=>service.resetRace(roundId),'排行榜已重置，請設定時間後開始新一場。');
});
for(const [id,url]of [['copy-board',boardURL],['copy-player',playURL]])$(id).addEventListener('click',async()=>{
  try{await navigator.clipboard.writeText(url.href);notice('網址已複製。');}catch{notice('請手動複製上方網址。');}
});
window.addEventListener('offline',()=>{confirmed=false;connection(false,'離線 · 無法操作');tick();});
window.addEventListener('online',async()=>{
  try{await service?.syncClock?.();connection(true,demo?'本機示範':'已重新連線');if(demo)confirmed=true;}catch(error){notice(friendlyError(error),true);}tick();
});
try{
  service=await createService();hostUI();
  service.watchRace((next,meta={})=>{
    const changed=race?.roundId!==next?.roundId;race=next;confirmed=!meta.cached;
    if(changed&&next?.duration>0){$('duration-minutes').value=Math.floor(next.duration/60);$('duration-seconds').value=next.duration%60;}
    connection(confirmed,meta.cached?'等待伺服器確認':demo?'本機示範':'已連上競賽');hostUI();
  },error=>{confirmed=false;connection(false,'連線失敗');notice(friendlyError(error),true);tick();});
}catch(error){notice(friendlyError(error),true);connection(false,'無法連線');}
setInterval(tick,100);
document.addEventListener('visibilitychange',()=>{if(!document.hidden)tick();});

