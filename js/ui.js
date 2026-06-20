let termLines = 0;

function terminalLog(msg, type='') {
  const el = document.getElementById('terminal-output');
  if(!el) return;
  const colors = {ok:'#10b981', warn:'#f59e0b', err:'#ef4444', run:'#60a5fa'};
  const color = colors[type] || '#4edea3';
  const line = document.createElement('span');
  line.style.cssText = `display:block;color:${color};`;
  line.textContent = `> [T+${simTick}] ${msg}`;
  el.appendChild(line);
  el.scrollTop = el.scrollHeight;
  if(++termLines > 100) el.removeChild(el.firstChild);
}

function updateAILogsWindow(agent, reasoning, outcome='PROCESSING') {
  const table = document.querySelector('#win-ai-logs table tbody');
  if(!table) return;
  const now = new Date().toTimeString().split(' ')[0];
  const outcomeColors = {
    'RESCUE_TRIGGER':'color:#ef4444;font-weight:bold',
    'SUCCESS':'color:#10b981;font-weight:bold',
    'RESCUE_SUCCESS':'color:#10b981;font-weight:bold',
    'ERROR':'color:#ef4444',
    'PENDING_HUMAN':'color:#f59e0b;font-weight:bold',
    'PROCESSING':'color:#60a5fa',
    'OPTIMAL':'color:#10b981'
  };
  const tr = document.createElement('tr');
  tr.innerHTML = `
    <td>${now}</td>
    <td>${agent}</td>
    <td>${reasoning}</td>
    <td style="${outcomeColors[outcome]||''}">${outcome}</td>
  `;
  table.insertBefore(tr, table.firstChild);
}

function updateWasteLogsWindow(prediction) {
  const table = document.querySelector('#win-waste-logs table tbody');
  if(!table) return;
  const today = new Date().toISOString().split('T')[0];
  const riskColors = {high:'color:#ef4444;font-weight:bold', medium:'color:#f59e0b;font-weight:bold', low:'color:#10b981'};
  const tr = document.createElement('tr');
  tr.style.background = '#fef3c7';
  tr.innerHTML = `
    <td>${today}</td>
    <td>${prediction.at_risk_meals.join(', ')}</td>
    <td>${prediction.predicted_waste_kg}</td>
    <td style="${riskColors[prediction.waste_risk]||''}">${prediction.waste_risk.toUpperCase()} (${prediction.risk_pct}%)</td>
  `;
  table.insertBefore(tr, table.firstChild);
}

function updateWeatherWindow() {
  let win = document.getElementById('win-weather');
  if(!win) {
    win = document.createElement('div');
    win.id = 'win-weather';
    win.className = 'os-window absolute top-20 right-12 w-[330px] z-50 hidden';
    win.innerHTML = `
      <div class="os-titlebar">
        <div class="flex items-center gap-2"><span>☁️</span>
          <span class="font-bold text-[10px] uppercase">WEATHER_SENSOR — 7 DAY</span></div>
        <div class="window-button bg-secondary" onclick="toggleWindow('win-weather')"></div>
      </div>
      <div class="p-3 font-mono" id="weather-body"></div>`;
    document.getElementById('desktop-os').appendChild(win);
    toggleWindow('win-weather');
  }
  const body = document.getElementById('weather-body');
  if(!body) return;

  const today = weatherForecast[0] || weatherData;
  const loc = weatherData.location || setupConfig?.location || 'auto-detected';
  let html = `
    <div style="display:flex;align-items:center;gap:12px;margin-bottom:12px;padding-bottom:10px;border-bottom:2px solid #0f172a;">
      <span style="font-size:36px;">${today.icon || '☁️'}</span>
      <div>
        <div style="font-size:20px;font-weight:bold;">${today.tempMax ?? weatherData.temp ?? '--'}°C</div>
        <div style="font-size:11px;opacity:0.7;">${today.condition || 'Loading...'}</div>
        <div style="font-size:9px;opacity:0.5;">${loc}</div>
      </div>
    </div>`;

  if(weatherForecast.length > 0) {
    html += `<div style="display:grid;grid-template-columns:repeat(7,1fr);gap:3px;margin-bottom:4px;">`;
    for(let i = 0; i < weatherForecast.length; i++) {
      const f = weatherForecast[i];
      const isToday = i === 0;
      html += `
        <div style="text-align:center;background:${isToday?'#0f172a':'transparent'};border-radius:4px;padding:4px 2px;${isToday?'color:#10b981;':''}">
          <div style="font-size:8px;font-weight:bold;text-transform:uppercase;">${isToday ? 'Now' : f.dayName}</div>
          <div style="font-size:16px;margin:2px 0;">${f.icon}</div>
          <div style="font-size:10px;font-weight:bold;">${f.tempMax}°</div>
          <div style="font-size:8px;opacity:0.5;">${f.tempMin}°</div>
          <div style="font-size:7px;opacity:0.6;">${f.precip>0?f.precip.toFixed(1)+'mm':''}</div>
        </div>`;
    }
    html += `</div>`;
  }
  body.innerHTML = html;
}

function showRescueWindow() {
  let win = document.getElementById('win-rescue');
  if(!win) {
    win = document.createElement('div');
    win.id = 'win-rescue';
    win.className = 'os-window absolute top-24 left-1/2 -translate-x-1/2 w-[520px] z-[60]';
    document.getElementById('desktop-os').appendChild(win);
  }
  win.innerHTML = `
    <div class="os-titlebar">
      <div class="flex items-center gap-2">
        <span style="color:#ef4444">🚨</span>
        <span class="font-bold text-[10px] uppercase">RESCUE_DISPATCH — MANAGER APPROVAL REQUIRED</span>
      </div>
      <div class="window-button bg-secondary" onclick="toggleWindow('win-rescue')"></div>
    </div>
    <div class="p-4">
      <div id="rescue-draft-text" style="font-size:12px;line-height:1.7;background:#f8fafc;border:2px solid #0f172a;padding:12px;margin-bottom:12px;font-family:monospace;max-height:180px;overflow-y:auto;">
        Drafting rescue message...
      </div>
      <div id="rescue-stats" style="font-size:11px;color:#6b7280;margin-bottom:12px;"></div>
      <p style="color:#f59e0b;font-size:11px;margin-bottom:12px;font-weight:bold;">
        ⚠️ AI drafted this message. Review before sending. This decision is yours, not the AI's.
      </p>
      <div style="display:flex;gap:8px;justify-content:center;">
        <button onclick="confirmRescue()" 
          style="background:#10b981;color:white;border:3px solid #0f172a;padding:8px 20px;font-weight:bold;font-size:12px;box-shadow:3px 3px 0 #0f172a;cursor:pointer;">
          ✅ APPROVE & SEND
        </button>
        <button onclick="document.getElementById('rescue-draft-text').contentEditable='true';document.getElementById('rescue-draft-text').focus();"
          style="background:#3b82f6;color:white;border:3px solid #0f172a;padding:8px 20px;font-weight:bold;font-size:12px;box-shadow:3px 3px 0 #0f172a;cursor:pointer;">
          ✏️ EDIT FIRST
        </button>
        <button onclick="toggleWindow('win-rescue')"
          style="background:#ef4444;color:white;border:3px solid #0f172a;padding:8px 20px;font-weight:bold;font-size:12px;box-shadow:3px 3px 0 #0f172a;cursor:pointer;">
          ❌ CANCEL
        </button>
      </div>
    </div>`;
  win.classList.remove('hidden');
}

function populateRescueWindow(draft) {
  const dt = document.getElementById('rescue-draft-text');
  if(dt) dt.textContent = draft;
  const st = document.getElementById('rescue-stats');
  if(st && currentPrediction) {
    st.innerHTML = `
      <b>Food:</b> ${currentPrediction.at_risk_meals.join(', ')} — ${currentPrediction.predicted_waste_kg}kg &nbsp;|&nbsp;
      <b>CO₂ saved:</b> ${currentPrediction.co2_at_risk_kg}kg &nbsp;|&nbsp;
      <b>Meals to people:</b> ~${Math.round(currentPrediction.predicted_waste_kg*MEALS_PER_KG)} &nbsp;|&nbsp;
      <b>Risk:</b> <span style="color:#ef4444">${currentPrediction.waste_risk.toUpperCase()}</span>`;
  }
}

function updateSimWindow() {
  const avgH = students.length ? students.reduce((s,n)=>s+n.hunger,0)/students.length : 0;
  const info = document.querySelector('#win-simulation .os-content .text-right');
  if(info) info.innerHTML = `
    <div class="text-xs">STUDENTS: ${students.length}</div>
    <div class="text-xs">HUNGER: ${Math.round(avgH*100)}%</div>
    <div class="text-xs">WASTE: ${wasteToday.toFixed(2)}kg</div>
    <div class="text-xs">RESCUED: ${rescuedToday.toFixed(2)}kg</div>
    <div class="text-xs">MEALS SAVED: ${mealsSaved}</div>
    <div class="text-xs">CO₂ OFFSET: ${(weekRescued*CO2_PER_KG).toFixed(2)}kg</div>`;
  updateWidgets();
}

let widgetOverrides = null;

function restoreWidgetState() {
  const saved = localStorage.getItem('ct_widget_state');
  if (saved) {
    try { widgetOverrides = JSON.parse(saved); } catch(e) { widgetOverrides = null; }
  }
}

function saveWidgetState() {
  if (widgetOverrides) {
    localStorage.setItem('ct_widget_state', JSON.stringify(widgetOverrides));
  }
}

function applyWidgetOverrides(overrides) {
  widgetOverrides = overrides;
  saveWidgetState();
  updateWidgets();
}

function resetWidgetOverrides() {
  widgetOverrides = null;
  localStorage.removeItem('ct_widget_state');
  updateWidgets();
}

function updateWidgets() {
  if (widgetOverrides === null) restoreWidgetState();

  const eff = document.getElementById('widget-efficiency');
  const effBar = document.getElementById('widget-efficiency-bar');
  const mood = document.getElementById('widget-mood');
  const moodDet = document.getElementById('widget-mood-detail');
  const waste = document.getElementById('widget-waste-red');
  const co2 = document.getElementById('widget-co2-offset');
  const meals = document.getElementById('widget-meals');
  const mealsDet = document.getElementById('widget-meals-detail');
  if (!eff) return;

  const useOverrides = widgetOverrides !== null;
  const efficiency = useOverrides ? widgetOverrides.efficiency : (wasteToday + rescuedToday > 0 ? Math.round((rescuedToday / (wasteToday + rescuedToday)) * 100) : 0);
  const wasteVal = useOverrides ? widgetOverrides.wasteReduction : rescuedToday;
  const co2Val = useOverrides ? widgetOverrides.co2Saved : (rescuedToday * CO2_PER_KG);
  const mealsVal = useOverrides ? widgetOverrides.mealsDonated : mealsSaved;
  const moodLabel = useOverrides ? widgetOverrides.mood : (efficiency > 80 ? 'Optimal' : efficiency > 50 ? 'Stable' : 'Attention');
  const moodDetail = useOverrides ? (widgetOverrides.moodDetail || '') : (efficiency > 80 ? 'All systems nominal' : efficiency > 50 ? 'Minor adjustments needed' : 'Review waste reduction strategies');

  if (typeof gsap !== 'undefined') {
    gsap.killTweensOf(effBar);
    gsap.to(effBar, { width: Math.min(efficiency, 100) + '%', duration: 1.2, ease: "power2.out" });

    const prevEff = parseFloat(eff.textContent.replace('%', '')) || 0;
    const eObj = { val: prevEff };
    gsap.to(eObj, {
      val: efficiency,
      duration: 1.2,
      ease: "power2.out",
      onUpdate: () => { eff.textContent = Math.round(eObj.val) + '%'; }
    });

    const prevWaste = parseFloat(waste.textContent.replace('kg', '').replace('-', '')) || 0;
    const wObj = { val: prevWaste };
    gsap.to(wObj, {
      val: wasteVal,
      duration: 1.2,
      ease: "power2.out",
      onUpdate: () => { waste.textContent = '-' + wObj.val.toFixed(1) + 'kg'; }
    });

    const prevMeals = parseInt(meals.textContent) || 0;
    const mObj = { val: prevMeals };
    gsap.to(mObj, {
      val: mealsVal,
      duration: 1.2,
      ease: "power2.out",
      onUpdate: () => {
        meals.textContent = Math.round(mObj.val);
        if (mealsDet) mealsDet.textContent = 'People fed: ' + Math.round(mObj.val);
      }
    });
  } else {
    eff.textContent = efficiency + '%';
    effBar.style.width = Math.min(efficiency, 100) + '%';
    waste.textContent = '-' + wasteVal.toFixed(1) + 'kg';
    meals.textContent = mealsVal;
    if (mealsDet) mealsDet.textContent = 'People fed: ' + mealsVal;
  }

  mood.textContent = moodLabel;
  moodDet.textContent = moodDetail;

  co2.textContent = "Today's CO₂ Offset: " + co2Val.toFixed(1) + 'kg';
}

