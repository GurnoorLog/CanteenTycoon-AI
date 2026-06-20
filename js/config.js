const cleanKey = (k) => {
  if (!k || k.includes('YOUR_') || k.includes('KEY_HERE')) return '';
  return k.trim();
};

let CLAUDE_API_KEY = cleanKey(localStorage.getItem('ct_claude_key') || '');
let GEMINI_API_KEY = cleanKey(localStorage.getItem('ct_gemini_key') || '');

// Claude 3.5 Sonnet is the primary model for all AI tasks
const CLAUDE_MODEL     = 'claude-sonnet-4-5';
const GEMINI_IMG_MODEL = 'gemini-2.5-flash-image';
const GEMINI_VIS_MODEL = 'gemini-1.5-flash';

const CLAUDE_URL  = '/proxy/claude';
const GEMINI_URL  = `/proxy/gemini/v1beta/models/${GEMINI_IMG_MODEL}:generateContent`;
const GEMINI_VIS_URL = `/proxy/gemini/v1beta/models/${GEMINI_VIS_MODEL}:generateContent`;
const OLLAMA_URL  = 'http://localhost:11434/api/generate';
const WEATHER_URL = 'https://api.open-meteo.com/v1/forecast';

(function __applyEnv() {
  const check = setInterval(() => {
    const e = window.__ENV;
    if (!e) return;
    clearInterval(check);
    if (!CLAUDE_API_KEY) CLAUDE_API_KEY = cleanKey(e.CLAUDE_API_KEY) || '';
    if (!GEMINI_API_KEY) GEMINI_API_KEY = cleanKey(e.GEMINI_API_KEY) || '';
    if (!localStorage.getItem('ct_google_client_id')) {
      const g = cleanKey(e.GOOGLE_CLIENT_ID) || '';
      if (g) localStorage.setItem('ct_google_client_id', g);
    }
  }, 100);
})();

const CANVAS_W        = 1100;
const CANVAS_H        = 650;
const NPC_FRAME_SIZE  = 32;
const NPC_RENDER_SIZE = 48;
const MGR_FRAME_SIZE  = 16;
const MGR_RENDER_SIZE = 48;
const NPC_SPEED       = 1.2;
const WASTE_PER_EVENT = 0.3;
const CO2_PER_KG      = 3.0;
const MEALS_PER_KG    = 3.33;

let currentMode = 'cloud';

let uploadedPhotoB64  = null;
let generatedMapB64   = null;
let currentMapConfig  = null;
let currentPrediction = null;
let currentDraft      = null;

let wasteToday    = 0;
let rescuedToday  = 0;
let mealsSaved    = 0;
let simTick       = 0;
let weekRescued   = parseFloat(localStorage.getItem('ct_wr') || '0');
let weekMeals     = parseInt(localStorage.getItem('ct_wm') || '0');
let weatherData   = { condition:'Sunny', temp:18, icon:'☀️' };
let weatherForecast = [];
let backgroundImg = null;
let showZones     = false;

// Legacy NIM state kept as stubs so old references don't crash
let nimLoopInterval  = null;
let nimLoopCycle     = 0;
let nimWebCache      = null;
let nimWebFetchCount = 0;
let nimWebLastFetch  = null;
let nimPushGranted   = false;
let nimObservations = [];
let dailySummaryText = '';
let DATASET_HISTORY  = [];
let lastMLPrediction = null;

const DDG_URL = 'https://api.duckduckgo.com/?format=json&no_html=1&skip_disambig=1&q=';
const WEB_FETCH_LIMIT = 3;
