# OPENCODE TASK — CanteenTycoon AI
# Build this entire project from zero. Create every file exactly as specified.
# Do not ask questions. Do not summarize. Just build.

---

## WHAT YOU ARE BUILDING

A gamified digital twin of a real school cafeteria.
- User uploads cafeteria photo → Gemini generates top-down pixel art map
- Claude Vision (Agent 1) identifies zones in pixel art → outputs JSON
- Canvas game engine renders map + spawns student NPCs that walk, eat, abandon food
- Claude Haiku (Agent 2) predicts food waste from weather + calendar + history
- Claude Haiku (Agent 3) drafts a shelter rescue message
- Manager approves in modal before anything is sent (human-in-the-loop)

Tech: Vanilla HTML5 + JavaScript + Canvas API. No frameworks. No build step.
APIs: Claude Haiku 4.5 + Gemini 2.0 Flash Image Gen + Open-Meteo (free weather)
Local mode: Ollama with phi3.5 + llama3.2-vision (toggle in UI)

---

## ASSET SPECS — READ CAREFULLY

### Snoblin student NPCs (assets/snoblin/)
5 color variants: Default, Blue, Green, Red, Yellow
Each folder has: walk.png, idle.png, hurt.png

walk.png = 128×96px = 4 columns × 3 rows = 32×32px per frame
  - ALWAYS use ROW 0 only (srcY = 0) = facing south toward viewer
  - 4 walk frames: srcX = 0, 32, 64, 96

idle.png = 64×96px = 2 columns × 3 rows = 32×32px per frame
  - ALWAYS use ROW 0 only (srcY = 0)
  - 2 idle frames: srcX = 0, 32

hurt.png = 64×96px = 2 columns × 3 rows = 32×32px per frame
  - ALWAYS use ROW 0 only (srcY = 0)
  - 2 hurt frames: srcX = 0, 32
  - Play once on food abandonment event then revert to idle

Render all Snoblin at 48×48px on canvas (1.5x scale from 32×32 source)

### Adam manager NPC (assets/limezu/)
Adam_run_16x16.png = 384×32px = 24 frames × 1 row = 16×16px per frame
  - Walking EAST (right): frames 12-15 → srcX = 192, 208, 224, 240
  - Walking WEST (left):  frames 8-11  → srcX = 128, 144, 160, 176

Adam_idle_anim_16x16.png = 384×32px = 24 frames, use frames 0-3 looping
Adam_phone_16x16.png = 144×32px = 9 frames, use all 9 looping

Render Adam at 48×48px on canvas (3x scale from 16×16 source)

---

## FILE STRUCTURE TO CREATE

canteentycoon/
├── index.html
├── css/style.css
├── js/config.js
├── js/data.js
├── js/agents.js
├── js/npc.js
├── js/simulation.js
├── js/ui.js
└── assets/  ← user will copy sprites manually, just reference correct paths

---

## FILE 1: index.html

Create this exact HTML:

```html
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <title>CanteenTycoon AI — USAII 2026</title>
  <link rel="stylesheet" href="css/style.css">
</head>
<body>

<nav id="navbar">
  <div id="brand">🍽️ <span>CANTEEN</span>TYCOON <em>AI</em></div>
  <div id="nav-tag">USAII 2026 · Brief 2A · Food Waste Rescue Radar</div>
  <div id="mode-toggle">
    <button id="btn-cloud" class="mode-btn active" onclick="setMode('cloud')">☁️ CLOUD</button>
    <button id="btn-local" class="mode-btn" onclick="setMode('local')">💻 LOCAL</button>
  </div>
</nav>

<div id="actionbar">
  <label id="upload-label">
    📷 Upload Cafeteria Photo
    <input type="file" id="photo-input" accept="image/*" hidden onchange="handlePhotoUpload(event)">
  </label>
  <button id="btn-a1" onclick="triggerAgent1()" disabled>🧠 Agent 1: Generate Map</button>
  <button id="btn-a2" onclick="triggerAgent2()" disabled>⚡ Agent 2: Predict Waste</button>
  <button id="btn-a3" onclick="triggerAgent3()" disabled>🚨 Agent 3: Rescue Draft</button>
  <button id="btn-reset" onclick="resetAll()">🔄 Reset</button>
  <button id="btn-zones" onclick="toggleZones()">👁 Zones</button>
</div>

<div id="layout">
  <div id="canvas-area">
    <canvas id="gameCanvas"></canvas>
    <div id="co2-bar">
      🌍 CO₂ Today: <span id="co2-now">0.00</span> kg
      <span class="green"> | Saved: <span id="co2-saved">0.00</span> kg</span>
    </div>
  </div>

  <div id="sidebar">

    <div class="panel">
      <h3>📊 Simulation</h3>
      <div class="row"><span>Students</span><b id="s-students">10</b></div>
      <div class="row"><span>Hunger Avg</span><b id="s-hunger">0%</b></div>
      <div class="row"><span>Waste Today</span><b id="s-waste" class="red">0.00 kg</b></div>
      <div class="row"><span>Rescued</span><b id="s-rescued" class="green">0.00 kg</b></div>
      <div class="row"><span>Meals Saved</span><b id="s-meals">0</b></div>
      <div class="row"><span>Weather</span><b id="s-weather">...</b></div>
      <div class="row"><span>Calendar</span><b id="s-calendar">...</b></div>
      <div class="row"><span>Tick</span><b id="s-tick">0</b></div>
    </div>

    <div class="panel">
      <h3>🌱 Weekly Climate Impact</h3>
      <div class="row"><span>Total Rescued</span><b id="w-rescued" class="green">0.00 kg</b></div>
      <div class="row"><span>CO₂ Offset</span><b id="w-co2" class="green">0.00 kg</b></div>
      <div class="row"><span>Meals Donated</span><b id="w-meals">0</b></div>
      <div id="w-equiv" class="equiv">—</div>
    </div>

    <div class="panel">
      <h3>📸 Cafeteria Photo</h3>
      <img id="photo-preview" style="display:none;width:100%;border-radius:6px;">
      <p id="photo-hint">Upload your cafeteria photo — AI will generate a pixel art map of YOUR space</p>
    </div>

    <div class="panel">
      <h3>🤖 Agent 1 — Map Generator</h3>
      <pre id="out-a1">Upload a photo to begin...</pre>
    </div>

    <div class="panel">
      <h3>⚡ Agent 2 — Waste Predictor</h3>
      <pre id="out-a2">Idle...</pre>
    </div>

    <div class="panel">
      <h3>🚛 Agent 3 — Rescue Dispatch</h3>
      <div id="out-a3">Idle...</div>
      <button id="btn-approve" onclick="openApprovalModal()" style="display:none">
        ✅ Review & Approve Rescue
      </button>
      <p id="approve-note" style="display:none">⚠️ Manager approval required before sending</p>
    </div>

    <div class="panel">
      <h3>🧵 Event Log</h3>
      <div id="event-log"></div>
    </div>

    <div class="panel">
      <h3>👤 NPC Legend</h3>
      <div class="legend"><span class="dot" style="background:#888"></span>Regular (Default)</div>
      <div class="legend"><span class="dot" style="background:#3498db"></span>Vegetarian (Blue)</div>
      <div class="legend"><span class="dot" style="background:#27ae60"></span>Eco (Green)</div>
      <div class="legend"><span class="dot" style="background:#e74c3c"></span>Athlete (Red)</div>
      <div class="legend"><span class="dot" style="background:#f1c40f"></span>Picky (Yellow)</div>
    </div>

  </div>
</div>

<div id="modal" style="display:none">
  <div id="modal-box">
    <h2>🚛 Rescue Dispatch — Manager Approval</h2>
    <div id="modal-draft"></div>
    <div id="modal-stats"></div>
    <p class="warn">⚠️ This message was drafted by AI. You must review it before it is sent. This decision belongs to you, not the AI.</p>
    <div class="modal-btns">
      <button class="gbtn" onclick="confirmRescue()">✅ Approve & Send</button>
      <button class="bbtn" onclick="editRescue()">✏️ Edit First</button>
      <button class="rbtn" onclick="closeModal()">❌ Cancel</button>
    </div>
  </div>
</div>

<script src="js/config.js"></script>
<script src="js/data.js"></script>
<script src="js/agents.js"></script>
<script src="js/npc.js"></script>
<script src="js/simulation.js"></script>
<script src="js/ui.js"></script>
</body>
</html>
```