function createAgentControlWindow() {
  const win = document.createElement('div');
  win.id = 'win-agents';
  win.className = 'os-window absolute top-20 right-8 w-[260px] z-50';
  win.innerHTML = `
    <div class="os-titlebar">
      <div class="flex items-center gap-2">
        <span>🤖</span>
        <span class="font-bold text-[10px] uppercase">AI_AGENT_CONTROL</span>
      </div>
      <div class="window-button bg-secondary" onclick="toggleWindow('win-agents')"></div>
    </div>
    <div class="p-3 space-y-2">
      <div style="font-size:10px;font-family:monospace;color:#6b7280;margin-bottom:8px;">
        MODE: <span id="agent-mode-label" style="color:#10b981;font-weight:bold;">CLOUD</span>
        &nbsp;|&nbsp;
        <button onclick="currentMode=currentMode==='cloud'?'local':'cloud';document.getElementById('agent-mode-label').textContent=currentMode.toUpperCase();terminalLog('MODE: Switched to '+currentMode,'ok');"
          style="font-size:10px;text-decoration:underline;cursor:pointer;background:none;border:none;color:#60a5fa;">
          toggle
        </button>
      </div>
      <button id="btn-agent1" onclick="triggerAgent1()"
        style="width:100%;background:#0f172a;color:#10b981;border:2px solid #10b981;padding:8px;font-family:monospace;font-size:11px;font-weight:bold;cursor:pointer;text-align:left;">
        🧠 AGENT 1: Generate Map
      </button>
      <button onclick="triggerAgent2()"
        style="width:100%;background:#0f172a;color:#f59e0b;border:2px solid #f59e0b;padding:8px;font-family:monospace;font-size:11px;font-weight:bold;cursor:pointer;text-align:left;">
        ⚡ AGENT 2: Predict Waste
      </button>
      <button id="btn-agent3" onclick="triggerAgent3()" disabled
        style="width:100%;background:#1a1a2e;color:#4b5563;border:2px solid #374151;padding:8px;font-family:monospace;font-size:11px;font-weight:bold;cursor:not-allowed;text-align:left;">
        🚨 AGENT 3: Rescue Draft
      </button>
      <button onclick="showZones=!showZones"
        style="width:100%;background:#0f172a;color:#60a5fa;border:2px solid #374151;padding:6px;font-family:monospace;font-size:10px;cursor:pointer;text-align:left;">
        👁 TOGGLE ZONE OVERLAY
      </button>
      <hr style="border-color:#374151;margin:6px 0;">
      <div style="font-size:10px;font-family:monospace;color:#6b7280;display:flex;justify-content:space-between;align-items:center;margin-bottom:4px;">
        <span>AUTO LOOP:</span>
        <span id="loop-status" style="color:#10b981;font-weight:bold;">STARTING</span>
        <button onclick="if(nimLoopInterval){stopNIMAutonomousLoop();document.getElementById('loop-status').textContent='PAUSED';document.getElementById('loop-status').style.color='#f59e0b';}else{startNIMAutonomousLoop();document.getElementById('loop-status').textContent='ACTIVE';document.getElementById('loop-status').style.color='#10b981';}" style="font-size:10px;text-decoration:underline;cursor:pointer;background:none;border:none;color:#60a5fa;">toggle</button>
      </div>
      <div style="font-size:10px;font-family:monospace;color:#6b7280;margin-bottom:6px;">
        WEB: <span id="web-count" style="color:#a855f7;">0/${WEB_FETCH_LIMIT}</span> fetches today
      </div>
      <button onclick="generateDailySummary()"
        style="width:100%;background:#0f172a;color:#a855f7;border:2px solid #a855f7;padding:7px;font-family:monospace;font-size:11px;font-weight:bold;cursor:pointer;text-align:left;margin-top:2px;">
        📋 GENERATE DAILY REPORT
      </button>
      <button onclick="downloadSummary()"
        style="width:100%;background:#0f172a;color:#6b7280;border:2px solid #374151;padding:6px;font-family:monospace;font-size:10px;cursor:pointer;text-align:left;margin-top:2px;">
        ⬇ DOWNLOAD LAST REPORT
      </button>
      <button onclick="(async()=>{const q=prompt('Search the web for:','food shortage school cafeteria');if(q)await fetchWebContext(q,'user_request');document.getElementById('web-count').textContent=nimWebFetchCount+'/${WEB_FETCH_LIMIT}';})();"
        style="width:100%;background:#0f172a;color:#60a5fa;border:2px solid #60a5fa;padding:6px;font-family:monospace;font-size:10px;cursor:pointer;text-align:left;margin-top:2px;">
        🌐 MANUAL WEB SEARCH
      </button>
    </div>`;
  document.getElementById('desktop-os').appendChild(win);
}

function enableAgent3() {
  const btn = document.getElementById('btn-agent3');
  if(btn){
    btn.disabled=false;
    btn.style.cssText='width:100%;background:#0f172a;color:#ef4444;border:2px solid #ef4444;padding:8px;font-family:monospace;font-size:11px;font-weight:bold;cursor:pointer;text-align:left;';
  }
}

