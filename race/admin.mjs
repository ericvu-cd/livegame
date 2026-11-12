import { createService, demo, friendlyError } from './service.mjs';
import { durationSeconds, isRunning, formatClock } from './model.mjs';
const $=id=>document.getElementById(id);
let service,race=null,busy=false,confirmed=false;
let queryOpen=false,queryRoundId=null,unwatchPlayers=()=>{},queryPlayers=[],finalLoaded=false,finalLoading=false,finalRetryAt=0;
if(demo)$('demo-label').hidden=false;
try{
  const stored=JSON.parse(localStorage.getItem('fishball-race-admin-duration')||'null');
  if(stored){durationSeconds(stored.minutes,stored.seconds);$('duration-minutes').value=stored.minutes;$('duration-seconds').value=stored.seconds;}
}catch{}
function notice(text='',error=false){$('notice').textContent=text;$('notice').classList.toggle('error',error);}
function connection(ok,text){$('connection').textContent=text;$('connection').classList.toggle('offline',!ok);}
function closeQuery(){
  queryOpen=false;unwatchPlayers();unwatchPlayers=()=>{};queryRoundId=null;queryPlayers=[];finalLoaded=false;finalLoading=false;finalRetryAt=0;
  $('query-results').hidden=true;$('query-btn').textContent='⌕ 查詢本場成績';
}
function renderQuery(){
  const section=$('query-results'),list=$('query-results-list');
  section.hidden=!queryOpen;list.replaceChildren();
  if(!queryOpen)return;
  queryPlayers.forEach((player,index)=>{
    const row=document.createElement('tr');
    const rank=document.createElement('td');rank.textContent=String(index+1).padStart(2,'0');
    const name=document.createElement('td');name.className='admin-result-name';name.textContent=player.name||'未命名玩家';
    const current=document.createElement('td');current.textContent=Number(player.currentScore||0).toLocaleString('zh-TW')+' 分';
    const best=document.createElement('td');best.className='admin-result-score';best.textContent=Number(player.bestScore||0).toLocaleString('zh-TW')+' 分';
    const progress=document.createElement('td');progress.textContent=player.phase==='finished'?'十關完成':player.phase==='ended'?'時間截止':'第 '+(player.level||1)+' 關';
    row.append(rank,name,current,best,progress);list.append(row);
  });
  const live=isRunning(race,service?.now?.()??Date.now());
  if(live)$('query-results-state').textContent='即時更新中 · '+queryPlayers.length+' 位參賽玩家';
  else if(race?.status==='running'&&race?.roundId===queryRoundId&&service.now()<Number(race.endsAt)+8000+(service.clockUncertainty||0)+150){
    $('query-results-state').textContent='結算中 · 最後成績同步倒數 '+formatClock(Number(race.endsAt)+8000+(service.clockUncertainty||0)+150-service.now());
  }else if(finalLoaded)$('query-results-state').textContent='最終成績已鎖定 · '+queryPlayers.length+' 位玩家';
  else if(Date.now()<finalRetryAt)$('query-results-state').textContent='讀取失敗，稍後自動重試';
  else $('query-results-state').textContent='讀取最終成績…';
}
function beginQuery(){
  const roundId=race?.roundId;
  if(!roundId){notice('目前沒有可查詢的競賽場次。');return;}
  unwatchPlayers();queryOpen=true;queryRoundId=roundId;queryPlayers=[];finalLoaded=false;finalLoading=false;finalRetryAt=0;
  $('query-btn').textContent='✕ 關閉成績查詢';$('query-results').hidden=false;renderQuery();
  unwatchPlayers=service.watchPlayers(roundId,(players,meta={})=>{
    if(queryRoundId!==roundId||finalLoaded)return;
    queryPlayers=players;renderQuery();
    if(meta.cached)$('query-results-state').textContent='顯示本機快取 · 等待伺服器更新';
  },error=>{notice(friendlyError(error),true);$('query-results-state').textContent='讀取失敗，請重新查詢';});
}
async function lockFinalQuery(){
  if(!queryOpen||!queryRoundId||finalLoaded||finalLoading||Date.now()<finalRetryAt)return;
  const roundId=queryRoundId;finalLoading=true;renderQuery();
  try{
    const players=await service.finalPlayers(roundId);
    if(queryOpen&&queryRoundId===roundId&&race?.roundId===roundId){queryPlayers=players;finalLoaded=true;unwatchPlayers();unwatchPlayers=()=>{};notice('本場最終成績已鎖定並同步至管理端。');}
  }catch(error){finalRetryAt=Date.now()+2000;if(queryRoundId===roundId)notice(friendlyError(error),true);}
  finally{finalLoading=false;renderQuery();}
}
function updateQuery(){
  if(!queryOpen||!race?.roundId)return;
  if(race.roundId!==queryRoundId){closeQuery();return;}
  renderQuery();
  const live=isRunning(race,service.now());
  const settled=race.status==='stopped'||service.now()>=Number(race.endsAt)+8000+(service.clockUncertainty||0)+150;
  if(!live&&settled)void lockFinalQuery();
}
function tick(){
  if(!service)return;
  const live=isRunning(race,service.now()),hasRound=!!race?.roundId;
  const authorized=service.host&&confirmed&&navigator.onLine&&!busy;
  const settling=hasRound&&!live&&race.status==='running';
  $('admin-status').textContent=live?'競賽進行中':settling?'結算中':race?.status==='stopped'?'已手動停止':hasRound?'時間到 · 已結束':'等待開始';
  $('admin-status').dataset.state=live?'running':hasRound?'ended':'ready';
  $('admin-clock').textContent=hasRound?formatClock(race.endsAt-service.now()):'--:--';
  $('admin-clock').classList.toggle('urgent',live&&race.endsAt-service.now()<30000);
  $('admin-round').textContent=hasRound?'#'+race.roundId.slice(0,8):'尚未開賽';
  $('start-btn').disabled=!authorized||live;
  $('start-btn').textContent=hasRound?'▶ 開始新一場':'▶ 開始競賽';
  $('stop-btn').disabled=!authorized||!live;
  $('reset-btn').disabled=!authorized||!hasRound;
  $('query-btn').disabled=!hasRound||!navigator.onLine;
  $('duration-minutes').disabled=busy||live||!service.host;
  $('duration-seconds').disabled=busy||live||!service.host;
  updateQuery();
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
  void act(async()=>{await service.resetRace(roundId);closeQuery();},'排行榜已重置，請設定時間後開始新一場。');
});
$('query-btn').addEventListener('click',()=>queryOpen?closeQuery():beginQuery());
window.addEventListener('offline',()=>{confirmed=false;connection(false,'離線 · 無法操作');tick();});
window.addEventListener('online',async()=>{
  try{await service?.syncClock?.();connection(true,demo?'本機示範':'已重新連線');if(demo)confirmed=true;}catch(error){notice(friendlyError(error),true);}tick();
});
try{
  service=await createService();hostUI();
  service.watchRace((next,meta={})=>{
    const changed=race?.roundId!==next?.roundId;race=next;confirmed=!meta.cached;
    if(changed&&queryOpen)closeQuery();
    if(changed&&next?.duration>0){$('duration-minutes').value=Math.floor(next.duration/60);$('duration-seconds').value=next.duration%60;}
    connection(confirmed,meta.cached?'等待伺服器確認':demo?'本機示範':'已連上競賽');hostUI();
  },error=>{confirmed=false;connection(false,'連線失敗');notice(friendlyError(error),true);tick();});
}catch(error){notice(friendlyError(error),true);connection(false,'無法連線');}
setInterval(tick,250);
document.addEventListener('visibilitychange',()=>{if(!document.hidden)tick();});