---

## FILE 2: css/style.css

```css
*{margin:0;padding:0;box-sizing:border-box}
body{background:#0d1117;color:#e6edf3;font-family:'Segoe UI',system-ui,sans-serif;
  height:100vh;display:flex;flex-direction:column;overflow:hidden}
#navbar{background:#161b22;border-bottom:2px solid #ff4444;padding:0 16px;
  display:flex;align-items:center;justify-content:space-between;height:46px;flex-shrink:0}
#brand{font-size:18px;font-weight:900;letter-spacing:1px}
#brand span{color:#ff4444}
#brand em{color:#f39c12;font-style:normal;font-size:13px;margin-left:4px}
#nav-tag{font-size:11px;color:#555}
.mode-btn{background:#21262d;color:#8b949e;border:1px solid #30363d;
  padding:4px 12px;border-radius:4px;cursor:pointer;font-size:12px;margin-left:6px;transition:all .2s}
.mode-btn.active{background:#1f6feb;color:#fff;border-color:#1f6feb}
#actionbar{background:#161b22;padding:7px 14px;display:flex;gap:8px;
  border-bottom:1px solid #30363d;flex-shrink:0;flex-wrap:wrap}
#actionbar button,#upload-label{background:#21262d;color:#e6edf3;
  border:1px solid #30363d;padding:5px 13px;border-radius:6px;cursor:pointer;
  font-size:12px;transition:all .2s;white-space:nowrap}
#actionbar button:hover:not(:disabled),#upload-label:hover{background:#ff4444;border-color:#ff4444}
#actionbar button:disabled{opacity:.35;cursor:not-allowed}
#btn-reset{margin-left:auto}
#layout{display:flex;flex:1;overflow:hidden;min-height:0}
#canvas-area{flex:1;position:relative;background:#000;overflow:hidden}
#gameCanvas{display:block;width:100%;height:100%}
#co2-bar{position:absolute;top:10px;left:10px;background:rgba(0,0,0,.8);
  color:#ff6b6b;padding:6px 14px;border-radius:6px;font-size:12px;
  font-weight:bold;border:1px solid #ff4444;pointer-events:none}
.green{color:#2ecc71}
.red{color:#e74c3c}
#sidebar{width:270px;background:#161b22;border-left:1px solid #30363d;
  overflow-y:auto;padding:8px;display:flex;flex-direction:column;gap:7px;flex-shrink:0}
.panel{background:#0d1117;border:1px solid #30363d;border-radius:8px;padding:10px}
.panel h3{font-size:11px;color:#8b949e;margin-bottom:7px;text-transform:uppercase;letter-spacing:.5px}
.row{display:flex;justify-content:space-between;font-size:12px;padding:3px 0;
  border-bottom:1px solid #21262d}
.row:last-child{border:none}
.equiv{font-size:11px;color:#2ecc71;text-align:center;margin-top:6px;font-style:italic}
pre{font-size:10px;color:#7ee787;white-space:pre-wrap;word-break:break-word;
  max-height:110px;overflow-y:auto;margin:0}
#out-a3{font-size:12px;line-height:1.6;max-height:130px;overflow-y:auto}
#btn-approve{width:100%;margin-top:8px;background:#27ae60;color:#fff;border:none;
  padding:8px;border-radius:6px;cursor:pointer;font-weight:bold;font-size:13px}
#approve-note{font-size:11px;color:#f39c12;margin-top:5px;text-align:center}
#event-log{font-size:11px;max-height:160px;overflow-y:auto;color:#8b949e}
#event-log div{padding:2px 0;border-bottom:1px solid #1a1a2e}
#event-log .ok{color:#7ee787}
#event-log .warn{color:#f39c12}
#event-log .err{color:#ff4444}
.legend{display:flex;align-items:center;gap:7px;font-size:12px;padding:2px 0}
.dot{width:11px;height:11px;border-radius:50%;display:inline-block;flex-shrink:0}
#photo-hint{font-size:11px;color:#555;line-height:1.5}
#modal{position:fixed;inset:0;background:rgba(0,0,0,.88);
  display:flex;align-items:center;justify-content:center;z-index:999}
#modal-box{background:#161b22;border:2px solid #f39c12;border-radius:12px;
  padding:24px;max-width:500px;width:92%}
#modal-box h2{color:#f39c12;margin-bottom:14px;font-size:16px}
#modal-draft{background:#0d1117;padding:14px;border-radius:6px;font-size:12px;
  line-height:1.7;color:#e6edf3;margin-bottom:10px;white-space:pre-wrap;
  max-height:200px;overflow-y:auto}
#modal-stats{font-size:12px;color:#8b949e;margin-bottom:10px;line-height:1.6}
.warn{color:#f39c12;font-size:12px;margin-bottom:14px;line-height:1.5}
.modal-btns{display:flex;gap:10px;justify-content:center}
.gbtn{background:#27ae60;color:#fff;border:none;padding:9px 18px;border-radius:6px;cursor:pointer;font-weight:bold}
.bbtn{background:#2980b9;color:#fff;border:none;padding:9px 18px;border-radius:6px;cursor:pointer}
.rbtn{background:#c0392b;color:#fff;border:none;padding:9px 18px;border-radius:6px;cursor:pointer}
```