async function initDesktopOS() {
  try {
  weekRescued = 0;
  weekMeals = 0;
  wasteToday = 0;
  rescuedToday = 0;
  mealsSaved = 0;
  simTick = 0;
  localStorage.removeItem('ct_wr');
  localStorage.removeItem('ct_wm');
  terminalLog('SYSTEM: CanteenTycoon OS booting — all counters reset to zero...', 'run');

  initCanvas();

  spawnAll();
  gameLoop();

  createAgentControlWindow();

  toggleWindow('win-simulation');
  toggleWindow('win-terminal');
  toggleWindow('win-agents');
  toggleWindow('win-chat');

  updateWeatherWindow();
  fetchWeather();
  refreshMLPrediction();

  const cal = getCalendar();
  terminalLog(`CALENDAR: ${cal.event}`, 'ok');

  terminalLog(`SYSTEM: ${setupConfig?.canteenName || 'Cafeteria'} — ${setupConfig?.avgStudents || '?'} students, ${setupConfig?.staffCount || '?'} staff`, 'ok');
  terminalLog(`SYSTEM: Shelter: ${setupConfig?.shelterName || 'None'} | Goal: ${setupConfig?.efficiencyGoal || '80%'}`, 'ok');
  terminalLog('SYSTEM: Ready. Agent 2 available immediately to predict waste.', 'ok');
  terminalLog('SYSTEM: Launch Agent 1 from AI Agent Control to generate your cafeteria map.', 'ok');

  updateWidgets();

  if(typeof lucide !== 'undefined') lucide.createIcons();

  // AI-generated welcome message in chat using Claude
  (async () => {
    try {
      const now = new Date();
      const dateStr = now.toLocaleDateString('en-US', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' });
      const welcomeMsg = await callChatAI(
        `You are CMD_CORE, the AI assistant for ${setupConfig?.canteenName || 'a school cafeteria'}. Today is ${dateStr}. Welcome the manager warmly. You MUST state the exact student count: ${setupConfig?.avgStudents || 'unknown'} students (do not invent a different number). Mention you can predict waste for any day, create menus, and generate PDF reports. Max 2 sentences.`,
        [{ role: 'user', content: `Manager: ${setupConfig?.managerName}. Cafeteria: ${setupConfig?.canteenName}, Location: ${setupConfig?.location}, Students: ${setupConfig?.avgStudents}. Generate welcome.` }]
      );
      chatHistory.push({role:'assistant', content: welcomeMsg});
      appendChatMessage('assistant', welcomeMsg, ['🔮 Run Forecast', '📄 PDF Report', '📊 Export CSV']);
    } catch(e) {
      terminalLog(`WELCOME: ${e.message}`, 'warn');
      appendChatMessage('assistant', `👋 Welcome to CanteenTycoon, ${setupConfig?.managerName || 'Manager'}! I'm CMD_CORE — your AI command center. Ask me to predict tomorrow's waste anytime.`);
    }
  })();

  // Request notification permission
  setTimeout(async () => {
    const granted = await requestNotificationPermission();
    if(granted) {
      terminalLog('NOTIFY: Browser notifications enabled ✓', 'ok');
    } else {
      terminalLog('NOTIFY: Browser notifications not available — in-app alerts only', 'warn');
    }
  }, 2000);

  // Load real university canteen dataset
  setTimeout(() => { loadHistoricalData(); }, 3000);

  // Autonomous loop is initialized as PAUSED by default
  const ls = document.getElementById('loop-status');
  if(ls) { ls.textContent = 'PAUSED'; ls.style.color = '#f59e0b'; }
  terminalLog('CMD_CORE: Autonomous loop initialized in PAUSED mode. Open Chat and type "make a prediction" to run.', 'ok');

  // Force taskbar + folders visible immediately (no GSAP, no animation)
  document.querySelectorAll('.taskbar, .folder-item').forEach(el => {
    el.style.removeProperty('opacity');
    el.style.removeProperty('transform');
    el.style.removeProperty('visibility');
    el.style.removeProperty('display');
  });

  } catch(e) {
    console.error('initDesktopOS error:', e);
    terminalLog('BOOT_ERROR: ' + (e.message || e), 'err');
  }

  // Failsafe: force visibility after 1s regardless of errors
  setTimeout(() => {
    document.querySelectorAll('.taskbar, .folder-item').forEach(el => {
      if (el) {
        el.style.setProperty('opacity', '1', 'important');
        el.style.setProperty('visibility', 'visible', 'important');
        el.style.setProperty('transform', 'none', 'important');
        el.style.removeProperty('display');
        if (el.classList.contains('taskbar')) el.style.setProperty('display', 'flex', 'important');
      }
    });
    // Debug: log computed styles to console
    const tb = document.querySelector('.taskbar');
    if (tb) {
      const cs = getComputedStyle(tb);
      console.log('TASKBAR DEBUG:', { display: cs.display, opacity: cs.opacity, visibility: cs.visibility, zIndex: cs.zIndex, position: cs.position, bottom: cs.bottom, height: cs.height });
    } else {
      console.warn('TASKBAR: element not found in DOM');
    }
    document.querySelectorAll('.folder-item').forEach((el, i) => {
      const cs = getComputedStyle(el);
      console.log(`FOLDER[${i}] DEBUG:`, { display: cs.display, opacity: cs.opacity, visibility: cs.visibility });
    });
    const chat = document.getElementById('win-chat');
    if (chat) {
      const cs = getComputedStyle(chat);
      console.log('CHAT DEBUG:', { display: cs.display, opacity: cs.opacity, visibility: cs.visibility, zIndex: cs.zIndex });
    }
  }, 1500);
}

window.__bootDesktop = initDesktopOS;

let chatHistory = [];

let waitingForEventResponse = false;




function showChatTypingIndicator() {
  const el = document.getElementById('chat-typing');
  if (el) { el.style.display = 'block'; return; }
  // Fallback: old inline approach
  const container = document.getElementById('chat-messages');
  if(!container) return;
  hideChatTypingIndicator();
  const div = document.createElement('div');
  div.id = 'chat-typing-indicator';
  div.className = 'chat-msg-ai';
  div.innerHTML = `
    <div class="chat-avatar-ai">✦</div>
    <div style="flex:1;">
      <div class="chat-label">CMD_CORE · Claude 3.5 Sonnet</div>
      <div class="chat-bubble-ai" style="display:flex;align-items:center;gap:6px;"><div class="chat-dot"></div><div class="chat-dot" style="animation-delay:0.15s"></div><div class="chat-dot" style="animation-delay:0.3s"></div><span style="font-size:10px;color:#94a3b8;margin-left:4px;">Thinking...</span></div>
    </div>`;
  container.appendChild(div);
  container.scrollTop = container.scrollHeight;
}

function hideChatTypingIndicator() {
  const el = document.getElementById('chat-typing');
  if (el) { el.style.display = 'none'; }
  const existing = document.getElementById('chat-typing-indicator');
  if(existing) existing.remove();
}

async function executeAIStructuredForecastFlow(options = {}) {
  const targetDate = options.targetDate instanceof Date ? options.targetDate : parseForecastTargetDate(options.userMessage || '');
  const targetStr = targetDate.toLocaleDateString('en-US', { weekday:'long', year:'numeric', month:'long', day:'numeric' });
  try {
    // Step-by-step progress messages in chat
    const steps = [
      { msg: '🧠 Running LightGBM baseline model…', delay: 0 },
      { msg: '🌤️ Fetching live weather data…', delay: 900 },
      { msg: '📅 Scanning school calendar…', delay: 1800 },
      { msg: '🤖 Claude synthesizing factors…', delay: 2700 },
    ];
    let stepEl = null;
    const updateStep = (text) => {
      if (stepEl) stepEl.querySelector('p').textContent = text;
    };
    // Show first step inline
    const container = document.getElementById('chat-messages');
    if (container) {
      stepEl = document.createElement('div');
      stepEl.id = 'forecast-steps-indicator';
      stepEl.className = 'flex items-start gap-2';
      stepEl.innerHTML = `
        <div class="w-6 h-6 bg-amber-500 rounded-full flex items-center justify-center flex-shrink-0 mt-0.5">
          <span style="font-size:12px">🔬</span>
        </div>
        <div class="bg-amber-50 p-3 border-2 border-amber-400 flex-1">
          <p class="font-bold text-[10px] uppercase text-amber-600 mb-1">FORECAST ENGINE</p>
          <p id="forecast-step-text" class="text-xs font-mono">Initializing pipeline…</p>
          <div class="mt-2 h-1 bg-amber-200 overflow-hidden"><div id="forecast-prog-bar" class="h-full bg-amber-500 transition-all duration-700" style="width:0%"></div></div>
        </div>`;
      container.appendChild(stepEl);
      container.scrollTop = container.scrollHeight;
    }
    const setStep = (text, pct) => {
      const t = document.getElementById('forecast-step-text');
      const b = document.getElementById('forecast-prog-bar');
      if (t) t.textContent = text;
      if (b) b.style.width = pct + '%';
    };

    setStep('🧠 Running LightGBM baseline model…', 15);
    await refreshMLPrediction(targetDate);

    setStep('🌤️ Fetching live weather data…', 35);
    if (!weatherForecast || weatherForecast.length === 0) await fetchWeather();

    setStep(`📅 Scanning calendar for ${targetStr}…`, 55);
    await new Promise(r => setTimeout(r, 400)); // brief pause for visual effect

    setStep('⚡ Running Agent 2 synthesis…', 70);
    const pred = await runAgent2(targetDate);
    currentPrediction = pred;
    updateWasteLogsWindow(pred);
    updateSimWindow();

    setStep('🤖 Claude drafting narrative…', 85);
    const mlBaseline = lastMLPrediction ? lastMLPrediction.total : 10.0;
    const fc = getForecastForDate(targetDate);
    const explanationContext = `You are CMD_CORE for CanteenTycoon. The forecast pipeline has completed for TARGET DATE: ${targetStr}.
- LightGBM Baseline: ${mlBaseline.toFixed(2)} kg
- Final AI Prediction: ${pred.predicted_waste_kg} kg
- Waste Risk: ${pred.waste_risk.toUpperCase()} (${pred.risk_pct}%)
- Weather on ${targetStr}: ${fc ? fc.condition + ', high ' + fc.tempMax + '°C' : weatherData.condition + ', ' + weatherData.temp + '°C'}
- Calendar Event: ${getCalendar(targetDate).event}
- Primary Cause: ${pred.main_cause}
- CO2 Impact: ${pred.co2_at_risk_kg} kg
In 2-3 sentences, explain why you predict this amount for ${targetStr} (NOT today unless target is today). Cite weather, calendar, and menu for that specific date. Tell the manager to review the Forecast Report and click Approve if they agree.
Optionally, you can update the dashboard widgets based on this forecast by adding:
[WIDGETS: {"efficiency":${Math.round(100 - pred.risk_pct)},"mood":"${pred.waste_risk === 'high' ? 'Attention' : pred.waste_risk === 'medium' ? 'Stable' : 'Optimal'}","wasteReduction":${(pred.predicted_waste_kg * 0.3).toFixed(1)},"co2Saved":${pred.co2_at_risk_kg},"mealsDonated":${Math.round(pred.predicted_waste_kg * 3.33 * 0.3)},"moodDetail":"${pred.main_cause.substring(0, 60)}"}]`;
    let reply = await callChatAI(explanationContext, [{ role: 'user', content: `Explain the forecast for ${targetStr}.` }]);
    // Extract WIDGETS tag from explanation (don't use full processClaudeActions — would loop on [RUN_FORECAST])
    const wm = reply.match(/\[WIDGETS:\s*(\{[\s\S]+?\})\]/);
    if (wm) {
      try { applyWidgetOverrides(JSON.parse(wm[1])); } catch(e) { terminalLog(`WIDGETS: ${e.message}`, 'warn'); }
      reply = reply.replace(/\[WIDGETS:\s*\{[\s\S]+?\}\]/, '').trim();
    }
    // Also strip any other tags that might have been included
    reply = reply.replace(/\[(GENERATE_PDF|EXPORT_CSV|DAILY_REPORT|CLEAR_CHAT|WEB_SEARCH|SEND_EMAIL|SAVE_MEMORY|TRAIN_MODEL)[^\]]*\]/gi, '').trim();

    setStep('✅ Forecast complete! Report ready.', 100);
    await new Promise(r => setTimeout(r, 600));
    if (stepEl) stepEl.remove();

    // Show the animated prediction paper
    showPredictionPaperAnimated(pred, reply, targetDate);

    chatHistory.push({role: 'assistant', content: reply});
    appendChatMessage('assistant', reply, ['📥 Download PDF']);
    // Auto-generate downloadable PDF of the forecast
    generatePDF(`Waste Forecast — ${targetStr}`, reply);
    updateAILogsWindow('CHAT_AI', `Forecast Paper printed! ${pred.predicted_waste_kg}kg predicted`, 'SUCCESS');

    // Auto-save forecast to waste memory (pending actual outcome)
    const dayShort = ['sun','mon','tue','wed','thu','fri','sat'][targetDate.getDay()];
    saveMemory('waste', {
      date: targetDate.toISOString().split('T')[0],
      menu: setupConfig?.weeklyMenu?.[dayShort] || 'unknown',
      predicted: pred.predicted_waste_kg,
      actual: null,
      risk: pred.waste_risk,
      weather: (getForecastForDate(targetDate)?.condition || weatherData.condition),
      temp: (getForecastForDate(targetDate)?.tempMax || weatherData.temp),
      calendarEvent: getCalendar(targetDate).event,
      cause: pred.main_cause,
      followUpNeeded: true
    });

  } catch(e) {
    const stepEl = document.getElementById('forecast-steps-indicator');
    if (stepEl) stepEl.remove();
    hideChatTypingIndicator();
    terminalLog(`FORECAST_FLOW_ERROR: ${e.message}`, 'err');
    appendChatMessage('assistant', `⚠️ Error running forecast: ${e.message}`);
    updateAILogsWindow('CHAT_AI', `Forecast Error: ${e.message}`, 'ERROR');
  }
}

function showPredictionPaper(pred) {
  const win = document.getElementById('win-prediction-paper');
  if(!win) return;
  
  // Format Date and Time
  const now = new Date();
  document.getElementById('pred-paper-date').textContent = `DATE: ${now.toLocaleDateString()} | TIME: ${now.toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'})}`;
  
  // Weather — use forecast high when available, fall back to current temp
  const todayHigh = weatherForecast.length > 0 ? weatherForecast[0].tempMax : weatherData.temp;
  document.getElementById('pred-paper-weather-text').textContent = `${weatherData.condition || 'Unknown'}, H:${todayHigh}°C`;
  document.getElementById('pred-paper-weather-icon').textContent = weatherData.icon || '☁️';
  
  // Calculate weather effect bar width and text based on precipitation or temperature
  let weatherEffectText = 'NEUTRAL PRESSURE';
  let weatherBarWidth = '50%';
  let weatherBarColor = 'bg-blue-400';
  
  const conditionLower = (weatherData.condition || '').toLowerCase();
  const tempForEffect = todayHigh;
  if (conditionLower.includes('rain') || conditionLower.includes('shower') || conditionLower.includes('storm') || (tempForEffect && tempForEffect < 10)) {
    weatherEffectText = '❌ LOW ATTENDANCE RISK (+WASTE)';
    weatherBarWidth = '80%';
    weatherBarColor = 'bg-red-500';
  } else if (conditionLower.includes('clear') || conditionLower.includes('sun') || (tempForEffect && tempForEffect > 20)) {
    weatherEffectText = '✅ HIGH ATTENDANCE (-WASTE)';
    weatherBarWidth = '20%';
    weatherBarColor = 'bg-emerald-500';
  }
  
  const bar = document.getElementById('pred-paper-weather-bar');
  if(bar) {
    bar.style.width = weatherBarWidth;
    bar.className = `h-full transition-all duration-1000 ${weatherBarColor}`;
  }
  document.getElementById('pred-paper-weather-effect').textContent = weatherEffectText;
  if(weatherEffectText.includes('LOW')) {
    document.getElementById('pred-paper-weather-effect').style.color = '#ef4444';
  } else if(weatherEffectText.includes('HIGH')) {
    document.getElementById('pred-paper-weather-effect').style.color = '#10b981';
  } else {
    document.getElementById('pred-paper-weather-effect').style.color = '#3b82f6';
  }
  
  // Calendar Event
  const cal = getCalendar();
  document.getElementById('pred-paper-event-name').textContent = cal.event.toUpperCase();
  let eventDesc = 'Regular cafeteria operations with standard attendance.';
  if (cal.type === 'exam_week') {
    eventDesc = '⚠️ STUDY LEAVE: Lower lunch attendance expected as students study off-campus. Higher risk of waste.';
  } else if (cal.type === 'sports') {
    eventDesc = '⚽ SPORTS EVENT: High campus activity. Attendance likely to surge, low waste risk.';
  } else if (cal.type === 'holiday') {
    eventDesc = '❌ CAMPUS HOLIDAY: Cafeteria closed or extremely low activity. Critical waste risk.';
  } else if (cal.type === 'friday') {
    eventDesc = '📅 WEEKEND DRIFT: Lower dinner/afternoon attendance observed on Fridays.';
  }
  document.getElementById('pred-paper-event-desc').textContent = eventDesc;
  
  // Menu Risk
  const dayShort = new Date().toLocaleDateString('en-US',{weekday:'short'}).toLowerCase();
  const todayMenu = setupConfig?.weeklyMenu?.[dayShort] || 'Rice';
  const category = mapMenuToCategory(todayMenu);
  document.getElementById('pred-paper-menu-name').textContent = todayMenu.toUpperCase();
  
  let riskLevel = 'MEDIUM';
  let riskBg = 'bg-amber-500';
  let histWaste = '~8.4kg';
  if (category === 'Meat' || category === 'Soup') {
    riskLevel = 'HIGH';
    riskBg = 'bg-red-500';
    histWaste = '~15.5kg';
  } else if (category === 'Vegetables') {
    riskLevel = 'LOW';
    riskBg = 'bg-emerald-500';
    histWaste = '~3.8kg';
  }
  
  const riskBadge = document.getElementById('pred-paper-menu-risk');
  if(riskBadge) {
    riskBadge.textContent = riskLevel;
    riskBadge.className = `px-1.5 py-0.5 rounded text-[8px] font-bold text-white uppercase ${riskBg}`;
  }
  document.getElementById('pred-paper-menu-hist').textContent = histWaste;
  
  // ML vs AI Comparison
  const mlVal = lastMLPrediction ? lastMLPrediction.total : 10.0;
  document.getElementById('pred-paper-ml-val').textContent = `${mlVal.toFixed(2)} kg`;
  document.getElementById('pred-paper-ai-val').textContent = `${pred.predicted_waste_kg} kg`;
  
  // Probability Bar
  document.getElementById('pred-paper-prob-val').textContent = `${pred.risk_pct}%`;
  document.getElementById('pred-paper-prob-bar').style.width = `${pred.risk_pct}%`;
  
  // Carbon Leaf
  document.getElementById('pred-paper-co2-val').textContent = `${pred.co2_at_risk_kg} kg CO₂ prevented if rescued`;
  
  // Explanation text
  document.getElementById('pred-paper-explanation').textContent = pred.main_cause || 'AI has synthesized historical ML patterns with live weather forecasts and academic events.';
  
  // Open the window
  win.classList.remove('hidden');
  win.style.zIndex = "80";
  
  terminalLog(`OUTLOOK_PAPER: Forecast receipt printed successfully ✓`, 'ok');
}

