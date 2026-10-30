const $=id=>document.getElementById(id);
const format=n=>n.toLocaleString('zh-TW');
const reduced=matchMedia('(prefers-reduced-motion: reduce)');
export class RankingView{
 constructor(audio){this.audio=audio;this.reset();}
 reset(){
  clearTimeout(this.expiry);this.previous=new Map();this.movements=new Map();this.rows=new Map();this.initial=true;
  $('rankings').replaceChildren();this.updateText('每關完成更新成績，準備爭奪領先寶座！');
 }
 updateText(text,leader=false){$('rank-update-text').textContent=text;$('rank-update').classList.toggle('event-leader',leader);}
 render(input,{running=false}={}){
  const players=input.slice(0,10),old=this.previous,leader=players[0];
  const oldPositions=new Map([...this.rows].filter(([,row])=>row.isConnected).map(([id,row])=>[id,row.getBoundingClientRect().top]));
  const updates=[];let leaderChange=false;
  if(!this.initial&&running){
   for(let index=0;index<players.length;index++){
    const p=players[index],before=old.get(p.id),delta=before?before.index-index:null;
    if(!before||delta){
     this.movements.set(p.id,{delta,expires:performance.now()+9000});
     updates.push({p,index,delta});
    }
   }
   const lastLeader=[...old].find(([,p])=>p.index===0)?.[0];
   leaderChange=!!leader&&!!lastLeader&&leader.id!==lastLeader;
   if(leaderChange){this.updateText('冠軍易主！'+leader.name+' 登上第 1 名 · '+format(leader.bestScore)+' 分',true);this.audio.cue('go');}
   else if(updates.length){
    const up=updates.filter(p=>p.delta>0).sort((a,b)=>b.delta-a.delta)[0];
    const added=updates.find(p=>p.delta===null);
    if(up)this.updateText(up.p.name+' 超越 '+up.delta+' 位挑戰者，升上第 '+(up.index+1)+' 名！');
    else if(added)this.updateText(added.p.name+' 新進前十名！目前第 '+(added.index+1)+' 名');
   }else{
    const improved=players.find(p=>old.has(p.id)&&p.bestScore>old.get(p.id).score);
    if(improved)this.updateText(improved.name+' 完成關卡 · 最高分提升至 '+format(improved.bestScore)+' 分');
   }
  }
  $('empty-state').hidden=players.length>0;$('champion-banner').classList.toggle('is-empty',!leader);
  $('champion-name').textContent=leader?.name||'虛位以待';$('champion-name').title=leader?.name||'';
  $('champion-id').textContent=leader?'#'+leader.id.slice(0,4):'等待挑戰者';
  $('champion-score').textContent=leader?format(leader.bestScore):'—';$('champion-unit').textContent='分';
  for(const index of [1,2]){
   const p=players[index],card=$('podium-'+(index+1));
   card.querySelector('.podium-name').textContent=p?.name||'虛位以待';card.querySelector('.podium-name').title=p?.name||'';
   card.querySelector('.podium-id').textContent=p?'#'+p.id.slice(0,4):'等待挑戰者';
   card.querySelector('.podium-score>span').textContent=p?format(p.bestScore):'—';
  }
  for(let index=0;index<3;index++){
   const p=players[index],card=index===0?$('champion-banner'):$('podium-'+(index+1));
   let badge=card.querySelector('.podium-movement');
   if(!badge){badge=document.createElement('span');badge.className='movement podium-movement';card.append(badge);}
   badge.hidden=!p;card.dataset.playerId=p?.id||'';
   const before=p&&old.get(p.id);
   if(p&&before&&before.index!==index&&!reduced.matches){
    card.getAnimations().forEach(a=>a.cancel());
    card.animate([{transform:'translateY(18px)',filter:'brightness(1.5)'},{transform:'translateY(0)',filter:'brightness(1)'}],{duration:850,easing:'cubic-bezier(.22,1,.36,1)'});
   }
  }
  const visible=new Set(players.map(p=>p.id));
  for(const [id,row] of this.rows)if(!visible.has(id)){row.remove();this.rows.delete(id);this.movements.delete(id);}
  players.forEach((p,index)=>{
   let row=this.rows.get(p.id);const before=old.get(p.id),isNew=!row;
   if(!row){
    row=document.createElement('tr');row.dataset.playerId=p.id;
    row.innerHTML='<td class="rank-number"><span></span></td><td class="rank-name"><b></b><small></small></td><td class="rank-movement"><span class="movement"></span></td><td class="rank-state"><span class="player-phase"></span></td><td class="rank-score align-right"><small class="score-delta"></small><span></span></td>';
    this.rows.set(p.id,row);
   }
   row.dataset.rank=index+1;row.classList.toggle('rank-first',index===0);
   row.querySelector('.rank-number span').textContent=String(index+1).padStart(2,'0');
   row.querySelector('.rank-name b').textContent=p.name;row.querySelector('.rank-name small').textContent='#'+p.id.slice(0,4);
   row.querySelector('.rank-name').title=p.name+' #'+p.id;
   const score=row.querySelector('.rank-score>span');score.textContent=format(p.bestScore);
   const gain=before?p.bestScore-before.score:0;
   if(gain>0&&running){
    row.querySelector('.score-delta').textContent='+'+format(gain);
    row.dataset.scoreExpires=performance.now()+9000;
    if(!reduced.matches)score.animate([{color:'#fff',textShadow:'0 0 20px #ffe080'},{color:'inherit',textShadow:'none'}],{duration:1200});
   }
   row.querySelector('.player-phase').textContent=!running?'截止計分':p.phase==='finished'?'十關完成':'最近同步 · 第 '+(p.level||1)+' 關';
   if(index<3){row.remove();return;}
   const tableIndex=index-3;
   if($('rankings').children[tableIndex]!==row)$('rankings').insertBefore(row,$('rankings').children[tableIndex]||null);
   if(!reduced.matches){
    const offset=oldPositions.has(p.id)?oldPositions.get(p.id)-row.getBoundingClientRect().top:0;
    if(offset){row.getAnimations().forEach(a=>a.cancel());row.animate([{transform:'translateY('+offset+'px)',position:'relative',zIndex:3},{transform:'translateY(0)',position:'relative',zIndex:3}],{duration:850,easing:'cubic-bezier(.22,1,.36,1)'});}
    else if(isNew&&!this.initial)row.animate([{opacity:0,transform:'translateX(28px)'},{opacity:1,transform:'translateX(0)'}],{duration:600});
   }
  });
  this.previous=new Map(players.map((p,index)=>[p.id,{index,score:p.bestScore}]));if(players.length)this.initial=false;
  this.refreshMovements();
  if(leaderChange&&!reduced.matches)$('champion-banner').animate([{filter:'brightness(1.8)',transform:'scale(1.025)'},{filter:'brightness(1)',transform:'scale(1)'}],{duration:1100});
 }
 refreshMovements(){
  clearTimeout(this.expiry);const now=performance.now();let next=Infinity;
  for(const [id,row] of this.rows){
   let m=this.movements.get(id);
   if(m&&m.expires<=now){this.movements.delete(id);m=null;}
   const badge=row.querySelector('.movement');
   const kind=!m?'same':m.delta===null?'new':m.delta>0?'up':'down';
   badge.className='movement movement-'+kind;badge.textContent=!m?'—':m.delta===null?'NEW':(m.delta>0?'▲ ':'▼ ')+Math.abs(m.delta);
   badge.setAttribute('aria-label',!m?'名次不變':m.delta===null?'新進榜':(m.delta>0?'上升':'下降')+Math.abs(m.delta)+'名');
   for(const card of [$('champion-banner'),$('podium-2'),$('podium-3')]){
    if(card.dataset.playerId===id){
     const podiumBadge=card.querySelector('.podium-movement');
     podiumBadge.className=badge.className+' podium-movement';podiumBadge.textContent=badge.textContent;
     podiumBadge.setAttribute('aria-label',badge.getAttribute('aria-label'));podiumBadge.hidden=!m;
    }
   }
   row.classList.toggle('is-rising',kind==='up');
   if(m)next=Math.min(next,m.expires);
   const scoreExpiry=Number(row.dataset.scoreExpires)||0;
   if(scoreExpiry>now)next=Math.min(next,scoreExpiry);else row.querySelector('.score-delta').textContent='';
  }
  if(Number.isFinite(next))this.expiry=setTimeout(()=>this.refreshMovements(),Math.max(25,next-now+20));
 }
}
