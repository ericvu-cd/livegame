import { createService, demo, friendlyError } from './service.mjs';
import { isRunning, formatClock } from './model.mjs';
import { ArcadeAudio, announce, confetti } from './effects.mjs';
import { pageURL } from './navigation.mjs';
import { RankingView } from './board-ranking.mjs';
const $=id=>document.getElementById(id),audio=new ArcadeAudio($('sound-btn'));
const ranking=new RankingView(audio);
let leaderId=null,lastWarningSecond=null;
let service,race=null,unwatchTop=()=>{},frozen=false,finalLoading=false,finalComplete=false,lastFinalTry=-Infinity;
$('play-link').href=pageURL('fishball-race.html').href;
function notice(message='',error=false){$('notice').textContent=message;$('notice').classList.toggle('error',error);}
function connection(ok,text){$('connection').textContent=text;$('connection').classList.toggle('offline',!ok);}
function render(players){
  ranking.render(players,{running:!!service&&isRunning(race,service.now())});
  leaderId=players[0]?.id??null;
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
  $('freeze-label').textContent=running?'過關更新排名':hasRound?finalComplete?'已鎖定最終排名':'本場已截止 · 正在確認最終排名':'等待主持人開始';
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
      unwatchTop();unwatchTop=()=>{};frozen=false;finalComplete=false;ranking.reset();leaderId=null;lastWarningSecond=null;render([]);notice();
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

