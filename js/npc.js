let ZONES = {
  serving:  {x:55,  y:80,  w:780, h:55},
  seating:  {x:55,  y:170, w:900, h:370},
  bins:     [{x:970,y:480},{x:970,y:540}],
  entrance: {x:400, y:610, w:200, h:35},
};

function applyZones(cfg) {
  const sx=CANVAS_W/512, sy=CANVAS_H/512, z=cfg.zones;
  ZONES = {
    serving:  {x:z.serving_line.x*sx, y:z.serving_line.y*sy, w:z.serving_line.width*sx, h:z.serving_line.height*sy},
    seating:  {x:z.seating_area.x*sx, y:z.seating_area.y*sy, w:z.seating_area.width*sx, h:z.seating_area.height*sy},
    bins:     z.waste_bins.map(b=>({x:b.x*sx, y:b.y*sy})),
    entrance: {x:z.entrance.x*sx, y:z.entrance.y*sy, w:z.entrance.width*sx, h:z.entrance.height*sy},
  };
  if(window.manager){manager.x=ZONES.serving.x+80; manager.y=ZONES.serving.y+ZONES.serving.h/2;}
  terminalLog('ZONES: Calibrated from Agent 1 output ✓', 'ok');
}

function resetZones() {
  ZONES={serving:{x:55,y:80,w:780,h:55},seating:{x:55,y:170,w:900,h:370},
    bins:[{x:970,y:480},{x:970,y:540}],entrance:{x:400,y:610,w:200,h:35}};
}

const NPC_TYPES = [
  {color:'Default',label:'Regular',    waste_prob:0.15, speed_mult:1.0},
  {color:'Blue',   label:'Vegetarian', waste_prob:0.10, speed_mult:0.9},
  {color:'Green',  label:'Eco',        waste_prob:0.05, speed_mult:1.1},
  {color:'Red',    label:'Athlete',    waste_prob:0.20, speed_mult:1.4},
  {color:'Yellow', label:'Picky',      waste_prob:0.35, speed_mult:0.8},
];

class StudentNPC {
  constructor(id, def) {
    this.id=`npc_${id}`; this.color=def.color; this.label=def.label;
    this.waste_prob=def.waste_prob; this.speed=NPC_SPEED*def.speed_mult;
    this.sWalk=this._img(`assets/snoblin/${def.color}/walk.png`);
    this.sIdle=this._img(`assets/snoblin/${def.color}/idle.png`);
    this.sHurt=this._img(`assets/snoblin/${def.color}/hurt.png`);
    this.x=ZONES.entrance.x+Math.random()*ZONES.entrance.w;
    this.y=CANVAS_H+32;
    this.tx=this.x; this.ty=this.y;
    this.anim='idle'; this.frame=0; this.fTick=0; this.fDelay=8; this.hurtLeft=0;
    this.state='SPAWNING'; this.eatTimer=0;
    this.eatMax=240+Math.floor(Math.random()*160);
    this.hunger=0.6+Math.random()*0.4;
    this.waitLeft=0; this.waitCb=null;
  }
  _img(src){const i=new Image();i.src=src;return i;}
  setTarget(x,y){this.tx=x;this.ty=y;}
  setState(s){
    if(s==='ABANDONING'&&this.state!=='ABANDONING'){
      wasteToday+=WASTE_PER_EVENT;
      if(typeof recordObservation === 'function') recordObservation('waste_event', {npcType:this.label, npcColor:this.color, wasteKg:WASTE_PER_EVENT, state:this.state});
      this.anim='hurt'; this.frame=0; this.hurtLeft=16;
    }
    this.state=s;
  }
  _rs(){return{x:ZONES.serving.x+Math.random()*ZONES.serving.w, y:ZONES.serving.y+ZONES.serving.h/2};}
  _rse(){const s=ZONES.seating;return{x:s.x+Math.random()*s.w, y:s.y+Math.random()*s.h};}
  _rb(){const b=ZONES.bins[Math.floor(Math.random()*ZONES.bins.length)];return{x:b.x,y:b.y};}
  _re(){return{x:ZONES.entrance.x+Math.random()*ZONES.entrance.w, y:CANVAS_H+35};}
  update(){
    const speedMult = window.simSpeedMultiplier || 1.0;
    this.hunger=Math.min(1,this.hunger+0.00007 * speedMult);
    if(this.waitLeft>0){
      this.waitLeft -= speedMult;
      if(this.waitLeft<=0&&this.waitCb){this.waitCb();this.waitCb=null;}
      return;
    }
    const dx=this.tx-this.x,dy=this.ty-this.y,dist=Math.sqrt(dx*dx+dy*dy),moving=dist>3;
    if(moving){
      const step = this.speed * speedMult;
      if(dist <= step) {
        this.x = this.tx;
        this.y = this.ty;
      } else {
        this.x+=(dx/dist)*step;
        this.y+=(dy/dist)*step;
      }
    }
    if(this.hurtLeft>0){
      this.hurtLeft -= speedMult;
      if(this.hurtLeft<=0) { this.hurtLeft=0; this.anim=moving?'walk':'idle'; }
    }
    else if(this.anim!=='hurt')this.anim=moving?'walk':'idle';
    
    this.fTick += speedMult;
    if(this.fTick>=this.fDelay){
      this.fTick=0;
      const max=this.anim==='walk'?4:2;
      this.frame=(this.frame+1)%max;
    }
    if(this.state==='EATING'){
      this.eatTimer += speedMult;
      this.hunger=Math.max(0,this.hunger-0.003 * speedMult);
      if(Math.random()<0.0008*(this.waste_prob/0.15) * speedMult){
        this.setState('ABANDONING');const b=this._rb();this.setTarget(b.x,b.y);return;
      }
      if(this.eatTimer>=this.eatMax){this.setState('LEAVING');const e=this._re();this.setTarget(e.x,e.y);}
    }
    if(!moving)this._onArrived();
  }
  _onArrived(){
    switch(this.state){
      case 'SPAWNING': this.setState('ENTERING');const s=this._rs();this.setTarget(s.x,s.y);break;
      case 'ENTERING':
        this.setState('AT_COUNTER');
        this.waitLeft=5+Math.floor(Math.random()*15);
        this.waitCb=()=>{this.setState('FINDING_SEAT');const se=this._rse();this.setTarget(se.x,se.y);};break;
      case 'FINDING_SEAT': this.setState('EATING');this.eatTimer=0;break;
      case 'ABANDONING': this.setState('LEAVING');const e=this._re();this.setTarget(e.x,e.y);break;
      case 'LEAVING':
        this.setState('SPAWNING');
        const en=this._re();this.x=en.x;this.y=CANVAS_H+35;
        this.hunger=0.5+Math.random()*0.5;
        this.waitLeft=10+Math.floor(Math.random()*30);
        this.waitCb=()=>{const sv=this._rs();this.setTarget(sv.x,sv.y);this.setState('ENTERING');};break;
    }
  }
  draw(ctx){
    let img,tf;
    if(this.anim==='hurt'){img=this.sHurt;tf=2;}
    else if(this.anim==='walk'){img=this.sWalk;tf=4;}
    else{img=this.sIdle;tf=2;}
    const f=Math.min(this.frame,tf-1);
    const dx=Math.round(this.x-NPC_RENDER_SIZE/2), dy=Math.round(this.y-NPC_RENDER_SIZE/2);
    if(img.complete&&img.naturalWidth>0){
      ctx.drawImage(img, f*NPC_FRAME_SIZE, 0, NPC_FRAME_SIZE, NPC_FRAME_SIZE, dx, dy, NPC_RENDER_SIZE, NPC_RENDER_SIZE);
    } else {
      const clrs={Default:'#888',Blue:'#3498db',Green:'#27ae60',Red:'#e74c3c',Yellow:'#f1c40f'};
      ctx.fillStyle=clrs[this.color]||'#fff';
      ctx.beginPath();ctx.arc(this.x,this.y,14,0,Math.PI*2);ctx.fill();
    }
    const sc={SPAWNING:'#34495e',ENTERING:'#3498db',AT_COUNTER:'#9b59b6',
      FINDING_SEAT:'#1abc9c',EATING:'#2ecc71',ABANDONING:'#e74c3c',LEAVING:'#95a5a6'};
    ctx.fillStyle=sc[this.state]||'#fff';
    ctx.beginPath();ctx.arc(this.x,dy-5,4,0,Math.PI*2);ctx.fill();
  }
}