---

## FILE 3: js/config.js

```javascript
// REPLACE WITH YOUR REAL KEYS
const CLAUDE_API_KEY = 'YOUR_CLAUDE_KEY_HERE';
const GEMINI_API_KEY = 'YOUR_GEMINI_KEY_HERE';

const CLAUDE_MODEL       = 'claude-haiku-4-5-20251001';
const GEMINI_IMG_MODEL   = 'gemini-2.0-flash-preview-image-generation';
const CLAUDE_URL         = 'https://api.anthropic.com/v1/messages';
const GEMINI_URL         = `https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_IMG_MODEL}:generateContent`;
const OLLAMA_URL         = 'http://localhost:11434/api/generate';
const WEATHER_URL        = 'https://api.open-meteo.com/v1/forecast';

const CANVAS_W           = 1100;
const CANVAS_H           = 750;
const NPC_FRAME_SIZE     = 32;    // Snoblin source: 32×32
const NPC_RENDER_SIZE    = 48;    // Snoblin canvas: 48×48
const MGR_FRAME_SIZE     = 16;    // Adam source: 16×16
const MGR_RENDER_SIZE    = 48;    // Adam canvas: 48×48
const NPC_SPEED          = 1.2;
const WASTE_PER_EVENT    = 0.3;   // kg per abandonment
const CO2_PER_KG         = 3.0;   // kg CO₂ per kg food wasted (IPCC)
const MEALS_PER_KG       = 3.33;

let currentMode    = 'cloud';
let uploadedPhoto  = null;
let generatedMapB64 = null;
let currentMapConfig = null;
let currentPrediction = null;
let currentDraft   = null;
let wasteToday     = 0;
let rescuedToday   = 0;
let mealsSaved     = 0;
let simTick        = 0;
let weekRescued    = parseFloat(localStorage.getItem('ct_wr') || '0');
let weekMeals      = parseInt(localStorage.getItem('ct_wm') || '0');
let weatherData    = {condition:'Sunny', temp:18, icon:'☀️'};
let calendarData   = {event:'Normal day', type:'normal'};
let showZones      = false;
let backgroundImg  = null;

function setMode(mode) {
  currentMode = mode;
  document.getElementById('btn-cloud').classList.toggle('active', mode==='cloud');
  document.getElementById('btn-local').classList.toggle('active', mode==='local');
  logEvent(`🔄 Switched to ${mode.toUpperCase()} mode`, 'ok');
}

function toggleZones() { showZones = !showZones; }
```

---

## FILE 4: js/data.js

```javascript
const HISTORY = [
  {date:"2025-12-02",weather:"cold", temp:4, event:"normal",   meal:"pasta",   served:115,wasted:9.2, rescued:4.1},
  {date:"2025-12-03",weather:"rainy",temp:7, event:"normal",   meal:"salad",   served:88, wasted:2.1, rescued:0.8},
  {date:"2025-12-04",weather:"cold", temp:3, event:"exam_week",meal:"pasta",   served:130,wasted:14.7,rescued:6.2},
  {date:"2025-12-05",weather:"cold", temp:2, event:"exam_week",meal:"soup",    served:140,wasted:3.2, rescued:1.1},
  {date:"2025-12-08",weather:"sunny",temp:12,event:"normal",   meal:"pizza",   served:125,wasted:5.8, rescued:2.4},
  {date:"2025-12-09",weather:"sunny",temp:14,event:"sports",   meal:"sandwich",served:70, wasted:8.9, rescued:3.8},
  {date:"2025-12-11",weather:"cold", temp:1, event:"normal",   meal:"pasta",   served:118,wasted:10.3,rescued:4.9},
  {date:"2025-12-15",weather:"cold", temp:-1,event:"exam_week",meal:"pasta",   served:135,wasted:16.2,rescued:7.1},
  {date:"2026-01-07",weather:"cold", temp:3, event:"normal",   meal:"pasta",   served:110,wasted:8.7, rescued:3.9},
  {date:"2026-01-14",weather:"cold", temp:2, event:"holiday",  meal:"special", served:60, wasted:11.4,rescued:5.2},
  {date:"2026-01-21",weather:"cold", temp:4, event:"exam_week",meal:"pasta",   served:128,wasted:13.9,rescued:6.0},
  {date:"2026-01-27",weather:"rainy",temp:6, event:"sports",   meal:"sandwich",served:65, wasted:9.2, rescued:4.0},
  {date:"2026-02-03",weather:"cold", temp:0, event:"normal",   meal:"pasta",   served:112,wasted:9.8, rescued:4.4},
  {date:"2026-02-10",weather:"sunny",temp:15,event:"special",  meal:"special", served:108,wasted:2.3, rescued:0.9},
  {date:"2026-02-24",weather:"cold", temp:3, event:"exam_week",meal:"pasta",   served:133,wasted:15.1,rescued:6.8},
  {date:"2026-03-03",weather:"sunny",temp:16,event:"normal",   meal:"salad",   served:102,wasted:1.5, rescued:0.5},
  {date:"2026-03-17",weather:"sunny",temp:18,event:"sports",   meal:"sandwich",served:72, wasted:7.8, rescued:3.3},
  {date:"2026-04-14",weather:"rainy",temp:13,event:"exam_week",meal:"pasta",   served:126,wasted:12.8,rescued:5.5},
  {date:"2026-04-21",weather:"sunny",temp:20,event:"normal",   meal:"pizza",   served:121,wasted:4.9, rescued:2.0},
  {date:"2026-05-05",weather:"sunny",temp:22,event:"normal",   meal:"salad",   served:110,wasted:1.1, rescued:0.3},
  {date:"2026-05-12",weather:"rainy",temp:15,event:"sports",   meal:"sandwich",served:68, wasted:8.5, rescued:3.6},
  {date:"2026-05-26",weather:"sunny",temp:23,event:"exam_week",meal:"pasta",   served:120,wasted:11.2,rescued:4.8},
  {date:"2026-06-02",weather:"sunny",temp:25,event:"normal",   meal:"salad",   served:108,wasted:0.8, rescued:0.2},
  {date:"2026-06-09",weather:"sunny",temp:26,event:"normal",   meal:"pizza",   served:116,wasted:4.2, rescued:1.6},
];

async function fetchWeather() {
  try {
    const url = `${WEATHER_URL}?latitude=45.79&longitude=11.66&current=temperature_2m,weathercode&timezone=auto`;
    const res = await fetch(url);
    const d = await res.json();
    const code = d.current.weathercode;
    const temp = Math.round(d.current.temperature_2m);
    let condition='Sunny', icon='☀️';
    if(code>=61){condition='Rainy';icon='🌧️';}
    else if(code>=45){condition='Cloudy';icon='☁️';}
    else if(temp<8){condition='Cold';icon='❄️';}
    weatherData = {condition, temp, icon};
    document.getElementById('s-weather').textContent = `${icon} ${condition} ${temp}°C`;
    logEvent(`🌤️ Weather: ${icon} ${condition} ${temp}°C`, 'ok');
  } catch(e) {
    document.getElementById('s-weather').textContent = '☀️ Sunny 18°C';
    logEvent('⚠️ Weather unavailable, using default', 'warn');
  }
}

function getCalendar() {
  const m = new Date().getMonth();
  const d = new Date().getDay();
  if([0,4,5].includes(m)) return {event:'Exam Week', type:'exam_week'};
  if(d===5) return {event:'Friday', type:'friday'};
  if(d===1) return {event:'Monday', type:'monday'};
  return {event:'Normal day', type:'normal'};
}
```

