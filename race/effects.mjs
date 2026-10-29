const reduced=window.matchMedia('(prefers-reduced-motion: reduce)');
export function punch(element,kind='score-pop'){
  if(!element||reduced.matches)return;
  element.classList.remove(kind);void element.offsetWidth;element.classList.add(kind);
}
export function announce(title,detail=''){
  const root=document.getElementById('hype-banner');if(!root)return;
  root.querySelector('strong').textContent=title;root.querySelector('span').textContent=detail;
  punch(root,'hype-show');
}
export function confetti(){
  if(reduced.matches)return;
  const root=document.getElementById('celebration');if(!root)return;
  root.replaceChildren();
  for(let i=0;i<56;i++){
    const bit=document.createElement('i');
    bit.style.cssText='--x:'+Math.random()*100+'%;--r:'+(Math.random()*720-360)+'deg;--delay:'+Math.random()*.55+'s;--color:'+['#ffd52e','#ff604b','#7ff267','#fff6d9','#67dfff'][i%5];
    root.append(bit);
  }
  setTimeout(()=>root.replaceChildren(),3200);
}
export class ArcadeAudio{
  constructor(button){
    this.button=button;this.context=null;this.muted=localStorage.getItem('fishball-race-sound')==='off';
    this.music=new Audio(new URL('./assets/fbbgm.m4a',import.meta.url));this.music.loop=true;this.music.volume=.18;
    this.music.preload='none';this.update();
    button?.addEventListener('click',()=>{this.muted=!this.muted;localStorage.setItem('fishball-race-sound',this.muted?'off':'on');this.update();if(!this.muted)this.unlock();});
    document.addEventListener('visibilitychange',()=>{if(document.hidden)this.music.pause();else if(this.context&&!this.muted)this.music.play().catch(()=>{});});
  }
  update(){if(this.button){this.button.textContent=this.muted?'🔇 聲音關':'🔊 聲音開';this.button.setAttribute('aria-pressed',String(!this.muted));}this.music.muted=this.muted;if(this.muted)this.music.pause();}
  unlock(){if(this.muted)return;try{this.context||=new (window.AudioContext||window.webkitAudioContext)();void this.context.resume();this.music.play().catch(()=>{});}catch{}}
  tone(freq,duration=.1,delay=0,type='square',volume=.035){
    if(this.muted||!this.context||this.context.state!=='running')return;
    const start=this.context.currentTime+delay,osc=this.context.createOscillator(),gain=this.context.createGain();
    osc.type=type;osc.frequency.value=freq;gain.gain.setValueAtTime(volume,start);gain.gain.exponentialRampToValueAtTime(.001,start+duration);
    osc.connect(gain).connect(this.context.destination);osc.start(start);osc.stop(start+duration);
  }
  cue(name){
    if(name==='score'){this.tone(880,.07);this.tone(1320,.12,.07);}
    if(name==='hurt'){this.tone(200,.14,0,'sawtooth');this.tone(100,.18,.1,'sawtooth');}
    if(name==='tick')this.tone(660,.07);
    if(name==='go'||name==='win')[523,659,784,1047].forEach((f,i)=>this.tone(f,.18,i*.09));
    if(name==='end')[784,659,523].forEach((f,i)=>this.tone(f,.2,i*.15));
  }
}