function approvePredictionPaper() {
  if (!currentPrediction) return;
  const p = currentPrediction;
  const rescueKg = (p.predicted_waste_kg * 0.8).toFixed(1);
  const meals = Math.round(parseFloat(rescueKg) * MEALS_PER_KG);
  const shelterName = setupConfig?.shelterName || 'Partner Shelter';
  const shelterEmail = setupConfig?.shelterEmail || '';
  const canteenName = setupConfig?.canteenName || 'Cafeteria';
  const managerName = setupConfig?.managerName || 'Manager';
  const now = new Date();
  const dateStr = now.toLocaleDateString('en-US', { weekday:'long', year:'numeric', month:'long', day:'numeric' });

  const subject = `🍽️ Surplus Food Dispatch — ${canteenName} — ${dateStr}`;
  const body = `Dear ${shelterName} Team,

Greetings from ${canteenName}!

We are pleased to inform you that we have surplus food available for dispatch today, ${dateStr}. Below are the details:

━━━━━━━━━━━━━━━━━━━━━━━
📦 DISPATCH NOTICE
━━━━━━━━━━━━━━━━━━━━━━━

📍 Source: ${canteenName}
👨‍🍳 Manager: ${managerName}
📅 Date: ${dateStr}
🍽️ Estimated Surplus: ${rescueKg} kg
👥 Estimated Meals: ~${meals} servings
♻️ CO₂ Prevented: ~${(parseFloat(rescueKg) * CO2_PER_KG).toFixed(1)} kg

━━━━━━━━━━━━━━━━━━━━━━━

Our team is preparing the dispatch and we will coordinate the pickup/delivery shortly. Please confirm receipt at your earliest convenience.

If you have any questions or need to adjust the pickup schedule, feel free to reach out.

Thank you for partnering with us to reduce food waste and feed our community!

Warm regards,
${managerName}
${canteenName}
${setupConfig?.location || ''}`;

  // Populate email modal
  document.getElementById('email-approval-to').value = shelterEmail;
  document.getElementById('email-approval-subject').value = subject;
  document.getElementById('email-approval-body').value = body;
  document.getElementById('email-approval-modal').classList.remove('hidden');
}

function closeEmailApproval() {
  document.getElementById('email-approval-modal').classList.add('hidden');
}

async function confirmSendEmail() {
  const rescueKg = currentPrediction ? (currentPrediction.predicted_waste_kg * 0.8).toFixed(2) : '0.00';
  const to = document.getElementById('email-approval-to').value.trim();
  const subject = document.getElementById('email-approval-subject').value.trim();
  const body = document.getElementById('email-approval-body').value.trim();
  if (!to) { terminalLog('EMAIL: No recipient email address', 'err'); return; }
  const fromEmail = setupConfig?.googleUser?.email || setupConfig?.managerContact || '';

  // Use pre-fetched Google token (from wizard sign-in) or request one
  let accessToken = window.__googleAccessToken || '';
  if (!accessToken && setupConfig?.googleUser && typeof google !== 'undefined' && google.accounts?.oauth2) {
    try {
      const cid = localStorage.getItem('ct_google_client_id') || GOOGLE_CLIENT_ID || '';
      if (cid) {
        const getToken = (prompt) => new Promise((res, rej) => {
          try {
            const tc = google.accounts.oauth2.initTokenClient({
              client_id: cid,
              scope: 'https://mail.google.com/',
              prompt,
              callback: (r) => r.access_token ? res(r.access_token) : rej(r.error || 'no token')
            });
            if (prompt === 'consent') sendNotification('⏳ Gmail Permission', 'A Google popup will ask you to grant email sending permission.', 'high');
            tc.requestAccessToken();
          } catch(e) { rej(e.message); }
        });
        try { accessToken = await getToken(''); }
        catch(e) {
          terminalLog('[Google] Silent Gmail token failed, requesting consent...', 'warn');
          accessToken = await getToken('consent');
        }
      }
    } catch(e) { terminalLog('[Google] Gmail token: ' + e, 'warn'); }
  }

  closeEmailApproval();

  // Close prediction paper
  const win = document.getElementById('win-prediction-paper');
  if(win) win.classList.add('hidden');

  // Send the email — try direct Gmail API first (browser has access_token), fall back to proxy
  let sent = false;
  if (accessToken) {
    try {
      const raw = [
        'Content-Type: text/plain; charset="UTF-8"',
        'MIME-Version: 1.0',
        'Content-Transfer-Encoding: 7bit',
        'To: ' + to,
        'Subject: ' + subject,
        'From: ' + fromEmail,
        '',
        body
      ].join('\r\n');
      const b64 = btoa(unescape(encodeURIComponent(raw))).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
      const r = await fetch('https://gmail.googleapis.com/gmail/v1/users/me/messages/send', {
        method: 'POST',
        headers: { 'Authorization': 'Bearer ' + accessToken, 'Content-Type': 'application/json' },
        body: JSON.stringify({ raw: b64 })
      });
      const d = await r.json();
      if (r.ok) { sent = true; terminalLog('EMAIL: Sent via direct Gmail API ✓', 'ok'); sendNotification('📧 Dispatch Email Sent', 'Surplus notice dispatched to ' + to, 'high'); }
      else { terminalLog('EMAIL: Direct Gmail API failed (' + (d.error?.message || r.status) + '), trying proxy...', 'warn'); }
    } catch(e) { terminalLog('EMAIL: Direct call error, trying proxy...', 'warn'); }
  }
  if (!sent) {
    try {
      const payload = { to, subject, body, from_email: fromEmail };
      if (accessToken) payload.access_token = accessToken;
      const res = await fetch('/proxy/send-email', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      });
      const result = await res.json();
      if (result.sent) {
        terminalLog('EMAIL: Dispatch notice sent to ' + to + ' (' + (result.simulated ? 'simulated' : 'delivered') + ')', 'ok');
        sendNotification('📧 Dispatch Email Sent', 'Surplus notice dispatched to ' + to, 'high');
      } else {
        terminalLog('EMAIL: Failed - ' + result.error, 'err');
      }
    } catch(e) {
      terminalLog('EMAIL: Error - ' + e.message, 'err');
    }
  }

  // Execute rescue confirmation
  if (currentPrediction) {
    confirmRescueFromEmail();
  }
  sendNotification('🚨 Dispatcher Notification', `Surplus dispatch initiated: ${rescueKg}kg.`, 'high');
}

function confirmRescueFromEmail() {
  if(!currentPrediction) return;
  const r = parseFloat((currentPrediction.predicted_waste_kg * 0.8).toFixed(2));
  const meals = Math.round(r * MEALS_PER_KG);
  const co2 = parseFloat((r * CO2_PER_KG).toFixed(2));

  rescuedToday += r;
  mealsSaved += meals;
  weekRescued += r;
  weekMeals += meals;
  localStorage.setItem('ct_wr', weekRescued.toFixed(2));
  localStorage.setItem('ct_wm', weekMeals.toString());

  const dayShort = new Date().toLocaleDateString('en-US',{weekday:'short'}).toLowerCase();

  if (typeof recordObservation === 'function') {
    recordObservation('rescue_confirmed', {
      meal: setupConfig?.weeklyMenu?.[dayShort] || 'unknown',
      served: parseInt(setupConfig?.avgStudents) || 0,
      wasted: parseFloat(wasteToday.toFixed(2)),
      rescued: r,
      confidence: currentPrediction.confidence,
      reasoning: currentPrediction.main_cause,
      shelter: setupConfig?.shelterName || 'Food Bank',
    });
  }

  if (typeof addRescueToWasteLogs === 'function') {
    addRescueToWasteLogs({
      food: currentPrediction.at_risk_meals?.join(', ') || 'Mixed',
      kg: r, meals, co2,
      shelter: setupConfig?.shelterName || 'City Food Bank',
      manager: setupConfig?.managerName || 'Manager',
      confidence: currentPrediction.confidence,
      risk: currentPrediction.waste_risk,
      reasoning: currentPrediction.main_cause,
    });
  }

  terminalLog(`RESCUE_CONFIRMED: ${r}kg → ${setupConfig?.shelterName||'Food Bank'} ✓`, 'ok');
  terminalLog(`IMPACT: ${co2}kg CO₂ prevented | ${meals} meals donated ✓`, 'ok');
  updateAILogsWindow('RESCUE', `${r}kg confirmed | ${meals} meals | ${co2}kg CO₂ saved`, 'RESCUE_SUCCESS');
  updateSimWindow();
}

let _reportQAData = null;

function toggleReportQA() {
  const section = document.getElementById('report-qa-section');
  if (section) {
    section.classList.toggle('hidden');
    if (!section.classList.contains('hidden')) {
      document.getElementById('report-qa-input')?.focus();
    }
  }
}

async function askReportQuestion() {
  const input = document.getElementById('report-qa-input');
  const thread = document.getElementById('report-qa-thread');
  if (!input || !thread || !input.value.trim()) return;

  const question = input.value.trim();
  input.value = '';
  input.disabled = true;

  // Show user question
  const qDiv = document.createElement('div');
  qDiv.className = 'text-indigo-800 font-bold';
  qDiv.textContent = '👤 ' + question;
  thread.appendChild(qDiv);

  // Build context
  const p = currentPrediction;
  const targetDate = _reportQAData?.targetDate || new Date().toLocaleDateString();
  const context = `The user is asking about this forecast report:

Date: ${targetDate}
Menu: ${_reportQAData?.menu || 'N/A'}
Weather: ${_reportQAData?.weather || 'N/A'}
Calendar: ${_reportQAData?.calendar || 'N/A'}
ML Prediction: ${p ? p.predicted_waste_kg + 'kg' : 'N/A'}
Risk: ${p ? p.risk_pct + '% - ' + p.waste_risk : 'N/A'}
CO2 at Risk: ${p ? p.co2_at_risk_kg + 'kg' : 'N/A'}

User question: ${question}

Answer concisely and informatively based on the above data. If you need to reference food science or behavioral patterns, do so.`;

  try {
    const answer = await callChatAI(
      'You are a data analyst assistant. Answer the manager\'s question about the forecast report using the provided data. Be concise (2-4 sentences) and cite specific numbers.',
      [{ role: 'user', content: context }]
    );
    const aDiv = document.createElement('div');
    aDiv.className = 'text-slate-700 leading-relaxed';
    aDiv.textContent = '🤖 ' + answer;
    thread.appendChild(aDiv);
    thread.scrollTop = thread.scrollHeight;
  } catch(e) {
    const aDiv = document.createElement('div');
    aDiv.className = 'text-red-600';
    aDiv.textContent = '⚠️ ' + e.message;
    thread.appendChild(aDiv);
  }

  input.disabled = false;
  input.focus();
}

