import { createService, demo, friendlyError } from './service.mjs';
import { normalizeName, isRunning, formatClock } from './model.mjs';
import { SeaGame, LEVELS } from './engine.mjs';
import { ArcadeRenderer } from './renderer.mjs';
import { ArcadeAudio, confetti, punch } from './effects.mjs';
import './navigation.mjs';
const $=id=>document.getElementById(id);
const canvas=$('game'), storage=demo?sessionStorage:localStorage;
const renderer=new ArcadeRenderer(canvas),audio=new ArcadeAudio($('sound-btn'));
let lastEffectScore=0,lastCountdownNumber=null;
let service, race=null, identity=null, record=null, activeRound=null, busy=false;
let pending=null, sending=false, networkPaused=false, manualPaused=false, endedByRace=false, lastFrame=0, countdownUntil=0;
const key='fishball-race-v2-identity';
try{identity=JSON.parse(storage.getItem(key)||'null');if(identity?.name)$('player-name').value=identity.name;}catch{}
if(demo){$('demo-label').hidden=false;$('board-link').href+='?demo=1';}
if(['localhost','127.0.0.1'].includes(location.hostname)&&new URLSearchParams(location.search).get('emulator')==='1')$('board-link').href+='?emulator=1';
function notice(text='',error=false){$('notice').textContent=text;$('notice').classList.toggle('error',error);}
function connected(ok,text){$('connection').textContent=text;$('connection').classList.toggle('offline',!ok);}
const engine=new SeaGame({
  change:updateHUD,
  score:()=>{scoreFeedback();publish(false);},
  levelClear:()=>{publish(false);audio.cue('win');confetti();showMessage('過關了！','本局累計 '+engine.score+' 分。準備好就前往下一關。','level');},
  end:reason=>{publish(true);const cleared=reason.includes('十關全破');audio.cue(cleared?'win':'end');if(cleared)confetti();showMessage(reason,'本局 '+engine.score+' 分，個人最高以資料庫已同步成績為準。','replay');}
});
function scoreFeedback(){
  const delta=engine.score-lastEffectScore;lastEffectScore=engine.score;
  renderer.burst(delta,engine);punch($('score'));punch(canvas.parentElement,delta<0?'hit-flash':'positive-flash');
  audio.cue(delta<0?'hurt':'score');
  if(delta<0||engine.comboCount>=2){
    $('combo-badge').textContent=delta<0?'小心誤捕！ '+delta:'COMBO ×'+Math.min(engine.comboCount,8);
    punch($('combo-badge'),'combo-show');
  }
}
function updateHUD(){
  $('score').textContent=engine.score;
  $('best').textContent=record?(endedByRace?record.bestScore:Math.max(record.completedBestScore,engine.score)):0;
  $('sustain').textContent=engine.sustain??100;
  $('sustain').classList.toggle('urgent',engine.sustain<=25);
  $('sustain-fill').style.transform='scaleX('+Math.max(0,(engine.sustain??100)/100)+')';
  $('level-label').textContent='第 '+engine.level+' / 10 關';
  $('level-clock').textContent='本關 '+formatClock(Math.max(0,LEVELS[engine.level-1].seconds*1000-(engine.elapsed||0)));
}
function showMessage(title,detail,action){
  $('game-message').dataset.action=action||'result';
  $('message-kicker').textContent=action==='level'?'★ STAGE CLEAR ★':action==='countdown'?'全場挑戰，準備出發！':engine.status==='finished'?'本局挑戰完成':'海洋冒險 · 魚丸追追樂';
  $('game-message').hidden=false;$('message-title').textContent=title;$('message-detail').textContent=detail;
  $('continue-btn').hidden=!['level','resume','network'].includes(action);
  $('continue-btn').textContent=action==='level'?'下一關':action==='network'?'重新同步並繼續':'繼續遊戲';
  $('continue-btn').dataset.action=action||'';
  $('replay-btn').hidden=action!=='replay'||!canPlay();
  $('replay-btn').disabled=sending||!!pending;
  // Never let a player abandon an unacknowledged score by changing identity.
  $('lobby-btn').disabled=sending||!!pending;
  $('lobby-btn').hidden=action==='countdown';
}
function canPlay(){return !!service&&navigator.onLine&&!busy&&!endedByRace&&isRunning(race,service.now());}
function publish(finished){
  if(!record||!activeRound||!service||endedByRace)return;
  // Single in-flight write + latest pending state: responses can never arrive out of order.
  pending={roundId:activeRound,id:identity.id,attempt:record.attempt,score:engine.score,level:engine.level,finished};
  void pump();
}
async function pump(){
  if(sending||!pending||!service)return;
  if(!isRunning(race,service.now())||race.roundId!==pending.roundId){pending=null;return;}
  sending=true;
  if(!$('game-message').hidden){$('replay-btn').disabled=true;$('lobby-btn').disabled=true;}
  const payload=pending;pending=null;
  try{
    const saved=await service.report(payload.roundId,payload.id,payload.attempt,payload.score,payload.level,payload.finished);
    if(activeRound===payload.roundId&&record?.attempt===payload.attempt){record=saved;$('best').textContent=saved.bestScore;}
    connected(true,demo?'本機示範':'成績已同步');
    if(networkPaused){networkPaused=false;notice('連線已恢復。按繼續遊戲後恢復操作。');if(engine.status==='paused')showMessage('連線已恢復','全球競賽倒數持續進行。','resume');}
  }catch(error){
    if(activeRound!==payload.roundId||endedByRace)return;
    if(isRunning(race,service.now())){
      pending=pending||payload;networkPaused=true;manualPaused=true;engine.pause();connected(false,'成績尚未同步');notice(friendlyError(error),true);
      showMessage('暫停同步','分數尚未送達資料庫。請恢復網路後重試；競賽倒數不暫停。','network');
    }
  }finally{
    sending=false;
    if(!networkPaused&&pending)void pump();
    if(!$('game-message').hidden){$('replay-btn').disabled=!!pending;$('lobby-btn').disabled=!!pending;}
  }
}
async function begin(name,forceNew=false){
  if(!canPlay())return;
  audio.unlock();
  busy=true;$('join-btn').disabled=true;$('replay-btn').disabled=true;
  const round=race.roundId;
  try{
    if(pending||sending)throw new Error('請等待上一局成績同步完成。');
    if(forceNew||!identity||identity.name!==name){identity={id:crypto.randomUUID(),name};storage.setItem(key,JSON.stringify(identity));}
    const saved=await service.startPlayer(round,identity.id,name);
    if(race?.roundId!==round||!isRunning(race,service.now()))throw new Error('競賽已截止或重置。');
    record=saved;activeRound=round;networkPaused=false;manualPaused=false;endedByRace=false;
    $('playing-name').textContent=name+' #'+identity.id.slice(0,4);
    $('identity').textContent='玩家編號 #'+identity.id.slice(0,8)+' · 使用同一名字重玩會保留成績';
    $('lobby').hidden=true;$('play-area').hidden=false;document.body.classList.add('is-playing');notice();
    renderer.reset();lastEffectScore=0;lastCountdownNumber=3;
    engine.start();engine.pause();countdownUntil=performance.now()+3000;audio.cue('tick');
    showMessage('3','準備好出發！','countdown');
    draw();
  }catch(error){notice(friendlyError(error),true);}finally{busy=false;updateRaceUI();}
}
function finishRace(reset=false){
  if(endedByRace&& !reset)return;
  endedByRace=true;pending=null;countdownUntil=0;engine.stop();
  if(!$('play-area').hidden){
    const acknowledged=record?.bestScore??0;
    if(!reset)audio.cue('end');
    const stopped=!reset&&race?.status==='stopped';
    showMessage(reset?'本場已重置':stopped?'本場已停止':'時間到！',reset?'等待主持人開始新一場競賽。':(stopped?'主持人已結束本場，成績已截止。':'已停止遊戲與成績更新。')+'\n已同步的個人最高：'+acknowledged+' 分\n最終排名請看現場看板。');
  }
}
function updateRaceUI(){
  if(!service)return;
  const running=isRunning(race,service.now()), remaining=running?race.endsAt-service.now():0;
  $('clock').textContent=formatClock(remaining);$('clock').classList.toggle('urgent',running&&remaining<=30000);
  $('race-status').textContent=running?'競賽進行中 · 隨時加入':race?.status==='stopped'?'主持人已停止本場競賽':race?.status==='running'?'本場競賽已結束':'等待主持人開始競賽';
  $('join-btn').disabled=!running||busy||!navigator.onLine;
  $('join-btn').textContent=running?'加入 / 再挑戰':race?.status==='stopped'?'本場已停止':race?.status==='running'?'本場競賽已結束':'等待競賽開始';
  if(!running&&activeRound)finishRace(race?.roundId!==activeRound);
  if(!$('game-message').hidden && $('continue-btn').dataset.action!=='countdown'){
    if(!running)$('continue-btn').hidden=true;
    $('replay-btn').hidden=!running||engine.status!=='finished';
  }
}
$('join-form').addEventListener('submit',e=>{e.preventDefault();try{void begin(normalizeName($('player-name').value));}catch(error){notice(error.message,true);}});
$('replay-btn').addEventListener('click',()=>void begin(identity.name));
$('continue-btn').addEventListener('click',async()=>{
  if(!canPlay())return;
  const action=$('continue-btn').dataset.action;
  if(action==='network'){
    networkPaused=false;await pump();if(networkPaused||pending||sending)return;
  }
  manualPaused=false;lastFrame=performance.now();
  if(countdownUntil){engine.pause();countdownUntil=performance.now()+3000;showMessage('3','準備好出發！','countdown');return;}
  if(engine.status==='level-clear')engine.nextLevel();else engine.resume();
  $('game-message').hidden=true;
});
$('lobby-btn').addEventListener('click',()=>{
  if(sending||pending)return;
  if(engine.status==='paused'||engine.status==='playing'||engine.status==='level-clear'){
    engine.status='finished';publish(true);
    showMessage('本局已結束','成績同步後，可返回更換玩家。','replay');return;
  }
  engine.stop();activeRound=null;record=null;endedByRace=false;countdownUntil=0;
  $('lobby').hidden=false;$('play-area').hidden=true;document.body.classList.remove('is-playing');$('player-name').focus();updateRaceUI();
});
const directions={up:{x:0,y:-1},down:{x:0,y:1},left:{x:-1,y:0},right:{x:1,y:0}};
function turn(name){if(canPlay()&&!networkPaused){const d=directions[name];if(d)engine.turn(d.x,d.y);}}
window.addEventListener('keydown',e=>{
  if(['INPUT','TEXTAREA'].includes(document.activeElement?.tagName))return;
  const name={ArrowUp:'up',ArrowDown:'down',ArrowLeft:'left',ArrowRight:'right'}[e.key];
  if(name&&!$('play-area').hidden){e.preventDefault();turn(name);}
});
for(const btn of document.querySelectorAll('[data-dir]'))btn.addEventListener('pointerdown',e=>{e.preventDefault();turn(btn.dataset.dir);});
let touch=null;
canvas.addEventListener('pointerdown',e=>{touch={x:e.clientX,y:e.clientY};canvas.setPointerCapture(e.pointerId);});
canvas.addEventListener('pointermove',e=>{
  if(!touch)return;const dx=e.clientX-touch.x,dy=e.clientY-touch.y;
  if(Math.max(Math.abs(dx),Math.abs(dy))<12)return;
  turn(Math.abs(dx)>Math.abs(dy)?dx>0?'right':'left':dy>0?'down':'up');touch={x:e.clientX,y:e.clientY};
});
for(const type of ['pointerup','pointercancel'])canvas.addEventListener(type,()=>touch=null);
document.addEventListener('visibilitychange',()=>{
  updateRaceUI();
  if(document.hidden&&['playing','paused'].includes(engine.status)&&!networkPaused){engine.pause();manualPaused=true;showMessage('暫停一下','競賽倒數仍持續進行。回來後按繼續遊戲。','resume');}
  lastFrame=0;
});
window.addEventListener('offline',()=>{
  connected(false,'離線 · 請恢復網路');networkPaused=true;manualPaused=true;
  if(['playing','paused','level-clear'].includes(engine.status)){engine.pause();showMessage('網路已中斷','競賽倒數不暫停，請重新連線後繼續。','network');}
  updateRaceUI();
});
window.addEventListener('online',async()=>{
  try{await service?.syncClock?.();networkPaused=false;await pump();if(engine.status==='paused'&&!networkPaused)showMessage('網路已恢復','按繼續遊戲回到挑戰。','resume');connected(true,demo?'本機示範':'連線已恢復');}catch(error){notice(friendlyError(error),true);}
  updateRaceUI();
});
function draw(){
  renderer.draw(engine);
  $('tide-alert').hidden=engine.status!=='playing'||25000-(engine.elapsed||0)%25000>=2200;
}
function frame(ts){
  if(service)updateRaceUI();
  const dt=lastFrame?Math.min(ts-lastFrame,100):0;lastFrame=ts;
  if(countdownUntil){
    if(!canPlay()){if(service&&!isRunning(race,service.now()))finishRace();}
    else if(ts>=countdownUntil&&!document.hidden&&!manualPaused&&!networkPaused){countdownUntil=0;engine.resume();$('game-message').hidden=true;audio.cue('go');$('combo-badge').textContent='GO!';punch($('combo-badge'),'combo-show');}
    else if(!networkPaused&&!manualPaused&&!document.hidden){
      const number=Math.max(1,Math.ceil((countdownUntil-ts)/1000));$('message-title').textContent=number;
      if(number!==lastCountdownNumber){lastCountdownNumber=number;audio.cue('tick');punch($('message-title'));}
    }
  }
  if(!document.hidden&&!manualPaused&&!networkPaused&&canPlay())engine.advance(dt);
  if(!$('play-area').hidden){draw();updateHUD();}
  requestAnimationFrame(frame);
}
requestAnimationFrame(frame);
try{
  service=await createService();connected(true,demo?'本機示範':'已連上競賽');
  service.watchRace((next,meta={})=>{
    const changed=race?.roundId!==next?.roundId;
    race=next;
    if(changed){
      if(activeRound)finishRace(true);
      endedByRace=false;activeRound=null;record=null;pending=null;countdownUntil=0;engine.stop();
      $('play-area').hidden=true;$('lobby').hidden=false;document.body.classList.remove('is-playing');notice(next?.roundId?'新一場競賽已開始，輸入名字即可加入。':'等待主持人開始競賽。');
    }
    if(meta.cached)connected(false,'等待伺服器確認');else connected(true,demo?'本機示範':'已連上競賽');
    updateRaceUI();
  },error=>{networkPaused=true;manualPaused=true;engine.pause();notice(friendlyError(error),true);connected(false,'連線失敗');});
}catch(error){notice(friendlyError(error),true);connected(false,'無法連線');$('race-status').textContent='尚未完成競賽連線設定';}

