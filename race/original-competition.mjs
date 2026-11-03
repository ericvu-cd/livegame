import {createService,demo,friendlyError} from './service.mjs';
import {normalizeName,isRunning,formatClock} from './model.mjs';

// Competition state window. The original platform game remains responsible for
// movement, maps, scoring, artwork and audio.
const shell=document.createElement('div');
shell.id='race-shell';
shell.innerHTML=`<style>
 #race-dialog{position:fixed;inset:0;z-index:20000;background:#061a2de8;display:flex;align-items:center;justify-content:center;padding:20px;color:white;font:16px/1.6 system-ui}
 #race-dialog[hidden]{display:none}
 #race-dialog form{width:min(390px,100%);background:#123d58;border:3px solid #e9b94a;border-radius:16px;padding:22px;box-shadow:0 10px 50px #0008}
 #race-dialog h2{margin:0;color:#ffd56b;font-size:1.25rem}
 #race-dialog .race-head{display:flex;align-items:center;justify-content:space-between;gap:12px;margin-bottom:12px}
 #race-clock{font-variant-numeric:tabular-nums;font-weight:800;color:#fff1b5;white-space:nowrap}
 #race-name-label{display:block}
 #race-dialog input{box-sizing:border-box;width:100%;padding:12px;font:inherit;border-radius:8px;border:2px solid #e9b94a;margin:8px 0;background:#fff;color:#17334a;user-select:text;touch-action:manipulation}
 #race-notice{white-space:pre-line;color:#ffe8a3;min-height:1.5em;margin:4px 0 10px}
 #race-dialog .race-actions{display:flex;flex-wrap:wrap;gap:8px;align-items:center}
 #race-dialog button{padding:10px 16px;font:inherit;border:0;border-radius:8px;background:#ffce59;color:#15334b;font-weight:bold;cursor:pointer;touch-action:manipulation}
 #race-dialog button:disabled{opacity:.45;cursor:not-allowed}
 #race-dialog button.secondary{background:#d5e7f2}
 #race-connection{font-size:12px;color:#d8e9f4}
 /* Running state is a compact in-flow bar between the HUD and playfield;
    it never overlays the bottom legend. */
 #race-dialog.compact{position:relative;inset:auto;z-index:3;display:block;width:100%;padding:0;background:#082c46;color:#fff}
 #race-dialog.compact form{width:100%;padding:5px 9px;border:0;border-bottom:2px solid #e9b94a;border-radius:0;box-shadow:none;background:#082c46;display:flex;align-items:center;justify-content:space-between;gap:8px}
 #race-dialog.compact .race-head{margin:0;min-width:0;gap:8px}
 #race-dialog.compact h2{font-size:12px;white-space:nowrap}
 #race-dialog.compact #race-name-label,#race-dialog.compact #race-notice,#race-dialog.compact #race-retry,#race-dialog.compact #resume-btn,#race-dialog.compact #race-connection{display:none!important}
 #race-dialog.compact .race-actions{flex-shrink:0;gap:5px}
 #race-dialog.compact button{font-size:12px;padding:6px 9px;white-space:nowrap}
 #race-dialog.compact #race-edit{display:inline-block}
 #race-dialog.compact #join-btn[hidden],#race-dialog.compact #race-edit[hidden]{display:none!important}
 @media(max-width:380px){#race-dialog.compact h2{font-size:10px}#race-dialog.compact button{font-size:10px;padding:5px 7px}#race-dialog.compact form{gap:5px;padding-inline:6px}}
 </style>
 <section id="race-dialog" aria-live="polite">
  <form id="join-form" novalidate>
   <div class="race-head"><h2 id="race-title">準備中</h2><strong id="race-clock">--:--</strong></div>
   <label id="race-name-label">玩家名字<input id="player-name" maxlength="40" autocomplete="nickname" required placeholder="請輸入玩家名字"></label>
   <div id="race-notice" role="status">等待管理端開始競賽。</div>
   <div class="race-actions">
    <button id="join-btn" type="submit" disabled>等待競賽開始</button>
    <button id="race-edit" class="secondary" type="button" hidden>修改姓名</button>
    <button id="resume-btn" type="button" hidden>繼續遊戲</button>
    <button id="race-retry" type="button" hidden>重試同步</button>
   </div>
   <div id="race-connection"></div>
  </form>
 </section>`;