function downloadForecastPaper() {
  const p = currentPrediction;
  if (!p) return;
  const narrative = document.getElementById('pred-paper-explanation')?.textContent || '';
  const tgtDate = _reportQAData?.targetDate || new Date().toLocaleDateString();
  const menu = _reportQAData?.menu || 'N/A';
  const weather = _reportQAData?.weather || 'N/A';
  const calendar = _reportQAData?.calendar || 'N/A';
  const canteen = setupConfig?.canteenName || 'CanteenTycoon';
  const manager = setupConfig?.managerName || 'Manager';
  const now = new Date();

  const researchPaper = `# 🧪 CanteenTycoon — AI Forecast Research Report

## Executive Summary
**Prepared for:** ${canteen}  
**Manager:** ${manager}  
**Date:** ${now.toLocaleDateString('en-US', { weekday:'long', year:'numeric', month:'long', day:'numeric' })}  
**Target:** ${tgtDate}  
**Menu:** ${menu}

**Predicted Waste:** ${p.predicted_waste_kg} kg  
**Risk Level:** ${p.waste_risk.toUpperCase()} (${p.risk_pct}%)  
**CO₂ at Risk:** ${p.co2_at_risk_kg} kg  
**Meals at Risk:** ~${Math.round(p.predicted_waste_kg * MEALS_PER_KG)} meals

---

## 1. Methodology

This forecast uses a multi-signal AI approach combining four independent data streams synthesized by Claude 3.5 Sonnet with reference to a LightGBM model trained on 2,600+ real university canteen records across 4 food categories (Meat, Vegetables, Rice, Soup).

### Data Sources
- **LightGBM Baseline**: Statistical model predicting waste from historical patterns
- **Weather Forecast**: Open-Meteo API data for target date conditions
- **Academic Calendar**: Events affecting student attendance and appetite
- **Menu Profile**: Category-level waste risk based on historical trends
- **AI Synthesis**: Cross-referencing all signals with food science and behavioral economics

---

## 2. Factor Analysis

### Weather Impact
${weather}

### Calendar Impact
${calendar}

### Menu Risk Analysis
**Menu Item:** ${menu}  
${p.main_cause || 'AI analysis based on historical consumption patterns.'}

### ML Baseline Reference
LightGBM model predicted baseline waste with category-level granularity.

---

## 3. AI Synthesis & Prediction

**Forecast:** ${p.predicted_waste_kg} kg of ${menu} waste is predicted for ${tgtDate}.  
**Risk Probability:** ${p.risk_pct}% — Classification: ${p.waste_risk.toUpperCase()}

### Narrative Analysis
${narrative}

### Environmental Impact
If this food waste is not prevented:
- 🌍 **CO₂ Emissions:** ${p.co2_at_risk_kg} kg of CO₂ equivalent
- 🍽️ **Meals Wasted:** ~${Math.round(p.predicted_waste_kg * MEALS_PER_KG)} meals
- 💰 **Economic Loss:** Significant procurement inefficiency

---

## 4. Recommendations

1. **Adjust Procurement**: Order ${Math.round(p.predicted_waste_kg * 0.3)} kg less ${menu} for ${tgtDate}
2. **Monitor Weather**: ${weather.includes('heat') ? 'Consider lighter menu options in extreme heat' : 'Standard operations recommended'}
3. **Portion Control**: Offer smaller serving sizes with optional seconds
4. **Promote Lighter Options**: Encourage students toward lower-waste alternatives
5. **Prepare Dispatch**: Coordinate with ${setupConfig?.shelterName || 'food shelter'} for surplus rescue

---

## 5. Data Sources

| Source | Description |
|--------|-------------|
| LightGBM Model | 2,600+ records, 4 categories, trained on university canteen data |
| Open-Meteo API | Free weather forecast API |
| Academic Calendar | User-defined events + setup configuration |
| Weekly Menu | Manager-configured meal plan |
| Claude 3.5 Sonnet | AI synthesis & behavioral analysis |

---

*Report generated by CMD_CORE — CanteenTycoon AI Platform*  
*${now.toISOString()}*`;

  generatePDF(`Research_Report_${tgtDate.replace(/[\/,]/g,'_')}`, researchPaper);
}

window.approvePredictionPaper = approvePredictionPaper;
window.closeEmailApproval = closeEmailApproval;
window.confirmSendEmail = confirmSendEmail;
window.toggleReportQA = toggleReportQA;
window.askReportQuestion = askReportQuestion;
window.downloadForecastPaper = downloadForecastPaper;
window.confirmRescueFromEmail = confirmRescueFromEmail;

// ─── CHAT HELPERS ────────────────────────────────────────────────────
let chatProcessing = false;

function setChatInputEnabled(enabled) {
  const input = document.getElementById('chat-input');
  const btn = document.getElementById('chat-send-btn');
  if (input) { input.disabled = !enabled; input.style.opacity = enabled ? '1' : '0.5'; input.style.cursor = enabled ? 'text' : 'not-allowed'; }
  if (btn) { btn.disabled = !enabled; btn.style.opacity = enabled ? '1' : '0.4'; btn.style.cursor = enabled ? 'pointer' : 'not-allowed'; }
}

function chatInputKeydown(e) {
  if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); if (!chatProcessing) sendChatMessage(); }
}
function autoGrowChat(el) {
  el.style.height = 'auto';
  el.style.height = Math.min(el.scrollHeight, 120) + 'px';
  const cnt = document.getElementById('chat-char-count');
  if (cnt) cnt.textContent = `${el.value.length} / 2000`;
}
function clearChat() {
  chatHistory = [];
  const c = document.getElementById('chat-messages');
  if (c) c.innerHTML = '';
  terminalLog('CHAT: Conversation cleared ✓', 'ok');
  // Re-show welcome
  setTimeout(() => {
    const welcomeMsg = `✦ **CMD_CORE ready.** I can help you with forecasts, PDF reports, CSV exports, menu advice, rescue operations, and any cafeteria question. What do you need?`;
    appendChatMessage('assistant', welcomeMsg, ['🔮 Run Forecast', '📄 PDF Report', '📊 Export CSV']);
  }, 300);
}
function chatQuickAction(msg) {
  const input = document.getElementById('chat-input');
  if (input) { input.value = msg; autoGrowChat(input); }
  sendChatMessage();
}

// ─── PDF EXPORT ───────────────────────────────────────────────────────
function downloadChatPDF() {
  if (chatHistory.length === 0) {
    appendChatMessage('assistant', '⚠️ No conversation to export. Ask me something first!');
    return;
  }
  const dateStr = new Date().toLocaleString();
  const canteen = setupConfig?.canteenName || 'CanteenTycoon';
  let html = `<!DOCTYPE html><html><head><meta charset="utf-8">
<title>CMD_CORE Chat Export — ${canteen}</title>
<style>
body{font-family:Arial,sans-serif;max-width:800px;margin:40px auto;color:#0f172a;}
h1{background:#0f172a;color:white;padding:16px 24px;border-radius:8px;font-size:18px;}
.meta{color:#64748b;font-size:12px;margin-bottom:24px;font-family:monospace;}
.msg{margin-bottom:16px;display:flex;gap:12px;align-items:flex-start;}
.bubble{padding:12px 16px;border-radius:12px;max-width:75%;font-size:13px;line-height:1.6;}
.bubble-user{background:#6366f1;color:white;margin-left:auto;}
.bubble-ai{background:#f8fafc;border:1.5px solid #e2e8f0;}
.role{font-size:10px;font-weight:700;text-transform:uppercase;margin-bottom:4px;opacity:0.7;font-family:monospace;}
.divider{border:none;border-top:1px solid #e2e8f0;margin:16px 0;}
footer{color:#94a3b8;font-size:11px;text-align:center;margin-top:40px;font-family:monospace;}
</style></head><body>
<h1>🤖 CMD_CORE — AI Chat Export</h1>
<div class="meta">📅 Generated: ${dateStr} | 🏫 ${canteen} | 💬 ${chatHistory.length} messages | 🌡️ ${weatherData.condition} ${weatherData.temp}°C</div>
<hr class="divider">`;
  chatHistory.forEach(m => {
    const isUser = m.role === 'user';
    html += `<div class="msg"><div class="bubble ${isUser ? 'bubble-user' : 'bubble-ai'}"><div class="role">${isUser ? '👤 You' : '✦ CMD_CORE'}</div>${m.content.replace(/\n/g,'<br>').replace(/\*\*(.+?)\*\*/g,'<strong>$1</strong>')}</div></div>`;
  });
  html += `<footer>CanteenTycoon AI · CMD_CORE · Powered by Claude 3.5 Sonnet</footer></body></html>`;
  const blob = new Blob([html], {type:'text/html'});
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a'); a.href=url;
  a.download = `CMD_CORE_Chat_${canteen.replace(/\s+/g,'_')}_${new Date().toISOString().split('T')[0]}.html`;
  document.body.appendChild(a); a.click();
  document.body.removeChild(a); URL.revokeObjectURL(url);
  terminalLog('CHAT: Chat exported as HTML/PDF ✓', 'ok');
  appendChatMessage('assistant', `✅ **Chat exported!** Your conversation has been downloaded as an HTML file — open it in any browser and use File → Print → Save as PDF.`);
}

// ─── CSV EXPORT ───────────────────────────────────────────────────────
function downloadWasteCSV() {
  const rows = [['Date','Meal','Category','Section','Waste (kg)','CO2 (kg)','Rescued (kg)']];
  (DATASET_HISTORY||[]).slice(-100).forEach(r => {
    rows.push([r.date||'', r.meal||'', r.category||'', r.section||'', r.waste_kg||0, ((r.waste_kg||0)*2.5).toFixed(2), 0]);
  });
  (HISTORY||[]).forEach(h => {
    rows.push([h.date||'', h.meal||'', '', 'rescued', h.wasted||0, h.co2_saved||0, h.rescued||0]);
  });
  const csv = rows.map(r => r.map(v => `"${String(v).replace(/"/g,'""')}"`).join(',')).join('\n');
  const blob = new Blob([csv], {type:'text/csv'});
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a'); a.href=url;
  a.download = `CanteenTycoon_WasteData_${new Date().toISOString().split('T')[0]}.csv`;
  document.body.appendChild(a); a.click();
  document.body.removeChild(a); URL.revokeObjectURL(url);
  terminalLog('EXPORT: Waste data exported as CSV ✓', 'ok');
}
window.downloadWasteCSV = downloadWasteCSV;
window.downloadChatPDF = downloadChatPDF;
window.clearChat = clearChat;
window.chatQuickAction = chatQuickAction;
window.autoGrowChat = autoGrowChat;
window.chatInputKeydown = chatInputKeydown;

