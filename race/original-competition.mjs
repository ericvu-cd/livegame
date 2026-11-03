import {createService,demo,friendlyError} from './service.mjs';
import {normalizeName,isRunning,formatClock} from './model.mjs';

// Competition shell only. Movement, maps, scoring, artwork and audio live in
// the supplied platform game's original inline script.
const shell=document.createElement('div');
shell.innerHTML=`<style>
 #race-strip{position:fixed;bottom:0;left:0;right:0;z-index:11000;background:#082c46ee;color:#fff;border-top:2px solid #e9b94a;padding:5px 10px;font:13px/1.5 system-ui;text-align:center;pointer-events:none}
 #race-dialog{position:fixed;inset:0;z-index:20000;background:#061a2de8;display:flex;align-items:center;justify-content:center;padding:20px;color:white;font:16px/1.6 system-ui}
 #race-dialog[hidden]{display:none} #race-dialog form{width:min(360px,100%);background:#123d58;border:3px solid #e9b94a;border-radius:16px;padding:24px;box-shadow:0 10px 50px #0008}
 #race-dialog h2{margin:0 0 12px;color:#ffd56b} #race-dialog input{box-sizing:border-box;width:100%;padding:12px;font:inherit;border-radius:8px;border:2px solid #e9b94a;margin:8px 0}
 #race-dialog button{padding:10px 16px;margin:8px 5px 0 0;font:inherit;border:0;border-radius:8px;background:#ffce59;color:#15334b;font-weight:bold} #race-dialog button:disabled{opacity:.5}
 #race-notice{white-space:pre-line;color:#ffe8a3} #race-connection{font-size:12px}
 </style><div id="race-strip"><span id="race-status">連線中</span> · <strong id="race-clock">00:00</strong> <span id="race-player"></span> <span id="race-connection"></span></div>
 <div id="race-dialog" hidden><form id="join-form"><h2 id="race-title">加入魚丸競賽</h2><label id="race-name-label">玩家名字<input id="player-name" maxlength="40" autocomplete="nickname" required placeholder="請輸入名字"></label><div id="race-notice" role="status"></div><button id="join-btn" type="submit">開始挑戰</button><button id="race-close" type="button">返回遊戲說明</button></form></div>`;