---

## FILE 5: js/agents.js

```javascript
async function callAI(system, user, imageB64=null) {
  return currentMode==='local'
    ? callOllama(system, user, imageB64)
    : callClaude(system, user, imageB64);
}

async function callOllama(system, user, imageB64=null) {
  const model = imageB64 ? 'llama3.2-vision' : 'phi3.5';
  const body = {
    model,
    prompt: `${system}\n\n${user}`,
    stream: false,
    options: {temperature:0.2, num_predict:800}
  };
  if(imageB64) body.images = [imageB64.replace(/^data:image\/\w+;base64,/,'')];
  const res = await fetch(OLLAMA_URL, {
    method:'POST', headers:{'Content-Type':'application/json'},
    body: JSON.stringify(body)
  });
  if(!res.ok) throw new Error(`Ollama ${res.status}: ${await res.text()}`);
  return (await res.json()).response;
}

async function callClaude(system, user, imageB64=null) {
  const content = [];
  if(imageB64) {
    const data = imageB64.replace(/^data:image\/\w+;base64,/,'');
    const mt = imageB64.startsWith('data:image/png') ? 'image/png' : 'image/jpeg';
    content.push({type:'image', source:{type:'base64', media_type:mt, data}});
  }
  content.push({type:'text', text:user});
  const res = await fetch(CLAUDE_URL, {
    method:'POST',
    headers:{
      'Content-Type':'application/json',
      'x-api-key': CLAUDE_API_KEY,
      'anthropic-version':'2023-06-01'
    },
    body: JSON.stringify({
      model: CLAUDE_MODEL,
      max_tokens: 1000,
      system,
      messages:[{role:'user', content}]
    })
  });
  if(!res.ok){const e=await res.json(); throw new Error(`Claude: ${e.error?.message}`);}
  return (await res.json()).content[0].text;
}

async function generateCafeteriaImage(userPhotoB64) {
  const style = `Modern pixel art, strict orthographic top-down bird's-eye view (looking straight down, no perspective, no isometric angle), 512×512 pixels, clean 16-bit color palette, bright warm colors, game-ready like Stardew Valley top-down view.`;
  const layout = userPhotoB64
    ? `Transform this uploaded school cafeteria photo into top-down pixel art. Maintain the real spatial layout. Convert walls to border tiles, tables to flat rectangles, chairs to small squares, serving counter to long horizontal tiles, floor to checkered pattern. Keep same relative positions as in the photo.`
    : `School cafeteria: thick wall borders, serving counter along north wall with food trays, 4 rows of rectangular dining tables with chairs, 2 trash bins near south-east, small kitchen north-west corner, entrance door south wall, checkered floor tiles.`;
  const quality = `All elements clearly readable top-down. Tables = flat rectangles. Chairs = small squares. Counter = long horizontal element. Floor = visible tile pattern. Walls = clear borders. NO diagonal perspective. NO 3D. Pure orthographic only.`;
  const prompt = `${style} ${layout} ${quality}`;
  const parts = [];
  if(userPhotoB64) {
    parts.push({
      inline_data:{
        mime_type: userPhotoB64.startsWith('data:image/png') ? 'image/png' : 'image/jpeg',
        data: userPhotoB64.replace(/^data:image\/\w+;base64,/,'')
      }
    });
  }
  parts.push({text: prompt});
  const res = await fetch(`${GEMINI_URL}?key=${GEMINI_API_KEY}`, {
    method:'POST',
    headers:{'Content-Type':'application/json'},
    body: JSON.stringify({
      contents:[{parts}],
      generationConfig:{responseModalities:['IMAGE','TEXT']}
    })
  });
  if(!res.ok){const e=await res.json(); throw new Error(`Gemini: ${JSON.stringify(e.error?.message)}`);}
  const d = await res.json();
  for(const part of d.candidates[0].content.parts) {
    if(part.inline_data) return `data:${part.inline_data.mime_type};base64,${part.inline_data.data}`;
  }
  throw new Error('Gemini returned no image data');
}

async function runAgent1(mapImageB64) {
  const system = `You analyze top-down pixel art cafeteria images and identify zones. Output ONLY raw valid JSON. No markdown, no explanation, no code blocks.`;
  const user = `Analyze this top-down pixel art cafeteria image (512×512 pixels). Identify pixel coordinates of each zone.
Output ONLY this JSON with real pixel values from the image:
{
  "layout_type": "rectangular",
  "capacity": 80,
  "zones": {
    "serving_line": {"x":10,"y":10,"width":490,"height":55},
    "seating_area":  {"x":10,"y":80,"width":490,"height":360},
    "kitchen":       {"x":380,"y":10,"width":120,"height":55},
    "waste_bins":    [{"x":440,"y":440},{"x":480,"y":440}],
    "entrance":      {"x":200,"y":470,"width":112,"height":30}
  },
  "table_count": 8,
  "serving_line_position": "north"
}`;
  const raw = await callAI(system, user, mapImageB64);
  const clean = raw.replace(/```json\n?|```\n?/g,'').trim();
  try {
    return JSON.parse(clean);
  } catch(e) {
    logEvent('⚠️ Agent 1 JSON parse failed — using default zones', 'warn');
    return {
      capacity:80, table_count:8,
      zones:{
        serving_line:{x:10,y:10,width:490,height:55},
        seating_area:{x:10,y:80,width:490,height:360},
        kitchen:{x:380,y:10,width:120,height:55},
        waste_bins:[{x:440,y:440},{x:480,y:440}],
        entrance:{x:200,y:470,width:112,height:30}
      }
    };
  }
}