// ─── GENERAL PDF GENERATOR ─────────────────────────────────────────
// Takes any title + markdown content and creates a downloadable HTML file
// that the user can open in a browser and File → Print → Save as PDF.
function generatePDF(title, markdownContent) {
  if (!markdownContent) {
    appendChatMessage('assistant', '⚠️ Nothing to export. Ask me something first!');
    return;
  }
  const dateStr = new Date().toLocaleString();
  const canteen = setupConfig?.canteenName || 'CanteenTycoon';
  const escapedContent = markdownContent
    .replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;')
    .replace(/\n/g,'<br>')
    .replace(/\*\*(.+?)\*\*/g,'<strong>$1</strong>')
    .replace(/\*(.+?)\*/g,'<em>$1</em>')
    .replace(/```(\w*)\n?([\s\S]*?)```/g,'<pre><code>$2</code></pre>')
    .replace(/`(.+?)`/g,'<code>$1</code>')
    .replace(/^### (.+)$/gm,'<h3>$1</h3>')
    .replace(/^## (.+)$/gm,'<h2>$1</h2>')
    .replace(/^# (.+)$/gm,'<h1>$1</h1>')
    .replace(/^- (.+)$/gm,'<li>$1</li>')
    .replace(/\n{2,}/g,'</p><p>');

  let html = `<!DOCTYPE html><html><head><meta charset="utf-8">
<title>${title} — ${canteen}</title>
<style>
body{font-family:Arial,sans-serif;max-width:800px;margin:40px auto;padding:0 20px;color:#0f172a;}
h1{background:#0f172a;color:white;padding:16px 24px;border-radius:8px;font-size:20px;}
h2{color:#0f172a;border-bottom:3px solid #6366f1;padding-bottom:6px;margin-top:28px;}
h3{color:#475569;}
p{line-height:1.7;font-size:14px;color:#334155;}
li{margin:4px 0 4px 20px;font-size:14px;line-height:1.5;color:#334155;}
pre{background:#0f172a;color:#e2e8f0;padding:14px;border-radius:8px;overflow-x:auto;font-size:12px;}
code{background:#f1f5f9;padding:2px 6px;border-radius:4px;font-size:13px;}
pre code{background:transparent;padding:0;}
.meta{color:#64748b;font-size:12px;margin-bottom:24px;font-family:monospace;}
footer{color:#94a3b8;font-size:11px;text-align:center;margin-top:40px;font-family:monospace;border-top:1px solid #e2e8f0;padding-top:16px;}
@media print{body{margin:20px auto;}h1{background:#0f172a!important;-webkit-print-color-adjust:exact;}}
</style></head><body>
<h1>📄 ${title}</h1>
<div class="meta">📅 ${dateStr} | 🏫 ${canteen}</div>
<p>${escapedContent}</p>
<footer>CanteenTycoon AI · CMD_CORE · Generated by Claude 3.5 Sonnet</footer></body></html>`;

  const blob = new Blob([html], {type:'text/html'});
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a'); a.href=url;
  const safeTitle = title.replace(/[^a-zA-Z0-9_ ]/g,'').replace(/\s+/g,'_');
  a.download = `${safeTitle}_${new Date().toISOString().split('T')[0]}.html`;
  document.body.appendChild(a); a.click();
  document.body.removeChild(a); URL.revokeObjectURL(url);
  terminalLog(`PDF: "${title}" exported ✓`, 'ok');
}
window.generatePDF = generatePDF;

async function sendChatMessage() {
  if (chatProcessing) return;
  const input = document.getElementById('chat-input');
  if (!input) return;
  const msg = input.value.trim();
  if (!msg) return;
  chatProcessing = true;
  setChatInputEnabled(false);
  input.value = '';
  if (typeof autoGrowChat === 'function') input.style.height = 'auto';
  const cnt = document.getElementById('chat-char-count');
  if (cnt) cnt.textContent = '0 / 2000';
  appendChatMessage('user', msg);
  chatHistory.push({role:'user', content: msg});
  updateAILogsWindow('CHAT_USER', msg.substring(0, 80), 'SUCCESS');

  showChatTypingIndicator();
  const badge = document.getElementById('chat-model-badge');
  if (badge) badge.textContent = 'Thinking...';

  try {
    let reply = await callChatAI(buildChatContext(), chatHistory.slice(-20));
    hideChatTypingIndicator();
    if (badge) badge.textContent = 'Claude 3.5 Sonnet · Ready';

    // Parse & execute all action tags Claude included
    reply = await processClaudeActions(reply);

    // Display final response
    if (reply && reply.trim()) {
      chatHistory.push({role:'assistant', content: reply});
      const suggestions = [];
      if (/forecast|predict/i.test(reply)) suggestions.push('🔮 Run Forecast');
      if (/waste|risk/i.test(reply)) suggestions.push('⚠️ Show Status');
      if (/menu|meal/i.test(reply)) suggestions.push('🍽️ Menu Tips');
      appendChatMessage('assistant', reply, suggestions.slice(0,2));
      updateAILogsWindow('CHAT_AI', reply.substring(0, 80), 'SUCCESS');

      // Auto-save chat summary (every 5 exchanges to avoid spam)
      if (chatHistory.length > 0 && chatHistory.length % 5 === 0) {
        saveMemory('chat', {
          summary: msg.substring(0, 120) + ' → ' + reply.substring(0, 120),
          keyPoints: [msg.substring(0, 60), reply.substring(0, 60)],
          exchangeCount: chatHistory.length / 2
        });
      }
    }
  } catch(err) {
    hideChatTypingIndicator();
    if (badge) badge.textContent = 'Error';
    terminalLog(`CHAT: ${err.message}`, 'err');
    appendChatMessage('assistant', `⚠️ ${err.message}`);
    updateAILogsWindow('CHAT_AI', `Error: ${err.message}`, 'ERROR');
  } finally {
    chatProcessing = false;
    setChatInputEnabled(true);
  }
}

async function processClaudeActions(text) {
  let t = text;

  // [RUN_FORECAST: day] — trigger the AI forecast pipeline
  const fc = t.match(/\[RUN_FORECAST:\s*(.+?)\]/i);
  if (fc) {
    const targetDate = parseForecastTargetDate(fc[1]);
    await executeAIStructuredForecastFlow({ targetDate, userMessage: fc[1] });
    return ''; // forecast pipeline handles its own output
  }

  // [WIDGETS: {...}] — update dashboard scores
  const wm = t.match(/\[WIDGETS:\s*(\{[\s\S]+?\})\]/);
  if (wm) {
    try { applyWidgetOverrides(JSON.parse(wm[1])); } catch(e) { terminalLog(`WIDGETS: ${e.message}`, 'warn'); }
    t = t.replace(/\[WIDGETS:\s*\{[\s\S]+?\}\]/, '').trim();
  }

  // [GENERATE_PDF: Title] — download PDF of response content
  const pm = t.match(/\[GENERATE_PDF:\s*(.+?)\]/i);
  if (pm) {
    const pdfTitle = pm[1].trim();
    t = t.replace(/\[GENERATE_PDF:[^\]]+\]/i, '').trim();
    generatePDF(pdfTitle, t);
    updateAILogsWindow('CHAT_AI', `PDF generated: ${pdfTitle}`, 'SUCCESS');
  }

  // [EXPORT_CSV] — download waste data CSV
  if (/\[EXPORT_CSV\]/i.test(t)) {
    t = t.replace(/\[EXPORT_CSV\]/gi, '').trim();
    downloadWasteCSV();
  }

  // [DAILY_REPORT] — generate daily report
  if (/\[DAILY_REPORT\]/i.test(t)) {
    await generateDailySummary();
    return '';  // report shown separately
  }

  // [CLEAR_CHAT] — clear conversation
  if (/\[CLEAR_CHAT\]/i.test(t)) {
    clearChat();
    return '';
  }

  // [WEB_SEARCH: query] — fetch online context
  const wb = t.match(/\[WEB_SEARCH:\s*(.+?)\]/i);
  if (wb) {
    t = t.replace(/\[WEB_SEARCH:[^\]]+\]/i, '').trim();
    await fetchWebContext(wb[1].trim(), 'claude_request');
  }

  // [SAVE_MEMORY: type, {...}] — persist to memory store
  const sm = t.match(/\[SAVE_MEMORY:\s*(waste|chat)\s*,\s*(\{[\s\S]+?\})\]/i);
  if (sm) {
    const memType = sm[1].toLowerCase();
    try {
      const memData = JSON.parse(sm[2]);
      saveMemory(memType, memData);
      updateAILogsWindow('MEMORY', `${memType} record saved`, 'SUCCESS');
    } catch(e) {
      terminalLog(`MEMORY parse error: ${e.message}`, 'warn');
    }
    t = t.replace(/\[SAVE_MEMORY:[^\]]+\]/i, '').trim();
  }

  // [SEND_EMAIL: to, subject, body] — send dispatch email to food shelter
  const se = t.match(/\[SEND_EMAIL:\s*(.+?),?\s*(.+?),?\s*([\s\S]*?)\]/i);
  if (se) {
    const emailTo = se[1].trim() || setupConfig?.shelterEmail || '';
    const emailSubject = se[2].trim() || 'CanteenTycoon AI Dispatch';
    const emailBody = se[3].trim() || '';
    t = t.replace(/\[SEND_EMAIL:[^\]]+\]/i, '').trim();
    if (emailTo) {
      try {
        const res = await fetch('/proxy/send-email', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ to: emailTo, subject: emailSubject, body: emailBody })
        });
        const result = await res.json();
        if (result.sent) {
          terminalLog(`EMAIL: Sent to ${emailTo} (${result.simulated ? 'simulated' : 'delivered'})`, 'ok');
          updateAILogsWindow('EMAIL', `Dispatch to ${emailTo}: ${emailSubject}`, 'SUCCESS');
        } else {
          terminalLog(`EMAIL: Failed - ${result.error}`, 'err');
        }
      } catch(e) {
        terminalLog(`EMAIL: Error - ${e.message}`, 'err');
      }
    }
  }

  // [TRAIN_MODEL] — send confirmed waste records to LightGBM for retraining
  if (/\[TRAIN_MODEL\]/i.test(t)) {
    t = t.replace(/\[TRAIN_MODEL\]/gi, '').trim();
    await trainModelFromMemory();
  }

  return t;
}

function downloadChatLogs() {
  if (chatHistory.length === 0) {
    terminalLog('CHAT_LOG: No chat history to download', 'warn');
    alert('No chat history recorded today.');
    return;
  }
  const dateStr = new Date().toISOString().split('T')[0];
  const content = chatHistory.map(c => `[${c.role.toUpperCase()}] ${c.content}`).join('\n\n');
  const blob = new Blob([`CanteenTycoon AI Chat Log — ${dateStr}\n\n` + content], {type: 'text/plain'});
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `CanteenTycoon_ChatLog_${dateStr}.txt`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
  terminalLog('CHAT_LOG: Downloaded chat history ✓', 'ok');
}
window.downloadChatLogs = downloadChatLogs;

// ─── Memory System ──────────────────────────────────────────────────
// Claude manages two persistent memory stores:
//   ct_memory_waste — waste predictions & actual outcomes (self-training data)
//   ct_memory_chat  — concise chat session summaries
function initMemorySystem() {
  if (!localStorage.getItem('ct_memory_waste')) {
    localStorage.setItem('ct_memory_waste', '[]');
  }
  if (!localStorage.getItem('ct_memory_chat')) {
    localStorage.setItem('ct_memory_chat', '[]');
  }
}
function getMemories(type) {
  try { return JSON.parse(localStorage.getItem('ct_memory_' + type)) || []; }
  catch(e) { return []; }
}
function saveMemory(type, data) {
  const key = 'ct_memory_' + type;
  const arr = getMemories(type);
  data.timestamp = data.timestamp || new Date().toISOString();
  arr.push(data);
  localStorage.setItem(key, JSON.stringify(arr));
  terminalLog(`MEMORY: ${type} record saved (${arr.length} total)`, 'ok');
}
function formatMemoriesForContext(type, limit=5) {
  const arr = getMemories(type);
  if (!arr.length) return '';
  const recent = arr.slice(-limit);
  return recent.map(r => JSON.stringify(r)).join('\n');
}

