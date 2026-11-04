import {createService,demo,friendlyError} from './service.mjs';
import {normalizeName,isRunning,formatClock} from './model.mjs';

// This layer deliberately leaves the supplied game's artwork, scenes, controls
// and scoring untouched. It only supplies the race identity and score bridge.
const shell=document.createElement('div');
shell.innerHTML=`<style>
 #race-strip{position:fixed;bottom:0;left:0;right:0;z-index:11000;background:#082c46ee;color:#fff;border-top:2px solid #e9b94a;padding:5px 10px;font:13px/1.5 system-ui;text-align:center;pointer-events:none;transition:transform .18s ease,opacity .18s ease}
 #race-strip.race-strip--collapsed{transform:translateY(110%);opacity:0}
 #race-status-panel{position:fixed;inset:0;z-index:20000;background:#061a2de8;display:flex;align-items:center;justify-content:center;padding:20px;color:white;font:16px/1.6 system-ui}
 #race-status-panel[hidden]{display:none} #race-status-panel form{width:min(360px,100%);background:#123d58;border:3px solid #e9b94a;border-radius:16px;padding:24px;box-shadow:0 10px 50px #0008}
 #race-status-panel h2{margin:0 0 12px;color:#ffd56b} #race-status-panel input{box-sizing:border-box;width:100%;padding:12px;font:inherit;border-radius:8px;border:2px solid #e9b94a;margin:8px 0}
 #race-status-panel button{padding:10px 16px;margin:8px 5px 0 0;font:inherit;border:0;border-radius:8px;background:#ffce59;color:#15334b;font-weight:bold} #race-status-panel button:disabled{opacity:.5}
 #race-notice{white-space:pre-line;color:#ffe8a3} #race-connection{font-size:12px}
 </style><div id="race-strip"><span id="race-status">連線中</span> · <strong id="race-clock">00:00</strong> <span id="race-player"></span> <span id="race-connection"></span></div>
 <div id="race-status-panel" hidden><form id="join-form"><h2 id="race-title">競賽狀態</h2><label id="race-name-label">玩家名字<input id="player-name" maxlength="40" autocomplete="nickname" required placeholder="請輸入名字"></label><div id="race-notice" role="status"></div><button id="join-btn" type="submit">儲存名字</button><button id="race-close" type="button">關閉</button></form></div>`;