async function runAgent2() {
  const histStr = HISTORY.slice(-12).map(h =>
    `${h.date}|${h.weather} ${h.temp}°C|${h.event}|${h.meal}|served:${h.served}|wasted:${h.wasted}kg`
  ).join('\n');
  const system = `You are a food waste prediction AI for a school cafeteria. Detect patterns from historical data and current conditions. Output ONLY raw valid JSON, no markdown, no explanation.`;
  const user = `Historical waste data (last 12 entries):
${histStr}

Today's conditions:
- Weather: ${weatherData.condition}, ${weatherData.temp}°C
- School event: ${calendarData.event}
- Cafeteria capacity: ${currentMapConfig?.capacity || 80} students
- Waste so far today: ${wasteToday.toFixed(2)}kg

Key patterns:
- Cold + pasta + exam week = highest waste (avg 14-16kg)
- Sports day = many absent = surplus regardless of meal
- Sunny warm + salad = near-zero waste
- Friday = end-of-week surplus spike

Output ONLY this JSON:
{
  "waste_risk": "high",
  "risk_pct": 73,
  "predicted_waste_kg": 12.4,
  "confidence": "87%",
  "main_cause": "Cold weather combined with exam week historically produces maximum pasta overstock",
  "at_risk_meals": ["pasta","hot soup"],
  "order_reduction": "Reduce pasta order by 35 portions (30%)",
  "co2_at_risk_kg": 37.2,
  "rescue_needed": true,
  "recommended_action": "Contact shelter now, reduce tomorrow order by 30%"
}`;
  const raw = await callAI(system, user);
  const clean = raw.replace(/```json\n?|```\n?/g,'').trim();
  return JSON.parse(clean);
}

async function runAgent3() {
  const system = `You write concise professional food rescue pickup request messages. Warm but practical tone. Maximum 110 words.`;
  const user = `Write a food rescue pickup request for:
From: Springfield High School Cafeteria, [Manager Name], Tel: [Phone Number]
To: City Food Bank

Situation:
- Predicted surplus: ${currentPrediction.predicted_waste_kg}kg of ${currentPrediction.at_risk_meals.join(' and ')}
- Risk level: ${currentPrediction.waste_risk.toUpperCase()} (${currentPrediction.risk_pct}% probability)
- CO₂ impact if wasted: ${currentPrediction.co2_at_risk_kg}kg
- Reason: ${currentPrediction.main_cause}

Include: what food, estimated kg, pickup time (tomorrow 2:00-2:30 PM after lunch service), contact placeholders. Max 110 words. Professional and warm.`;
  return await callAI(system, user);
}

async function handlePhotoUpload(e) {
  const file = e.target.files[0];
  if(!file) return;
  const reader = new FileReader();
  reader.onload = ev => {
    uploadedPhoto = ev.target.result;
    const img = document.getElementById('photo-preview');
    img.src = uploadedPhoto; img.style.display='block';
    document.getElementById('photo-hint').style.display='none';
    document.getElementById('btn-a1').disabled = false;
    logEvent(`📸 Photo uploaded: ${file.name}`, 'ok');
  };
  reader.readAsDataURL(file);
}

async function triggerAgent1() {
  document.getElementById('out-a1').textContent = '🎨 Generating pixel art via Gemini...';
  document.getElementById('btn-a1').disabled = true;
  logEvent('🎨 Agent 1 — calling Gemini for pixel art generation...', 'ok');
  try {
    generatedMapB64 = await generateCafeteriaImage(uploadedPhoto);
    logEvent('✅ Pixel art map generated!', 'ok');
    setBackground(generatedMapB64);
    document.getElementById('out-a1').textContent = '🧠 Claude analyzing zones...';
    logEvent('🧠 Claude analyzing spatial zones...', 'ok');
    currentMapConfig = await runAgent1(generatedMapB64);
    applyZones(currentMapConfig);
    document.getElementById('out-a1').textContent = JSON.stringify(currentMapConfig, null, 2);
    document.getElementById('btn-a2').disabled = false;
    logEvent(`✅ Map ready — ${currentMapConfig.table_count} tables, ${currentMapConfig.capacity} capacity`, 'ok');
  } catch(err) {
    document.getElementById('out-a1').textContent = `❌ ${err.message}`;
    logEvent(`❌ Agent 1 failed: ${err.message}`, 'err');
    document.getElementById('btn-a1').disabled = false;
  }
}

async function triggerAgent2() {
  document.getElementById('out-a2').textContent = '⚡ Analyzing patterns...';
  document.getElementById('btn-a2').disabled = true;
  logEvent('⚡ Agent 2 — predicting waste from 6-month history + live conditions...', 'ok');
  try {
    currentPrediction = await runAgent2();
    const riskColors = {low:'#2ecc71', medium:'#f39c12', high:'#e74c3c'};
    const el = document.getElementById('out-a2');
    el.textContent = JSON.stringify(currentPrediction, null, 2);
    el.style.color = riskColors[currentPrediction.waste_risk] || '#7ee787';
    if(currentPrediction.waste_risk==='high') onHighRisk();
    document.getElementById('btn-a3').disabled = !currentPrediction.rescue_needed;
    logEvent(`⚡ ${currentPrediction.waste_risk.toUpperCase()} risk — ${currentPrediction.predicted_waste_kg}kg predicted (${currentPrediction.confidence})`,
      currentPrediction.waste_risk==='high'?'warn':'ok');
    if(currentPrediction.rescue_needed) logEvent('🚨 Rescue needed — click Agent 3!','warn');
  } catch(err) {
    document.getElementById('out-a2').textContent = `❌ ${err.message}`;
    logEvent(`❌ Agent 2 failed: ${err.message}`, 'err');
    document.getElementById('btn-a2').disabled = false;
  }
}

async function triggerAgent3() {
  document.getElementById('out-a3').textContent = '🚛 Drafting rescue message...';
  document.getElementById('btn-a3').disabled = true;
  logEvent('🚛 Agent 3 — drafting shelter rescue request...', 'ok');
  try {
    currentDraft = await runAgent3();
    document.getElementById('out-a3').textContent = currentDraft;
    document.getElementById('btn-approve').style.display = 'block';
    document.getElementById('approve-note').style.display = 'block';
    logEvent('✅ Rescue draft ready — MANAGER APPROVAL REQUIRED', 'warn');
  } catch(err) {
    document.getElementById('out-a3').textContent = `❌ ${err.message}`;
    logEvent(`❌ Agent 3 failed: ${err.message}`, 'err');
    document.getElementById('btn-a3').disabled = false;
  }
}

