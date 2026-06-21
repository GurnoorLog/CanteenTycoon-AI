let students=[], manager=null, animId=null;
let canvas, ctx;
window.simPaused = false;
window.simSpeedMultiplier = 1.0;
let simWasOpen = null; // tracks open→closed transition for final tracker update

function toggleSimPlayPause() {
  window.simPaused = !window.simPaused;
  const btn = document.getElementById('sim-play-pause-btn');
  if (btn) {
    btn.textContent = window.simPaused ? '▶ PLAY' : '⏸ PAUSE';
    btn.classList.toggle('text-emerald-400', !window.simPaused);
    btn.classList.toggle('text-amber-400', window.simPaused);
  }
  if (typeof terminalLog === 'function') {
    terminalLog(`SIMULATION: ${window.simPaused ? 'Paused' : 'Resumed'}`, 'ok');
  }
}
window.toggleSimPlayPause = toggleSimPlayPause;

function changeSimSpeed(val) {
  window.simSpeedMultiplier = parseFloat(val) || 1.0;
  if (typeof terminalLog === 'function') {
    terminalLog(`SIMULATION: Speed set to ${window.simSpeedMultiplier}x`, 'ok');
  }
}
window.changeSimSpeed = changeSimSpeed;

function initCanvas(){
  const simContent = document.querySelector('#win-simulation .os-content');
  if(!simContent) return;
  simContent.innerHTML = '';
  
  // Set up flex column layout on simContent
  simContent.style.cssText = 'display:flex;flex-direction:column;height:100%;overflow:hidden;background:#0f172a;';
  
  // Canvas container (flex-1)
  const canvasContainer = document.createElement('div');
  canvasContainer.style.cssText = 'flex:1;position:relative;overflow:hidden;';
  
  canvas = document.createElement('canvas');
  canvas.id = 'gameCanvas';
  canvas.width = CANVAS_W;
  canvas.height = CANVAS_H;
  canvas.style.cssText = 'display:block;width:100%;height:100%;image-rendering:pixelated;';
  
  canvasContainer.appendChild(canvas);
  simContent.appendChild(canvasContainer);
  
  // Bottom control dock / HUD
  const hud = document.createElement('div');
  hud.className = 'sim-hud flex items-center justify-between px-4 py-2 bg-slate-900 border-t-2 border-slate-700 font-mono text-[10px] text-slate-300';
  hud.style.cssText = 'height:36px;flex-shrink:0;z-index:10;';
  hud.innerHTML = `
    <!-- Left: Play/Pause & Speed -->
    <div class="flex items-center gap-3">
      <button id="sim-play-pause-btn" onclick="toggleSimPlayPause()" class="px-2 py-0.5 bg-slate-800 hover:bg-slate-700 border border-slate-600 text-emerald-400 font-bold uppercase rounded active:scale-95 transition-all cursor-pointer text-[9px]">
        ⏸ PAUSE
      </button>
      <div class="flex items-center gap-1">
        <span class="text-slate-400">SPEED:</span>
        <select id="sim-speed-select" onchange="changeSimSpeed(this.value)" class="bg-slate-800 border border-slate-600 text-slate-300 py-0 px-1 rounded text-[9px] cursor-pointer focus:ring-0">
          <option value="0.5">0.5x</option>
          <option value="1" selected>1.0x</option>
          <option value="2">2.0x</option>
        </select>
      </div>
    </div>

    <!-- Center: Stats & Zones Toggle -->
    <div class="flex items-center gap-4">
      <div class="flex items-center gap-1">
        <span class="text-slate-400">STUDENTS:</span>
        <span id="hud-student-count" class="font-bold text-white">--</span>
      </div>
      <label class="flex items-center gap-1 cursor-pointer select-none">
        <input type="checkbox" id="hud-zone-toggle" onchange="showZones=this.checked" class="bg-slate-800 border-slate-600 text-primary focus:ring-0 rounded-sm w-3 h-3 cursor-pointer" />
        <span class="ml-1 text-slate-300">ZONE OVERLAY</span>
      </label>
    </div>

    <!-- Right: Risk LED Indicator -->
    <div class="flex items-center gap-2">
      <span class="text-slate-400">RISK:</span>
      <div class="flex items-center gap-1">
        <span id="hud-risk-led" class="w-2.5 h-2.5 rounded-full bg-emerald-500 shadow-[0_0_8px_#10b981] inline-block"></span>
        <span id="hud-risk-label" class="font-bold text-emerald-400 uppercase">LOW</span>
      </div>
    </div>

    <!-- Simulated Day Indicator (hidden by default) -->
    <div id="sim-mode-indicator" class="flex items-center gap-1.5 ml-3 hidden">
      <span class="w-2 h-2 rounded-full bg-emerald-400 animate-pulse shadow-[0_0_6px_#34d399]"></span>
      <span id="sim-mode-label" class="font-bold text-emerald-300 text-[9px] uppercase">SIMULATING: --</span>
      <button onclick="stopSimulatedDay()" class="ml-1 px-1.5 py-0.5 bg-amber-700 hover:bg-amber-600 border border-amber-500 text-white font-bold uppercase rounded active:scale-95 transition-all cursor-pointer text-[8px] tracking-wider">STOP</button>
    </div>
  `;
  simContent.appendChild(hud);
  
  ctx = canvas.getContext('2d');
}