document.body.append(shell);
const $=id=>document.getElementById(id),storage=demo?sessionStorage:localStorage,key='fishball-race-v2-identity';
let service,race,identity,record,round,authorized=false,busy=false,sending=false,pending,lastSent='',launchingOriginal=false,networkFailed=false,terminal=false;
let reportedLevels=new Set();
try{identity=JSON.parse(storage.getItem(key)||'null');$('player-name').value=identity?.name||'';}catch{}
const active=()=>!!service&&isRunning(race,service.now())&&navigator.onLine;
window.fishballRaceAllowed=()=>authorized&&active()&&!networkFailed;
function setPlaying(playing){$('race-strip').classList.toggle('race-strip--collapsed',playing);}
window.fishballRaceGameState=state=>setPlaying(state==='playing');
function setPlayerLabel(){ $('race-player').textContent=identity?` · ${identity.name} #${identity.id.slice(0,4)}`:''; }
function panel(title,text,{name=false,close=true}={}){
 $('race-title').textContent=title;$('race-notice').textContent=text;
 $('race-name-label').hidden=!name;$('join-btn').hidden=!name;$('race-close').hidden=!close;
 $('join-btn').disabled=busy;$('race-status-panel').hidden=false;
 if(name)setTimeout(()=>$('player-name').focus(),0);
}
function waitingPanel(){
 panel('競賽準備中',identity?`已登記「${identity.name}」。\n等待主持人開始，開賽後直接按遊戲原本的 START。`:'請先輸入玩家名字。\n主持人開始競賽後，即可直接按遊戲原本的 START。',{name:true,close:false});
}
function syncPanel(){
 if(networkFailed||terminal)return;
 if(!race||race.status==='ready'||race.status==='stopped'){waitingPanel();return;}
 if(active()&&identity){$('race-status-panel').hidden=true;return;}
 if(active())panel('請先登記名字','輸入名字後，直接按遊戲原本的 START 開始挑戰。',{name:true,close:false});
 else panel('競賽已結束','本場競賽已結束，請等待下一場。',{name:!!identity,close:false});
}
function stop(text){
 authorized=false;pending=null;terminal=true;setPlaying(false);window.fishballOriginal.stop();
 panel('競賽已截止',text+`\n已同步個人最高：${record?.bestScore??0} 分。最終名次請看現場看板。`,{close:false});
}
async function startAttempt(){
 if(launchingOriginal||busy)return;
 if(!active()){syncPanel();return;}
 if(!identity?.name){panel('請先登記名字','請輸入名字後再開始遊戲。',{name:true,close:false});return;}
 if(sending||pending){panel('成績同步中','請等上一局完成關卡的成績同步後再挑戰。',{close:false});return;}
 busy=true;
 try{
  const nextRound=race.roundId;
  const saved=await service.startPlayer(nextRound,identity.id,identity.name);
  if(race.roundId!==nextRound||!active())throw Error('本場已截止。');
  record=saved;round=nextRound;authorized=true;terminal=false;networkFailed=false;lastSent='';reportedLevels=new Set();setPlayerLabel();
  $('race-status-panel').hidden=true;
  launchingOriginal=true;$('startBtn').click();launchingOriginal=false;
 }catch(error){panel('暫時無法開始',friendlyError(error),{close:false});}
 finally{busy=false;}
}
for(const id of ['startBtn','playAgainBtn'])$(id).addEventListener('click',e=>{
 if(launchingOriginal)return;
 e.preventDefault();e.stopImmediatePropagation();void startAttempt();
},true);
$('race-close').onclick=()=>{$('race-status-panel').hidden=true;};
$('join-form').onsubmit=e=>{
 e.preventDefault();
 try{
  const name=normalizeName($('player-name').value);
  if(!identity||identity.name!==name)identity={id:crypto.randomUUID(),name};
  storage.setItem(key,JSON.stringify(identity));setPlayerLabel();
  if(active())$('race-status-panel').hidden=true;else waitingPanel();
 }catch(error){$('race-notice').textContent=friendlyError(error);}
};
function queueScore(payload){
 if(!authorized||!record||!active()||record.phase==='finished')return;
 if(payload.kind==='level'&&reportedLevels.has(payload.level))return;
 if(payload.kind==='level')reportedLevels.add(payload.level);
 const signature=JSON.stringify(payload);if(signature===lastSent)return;lastSent=signature;
 pending={...payload,round,id:identity.id,attempt:record.attempt};void pump();
}
window.fishballRaceLevelComplete=payload=>queueScore({...payload,kind:'level'});
window.fishballRaceAttemptEnded=payload=>queueScore({...payload,finished:false,kind:'attempt-end'});
async function pump(){
 if(sending||!pending||!active())return;
 const p=pending;pending=null;sending=true;
 try{
  const saved=await service.report(p.round,p.id,p.attempt,p.score,p.level,p.finished);
  if(round===p.round&&record?.attempt===p.attempt)record=saved;
  $('race-connection').textContent=demo?' · 本機示範':' · 已同步';
 }catch(error){
  if(authorized&&active()){
   pending=pending||p;networkFailed=true;setPlaying(false);window.fishballOriginal.stop();
   panel('成績尚未同步',friendlyError(error)+'\n恢復連線後按「重試同步」。',{close:false});
   $('race-retry').hidden=false;
  }
 }finally{sending=false;if(pending&&!networkFailed)void pump();}
}
const retry=document.createElement('button');retry.id='race-retry';retry.type='button';retry.textContent='重試同步';retry.hidden=true;$('join-form').append(retry);
retry.onclick=async()=>{
 if(!active())return;networkFailed=false;await pump();
 if(networkFailed||pending||sending)return;
 retry.hidden=true;$('race-status-panel').hidden=true;
 if($('endOverlay').classList.contains('hidden'))window.resumeFromPause();
};
function tick(){
 if(!service)return;
 const live=active();$('race-clock').textContent=formatClock(live?race.endsAt-service.now():0);
 $('race-status').textContent=live?'競賽進行中':race?.status==='running'?'本場已結束':race?.status==='stopped'?'本場已停止':'等待競賽開始';
 if(authorized&&(!isRunning(race,service.now())||race?.roundId!==round)){
  stop(race?.roundId!==round?'本場已重置。':race?.status==='stopped'?'主持人已停止本場。':'時間到！');
  return true;
 }
 return false;
}
window.addEventListener('offline',()=>{
 if(!authorized)return;networkFailed=true;setPlaying(false);window.fishballOriginal.stop();
 panel('網路中斷','競賽倒數持續進行。請恢復連線後重試同步。',{close:false});retry.hidden=false;
});
try{
 service=await createService();
 service.watchRace(next=>{
  const changed=race?.roundId!==next?.roundId;race=next;
  if(changed){authorized=false;pending=null;round=null;record=null;lastSent='';terminal=false;networkFailed=false;setPlaying(false);window.fishballOriginal.reset();retry.hidden=true;}
  if(!tick())syncPanel();
 },error=>{networkFailed=true;setPlaying(false);window.fishballOriginal.stop();panel('無法連線',friendlyError(error),{close:false});});
 $('race-connection').textContent=demo?' · 本機示範':' · 已連上競賽';setPlayerLabel();
}catch(error){panel('無法連線',friendlyError(error),{close:false});}
setInterval(tick,100);