function openApprovalModal() {
  document.getElementById('modal-draft').textContent = currentDraft;
  document.getElementById('modal-stats').innerHTML = `
    <b>📦 Food:</b> ${currentPrediction.at_risk_meals.join(', ')} — ${currentPrediction.predicted_waste_kg}kg<br>
    <b>🌍 CO₂ saved if rescued:</b> ${currentPrediction.co2_at_risk_kg}kg<br>
    <b>🍽️ Meals that will reach people:</b> ~${Math.round(currentPrediction.predicted_waste_kg*MEALS_PER_KG)}<br>
    <b>⚠️ Risk:</b> ${currentPrediction.waste_risk.toUpperCase()} (${currentPrediction.risk_pct}%)`;
  document.getElementById('modal').style.display = 'flex';
}

function confirmRescue() {
  const r = currentPrediction.predicted_waste_kg * 0.8;
  rescuedToday += r; mealsSaved += Math.round(r*MEALS_PER_KG);
  weekRescued += r; weekMeals += Math.round(r*MEALS_PER_KG);
  localStorage.setItem('ct_wr', weekRescued.toFixed(2));
  localStorage.setItem('ct_wm', weekMeals.toString());
  closeModal();
  updateWeeklyPanel();
  onRescueApproved();
  logEvent(`✅ RESCUE CONFIRMED — ${r.toFixed(1)}kg → City Food Bank`, 'ok');
  logEvent(`🌍 ${(r*CO2_PER_KG).toFixed(1)}kg CO₂ prevented`, 'ok');
}

function editRescue() {
  closeModal();
  const el = document.getElementById('out-a3');
  el.contentEditable='true'; el.style.border='1px solid #f39c12'; el.focus();
  logEvent('✏️ Draft opened for editing', 'ok');
}

function closeModal() { document.getElementById('modal').style.display='none'; }

function resetAll() {
  wasteToday=0; rescuedToday=0; mealsSaved=0;
  currentMapConfig=null; currentPrediction=null; currentDraft=null;
  generatedMapB64=null; backgroundImg=null;
  document.getElementById('out-a1').textContent='Upload a photo to begin...';
  document.getElementById('out-a2').textContent='Idle...';
  document.getElementById('out-a3').textContent='Idle...';
  document.getElementById('btn-a1').disabled=true;
  document.getElementById('btn-a2').disabled=false;
  document.getElementById('btn-a3').disabled=true;
  document.getElementById('btn-approve').style.display='none';
  document.getElementById('approve-note').style.display='none';
  resetZones();
  logEvent('🔄 System reset', 'ok');
}
```

---

## FILE 6: js/npc.js

```javascript
let ZONES = {
  serving:  {x:55,  y:90,  w:780, h:55},
  seating:  {x:55,  y:185, w:900, h:440},
  bins:     [{x:970,y:550},{x:970,y:610}],
  entrance: {x:400, y:700, w:200, h:40},
};

function applyZones(cfg) {
  const sx=CANVAS_W/512, sy=CANVAS_H/512;
  const z=cfg.zones;
  ZONES = {
    serving:  {x:z.serving_line.x*sx, y:z.serving_line.y*sy, w:z.serving_line.width*sx, h:z.serving_line.height*sy},
    seating:  {x:z.seating_area.x*sx, y:z.seating_area.y*sy, w:z.seating_area.width*sx, h:z.seating_area.height*sy},
    bins:     z.waste_bins.map(b=>({x:b.x*sx, y:b.y*sy})),
    entrance: {x:z.entrance.x*sx, y:z.entrance.y*sy, w:z.entrance.width*sx, h:z.entrance.height*sy},
  };
  if(manager){manager.x=ZONES.serving.x+80; manager.y=ZONES.serving.y+ZONES.serving.h/2;}
  logEvent('🗺️ NPC zones updated from Agent 1', 'ok');
}

function resetZones() {
  ZONES={serving:{x:55,y:90,w:780,h:55},seating:{x:55,y:185,w:900,h:440},
    bins:[{x:970,y:550},{x:970,y:610}],entrance:{x:400,y:700,w:200,h:40}};
}

