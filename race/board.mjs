import { createService, demo, friendlyError } from './service.mjs';
import { isRunning, formatClock } from './model.mjs';
import { ArcadeAudio, announce, confetti } from './effects.mjs';
import { pageURL } from './navigation.mjs';
import { RankingView } from './board-ranking.mjs';
const $=id=>document.getElementById(id),audio=new ArcadeAudio($('sound-btn'));
audio.music.pause();audio.music.muted=true;
const ranking=new RankingView(audio);
let leaderId=null,lastWarningSecond=null;
let service,race=null,unwatchTop=()=>{},frozen=false,finalLoading=false,finalComplete=false,lastFinalTry=-Infinity,celebrationStarted=false;
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
    const deadlineGrace=race.status==='running'?8000:0;
    const wait=Math.max(0,(race.endsAt-service.now())+deadlineGrace+(service.clockUncertainty||0)+150);
    if(wait){
      let overlay=document.getElementById('finalizing-overlay');
      if(!overlay){overlay=document.createElement('div');overlay.id='finalizing-overlay';overlay.style.cssText='position:fixed;inset:0;z-index:29000;display:grid;place-items:center;background:#eaf8fff5;padding:20px;text-align:center';overlay.innerHTML='<div style="padding:28px 36px;border:3px solid #8fc8e5;border-radius:16px;background:#fff;box-shadow:0 12px 40px #547e9a33"><strong style="display:block;color:#245675">正在結算最後成績</strong><span style="display:block;margin-top:8px;color:#527795">請稍候，排行榜即將鎖定</span></div>';document.body.append(overlay);}
      await new Promise(resolve=>setTimeout(resolve,Math.min(wait,15000)));
    }
    const players=await service.finalTop(roundId);
    if(race?.roundId===roundId){
      render(players);finalComplete=true;notice(race.status==='stopped'?'主持人已停止本場，最終排名已鎖定。':'競賽結束，最終排名已鎖定。');
      document.getElementById('finalizing-overlay')?.remove();
      connection(true,demo?'本機示範':'最終排名已確認');
      if(players.length){announce('本場魚丸王！',players[0].name+' · '+players[0].bestScore.toLocaleString('zh-TW')+' 分');confetti();audio.cue('win');}
      void celebrateFinal(players,roundId);
    }
  }catch(error){if(race?.roundId===roundId){document.getElementById('finalizing-overlay')?.remove();notice('無法取得最終排名，重新連線後會再確認。 '+friendlyError(error),true);connection(false,'最終排名待確認');}}
  finally{finalLoading=false;tick();}
}
async function celebrateFinal(players,roundId){
 if(celebrationStarted||!players.length)return;celebrationStarted=true;
 const winner=players[0];$('final-winner').textContent=winner.name;$('final-winner-score').textContent=winner.bestScore.toLocaleString('zh-TW')+' 分';
 const overlay=$('final-celebration');overlay.hidden=false;
 for(let n=10;n>0;n--){if(race?.roundId!==roundId){overlay.hidden=true;return;}$('final-celebration-count').textContent=n;await new Promise(resolve=>setTimeout(resolve,1000));}
 if(race?.roundId===roundId)overlay.hidden=true;
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
      unwatchTop();unwatchTop=()=>{};frozen=false;finalComplete=false;celebrationStarted=false;ranking.reset();leaderId=null;lastWarningSecond=null;render([]);notice();$('final-celebration').hidden=true;
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