class ManagerNPC {
  constructor(){
    this.imgRun  =this._img('assets/limezu/Adam_run_16x16.png');
    this.imgIdle =this._img('assets/limezu/Adam_idle_anim_16x16.png');
    this.imgPhone=this._img('assets/limezu/Adam_phone_16x16.png');
    this.x=ZONES.serving.x+80; this.y=ZONES.serving.y+ZONES.serving.h/2;
    this.dir=1; this.mode='patrol'; this.frame=0; this.fTick=0; this.fDelay=10;
  }
  _img(src){const i=new Image();i.src=src;return i;}
  setMode(m){this.mode=m;this.frame=0;}
  update(){
    const speedMult = window.simSpeedMultiplier || 1.0;
    if(this.mode==='patrol'){
      this.x+=this.dir*0.7 * speedMult;
      if(this.x>ZONES.serving.x+ZONES.serving.w-40)this.dir=-1;
      if(this.x<ZONES.serving.x+40)this.dir=1;
    }
    this.fTick += speedMult;
    if(this.fTick>=this.fDelay){this.fTick=0;const max=this.mode==='phone'?9:4;this.frame=(this.frame+1)%max;}
  }
  draw(ctx){
    let img,srcX;
    if(this.mode==='phone'){img=this.imgPhone;srcX=this.frame*16;}
    else if(this.mode==='idle'){img=this.imgIdle;srcX=this.frame*16;}
    else{img=this.imgRun;srcX=((this.dir===1?12:8)+this.frame)*16;}
    const dx=Math.round(this.x-24), dy=Math.round(this.y-80);
    if(img.complete&&img.naturalWidth>0){
      ctx.drawImage(img,srcX,0,16,32,dx,dy,48,96);
    } else {
      ctx.fillStyle='#f1c40f';
      ctx.fillRect(dx + 12, dy + 24, 24, 64);
      ctx.strokeStyle='#0f172a';
      ctx.lineWidth=2;
      ctx.strokeRect(dx + 12, dy + 24, 24, 64);
    }
    ctx.fillStyle='rgba(0,0,0,.7)';ctx.fillRect(this.x-28,dy-16,56,14);
    ctx.fillStyle='#f1c40f';ctx.font='bold 9px monospace';ctx.textAlign='center';
    ctx.fillText(`👔 ${setupConfig?.managerName||'Manager'}`,this.x,dy-4);
    ctx.textAlign='left';
  }
}

function flashCanvas(){
  const cv=document.getElementById('gameCanvas');
  if(!cv)return;
  const c=cv.getContext('2d');
  let a=0.4;
  const f=()=>{c.fillStyle=`rgba(239,68,68,${a})`;c.fillRect(0,0,CANVAS_W,CANVAS_H);a-=0.02;if(a>0)requestAnimationFrame(f);};
  requestAnimationFrame(f);
}