async function trainModelFromMemory() {
  const records = getMemories('waste').filter(r => r.actual != null && r.actual !== '');
  if (records.length === 0) {
    appendChatMessage('assistant', '📭 No confirmed waste outcomes to train on yet. After you confirm actual waste for past forecasts, use `[TRAIN_MODEL]` to retrain.');
    return;
  }
  // Format records for LightGBM training
  const trainingData = records.map(r => ({
    Date: r.date,
    Meal: 'Lunch',
    Canteen_Section: 'A',
    Food_Category: r.menu || 'Rice',
    waste_kg: r.actual,
    Cost_Loss: (r.actual * 3).toFixed(2)
  }));
  try {
    const res = await fetch('/proxy/ml/train', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(trainingData)
    });
    const result = await res.json();
    if (result.trained) {
      appendChatMessage('assistant', `🧠 **Model retrained!**\n- Records used: ${result.records_received}\n- Total training set: ${result.total_records}\n- Model score: ${result.model_score}\n\nThe LightGBM model now incorporates your real-world outcomes.`);
      updateAILogsWindow('TRAIN', `Model trained on ${result.records_received} new records, score: ${result.model_score}`, 'SUCCESS');
    } else {
      appendChatMessage('assistant', `⚠️ Training failed: ${result.error || 'Unknown error'}`);
      updateAILogsWindow('TRAIN', `Training error: ${result.error}`, 'ERROR');
    }
  } catch(e) {
    appendChatMessage('assistant', `⚠️ Could not reach training server: ${e.message}`);
    updateAILogsWindow('TRAIN', `Connection error: ${e.message}`, 'ERROR');
  }
}

function buildChatContext() {
const datasetInfo = DATASET_HISTORY.length > 0
  ? `\nREAL HISTORICAL DATASET (${DATASET_HISTORY.length} records from a university canteen):\n` +
    `- ${DATASET_HISTORY.reduce((s,r)=>s+r.waste_kg,0).toFixed(0)}kg total waste observed\n` +
    `- Meals: Breakfast, Lunch, Dinner\n` +
    `- Categories: Meat, Vegetables, Rice, Soup\n` +
    `- Sections: A, B, C, D\n` +
    `- Date range: ${DATASET_HISTORY[0]?.date} to ${DATASET_HISTORY[DATASET_HISTORY.length-1]?.date}\n` +
    `- Latest pattern: ${DATASET_HISTORY.slice(-1)[0]?.meal} | ${DATASET_HISTORY.slice(-1)[0]?.category} | ${DATASET_HISTORY.slice(-1)[0]?.waste_kg}kg`
  : '';

const _now = new Date();
const _todayStr = _now.toLocaleDateString('en-US', { weekday:'long', year:'numeric', month:'long', day:'numeric' });
return `You are CMD_CORE — an expert AI assistant and command center for CanteenTycoon, a school cafeteria food waste management platform. You behave like Claude: helpful, thoughtful, and capable of anything the manager needs.

Today's date: ${_todayStr}.

FULL CAFETERIA CONFIGURATION:
- Canteen: ${setupConfig?.canteenName || 'Unknown'}
- Location: ${setupConfig?.location || 'Unknown'}
- Manager: ${setupConfig?.managerName || 'Unknown'} (Contact: ${setupConfig?.managerContact || 'Unknown'})
- Students/day: ${setupConfig?.avgStudents || '?'}
- Staff: ${setupConfig?.staffCount || '?'}
- Weekly menu: Mon:${setupConfig?.weeklyMenu?.mon||'-'} Tue:${setupConfig?.weeklyMenu?.tue||'-'} Wed:${setupConfig?.weeklyMenu?.wed||'-'} Thu:${setupConfig?.weeklyMenu?.thu||'-'} Fri:${setupConfig?.weeklyMenu?.fri||'-'} Sat:${setupConfig?.weeklyMenu?.sat||'-'}
- Calendar event: ${setupConfig?.calendarEvent || 'normal'}
- Efficiency goal: ${setupConfig?.efficiencyGoal || '80% - Balanced Growth'}
- Operating hours: ${setupConfig?.openTime || '07:00'} – ${setupConfig?.closeTime || '15:00'} (currently ${openOrClosed()})
- Receiving shelter: ${setupConfig?.shelterName || 'Unknown'}
- Signed in with Google: ${setupConfig?.googleUser ? 'Yes (' + setupConfig.googleUser.email + ')' : 'No'}
${datasetInfo}

LIVE STATUS:
- Today's weather: ${weatherData.condition} ${weatherData.temp}°C (${weatherData.location || setupConfig?.location || 'auto'})
- Today's forecast high: ${weatherForecast.length > 0 ? weatherForecast[0].tempMax + '°C' : weatherData.temp + '°C'}
- 7-day forecast: ${weatherForecast.length > 0 ? weatherForecast.map(f=>`${f.dayName} ${f.icon}${f.tempMax}°`).join(' ') : 'unavailable'}
- School event today: ${getCalendar().event}

YOUR MEMORY (past waste records & chat summaries — use these to learn from past outcomes):
WASTE MEMORY:
${formatMemoriesForContext('waste', 10)}
CHAT MEMORY:
${formatMemoriesForContext('chat', 5)}

MEMORY GUIDELINES:
- When you find a waste record where the date has passed but "actualWaste" is null, ask the manager how that day went so you can log the real outcome — this helps you learn and improve future predictions.
- When the manager tells you an actual outcome, save it with [SAVE_MEMORY: waste, {...}] so you remember next time.
- After important conversations, save a chat summary with [SAVE_MEMORY: chat, {"summary":"...","keyPoints":["..."]}]
- Never guess actualWaste — only save what the manager confirms.
- When you have several confirmed actual outcomes saved, suggest retraining by adding [TRAIN_MODEL] to your response — this sends all confirmed waste records to the LightGBM server for retraining.
- These memories persist across sessions — you are gradually training yourself.

CAPABILITIES — you can do all of the following:
1. Answer any question the manager asks — you are a full assistant, never say you cannot
2. Run AI waste forecasts (add [RUN_FORECAST: monday/today/tomorrow] to your response)
3. Generate detailed operations reports ([DAILY_REPORT])
4. Export waste data as CSV ([EXPORT_CSV])
5. Download any content as a printable PDF ([GENERATE_PDF: Title Here])
6. Clear the conversation ([CLEAR_CHAT])
7. Search the web for current data ([WEB_SEARCH: your search query])
8. Update the dashboard widgets with scores ([WIDGETS: {...}])
9. Suggest menu optimizations, explain AI decisions, compute metrics

ACTION TAGS — add any of these to your response to trigger actions (tags are removed before display):
- [RUN_FORECAST: monday] — triggers the full AI prediction pipeline for a specific day
- [GENERATE_PDF: Report Title] — downloads your response as a printable HTML file
- [EXPORT_CSV] — exports waste data as CSV spreadsheet
- [DAILY_REPORT] — generates a complete daily operations report
- [CLEAR_CHAT] — clears the conversation history
- [WEB_SEARCH: query] — fetches live web data for context
- [WIDGETS: {"efficiency":85,"mood":"Optimal","wasteReduction":12.5,"co2Saved":37.5,"mealsDonated":42,"moodDetail":"Brief note"}]
  - efficiency: 0-100, mood: "Optimal"|"Stable"|"Attention", wasteReduction: kg, co2Saved: kg, mealsDonated: integer
- [SAVE_MEMORY: type, {...}] — save a record to Claude's persistent memory (type: "waste" or "chat")
  - Example: [SAVE_MEMORY: waste, {"date":"2026-06-22","menu":"Rice","predicted":4.5,"actual":null,"weather":"Sunny"}]
  - Example: [SAVE_MEMORY: chat, {"summary":"Discussed Monday forecast","keyPoints":["Pasta predicted 3.8kg","Will follow up Monday"]}]
- [TRAIN_MODEL] — sends all saved waste records (where actual outcome was confirmed) to retrain the LightGBM model on the server
- [SEND_EMAIL: to, subject, body] — sends a dispatch email to the food shelter (e.g., [SEND_EMAIL: shelter@example.org, Food Rescue, 12.5kg pasta rescued today])
  - To auto-use the shelter email: [SEND_EMAIL: auto, Dispatch Notification, Body text here]

You decide which tags to use based on what the user asks. Use [RUN_FORECAST] when asked for predictions. Use [WIDGETS] to reflect impact scores. Use [GENERATE_PDF] to create documents. Use [SAVE_MEMORY] to log outcomes you learned from the manager. Use [TRAIN_MODEL] when enough actual data has been collected to retrain. Use [SEND_EMAIL] to notify the food shelter about rescues. You are in full control — the system executes whatever tags you include.
8. Act as a general-purpose assistant — answer any question the manager has

IMPORTANT FORMATTING RULES:
- Use **bold** for key metrics and numbers
- Use bullet lists for multi-item answers
- Use numbered lists for step-by-step instructions
- Use code blocks for data tables or structured output
- Keep answers focused but thorough — be as detailed as needed
- You CAN create PDFs, menus, reports, and analyses — never say you cannot
- Never say you are "only a router" — you are the full CMD_CORE assistant
- If asked to make a PDF, generate a report, or export any content — write the full content in your response
- To generate a PDF, end with "[GENERATE_PDF: Title here]" and the app will auto-download it
- You are an expert, never say you cannot help — always provide the best answer possible`;
}

function appendChatMessage(role, text, actions) {
  const container = document.getElementById('chat-messages');
  if(!container) return;
  const div = document.createElement('div');
  const rendered = role === 'assistant' ? renderChatMarkdown(text) : escapeHtml(text);
  if(role === 'user') {
    div.className = 'chat-msg-user';
    div.innerHTML = `
      <div class="chat-avatar-user">👤</div>
      <div>
        <div class="chat-label" style="text-align:right;">You</div>
        <div class="chat-bubble-user">${rendered}</div>
      </div>`;
  } else {
    div.className = 'chat-msg-ai';
    let actionsHtml = '';
    if (actions && actions.length > 0) {
      actionsHtml = `<div class="chat-action-row">${actions.map(a => {
        const handlers = {
          '🔮 Run Forecast': 'chatQuickAction(\'Run AI forecast for today\')',
          '📄 PDF Report': 'downloadChatPDF()',
          '📊 Export CSV': 'downloadWasteCSV()',
          '⚠️ Show Status': 'chatQuickAction(\'What is the current waste level and risk?\')',
          '🍽️ Menu Tips': 'chatQuickAction(\'Suggest menu optimizations for this week\')',
          '📋 Summary': 'chatQuickAction(\'Generate a daily summary report\')',
          '📋 Daily Summary': 'generateDailySummary()',
          '📄 Export PDF': 'downloadChatPDF()',
          '📥 Download PDF': 'downloadChatPDF()',
        };
        const fn = handlers[a] || `chatQuickAction('${a}')`;
        return `<button class="chat-action-btn" onclick="${fn}">${a}</button>`;
      }).join('')}</div>`;
    }
    div.innerHTML = `
      <div class="chat-avatar-ai">✦</div>
      <div style="flex:1;min-width:0;">
        <div class="chat-label">CMD_CORE · Claude 3.5 Sonnet</div>
        <div class="chat-bubble-ai">${rendered}${actionsHtml}</div>
      </div>`;
  }
  container.appendChild(div);
  // GSAP animate-in
  if (typeof gsap !== 'undefined') {
    gsap.fromTo(div, { opacity:0, y:10 }, { opacity:1, y:0, duration:0.35, ease:'power2.out' });
  }
  container.scrollTop = container.scrollHeight;
}

function escapeHtml(str) {
  const d = document.createElement('div');
  d.textContent = str;
  return d.innerHTML;
}