const app=document.getElementById('app');
const header=app?.querySelector('header');
if(header)header.after(shell);else document.body.append(shell);
const $=id=>document.getElementById(id),storage=demo?sessionStorage:localStorage,key='fishball-race-v2-identity';
let service,race,identity,record,round,authorized=false,busy=false,sending=false,pending,lastSent='',replaying=false,networkFailed=false,paused=false;
let reportedLevels=new Set();
try{identity=JSON.parse(storage.getItem(key)||'null');$('player-name').value=identity?.name||'';}catch{}
const active=()=>!!service&&isRunning(race,service.now())&&navigator.onLine;
const hasName=()=>!!$('player-name').value.trim();
window.fishballRaceAllowed=()=>authorized&&active()&&!networkFailed&&!paused;
function panel(title,notice,{expanded=true,name=true,join=false,joinText='開始競賽',joinDisabled=false,resume=false,edit=false,editText='修改姓名'}={}){
 const box=$('race-dialog');
 box.hidden=false;box.classList.toggle('compact',!expanded);
 $('race-title').textContent=title;$('race-notice').textContent=notice||'';
 $('race-name-label').hidden=!name;
 $('join-btn').hidden=!join;$('join-btn').textContent=joinText;
 $('join-btn').disabled=joinDisabled||authorized||busy||!active()||!hasName()||networkFailed;
 $('race-edit').hidden=!edit;$('race-edit').textContent=editText;$('resume-btn').hidden=!resume;
 if(expanded&&name&&!authorized)$('player-name').focus();
}
function renderReady(){
 paused=false;panel('準備中','請輸入玩家名字，等待管理端切換為「競賽中」。',{expanded:true,name:true,join:true,joinText:'等待競賽開始'});
}
function renderRunning(){
 paused=false;$('race-player').textContent=hasName()?' · '+$('player-name').value.trim():'';
  // Keep the competition window and its action button visible throughout
  // the running state. After joining, show a disabled confirmation button.
  if(authorized){panel('競賽中','玩家：'+(identity?.name||''),{expanded:true,name:false,join:true,joinText:'已加入競賽',joinDisabled:true});return;}
  panel('競賽中','請輸入玩家名字，按下「開始競賽」加入本場比賽。',{expanded:true,name:true,join:true,joinText:'開始競賽'});
}
function renderEnded(text='本場競賽已結束。'){
 paused=false;panel('已結束',text,{expanded:true,name:false,join:false});
}
function renderPaused(){
 paused=true;panel('暫停中','遊戲已暫停。確認後可繼續本場競賽。',{expanded:true,name:false,join:false,resume:true});
 document.getElementById('pauseOverlay')?.classList.remove('show');
}
function renderCurrent(){
 if(!race||race.status==='ready'||!race.roundId){renderReady();return;}
 if(active()){renderRunning();return;}
 renderEnded(race.status==='stopped'?'主持人已結束本場競賽。':'本場競賽時間已結束。');
}
function stop(text){
 authorized=false;pending=null;window.fishballOriginal.stop();renderEnded(text+'\n已同步個人最高：'+(record?.bestScore??0)+' 分。最終名次請看現場看板。');
}
function openJoin(){
 if(!active()){renderCurrent();return;}
 if(authorized){
   panel('競賽中','玩家：'+(identity?.name||''),{expanded:true,name:false,join:true,joinText:'已加入競賽',joinDisabled:true});
   return;
  return;
 }
 renderRunning();
 if($('race-dialog').classList.contains('compact'))$('race-dialog').classList.remove('compact');
 $('race-dialog').hidden=false;
}
for(const id of ['startBtn','playAgainBtn'])$(id).addEventListener('click',e=>{
 if(replaying)return;
 e.preventDefault();e.stopImmediatePropagation();openJoin();
},true);
$('race-edit').onclick=()=>{
 panel('競賽中','請確認玩家名字後開始。',{expanded:true,name:true,join:true,joinText:'開始競賽'});
 $('player-name').value=identity?.name||$('player-name').value;
 $('player-name').focus();
};
$('player-name').addEventListener('input',()=>{
 $('join-btn').disabled=joinDisabled||authorized||busy||!active()||!hasName()||networkFailed;
 if(active()&&hasName()&&!authorized){
  // Keep the expanded form open while typing; collapse only after leaving it.
 }
});
$('join-form').onsubmit=async e=>{
 e.preventDefault();
 if(busy)return;
 if(!active()){renderCurrent();return;}
 let name;
 try{name=normalizeName($('player-name').value);}catch(error){
  panel('競賽中',error.message,{expanded:true,name:true,join:true,joinText:'開始競賽'});return;
 }
 busy=true;$('join-btn').disabled=true;
 try{
  if(sending||pending)throw Error('請等上一局成績同步完成後再挑戰。');
  const nextRound=race.roundId;
  if(!identity||identity.name!==name){identity={id:crypto.randomUUID(),name};storage.setItem(key,JSON.stringify(identity));}
  const saved=await service.startPlayer(nextRound,identity.id,name);
  if(race.roundId!==nextRound||!active())throw Error('本場已截止。');
  record=saved;round=nextRound;authorized=true;networkFailed=false;lastSent='';reportedLevels=new Set();
  $('race-player').textContent=' · '+name;
    panel('競賽中','玩家：'+name,{expanded:true,name:false,join:true,joinText:'已加入競賽',joinDisabled:true});
   $('race-edit').hidden=true;
  replaying=true;$('startBtn').click();replaying=false;
 }catch(error){
  replaying=false;
  panel(active()?'競賽中':'已結束',friendlyError(error),{expanded:true,name:true,join:active(),joinText:'開始競賽'});
 }finally{busy=false;$('join-btn').disabled=authorized||!active()||!hasName()||networkFailed;}
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
  $('race-connection').textContent=demo?'本機示範':'已同步';
 }catch(error){
  if(authorized&&active()){
   pending=pending||p;networkFailed=true;window.fishballOriginal.stop();
   panel('同步暫停',friendlyError(error)+'\n恢復連線後按「重試同步」。',{expanded:true,name:false,join:false});
   $('race-retry').hidden=false;
  }
 }finally{sending=false;if(pending&&!networkFailed)void pump();}
}
$('race-retry').onclick=async()=>{
 if(!active())return;networkFailed=false;await pump();
 if(networkFailed||pending||sending)return;
 $('race-retry').hidden=true;
 if(paused){renderPaused();return;}
 $('race-dialog').classList.add('compact');
 if($('endOverlay').classList.contains('hidden'))window.resumeFromPause();
};
$('resume-btn').onclick=()=>{
 if(!active()||!authorized)return;
 window.resumeFromPause();
};
window.addEventListener('fishball:pause',renderPaused);
window.addEventListener('fishball:resume',()=>{paused=false;if(authorized&&active())panel('競賽中','玩家：'+(identity?.name||''),{expanded:true,name:false,join:true,joinText:'已加入競賽',joinDisabled:true});});
window.addEventListener('offline',()=>{
 if(!authorized)return;networkFailed=true;window.fishballOriginal.stop();
 panel('網路中斷','競賽倒數持續進行。請恢復連線後重試同步。',{expanded:true,name:false,join:false});$('race-retry').hidden=false;
});
function tick(){
 if(!service)return;
 const live=active();$('race-clock').textContent=formatClock(live?race.endsAt-service.now():0);
 if(authorized&&(!isRunning(race,service.now())||race?.roundId!==round)){
  stop(race?.roundId!==round?'本場已重置。':race?.status==='stopped'?'主持人已停止本場。':'時間到！');return;
 }
 if(!authorized&&!paused){
  if(live){
   if($('race-title').textContent!=='競賽中'||$('race-dialog').hidden)renderRunning();
   $('join-btn').disabled=busy||!hasName()||networkFailed;
  }else if(race?.status==='stopped'||(race?.status==='running'&&race.endsAt<=service.now())){
   if($('race-title').textContent!=='已結束')renderEnded(race.status==='stopped'?'主持人已結束本場競賽。':'本場競賽時間已結束。');
  }else if($('race-title').textContent!=='準備中')renderReady();
 }
}
try{
 service=await createService();
 service.watchRace(next=>{
  const changed=race?.roundId!==next?.roundId;race=next;
  if(changed){authorized=false;pending=null;round=null;record=null;lastSent='';networkFailed=false;paused=false;
   window.fishballOriginal.reset();$('race-retry').hidden=true;
   if(next?.status==='ready'||!next?.roundId)renderReady();else renderCurrent();
  }else renderCurrent();
 },error=>{networkFailed=true;window.fishballOriginal.stop();panel('無法連線',friendlyError(error),{expanded:true,name:false,join:false});});
 $('race-connection').textContent=demo?'本機示範':'已連上競賽';
}catch(error){panel('無法連線',friendlyError(error),{expanded:true,name:false,join:false});}
setInterval(tick,250);
