import { createService, demo, friendlyError } from './service.mjs';
import { isRunning, formatClock } from './model.mjs';
import { ArcadeAudio, announce, confetti, punch } from './effects.mjs';
import { pageURL } from './navigation.mjs';
const $=id=>document.getElementById(id),audio=new ArcadeAudio($('sound-btn'));
let previousPlayers=new Map(),leaderId=null,lastWarningSecond=null,lastLeaderAnnouncement=-Infinity;
let service,race=null,unwatchTop=()=>{},frozen=false,finalLoading=false,finalComplete=false,lastFinalTry=-Infinity;
$('play-link').href=pageURL('fishball-race.html').href;
function notice(message='',error=false){$('notice').textContent=message;$('notice').classList.toggle('error',error);}
function connection(ok,text){$('connection').textContent=text;$('connection').classList.toggle('offline',!ok);}
function render(players){
  $('rankings').replaceChildren();$('empty-state').hidden=players.length>0;
  const leader=players[0];
  $('champion-banner').classList.toggle('is-empty',!leader);
  $('champion-name').textContent=leader?leader.name:'就是你！準備好挑戰了嗎？';
  $('champion-id').textContent=leader?'挑戰者 #'+leader.id.slice(0,4):'';
  $('champion-score').textContent=leader?leader.bestScore.toLocaleString('zh-TW'):'READY!';
  $('champion-unit').textContent=leader?'個人最高分':'最高榮耀，等你來拿';
  if(leader&&leaderId&&leader.id!==leaderId&&isRunning(race,service.now())){
    punch($('champion-banner'),'leader-changed');
    if(performance.now()-lastLeaderAnnouncement>6000){announce('冠軍換人！',leader.name+' 搶下領先寶座');audio.cue('go');lastLeaderAnnouncement=performance.now();}
  }
  leaderId=leader?.id??null;
  players.slice(0,10).forEach((player,index)=>{
    const previous=previousPlayers.get(player.id);
    const row=document.createElement('tr');row.dataset.rank=index+1;if(index===0)row.className='rank-first';
    const rank=document.createElement('td');rank.className='rank-number';
    const rankBadge=document.createElement('span');rankBadge.textContent=String(index+1).padStart(2,'0');rank.append(rankBadge);
    const name=document.createElement('td');name.className='rank-name';name.append(document.createTextNode(player.name));
    const id=document.createElement('small');id.textContent='#'+player.id.slice(0,4);name.append(id);name.title=player.name+' #'+player.id;
    const score=document.createElement('td');score.className='rank-score align-right';score.textContent=player.bestScore.toLocaleString('zh-TW');
    if(previous&&previous.index>index){
      row.classList.add('rank-improved');
      const gain=document.createElement('span');gain.className='position-gain';gain.textContent='↑'+(previous.index-index);name.append(gain);
    }
    if(previous&&player.bestScore>previous.score)score.classList.add('score-up');
    const state=document.createElement('td');state.className='rank-state';
    const closed=!isRunning(race,service.now());
    const badge=document.createElement('span');badge.className='player-phase '+(closed||player.phase==='finished'?'phase-finished':'phase-playing');
    badge.textContent=closed?(player.phase==='finished'?'已完成':'截止計分'):player.phase==='finished'?'本局完成':'挑戰中 · 第 '+(player.level||1)+' 關';state.append(badge);
    row.append(rank,name,state,score);$('rankings').append(row);
  });
  previousPlayers=new Map(players.map((p,index)=>[p.id,{index,score:p.bestScore}]));
}
function tick(){
  if(!service)return;
  const running=isRunning(race,service.now()),hasRound=!!race?.roundId;
  const remaining=hasRound?Math.max(0,race.endsAt-service.now()):0;
  $('clock').textContent=hasRound?formatClock(remaining):'--:--';
  $('timer-fill').style.transform='scaleX('+(hasRound?Math.min(1,remaining/(race.duration*1000)):1)+')';
  document.body.classList.toggle('state-running',running);document.body.classList.toggle('state-ready',!hasRound);document.body.classList.toggle('state-finished',hasRound&&!running);
  $('live-badge').textContent=running?'● LIVE · 即時爭霸':hasRound?'本場成績已截止':'挑戰者募集中';
  $('champion-label').textContent=leaderId?(finalComplete?'本場魚丸王':'目前領先'):'下一位魚丸王';
  const warningSecond=Math.ceil(remaining/1000);
  if(running&&warningSecond<=10&&warningSecond!==lastWarningSecond){audio.cue('tick');lastWarningSecond=warningSecond;}
  $('clock').classList.toggle('urgent',running&&remaining<=30000);
  $('race-status').textContent=running?'魚丸追追樂 · 現在加入，挑戰前十名':race?.status==='stopped'?'主持人已停止本場競賽':hasRound?'本場競賽已結束':'不限設備 · 等待管理端開始競賽';
  $('freeze-label').textContent=running?'成績即時更新':hasRound?finalComplete?'已鎖定最終排名':'本場已截止 · 正在確認最終排名':'等待主持人開始';
  if(hasRound&&!running&&!finalComplete&&!finalLoading&&navigator.onLine&&(!frozen||performance.now()-lastFinalTry>5000))void finalize(race.roundId);
}
async function finalize(roundId){
  if(finalLoading||finalComplete||race?.roundId!==roundId)return;
  frozen=true;finalLoading=true;lastFinalTry=performance.now();unwatchTop();unwatchTop=()=>{};
  try{
    const wait=Math.max(0,(race.endsAt-service.now())+(service.clockUncertainty||0)+150);
    if(wait)await new Promise(resolve=>setTimeout(resolve,Math.min(wait,15000)));
    const players=await service.finalTop(roundId);
    if(race?.roundId===roundId){
      render(players);finalComplete=true;notice(race.status==='stopped'?'主持人已停止本場，最終排名已鎖定。':'競賽結束，最終排名已鎖定。');
      connection(true,demo?'本機示範':'最終排名已確認');
      if(players.length){announce('本場魚丸王！',players[0].name+' · '+players[0].bestScore.toLocaleString('zh-TW')+' 分');confetti();audio.cue('win');}
    }
  }catch(error){if(race?.roundId===roundId){notice('無法取得最終排名，重新連線後會再確認。 '+friendlyError(error),true);connection(false,'最終排名待確認');}}
  finally{finalLoading=false;tick();}
}
$('fullscreen-btn').addEventListener('click',async()=>{
  audio.unlock();
  try{if(document.fullscreenElement)await document.exitFullscreen();else await document.documentElement.requestFullscreen();}catch{notice('目前瀏覽器不支援全螢幕，可使用瀏覽器的全螢幕功能。');}
});
document.addEventListener('fullscreenchange',()=>$('fullscreen-btn').textContent=document.fullscreenElement?'離開全螢幕':'全螢幕');
window.addEventListener('offline',()=>connection(false,'離線 · 成績暫停接收'));
window.addEventListener('online',async()=>{
  try{await service?.syncClock?.();connection(true,demo?'本機示範':'已重新連線');if(frozen&&!finalComplete&&race?.roundId)await finalize(race.roundId);}catch(error){notice(friendlyError(error),true);}
});
try{
  service=await createService();connection(true,demo?'本機示範':'已連上競賽');
  service.watchRace((next,meta={})=>{
    const changed=race?.roundId!==next?.roundId;race=next;
    if(changed){
      unwatchTop();unwatchTop=()=>{};frozen=false;finalComplete=false;previousPlayers.clear();leaderId=null;lastWarningSecond=null;render([]);notice();
      $('hype-banner').classList.remove('hype-show');$('celebration').replaceChildren();
      if(next?.roundId&&isRunning(next,service.now())){
        if(service.now()-next.startedAt<3000){announce('GO！全場開戰','吃好魚、衝高分，挑戰魚丸王！');audio.cue('go');}
        const roundId=next.roundId;
        unwatchTop=service.watchTop(roundId,(players,metadata={})=>{
          if(frozen||race?.roundId!==roundId)return;
          if(!isRunning(race,service.now())){void finalize(roundId);return;}
          render(players);connection(!metadata.cached,metadata.cached?'等待伺服器成績':demo?'本機示範':'即時排名連線中');
        },error=>{notice(friendlyError(error),true);connection(false,'排名連線失敗');});
      }
    }
    if(meta.cached)connection(false,'等待伺服器確認');tick();
  },error=>{notice(friendlyError(error),true);connection(false,'連線失敗');});
}catch(error){notice(friendlyError(error),true);connection(false,'無法連線');$('race-status').textContent='尚未完成競賽連線設定';}
setInterval(tick,100);
document.addEventListener('visibilitychange',()=>{if(!document.hidden)tick();});