function setCanvasBackground(b64){
  const img=new Image();
  img.onload=()=>{backgroundImg=img; terminalLog('MAP: AI pixel art applied to canvas ✓','ok');};
  img.src=b64;
}

function drawBackground(){
  if(!ctx) return;
  if(backgroundImg){
    ctx.drawImage(backgroundImg,0,0,CANVAS_W,CANVAS_H);
  } else {
    ctx.fillStyle='#0f172a';ctx.fillRect(0,0,CANVAS_W,CANVAS_H);
    ctx.fillStyle='rgba(16,185,129,0.05)';
    const step=30;
    for(let x=0;x<CANVAS_W;x+=step) for(let y=0;y<CANVAS_H;y+=step){
      ctx.beginPath();ctx.arc(x,y,1,0,Math.PI*2);ctx.fill();
    }
    const dots='.'.repeat((Math.floor(Date.now()/500)%4));
    ctx.fillStyle='#10b981';ctx.font='bold 18px VT323, monospace';ctx.textAlign='center';
    ctx.fillText('🍽 CANTEENTYCOON AI — SIMULATION READY',CANVAS_W/2,CANVAS_H/2-30);
    ctx.fillStyle='#6b7280';ctx.font='13px monospace';
    ctx.fillText('Complete the setup wizard to load your cafeteria map'+dots,CANVAS_W/2,CANVAS_H/2+10);
    ctx.fillStyle='#10b981';ctx.font='11px monospace';
    ctx.fillText('Agent 2 available — click AI_LOGS folder → Run Agents',CANVAS_W/2,CANVAS_H/2+40);
    ctx.textAlign='left';
  }
}

function drawZoneOverlays(){
  if(!ctx||!showZones) return;
  ctx.globalAlpha=0.18;
  ctx.fillStyle='#f59e0b';ctx.fillRect(ZONES.serving.x,ZONES.serving.y,ZONES.serving.w,ZONES.serving.h);
  ctx.fillStyle='#3b82f6';ctx.fillRect(ZONES.seating.x,ZONES.seating.y,ZONES.seating.w,ZONES.seating.h);
  ctx.fillStyle='#ef4444';
  for(const b of ZONES.bins){ctx.beginPath();ctx.arc(b.x,b.y,20,0,Math.PI*2);ctx.fill();}
  ctx.fillStyle='#10b981';ctx.fillRect(ZONES.entrance.x,ZONES.entrance.y,ZONES.entrance.w,ZONES.entrance.h);
  ctx.globalAlpha=1;
  ctx.fillStyle='rgba(255,255,255,0.8)';ctx.font='10px monospace';
  ctx.fillText('SERVING',ZONES.serving.x+4,ZONES.serving.y+12);
  ctx.fillText('SEATING',ZONES.seating.x+4,ZONES.seating.y+14);
  ctx.fillText('ENTRANCE',ZONES.entrance.x+2,ZONES.entrance.y+12);
}