const NPC_TYPES = [
  {color:'Default',label:'Regular',    waste_prob:0.15,speed_mult:1.0},
  {color:'Blue',   label:'Vegetarian', waste_prob:0.10,speed_mult:0.9},
  {color:'Green',  label:'Eco',        waste_prob:0.05,speed_mult:1.1},
  {color:'Red',    label:'Athlete',    waste_prob:0.20,speed_mult:1.4},
  {color:'Yellow', label:'Picky',      waste_prob:0.35,speed_mult:0.8},
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
    // walk: 128×96 → 4 cols × 3 rows → 32×32, use ROW 0 (srcY=0), 4 frames
    // idle:  64×96 → 2 cols × 3 rows → 32×32, use ROW 0 (srcY=0), 2 frames
    // hurt:  64×96 → 2 cols × 3 rows → 32×32, use ROW 0 (srcY=0), 2 frames
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
      logEvent(`🍽️ ${this.label} (${this.id}) abandoned food! +${WASTE_PER_EVENT}kg`,'warn');
      this.anim='hurt'; this.frame=0; this.hurtLeft=16;
    }
    this.state=s;
  }
  _rs(){return{x:ZONES.serving.x+Math.random()*ZONES.serving.w,y:ZONES.serving.y+ZONES.serving.h/2};}
  _rse(){const s=ZONES.seating;return{x:s.x+Math.random()*s.w,y:s.y+Math.random()*s.h};}
  _rb(){const b=ZONES.bins[Math.floor(Math.random()*ZONES.bins.length)];return{x:b.x,y:b.y};}
  _re(){return{x:ZONES.entrance.x+Math.random()*ZONES.entrance.w,y:CANVAS_H+35};}
  update(){
    this.hunger=Math.min(1,this.hunger+0.00007);
    if(this.waitLeft>0){this.waitLeft--;if(this.waitLeft===0&&this.waitCb){this.waitCb();this.waitCb=null;}return;}
    const dx=this.tx-this.x,dy=this.ty-this.y,dist=Math.sqrt(dx*dx+dy*dy),moving=dist>3;
    if(moving){this.x+=(dx/dist)*this.speed;this.y+=(dy/dist)*this.speed;}
    if(this.hurtLeft>0){this.hurtLeft--;if(this.hurtLeft===0)this.anim=moving?'walk':'idle';}
    else if(this.anim!=='hurt')this.anim=moving?'walk':'idle';
    this.fTick++;
    if(this.fTick>=this.fDelay){this.fTick=0;const max=this.anim==='walk'?4:2;this.frame=(this.frame+1)%max;}
    if(this.state==='EATING'){
      this.eatTimer++;this.hunger=Math.max(0,this.hunger-0.003);
      if(Math.random()<0.0008*(this.waste_prob/0.15)){
        this.setState('ABANDONING');const b=this._rb();this.setTarget(b.x,b.y);return;
      }
      if(this.eatTimer>=this.eatMax){this.setState('LEAVING');const e=this._re();this.setTarget(e.x,e.y);}
    }
    if(!moving)this._onArrived();
  }
  _onArrived(){
    switch(this.state){
      case 'SPAWNING':
        this.setState('ENTERING');const s=this._rs();this.setTarget(s.x,s.y);break;
      case 'ENTERING':
        this.setState('AT_COUNTER');
        this.waitLeft=30+Math.floor(Math.random()*60);
        this.waitCb=()=>{this.setState('FINDING_SEAT');const se=this._rse();this.setTarget(se.x,se.y);};break;
      case 'FINDING_SEAT':
        this.setState('EATING');this.eatTimer=0;break;
      case 'ABANDONING':
        this.setState('LEAVING');const e=this._re();this.setTarget(e.x,e.y);break;
      case 'LEAVING':
        this.setState('SPAWNING');
        const en=this._re();this.x=en.x;this.y=CANVAS_H+35;
        this.hunger=0.5+Math.random()*0.5;
        this.waitLeft=60+Math.floor(Math.random()*120);
        this.waitCb=()=>{const sv=this._rs();this.setTarget(sv.x,sv.y);this.setState('ENTERING');};break;
    }
  }
  draw(ctx){
    let img,totalFrames;
    if(this.anim==='hurt'){img=this.sHurt;totalFrames=2;}
    else if(this.anim==='walk'){img=this.sWalk;totalFrames=4;}
    else{img=this.sIdle;totalFrames=2;}
    const f=Math.min(this.frame,totalFrames-1);
    const srcX=f*NPC_FRAME_SIZE, srcY=0; // ALWAYS row 0 = facing south
    const dx=Math.round(this.x-NPC_RENDER_SIZE/2);
    const dy=Math.round(this.y-NPC_RENDER_SIZE/2);
    if(img.complete&&img.naturalWidth>0){
      ctx.drawImage(img,srcX,srcY,NPC_FRAME_SIZE,NPC_FRAME_SIZE,dx,dy,NPC_RENDER_SIZE,NPC_RENDER_SIZE);
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
    // Adam_run_16x16.png: 384×32 → 24 frames × 1 row → 16×16 each
    // Walk EAST (dir=1):  frames 12-15 → srcX = 192,208,224,240
    // Walk WEST (dir=-1): frames 8-11  → srcX = 128,144,160,176
    // Adam_idle_anim_16x16.png: use frames 0-3 looping
    // Adam_phone_16x16.png: 144×32 → 9 frames, all looping
    this.imgRun  =this._img('assets/limezu/Adam_run_16x16.png');
    this.imgIdle =this._img('assets/limezu/Adam_idle_anim_16x16.png');
    this.imgPhone=this._img('assets/limezu/Adam_phone_16x16.png');
    this.x=ZONES.serving.x+80; this.y=ZONES.serving.y+ZONES.serving.h/2;
    this.dir=1; this.mode='patrol'; this.frame=0; this.fTick=0; this.fDelay=10;
  }
  _img(src){const i=new Image();i.src=src;return i;}
  setMode(m){this.mode=m;this.frame=0;}
  update(){
    if(this.mode==='patrol'){
      this.x+=this.dir*0.7;
      if(this.x>ZONES.serving.x+ZONES.serving.w-40)this.dir=-1;
      if(this.x<ZONES.serving.x+40)this.dir=1;
    }
    this.fTick++;
    if(this.fTick>=this.fDelay){this.fTick=0;const max=this.mode==='phone'?9:4;this.frame=(this.frame+1)%max;}
  }
  draw(ctx){
    let img,srcX,srcY=0;
    if(this.mode==='phone'){img=this.imgPhone;srcX=this.frame*MGR_FRAME_SIZE;}
    else if(this.mode==='idle'){img=this.imgIdle;srcX=this.frame*MGR_FRAME_SIZE;}
    else{
      img=this.imgRun;
      const base=this.dir===1?12:8;
      srcX=(base+this.frame)*MGR_FRAME_SIZE;
    }
    const dx=Math.round(this.x-MGR_RENDER_SIZE/2);
    const dy=Math.round(this.y-MGR_RENDER_SIZE/2);
    if(img.complete&&img.naturalWidth>0){
      ctx.drawImage(img,srcX,srcY,MGR_FRAME_SIZE,MGR_FRAME_SIZE,dx,dy,MGR_RENDER_SIZE,MGR_RENDER_SIZE);
    }
    ctx.fillStyle='rgba(0,0,0,.7)';ctx.fillRect(this.x-24,dy-15,48,13);
    ctx.fillStyle='#f1c40f';ctx.font='bold 9px monospace';ctx.textAlign='center';
    ctx.fillText('👔 Manager',this.x,dy-4);ctx.textAlign='left';
  }
}

function onHighRisk(){
  let a=0.35;
  const flash=()=>{
    const cv=document.getElementById('gameCanvas');
    const c=cv.getContext('2d');
    c.fillStyle=`rgba(231,76,60,${a})`;c.fillRect(0,0,CANVAS_W,CANVAS_H);
    a-=0.015;if(a>0)requestAnimationFrame(flash);
  };
  requestAnimationFrame(flash);
}

function onRescueApproved(){
  if(manager){manager.setMode('phone');setTimeout(()=>manager.setMode('patrol'),5000);}
}
```

---

## FILE 7: js/simulation.js

```javascript
const canvas=document.getElementById('gameCanvas');
const ctx=canvas.getContext('2d');
canvas.width=CANVAS_W; canvas.height=CANVAS_H;

let students=[], manager=null, animId=null;

function setBackground(b64){
  const img=new Image();
  img.onload=()=>{backgroundImg=img;logEvent('🗺️ AI map applied to canvas','ok');};
  img.src=b64;
}

function drawBackground(){
  if(backgroundImg){
    ctx.drawImage(backgroundImg,0,0,CANVAS_W,CANVAS_H);
  } else {
    ctx.fillStyle='#0d1117';ctx.fillRect(0,0,CANVAS_W,CANVAS_H);
    const dots='.'.repeat((Math.floor(Date.now()/500)%4));
    ctx.fillStyle='rgba(255,68,68,.08)';ctx.fillRect(CANVAS_W/2-220,CANVAS_H/2-90,440,180);
    ctx.strokeStyle='#ff4444';ctx.lineWidth=1.5;ctx.strokeRect(CANVAS_W/2-220,CANVAS_H/2-90,440,180);
    ctx.fillStyle='#ff4444';ctx.font='bold 20px monospace';ctx.textAlign='center';
    ctx.fillText('🍽️ CANTEENTYCOON AI',CANVAS_W/2,CANVAS_H/2-45);
    ctx.fillStyle='#8b949e';ctx.font='14px sans-serif';
    ctx.fillText('Upload a cafeteria photo',CANVAS_W/2,CANVAS_H/2-10);
    ctx.fillText('→ AI generates your pixel art map'+dots,CANVAS_W/2,CANVAS_H/2+18);
    ctx.fillStyle='#2ecc71';ctx.font='12px monospace';
    ctx.fillText('Agent 2 available now — click to predict waste without a photo',CANVAS_W/2,CANVAS_H/2+58);
    ctx.textAlign='left';
  }
}

