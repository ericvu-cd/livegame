export const COLS = 15, ROWS = 21;
export const FOODS = {
  fish: { icon:'🐟', score:5, sustain:0, grow:1, weight:55, combo:4 },
  shark: { icon:'🦈', score:10, sustain:0, grow:3, weight:14, combo:8 },
  young: { icon:'🐠', score:-5, sustain:-5, grow:-1, weight:14, combo:2 },
  protected: { icon:'🐢', score:-20, sustain:-20, grow:-1, weight:8, combo:2 },
  ice: { icon:'🧊', score:0, sustain:10, grow:0, weight:18, combo:0 },
  ball: { icon:'🍥', score:20, sustain:0, grow:0, weight:0, combo:12 }
};
export const LEVELS = Array.from({length:10}, (_,i) => ({ seconds:30 + i * 10, walls: i === 0 ? [] : Array.from({length:Math.min(6 + i,16)}, (_,j) => ({x:2 + (j * 3 + i) % 11, y:j % 2 ? 15 + j % 3 : 3 + j % 3})) }));
export class SeaGame {
  constructor(events = {}, random = Math.random) { this.events = events; this.random = random; this.score = 0; this.level = 1; this.status = 'idle'; }
  start() { this.score = 0; this.level = 1; this.setupLevel(); }
  setupLevel() {
    this.snake = [{x:7,y:10},{x:6,y:10},{x:5,y:10}];
    this.direction = {x:1,y:0}; this.nextDirection = null;
    this.food = []; this.sustain = 100; this.elapsed = 0; this.moveAcc = 0;
    this.inset = 0; this.reef = new Set(); this.reefTier = 0;
    this.comboKey = ''; this.comboCount = 0; this.eaten = 0; this.growth = 0;
    this.walls = new Set(LEVELS[this.level-1].walls.map(p => p.x+','+p.y));
    this.status = 'playing'; this.refill(); this.events.change?.(this);
  }
  turn(x,y) {
    if (this.status !== 'playing' || this.nextDirection || (this.direction.x === -x && this.direction.y === -y)) return;
    this.nextDirection = {x,y};
  }
  pause() { if(this.status === 'playing') this.status = 'paused'; }
  resume() { if(this.status === 'paused') this.status = 'playing'; }
  stop() { this.status = 'stopped'; }
  blocked(p) { return p.x < this.inset || p.y < this.inset || p.x >= COLS-this.inset || p.y >= ROWS-this.inset || this.walls.has(p.x+','+p.y); }
  free(p) { return !this.blocked(p) && !this.snake.some(s=>s.x===p.x&&s.y===p.y) && !this.food.some(f=>f.x===p.x&&f.y===p.y); }
  randomCell() {
    const cells = [];
    for(let y=this.inset;y<ROWS-this.inset;y++) for(let x=this.inset;x<COLS-this.inset;x++) if(this.free({x,y})) cells.push({x,y});
    return cells.length ? cells[Math.floor(this.random()*cells.length)] : null;
  }
  refill() {
    while(this.food.length < 6) {
      const cell = this.randomCell(); if(!cell) break;
      let pick=this.random()*109, kind='fish';
      for(const [key,type] of Object.entries(FOODS)) { pick-=type.weight; if(pick<0) {kind=key;break;} }
      this.food.push({...cell,kind});
    }
    if (!this.food.some(f=>FOODS[f.kind].score>0) && this.food.length) this.food[0].kind='fish';
  }
  advance(ms) {
    if(this.status !== 'playing') return;
    this.elapsed += ms;
    const inset = Math.min(6,Math.floor(this.elapsed / 25000));
    if(inset > this.inset) {
      this.inset=inset;
      if(this.snake.some(s=>this.blocked(s))) return this.end('潮水追上魚丸串了！');
      this.food=this.food.filter(f=>!this.blocked(f)); this.refill();
    }
    if(this.elapsed >= LEVELS[this.level-1].seconds*1000) {
      this.status=this.level===10?'finished':'level-clear';
      this.events.change?.(this);
      if(this.level===10) this.events.end?.('十關全破，滿載而歸！',this); else this.events.levelClear?.(this);
      return;
    }
    this.moveAcc+=ms;
    const speed=Math.max(200,450-Math.floor(this.elapsed/10000)*20);
    while(this.moveAcc>=speed && this.status==='playing') { this.moveAcc-=speed; this.step(); }
  }
  step() {
    this.direction=this.nextDirection||this.direction; this.nextDirection=null;
    let head=this.snake[0], next={x:head.x+this.direction.x,y:head.y+this.direction.y};
    if(this.walls.has(next.x+','+next.y)) {
      const turns=[{x:-this.direction.y,y:this.direction.x},{x:this.direction.y,y:-this.direction.x}];
      const alternate=turns.find(d=>{const p={x:head.x+d.x,y:head.y+d.y};return !this.blocked(p)&&!this.snake.slice(0,-1).some(s=>s.x===p.x&&s.y===p.y);});
      if(!alternate) return this.end('魚丸串被礁岩困住了！');
      this.direction=alternate; next={x:head.x+alternate.x,y:head.y+alternate.y};
    }
    if(this.blocked(next)) return this.end('超出安全海域了！');
    const foodIndex=this.food.findIndex(f=>f.x===next.x&&f.y===next.y);
    const food=foodIndex<0?null:this.food[foodIndex], type=food&&FOODS[food.kind];
    const growth=this.growth + (type?.grow||0);
    const willRemove=growth>0?0:growth<0&&this.snake.length>3?2:1;
    if(this.snake.slice(0,this.snake.length-willRemove).some(s=>s.x===next.x&&s.y===next.y)) return this.end('魚丸串撞到自己了！');
    this.snake.unshift(next); this.growth=growth;
    if(this.growth>0) this.growth--; else {this.snake.pop();if(this.growth<0&&this.snake.length>3)this.snake.pop();this.growth=0;}
    let scoreChanged=false;
    const reefKey=next.x+','+next.y;
    if(!this.reef.has(reefKey)) {
      this.reef.add(reefKey);
      const tier=Math.floor(this.reef.size/(COLS*ROWS)*10);
      if(tier>this.reefTier){this.reefTier=tier;this.score+=10;this.sustain=Math.min(100,this.sustain+10);scoreChanged=true;}
    }
    if(food) {
      this.food.splice(foodIndex,1);
      if(food.kind!=='ice') {
        this.comboCount=food.kind===this.comboKey?this.comboCount+1:1;this.comboKey=food.kind;
      }
      const bonus=food.kind==='ice'?0:(Math.min(this.comboCount,8)-1)*type.combo*Math.sign(type.score);
      this.score+=type.score+bonus;this.sustain=Math.max(0,Math.min(100,this.sustain+type.sustain));scoreChanged=true;
      if(type.score>0 && ++this.eaten%4===0){const cell=this.randomCell();if(cell)this.food.push({...cell,kind:'ball'});}
      if(type.score<0) {
        const radius=food.kind==='protected'?2:1;
        for(let y=next.y-radius;y<=next.y+radius;y++)for(let x=next.x-radius;x<=next.x+radius;x++)this.reef.delete(x+','+y);
      }
      this.refill();
    }
    this.events.change?.(this);
    if(scoreChanged)this.events.score?.(this);
    if(this.sustain<=0)this.end('永續值歸零，讓海洋休息一下。');
  }
  end(reason) { if(this.status!=='playing')return;this.status='finished';this.events.end?.(reason,this); }
  nextLevel() { if(this.status==='level-clear'){this.level++;this.setupLevel();} }
}