function gameLoop(){
  const isOpen = typeof openOrClosed === 'function' && openOrClosed() === 'OPEN';
  const hasPrediction = hasPredictionForToday && currentPrediction;

  if (simWasOpen === null) simWasOpen = isOpen;
  if (simWasOpen === true && !isOpen && hasPrediction) {
    terminalLog(`SIMULATION: ⏹ Canteen closed — finalizing stats. Waste today: ${wasteToday.toFixed(2)}kg`, 'warn');
    updateSimWindow();
  }
  simWasOpen = isOpen;

  if (!window.simPaused && isOpen && hasPrediction) {
    simTick++;
    if(manager) manager.update();
    for(const npc of students) npc.update();
  }

  drawBackground();
  drawZoneOverlays();

  if(manager) manager.draw(ctx);
  for(const npc of students) npc.draw(ctx);

  if(ctx){
    const hudW = 320, hudX = 10, hudY = 10;
    let y = hudY + 16;

    ctx.fillStyle='rgba(0,0,0,0.7)'; ctx.fillRect(hudX, hudY, hudW, 90);
    ctx.font='bold 11px monospace';

    if (currentPrediction) {
      ctx.fillStyle='#60a5fa';
      ctx.fillText(`📊 Expected Waste: ${currentPrediction.predicted_waste_kg}kg`, hudX + 6, y);
      y += 16;
      ctx.fillText(`🎯 Expected Students: ${currentPrediction.expectedStudents || setupConfig?.avgStudents || '-'}`, hudX + 6, y);
      y += 20;
    }

    ctx.fillStyle='#ef4444'; ctx.font='bold 13px monospace';
    ctx.fillText(`🌍 CO₂ Today: ${(wasteToday*CO2_PER_KG).toFixed(2)}kg`, hudX + 6, y);
    y += 16;
    ctx.fillStyle='#10b981';
    ctx.fillText(`Saved: ${(weekRescued*CO2_PER_KG).toFixed(2)}kg`, hudX + 6, y);

    // Live HUD updates
    const studentCountEl = document.getElementById('hud-student-count');
    if (studentCountEl) studentCountEl.textContent = students.length;
    const riskLed = document.getElementById('hud-risk-led');
    const riskLabel = document.getElementById('hud-risk-label');
    if (currentPrediction && riskLed && riskLabel) {
      const riskColors = { low: '#10b981', medium: '#f59e0b', high: '#ef4444' };
      const riskLabels = { low: 'LOW', medium: 'MEDIUM', high: 'HIGH' };
      const color = riskColors[currentPrediction.waste_risk] || '#10b981';
      riskLed.style.backgroundColor = color;
      riskLed.style.boxShadow = `0 0 8px ${color}`;
      riskLabel.textContent = riskLabels[currentPrediction.waste_risk] || 'LOW';
      riskLabel.style.color = color;
    }

    // Update simulated day indicator in HUD toolbar
    const simIndicator = document.getElementById('sim-mode-indicator');
    const simLabel = document.getElementById('sim-mode-label');
    if (simIndicator && simLabel) {
      if (simulatingPredictedDay) {
        simIndicator.classList.remove('hidden');
        simLabel.textContent = `SIMULATING: ${simulatedDayLabel.toUpperCase()}`;
      } else {
        simIndicator.classList.add('hidden');
      }
    }

    // Status overlays
    if (simulatingPredictedDay) {
      ctx.fillStyle='rgba(0,0,0,0.85)'; ctx.fillRect(CANVAS_W/2-210, CANVAS_H/2-30, 420, 60);
      ctx.fillStyle='#34d399'; ctx.font='bold 14px monospace'; ctx.textAlign='center';
      ctx.fillText(`▶ SIMULATING: ${simulatedDayLabel.toUpperCase()}`, CANVAS_W/2, CANVAS_H/2);
      ctx.textAlign='left';
    } else if (!hasPrediction) {
      ctx.fillStyle='rgba(0,0,0,0.85)'; ctx.fillRect(CANVAS_W/2-210, CANVAS_H/2-30, 420, 60);
      ctx.fillStyle='#f59e0b'; ctx.font='bold 14px monospace'; ctx.textAlign='center';
      ctx.fillText('⏳ Awaiting AI Prediction — Run Agent 2', CANVAS_W/2, CANVAS_H/2);
      ctx.textAlign='left';
    } else if (!isOpen) {
      ctx.fillStyle='rgba(0,0,0,0.85)'; ctx.fillRect(CANVAS_W/2-160, CANVAS_H/2-20, 320, 40);
      ctx.fillStyle='#6b7280'; ctx.font='bold 13px monospace'; ctx.textAlign='center';
      ctx.fillText('🔒 Canteen Closed — Simulation Paused', CANVAS_W/2, CANVAS_H/2);
      ctx.textAlign='left';
    }
  }

  if(!window.simPaused && simTick%60===0) updateSimWindow();
  animId=requestAnimationFrame(gameLoop);
}

function spawnAll(){
  if(!canvas) return;
  students=[];
  const count = Math.min(Math.max(parseInt(setupConfig?.avgStudents) || 10, 5), 50);
  for(let i=0;i<count;i++){
    const def=NPC_TYPES[i%NPC_TYPES.length];
    const npc=new StudentNPC(i,def);
    setTimeout(()=>{npc.setState('ENTERING');const s=npc._rs();npc.setTarget(s.x,s.y);},i*700+Math.random()*300);
    students.push(npc);
  }
  manager=new ManagerNPC();
}