function drawZoneOverlays(){
  ctx.globalAlpha=0.2;
  ctx.fillStyle='#f39c12';ctx.fillRect(ZONES.serving.x,ZONES.serving.y,ZONES.serving.w,ZONES.serving.h);
  ctx.fillStyle='#3498db';ctx.fillRect(ZONES.seating.x,ZONES.seating.y,ZONES.seating.w,ZONES.seating.h);
  ctx.fillStyle='#e74c3c';
  for(const b of ZONES.bins){ctx.beginPath();ctx.arc(b.x,b.y,22,0,Math.PI*2);ctx.fill();}
  ctx.fillStyle='#2ecc71';ctx.fillRect(ZONES.entrance.x,ZONES.entrance.y,ZONES.entrance.w,ZONES.entrance.h);
  ctx.globalAlpha=1;
  ctx.fillStyle='rgba(255,255,255,0.8)';ctx.font='11px monospace';
  ctx.fillText('SERVING',ZONES.serving.x+6,ZONES.serving.y+14);
  ctx.fillText('SEATING',ZONES.seating.x+6,ZONES.seating.y+16);
  ctx.fillText('ENTRANCE',ZONES.entrance.x+4,ZONES.entrance.y+14);
}

function gameLoop(){
  simTick++;
  drawBackground();
  if(showZones)drawZoneOverlays();
  if(manager){manager.update();manager.draw(ctx);}
  for(const npc of students){npc.update();npc.draw(ctx);}
  if(simTick%30===0)updateStatsPanel();
  animId=requestAnimationFrame(gameLoop);
}

function spawnAll(){
  students=[];
  for(let i=0;i<10;i++){
    const def=NPC_TYPES[i%NPC_TYPES.length];
    const npc=new StudentNPC(i,def);
    setTimeout(()=>{npc.setState('ENTERING');const s=npc._rs();npc.setTarget(s.x,s.y);},i*700+Math.random()*300);
    students.push(npc);
  }
  manager=new ManagerNPC();
  logEvent(`✅ Spawned ${students.length} student NPCs + manager`,'ok');
}
```

---

## FILE 8: js/ui.js

```javascript
let logEntries=0;

function logEvent(msg,cls=''){
  const el=document.getElementById('event-log');
  const d=document.createElement('div');
  d.className=cls;d.textContent=`[T+${simTick}] ${msg}`;
  el.insertBefore(d,el.firstChild);
  if(++logEntries>80)el.removeChild(el.lastChild);
}

function updateStatsPanel(){
  if(!students.length)return;
  const avgH=students.reduce((s,n)=>s+n.hunger,0)/students.length;
  document.getElementById('s-students').textContent=students.length;
  document.getElementById('s-hunger').textContent=Math.round(avgH*100)+'%';
  document.getElementById('s-waste').textContent=wasteToday.toFixed(2)+' kg';
  document.getElementById('s-rescued').textContent=rescuedToday.toFixed(2)+' kg';
  document.getElementById('s-meals').textContent=mealsSaved;
  document.getElementById('s-tick').textContent=simTick;
  document.getElementById('s-calendar').textContent=calendarData.event;
  document.getElementById('co2-now').textContent=(wasteToday*CO2_PER_KG).toFixed(2);
  document.getElementById('co2-saved').textContent=(weekRescued*CO2_PER_KG).toFixed(2);
}

function updateWeeklyPanel(){
  document.getElementById('w-rescued').textContent=weekRescued.toFixed(2)+' kg';
  document.getElementById('w-co2').textContent=(weekRescued*CO2_PER_KG).toFixed(2)+' kg';
  document.getElementById('w-meals').textContent=weekMeals;
  const trees=(weekRescued*CO2_PER_KG/21).toFixed(1);
  const km=Math.round(weekRescued*CO2_PER_KG/0.21);
  document.getElementById('w-equiv').textContent=`≈ ${trees} trees planted / ${km}km of driving avoided`;
}

window.addEventListener('load',async()=>{
  logEvent('🚀 CanteenTycoon AI v1.0 initialized','ok');
  spawnAll();
  gameLoop();
  await fetchWeather();
  calendarData=getCalendar();
  document.getElementById('s-calendar').textContent=calendarData.event;
  updateWeeklyPanel();
  document.getElementById('btn-a2').disabled=false;
  logEvent('💡 Agent 2 ready — predict waste now, or upload photo first','ok');
  logEvent('💡 Upload cafeteria photo → Agent 1 → personalized AI map','ok');
});
```

---

## ASSET PATH REFERENCE (user copies manually)

```
assets/snoblin/Default/walk.png   (128×96)
assets/snoblin/Default/idle.png   (64×96)
assets/snoblin/Default/hurt.png   (64×96)
assets/snoblin/Blue/walk.png
assets/snoblin/Blue/idle.png
assets/snoblin/Blue/hurt.png
assets/snoblin/Green/walk.png
assets/snoblin/Green/idle.png
assets/snoblin/Green/hurt.png
assets/snoblin/Red/walk.png
assets/snoblin/Red/idle.png
assets/snoblin/Red/hurt.png
assets/snoblin/Yellow/walk.png
assets/snoblin/Yellow/idle.png
assets/snoblin/Yellow/hurt.png
assets/limezu/Adam_run_16x16.png
assets/limezu/Adam_idle_anim_16x16.png
assets/limezu/Adam_phone_16x16.png
```

---

## LOCAL MODE SETUP (add to README)

```
Install Ollama from https://ollama.com

Mac/Linux: OLLAMA_ORIGINS=* ollama serve
Windows:   $env:OLLAMA_ORIGINS="*"; ollama serve

Pull models:
  ollama pull phi3.5
  ollama pull llama3.2-vision

Toggle LOCAL button in app navbar.
```

---

## BUILD VERIFICATION CHECKLIST

After building, verify in browser console:
1. Open index.html — dark canvas with NPCs walking = ✅
2. Click Agent 2 — sidebar shows colored JSON prediction = ✅
3. Check event log — weather loaded, calendar detected = ✅
4. Upload any top-down image — Agent 1 → background changes = ✅
5. After Agent 2 HIGH risk — red flash on canvas = ✅
6. After Agent 3 — approve button appears = ✅
7. Approval modal shows 3 buttons = ✅
8. After approve — manager pulls out phone for 5 seconds = ✅