document.body.append(shell);
const $=id=>document.getElementById(id),storage=demo?sessionStorage:localStorage,key='fishball-race-v2-identity';
let service,race,identity,record,round,authorized=false,busy=false,sending=false,pending,lastSent='',replaying=false,networkFailed=false;
let reportedLevels=new Set();
try{identity=JSON.parse(storage.getItem(key)||'null');$('player-name').value=identity?.name||'';}catch{}
const active=()=>!!service&&isRunning(race,service.now())&&navigator.onLine;
window.fishballRaceAllowed=()=>authorized&&active()&&!networkFailed;
function message(title,text,canJoin=false){
 $('race-title').textContent=title;$('race-notice').textContent=text;
 $('race-name-label').hidden=!canJoin;$('join-btn').hidden=!canJoin;$('join-btn').disabled=busy||!active();
 $('race-dialog').hidden=false;
 if(canJoin)$('player-name').focus();
}
function stop(text){
 authorized=false;pending=null;window.fishballOriginal.stop();
 message('競賽已截止',text+'\n已同步個人最高：'+(record?.bestScore??0)+' 分。最終名次請看現場看板。');
}
function openJoin(){
 if(!active()){message('等待競賽',race?.status==='stopped'?'主持人已停止本場。':'請等待主持人開始新一場競賽。');return;}
 message('加入魚丸競賽','每關完成才同步累計分數；失敗或截止保留已完成關卡成績。重玩保留最高分。',true);
}
for(const id of ['startBtn','playAgainBtn'])$(id).addEventListener('click',e=>{
 if(replaying)return;
 e.preventDefault();e.stopImmediatePropagation();openJoin();
},true);
$('race-close').onclick=()=>{$('race-dialog').hidden=true;if(!authorized)window.fishballOriginal.reset();};
$('join-form').onsubmit=async e=>{
 e.preventDefault();if(busy||!active())return;
 busy=true;$('join-btn').disabled=true;
 try{
  if(sending||pending)throw Error('請等上一局成績同步完成後再挑戰。');
  const name=normalizeName($('player-name').value),nextRound=race.roundId;
  if(!identity||identity.name!==name){identity={id:crypto.randomUUID(),name};storage.setItem(key,JSON.stringify(identity));}
  const saved=await service.startPlayer(nextRound,identity.id,name);
  if(race.roundId!==nextRound||!active())throw Error('本場已截止。');
  record=saved;round=nextRound;authorized=true;networkFailed=false;lastSent='';reportedLevels=new Set();
  $('race-player').textContent=' · '+name+' #'+identity.id.slice(0,4);$('race-dialog').hidden=true;
  replaying=true;$('startBtn').click();replaying=false;
 }catch(error){$('race-notice').textContent=friendlyError(error);}finally{busy=false;$('join-btn').disabled=!active();}
};
window.fishballRaceLevelComplete=payload=>{
 if(!authorized||!record||!active()||record.phase==='finished')return;
 if(reportedLevels.has(payload.level))return;
 reportedLevels.add(payload.level);
 const signature=JSON.stringify(payload);if(signature===lastSent)return;lastSent=signature;
 pending={...payload,round,id:identity.id,attempt:record.attempt};void pump();
};
async function pump(){
 if(sending||!pending||!active())return;
 const p=pending;pending=null;sending=true;
 try{
  const saved=await service.report(p.round,p.id,p.attempt,p.score,p.level,p.finished);
  if(round===p.round&&record?.attempt===p.attempt)record=saved;
  $('race-connection').textContent=demo?' · 本機示範':' · 已同步';
 }catch(error){
  if(authorized&&active()){
   pending=pending||p;networkFailed=true;window.fishballOriginal.stop();
   message('成績尚未同步',friendlyError(error)+'\n恢復連線後按「重試同步」。');
   $('race-retry').hidden=false;
  }
 }finally{sending=false;if(pending&&!networkFailed)void pump();}
}
const retry=document.createElement('button');retry.id='race-retry';retry.type='button';retry.textContent='重試同步';retry.hidden=true;$('join-form').append(retry);
retry.onclick=async()=>{
 if(!active())return;networkFailed=false;await pump();
 if(networkFailed||pending||sending)return;
 retry.hidden=true;$('race-dialog').hidden=true;
 // Preserve the exact original pause/resume control and current level state.
 if($('endOverlay').classList.contains('hidden'))window.resumeFromPause();
};
function tick(){
 if(!service)return;
 const live=active();$('race-clock').textContent=formatClock(live?race.endsAt-service.now():0);
 $('race-status').textContent=live?'競賽進行中':race?.status==='running'?'本場已結束':race?.status==='stopped'?'本場已停止':'等待競賽開始';
 $('join-btn').disabled=busy||!live;
 if(authorized&&(!isRunning(race,service.now())||race?.roundId!==round))stop(race?.roundId!==round?'本場已重置。':race?.status==='stopped'?'主持人已停止本場。':'時間到！');
}
window.addEventListener('offline',()=>{
 if(!authorized)return;networkFailed=true;window.fishballOriginal.stop();
 message('網路中斷','競賽倒數持續進行。請恢復連線後重試同步。');retry.hidden=false;
});
try{
 service=await createService();
 service.watchRace(next=>{
  const changed=race?.roundId!==next?.roundId;race=next;
  if(changed){authorized=false;pending=null;round=null;record=null;lastSent='';networkFailed=false;
   window.fishballOriginal.reset();$('race-dialog').hidden=true;$('race-player').textContent='';retry.hidden=true;}
  tick();
 },error=>{networkFailed=true;window.fishballOriginal.stop();message('無法連線',friendlyError(error));});
 $('race-connection').textContent=demo?' · 本機示範':' · 已連上競賽';
}catch(error){message('無法連線',friendlyError(error));}
setInterval(tick,100);
