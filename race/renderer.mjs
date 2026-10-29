import { COLS, ROWS, FOODS } from './engine.mjs';
const C=30;
const palettes={fish:['#0b2743','#48cbf2','#a5f2ff'],shark:['#152539','#7396af','#cfdeeb'],young:['#743323','#ffb52f','#fff095'],protected:['#642342','#f35a83','#ffb5b2']};
function shape(ctx,points,fill,stroke='#09223d',width=1.4){
  ctx.beginPath();points.forEach(([x,y],i)=>i?ctx.lineTo(x,y):ctx.moveTo(x,y));ctx.closePath();ctx.fillStyle=fill;ctx.fill();
  if(stroke){ctx.strokeStyle=stroke;ctx.lineWidth=width;ctx.stroke();}
}
function fishSprite(kind){
  const cv=document.createElement('canvas');cv.width=cv.height=32;const c=cv.getContext('2d');
  if(kind==='ice'){
    shape(c,[[5,9],[16,3],[28,9],[28,24],[17,30],[5,23]],'#82e2f5','#16345b',2);
    shape(c,[[5,9],[16,3],[28,9],[17,15]],'#d5ffff',null);
    shape(c,[[17,15],[28,9],[28,24],[17,30]],'#37addb',null);
    c.strokeStyle='#fff';c.lineWidth=2;c.beginPath();c.moveTo(9,14);c.lineTo(9,20);c.moveTo(16,7);c.lineTo(22,9);c.stroke();return cv;
  }
  if(kind==='protected'){
    shape(c,[[4,10],[9,8],[12,3],[17,7],[24,8],[28,13],[24,22],[17,25],[10,23],[6,26],[5,20],[2,18]],'#81c36b');
    shape(c,[[7,10],[15,6],[24,10],[25,19],[18,24],[9,21]],'#ef5b84','#4b274a',2);
    c.strokeStyle='#a73263';c.lineWidth=2;c.strokeRect(12,11,8,7);c.fillStyle='#10223e';c.fillRect(3,15,2,2);return cv;
  }
  const [,body,light]=palettes[kind]||palettes.fish;
  shape(c,[[5,15],[1,9],[1,24],[6,20]],body);
  if(kind==='shark'){shape(c,[[10,12],[14,3],[19,12]],'#7292ad');shape(c,[[15,21],[20,28],[22,20]],'#597d9d');}
  else {shape(c,[[11,11],[15,6],[20,12]],body);shape(c,[[12,21],[16,26],[20,20]],body);}
  shape(c,[[6,13],[11,9],[22,9],[28,14],[29,17],[24,23],[12,23],[6,20]],body,'#0a233d',1.6);
  shape(c,[[8,13],[13,11],[22,11],[25,14],[10,16]],light,null);
  c.fillStyle='#f3fcff';c.fillRect(22,13,4,5);c.fillStyle='#0e2441';c.fillRect(24,14,2,3);
  c.strokeStyle='#24516e';c.lineWidth=1;c.beginPath();c.moveTo(18,16);c.lineTo(17,20);c.stroke();
  if(kind==='young'){c.strokeStyle='#dc7e25';c.lineWidth=2;c.beginPath();c.moveTo(12,12);c.lineTo(11,21);c.moveTo(17,12);c.lineTo(16,21);c.stroke();}
  return cv;
}
export class ArcadeRenderer{
  constructor(canvas){this.canvas=canvas;this.ctx=canvas.getContext('2d');this.sprites=Object.fromEntries(['fish','shark','young','protected','ice'].map(k=>[k,fishSprite(k)]));this.particles=[];this.labels=[];this.lastDraw=performance.now();this.lastSnake=null;this.moveAt=0;this.lastHead='';this.lastEat=0;}
  reset(){this.particles=[];this.labels=[];this.lastSnake=null;this.lastHead='';}
  burst(delta,engine){
    const head=engine.snake[0],x=head.x*C+C/2,y=head.y*C+C/2,born=performance.now();
    this.lastEat=born;
    for(let i=0;i<18;i++){const a=Math.random()*Math.PI*2,speed=30+Math.random()*65;this.particles.push({x,y,vx:Math.cos(a)*speed,vy:Math.sin(a)*speed,born,color:delta<0?'#ff776a':['#ffea5f','#fff4d5','#9bff8e'][i%3]});}
    this.labels.push({x,y,born,text:(delta>=0?'+':'')+delta,color:delta<0?'#ff6c70':'#fff277'});
  }
  draw(engine){
    const ctx=this.ctx,t=performance.now(),dt=Math.min(50,t-this.lastDraw)/1000;this.lastDraw=t;
    ctx.clearRect(0,0,450,630);ctx.imageSmoothingEnabled=false;
    for(let y=0;y<ROWS;y++)for(let x=0;x<COLS;x++){
      const px=x*C,py=y*C,hash=(x*37+y*23)%19,reef=engine.reef?.has(x+','+y);
      ctx.fillStyle=reef?(hash%2?'#25a89d':'#24968d'):(hash%2?'#307cd3':'#2e74c9');ctx.fillRect(px,py,C,C);
      ctx.fillStyle=reef?'#62d6ba50':'#95e9ff36';ctx.fillRect(px,py,C,2);ctx.fillRect(px,py,2,C);
      ctx.fillStyle='#0d366945';ctx.fillRect(px+C-2,py,2,C);ctx.fillRect(px,py+C-2,C,2);
      if(reef&&hash%3===0){
        ctx.fillStyle=['#ff9fa4','#ffc073','#c3e76d'][hash%3];ctx.fillRect(px+13,py+15,3,11);ctx.fillRect(px+8,py+14,3,6);ctx.fillRect(px+8,py+19,7,3);ctx.fillRect(px+18,py+10,3,8);ctx.fillRect(px+14,py+17,7,3);
      }else if(hash%4===0){
        const v=Math.sin(t/1100+hash)*2;ctx.fillStyle='#b7f1ff50';ctx.fillRect(px+8,py+10+v,4,2);ctx.fillRect(px+7,py+11+v,2,3);
      }
      if(engine.inset&&(x<engine.inset||y<engine.inset||x>=COLS-engine.inset||y>=ROWS-engine.inset)){ctx.fillStyle='#253d62bf';ctx.fillRect(px,py,C,C);ctx.fillStyle='#87b0ce55';ctx.fillRect(px+(t/80+y*5)%15,py+13,12,2);}
    }
    if(!engine.snake)return;
    for(const key of engine.walls){
      const [x,y]=key.split(',').map(Number),px=x*C+2,py=y*C+2;
      ctx.fillStyle='#0a244c';ctx.fillRect(px+2,py+3,26,26);ctx.fillStyle='#becbdd';ctx.fillRect(px,py,25,25);ctx.fillStyle='#eef4e8';ctx.fillRect(px,py,25,4);ctx.fillRect(px,py,4,25);ctx.fillStyle='#7995af';ctx.fillRect(px+21,py+4,4,21);ctx.fillRect(px+4,py+21,21,4);
      ctx.fillStyle='#9badc3';ctx.fillRect(px+10,py+7,5,4);
    }
    const nextTide=25000-engine.elapsed%25000;
    if(nextTide<2200&&Math.floor(t/220)%2===0){ctx.strokeStyle='#ff6547';ctx.lineWidth=5;const inset=engine.inset*C+3;ctx.strokeRect(inset,inset,450-inset*2,630-inset*2);}
    for(const f of engine.food){
      const px=f.x*C,py=f.y*C;
      if(f.kind==='ball'){
        ctx.save();ctx.translate(px+15,py+15);ctx.scale(.25+.75*Math.abs(Math.cos(t/300)),1);
        ctx.fillStyle='#6e3f12';ctx.beginPath();ctx.arc(1,2,13,0,Math.PI*2);ctx.fill();ctx.fillStyle='#ffd132';ctx.strokeStyle='#6e3f12';ctx.lineWidth=2;ctx.beginPath();ctx.arc(0,0,12,0,Math.PI*2);ctx.fill();ctx.stroke();
        ctx.strokeStyle='#fff2a2';ctx.beginPath();ctx.arc(0,0,8,0,Math.PI*2);ctx.stroke();ctx.fillStyle='#fff1c4';ctx.fillRect(-3,-6,6,12);ctx.restore();continue;
      }
      const color={fish:'#26ac56',shark:'#6383aa',young:'#eeb73d',protected:'#f75278',ice:'#74dbed'}[f.kind];
      ctx.fillStyle='#0b2645';ctx.fillRect(px+2,py+3,27,27);ctx.fillStyle=color;ctx.fillRect(px+2,py+2,25,25);ctx.fillStyle='#ffffff60';ctx.fillRect(px+3,py+3,23,2);
      if(['protected','young','ice'].includes(f.kind)){ctx.strokeStyle=f.kind==='ice'?'#c4ffff':'#ffb57b';ctx.globalAlpha=.45+.4*Math.sin(t/180);ctx.lineWidth=2;ctx.strokeRect(px+1,py+1,27,27);ctx.globalAlpha=1;}
      ctx.drawImage(this.sprites[f.kind],px+1,py+1,28,28);
    }
    const headKey=engine.snake[0].x+','+engine.snake[0].y;
    if(headKey!==this.lastHead){this.previousSnake=this.lastSnake||engine.snake;this.lastSnake=engine.snake.map(p=>({...p}));this.lastHead=headKey;this.moveAt=t;}
    const lerp=Math.min(1,(t-this.moveAt)/95);
    const points=engine.snake.map((p,i)=>{const old=this.previousSnake?.[i]||p;return{x:(old.x+(p.x-old.x)*lerp)*C+15,y:(old.y+(p.y-old.y)*lerp)*C+15};});
    ctx.strokeStyle='#172d46';ctx.lineWidth=7;ctx.lineCap='round';ctx.beginPath();points.forEach((p,i)=>i?ctx.lineTo(p.x,p.y+3):ctx.moveTo(p.x,p.y+3));ctx.stroke();
    ctx.strokeStyle='#e6b279';ctx.lineWidth=4;ctx.beginPath();points.forEach((p,i)=>i?ctx.lineTo(p.x,p.y):ctx.moveTo(p.x,p.y));ctx.stroke();
    for(let i=points.length-1;i>=0;i--){
      const {x,y}=points[i],r=i===0?13:12;
      ctx.save();ctx.translate(x,y);if(i===0)ctx.rotate(Math.atan2(engine.direction.y,engine.direction.x));
      const mouth=i===0?(t-this.lastEat<180 ? .32 : .18):0;
      ctx.fillStyle='#10365c66';ctx.beginPath();ctx.ellipse(1,5,r+1,r*.8,0,0,Math.PI*2);ctx.fill();
      const gradient=ctx.createRadialGradient(-4,-5,1,1,2,r+3);gradient.addColorStop(0,'#fff9dd');gradient.addColorStop(.55,'#f8d4a3');gradient.addColorStop(1,'#c88b5b');
      ctx.beginPath();if(i===0){ctx.moveTo(1,1);ctx.arc(0,0,r,mouth,Math.PI*2-mouth);ctx.closePath();}else ctx.arc(0,0,r,0,Math.PI*2);
      ctx.fillStyle=gradient;ctx.fill();ctx.strokeStyle='#583e32';ctx.lineWidth=1.5;ctx.stroke();
      ctx.fillStyle='#fff8e0b0';ctx.fillRect(-6,-8,5,3);ctx.fillStyle='#cc966850';ctx.fillRect(-5,7,7,2);
      if(i===0){ctx.fillStyle='#17263b';ctx.fillRect(1,-7,3,4);ctx.fillStyle='#fff';ctx.fillRect(1,-7,1,1);}
      ctx.restore();
    }
    this.particles=this.particles.filter(p=>t-p.born<650);
    for(const p of this.particles){p.x+=p.vx*dt;p.y+=p.vy*dt;p.vy+=80*dt;ctx.globalAlpha=1-(t-p.born)/650;ctx.fillStyle=p.color;ctx.fillRect(p.x,p.y,4,4);}ctx.globalAlpha=1;
    this.labels=this.labels.filter(p=>t-p.born<950);
    for(const p of this.labels){const age=(t-p.born)/950;ctx.globalAlpha=1-age;ctx.font='900 24px "Noto Sans TC",sans-serif';ctx.textAlign='center';ctx.lineWidth=4;ctx.strokeStyle='#11325a';ctx.strokeText(p.text,p.x,p.y-15-age*42);ctx.fillStyle=p.color;ctx.fillText(p.text,p.x,p.y-15-age*42);}ctx.globalAlpha=1;
  }
}