function renderChatMarkdown(str) {
  let safe = escapeHtml(str);
  // Code blocks: ```...```
  safe = safe.replace(/```([\s\S]*?)```/g, '<pre>$1</pre>');
  // Inline code: `...`
  safe = safe.replace(/`([^`]+)`/g, '<code>$1</code>');
  // **bold**
  safe = safe.replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>');
  // _italic_
  safe = safe.replace(/_(.*?)_/g, '<em>$1</em>');
  // Convert newlines first so header/list regexes can match <br>
  safe = safe.replace(/\n/g, '<br>');
  // Headings: # ## ###
  safe = safe.replace(/(^|<br>)###\s*(.+?)(?=<br>|$)/g, '$1<strong style="font-size:14px;display:block;margin:10px 0 4px;color:#0f172a;">$2</strong>');
  safe = safe.replace(/(^|<br>)##\s*(.+?)(?=<br>|$)/g, '$1<strong style="font-size:16px;display:block;margin:12px 0 6px;color:#0f172a;">$2</strong>');
  safe = safe.replace(/(^|<br>)#\s*(.+?)(?=<br>|$)/g, '$1<strong style="font-size:18px;display:block;margin:14px 0 8px;color:#0f172a;">$2</strong>');
  // Horizontal rule: ---
  safe = safe.replace(/(^|<br>)---+?(<br>|$)/g, '$1<hr style="border:none;border-top:2px solid #e2e8f0;margin:12px 0;">$2');
  // Blockquote: > text
  safe = safe.replace(/(^|<br>)&gt;\s*(.+?)(?=<br>|$)/g, '$1<blockquote style="border-left:3px solid #6366f1;padding:6px 10px;margin:6px 0;background:#f8fafc;font-style:italic;font-size:inherit;">$2</blockquote>');
  // Bullet lists
  safe = safe.replace(/(^|<br>)\s*[-*]\s+/g, '$1<span style="color:#6366f1;font-weight:700;">•</span> ');
  // Numbered lists
  safe = safe.replace(/(^|<br>)(\d+)\.\s+/g, '$1<span style="color:#6366f1;font-weight:700;">$2.</span> ');
  return safe;
}

// ───────────────────────────────────────────────────────────────────
// ANIMATED PREDICTION PAPER
// ───────────────────────────────────────────────────────────────────
function showPredictionPaperAnimated(pred, narrative, targetDate) {
  const win = document.getElementById('win-prediction-paper');
  if (!win) { showPredictionPaper(pred); return; } // fallback

  const now = new Date();
  const tgt = targetDate instanceof Date ? targetDate : now;
  const fc = getForecastForDate(tgt);
  const cond = fc ? fc.condition : weatherData.condition;
  const hi = fc ? fc.tempMax : weatherData.temp;
  const icon = fc ? fc.icon : weatherData.icon;
  const cal = getCalendar(tgt);
  const dayShort = tgt.toLocaleDateString('en-US',{weekday:'short'}).toLowerCase();
  const targetMenu = setupConfig?.weeklyMenu?.[dayShort] || 'Rice';

  // Reset all bars to zero before revealing
  win.querySelectorAll('.pp-bar-fill').forEach(b => b.style.width = '0%');
  win.querySelectorAll('.pp-bar-count').forEach(c => c.textContent = '0%');

  // Populate static fields
  const setId = (id, val) => { const el = document.getElementById(id); if(el) el.textContent = val; };
  setId('pred-paper-date', `${tgt.toLocaleDateString()} • ${now.toLocaleTimeString([], {hour:'2-digit', minute:'2-digit'})}`);
  setId('pred-paper-weather-icon', icon || '☁️');
  setId('pred-paper-weather-text', `${cond || 'Unknown'}, ${hi ?? '--'}°C`);
  setId('pred-paper-event-name', cal.event.toUpperCase());
  setId('pred-paper-menu-name', targetMenu.toUpperCase());
  const mlVal = lastMLPrediction ? lastMLPrediction.total : 10.0;
  setId('pred-paper-ml-val', `${mlVal.toFixed(2)} kg`);
  setId('pred-paper-ai-val', `${pred.predicted_waste_kg} kg`);
  setId('pred-paper-co2-val', `${pred.co2_at_risk_kg} kg CO₂ at risk`);
  if (narrative) setId('pred-paper-explanation', narrative);
  else setId('pred-paper-explanation', pred.main_cause || 'AI synthesis complete.');

  // Store context for Q&A and research paper
  _reportQAData = {
    targetDate: tgt.toLocaleDateString('en-US', { weekday:'long', year:'numeric', month:'long', day:'numeric' }),
    menu: targetMenu,
    weather: `${cond || 'Unknown'}, ${hi ?? '--'}°C`,
    calendar: `${cal.event} (${cal.type})`
  };

  // Dispatch preview text
  const rescueKg = (pred.predicted_waste_kg * 0.8).toFixed(1);
  setId('pred-paper-dispatch-preview',
    `TO: ${setupConfig?.shelterName || 'Food Shelter'} | FROM: ${setupConfig?.canteenName || 'Cafeteria'}
⏰ ${now.toLocaleDateString()} — Predicted surplus: ${pred.predicted_waste_kg}kg
🍽️ Estimated ${rescueKg}kg rescuable — ~${Math.round(parseFloat(rescueKg)*MEALS_PER_KG)} meals.
Reason: ${pred.main_cause} | Risk: ${pred.waste_risk.toUpperCase()}
Awaiting manager approval to dispatch logistics.`);

  // Disable approve button until animations done
  const approveBtn = document.getElementById('pred-paper-approve-btn');
  if (approveBtn) { approveBtn.disabled = true; approveBtn.style.opacity = '0.4'; approveBtn.style.cursor = 'not-allowed'; }

  // Show window
  win.classList.remove('hidden');
  win.style.zIndex = '80';
  terminalLog('FORECAST_PAPER: Rendering animated report…', 'ok');

  // Calculate factor values
  const condLow = (cond || '').toLowerCase();
  const weatherPct = condLow.includes('rain')||condLow.includes('storm') ? 80 :
    condLow.includes('sun')||condLow.includes('clear') ? 20 : 50;
  const calPct = cal.type==='exam_week' ? 70 : cal.type==='holiday' ? 90 : cal.type==='sports' ? 15 : 30;
  const category = mapMenuToCategory ? mapMenuToCategory(targetMenu) : 'Rice';
  const menuPct = category==='Meat'||category==='Soup' ? 80 : category==='Vegetables' ? 25 : 50;
  const mlPct = Math.min(Math.round((mlVal / 25) * 100), 100);
  const finalPct = pred.risk_pct;

  if (typeof gsap !== 'undefined') {
    // GSAP scale reveal for prediction paper
    gsap.killTweensOf(win);
    gsap.fromTo(win, 
      { scale: 0.85, opacity: 0 }, 
      { scale: 1, opacity: 1, duration: 0.5, ease: "back.out(1.3)" }
    );

    const tl = gsap.timeline({
      onComplete: () => {
        // Enable approve button with glow
        if (approveBtn) {
          approveBtn.disabled = false;
          approveBtn.style.opacity = '1';
          approveBtn.style.cursor = 'pointer';
          approveBtn.style.animation = 'pulsingGlow 1.8s infinite ease-in-out';
        }
        terminalLog('FORECAST_PAPER: Report ready. Awaiting manager approval ✓', 'ok');
      }
    });

    const bars = [
      { id: 'pp-lgbm-bar', countId: 'pp-lgbm-count', pct: mlPct },
      { id: 'pp-weather-bar', countId: 'pp-weather-count', pct: weatherPct },
      { id: 'pp-calendar-bar', countId: 'pp-calendar-count', pct: calPct },
      { id: 'pp-menu-bar', countId: 'pp-menu-count', pct: menuPct },
      { id: 'pp-final-bar', countId: 'pp-final-count', pct: finalPct }
    ];

    bars.forEach((b, idx) => {
      const barEl = document.getElementById(b.id);
      const countEl = document.getElementById(b.countId);
      if (!barEl) return;

      tl.to(barEl, {
        width: b.pct + '%',
        duration: 0.7,
        ease: "power2.out"
      }, idx === 0 ? "+=0.2" : "-=0.45");

      if (countEl) {
        const cObj = { val: 0 };
        tl.to(cObj, {
          val: b.pct,
          duration: 0.7,
          ease: "power2.out",
          onUpdate: () => {
            countEl.textContent = Math.round(cObj.val) + '%';
          }
        }, "<");
      }
    });
  } else {
    // Fallback cascade using timeouts
    function animBar(barId, countId, targetPct, delay, onDone) {
      setTimeout(() => {
        const bar = document.getElementById(barId);
        const count = document.getElementById(countId);
        if (!bar && !count) { if(onDone) onDone(); return; }
        if (bar) { bar.style.transition = 'width 0.9s cubic-bezier(0.4,0,0.2,1)'; bar.style.width = targetPct + '%'; }
        let curr = 0;
        const interval = setInterval(() => {
          curr = Math.min(curr + Math.ceil(targetPct/20), targetPct);
          if (count) count.textContent = curr + '%';
          if (curr >= targetPct) { clearInterval(interval); if(onDone) onDone(); }
        }, 45);
      }, delay);
    }

    animBar('pp-lgbm-bar', 'pp-lgbm-count', mlPct, 300, () => {
      animBar('pp-weather-bar', 'pp-weather-count', weatherPct, 200, () => {
        animBar('pp-calendar-bar', 'pp-calendar-count', calPct, 200, () => {
          animBar('pp-menu-bar', 'pp-menu-count', menuPct, 200, () => {
            animBar('pp-final-bar', 'pp-final-count', finalPct, 300, () => {
              setTimeout(() => {
                if (approveBtn) {
                  approveBtn.disabled = false;
                  approveBtn.style.opacity = '1';
                  approveBtn.style.cursor = 'pointer';
                  approveBtn.style.animation = 'pulsingGlow 1.8s infinite ease-in-out';
                }
                terminalLog('FORECAST_PAPER: Report ready. Awaiting manager approval ✓', 'ok');
              }, 400);
            });
          });
        });
      });
    });
  }
}
window.showPredictionPaperAnimated = showPredictionPaperAnimated;

// ───────────────────────────────────────────────────────────────────
// CLAUDE WIZARD STATE & HANDLERS
// ───────────────────────────────────────────────────────────────────

document.addEventListener('DOMContentLoaded', () => {
  if (typeof gsap === 'undefined') return;

  initMemorySystem();

  // Stagger reveal of the welcome gate
  const welcomeGate = document.getElementById('welcome-gate');
  if (welcomeGate && !welcomeGate.classList.contains('hidden')) {
    const tl = gsap.timeline();
    tl.from('#welcome-gate .brix-card', {
      scale: 0.95,
      y: 40,
      opacity: 0,
      duration: 1.0,
      ease: 'back.out(1.2)'
    });
    tl.from('#welcome-gate .brix-card > *', {
      y: 15,
      opacity: 0,
      stagger: 0.12,
      duration: 0.6,
      ease: 'power2.out'
    }, '-=0.6');
    tl.from('#welcome-gate .floating-sprite', {
      opacity: 0,
      scale: 0.5,
      stagger: 0.08,
      duration: 1.0,
      ease: 'elastic.out(1, 0.75)'
    }, '-=0.4');
  }

  // Bind magnetic-like hover animations on buttons
  document.querySelectorAll('.brix-button, .saas-pill-btn, .tactile-button').forEach(btn => {
    btn.addEventListener('mouseenter', () => {
      gsap.to(btn, { scale: 1.03, duration: 0.2, ease: 'power1.out' });
    });
    btn.addEventListener('mouseleave', () => {
      gsap.to(btn, { scale: 1, duration: 0.25, ease: 'power1.out' });
    });
    btn.addEventListener('mousedown', () => {
      gsap.to(btn, { scale: 0.97, duration: 0.1 });
    });
    btn.addEventListener('mouseup', () => {
      gsap.to(btn, { scale: 1.03, duration: 0.15 });
    });
  });

});
