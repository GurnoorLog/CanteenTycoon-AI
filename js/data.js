const HISTORY = [];

let DATASET_LOADED = false;

async function loadHistoricalData() {
  try {
    const res = await fetch('data/food_waste.json');
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const raw = await res.json();
    DATASET_HISTORY = raw.map(r => ({
      date: r.date,
      meal: r.meal,
      section: r.section,
      category: r.category,
      waste_kg: r.waste_kg,
      price_kg: r.price_kg,
      cost_loss: r.cost_loss,
    }));
    DATASET_LOADED = true;
    terminalLog(`DATASET: Loaded ${DATASET_HISTORY.length} real records from university canteen (${raw[0]?.date} to ${raw[raw.length-1]?.date})`, 'ok');
    terminalLog(`DATASET: ${raw.reduce((s,r)=>s+r.waste_kg,0).toFixed(0)}kg total waste | ${raw.length} days`, 'ok');
  } catch(e) {
    terminalLog(`DATASET: Failed to load — ${e.message}. NIM will use config-only predictions.`, 'warn');
    DATASET_HISTORY = [];
  }
}

let userLat = 45.13;
let userLon = 10.02;

function weatherCodeToCondition(code, tempMax) {
  if(code >= 95) return {condition:'Thunderstorm', icon:'⛈️'};
  if(code >= 80) return {condition:'Rain Showers', icon:'🌦️'};
  if(code >= 71) return {condition:'Snow', icon:'❄️'};
  if(code >= 61) return {condition:'Rain', icon:'🌧️'};
  if(code >= 51) return {condition:'Drizzle', icon:'🌦️'};
  if(code >= 45) return {condition:'Fog', icon:'🌫️'};
  if(code >= 20) return {condition:'Cloudy', icon:'☁️'};
  if(code >= 10) return {condition:'Partly Cloudy', icon:'⛅'};
  if(code >= 3)  return {condition:'Cloudy', icon:'☁️'};
  if(code >= 2)  return {condition:'Partly Cloudy', icon:'⛅'};
  if(code >= 1)  return {condition:'Mainly Clear', icon:'🌤️'};
  if(tempMax < 5) return {condition:'Freezing', icon:'🥶'};
  return {condition:'Clear', icon:'☀️'};
}

function fetchWithTimeout(url, ms=12000) {
  const ctrl = new AbortController();
  const id = setTimeout(() => ctrl.abort(), ms);
  return fetch(url, {signal: ctrl.signal}).finally(() => clearTimeout(id));
}

async function fetchWeather() {
  let lat = userLat, lon = userLon, locName = 'auto-detected';
  try {
    const wizardLoc = setupConfig?.location;
    if(wizardLoc && wizardLoc !== 'Unknown' && wizardLoc !== '') {
      locName = wizardLoc;
      try {
        const geoUrl = `https://geocoding-api.open-meteo.com/v1/search?name=${encodeURIComponent(wizardLoc)}&count=1&language=en&format=json`;
        const geoRes = await fetchWithTimeout(geoUrl);
        if(geoRes.ok) {
          const geo = await geoRes.json();
          if(geo.results && geo.results.length > 0) {
            lat = geo.results[0].latitude;
            lon = geo.results[0].longitude;
            terminalLog(`WEATHER: Geocoded "${wizardLoc}" → ${lat.toFixed(2)}, ${lon.toFixed(2)}`, 'ok');
          }
        }
      } catch(_) { terminalLog('WEATHER: Geocoding timed out — using default coords', 'warn'); }
    }
    if (!wizardLoc || wizardLoc === 'Unknown' || wizardLoc === '') {
      if('geolocation' in navigator) {
        try {
          const pos = await new Promise((res, rej) =>
            navigator.geolocation.getCurrentPosition(res, rej, {timeout:5000})
          );
          lat = pos.coords.latitude;
          lon = pos.coords.longitude;
        } catch(_) {}
      }
    }
    userLat = lat; userLon = lon;

    const url = `${WEATHER_URL}?latitude=${lat}&longitude=${lon}&daily=temperature_2m_max,temperature_2m_min,weathercode,precipitation_sum,windspeed_10m_max&timezone=auto&forecast_days=7`;
    const res = await fetchWithTimeout(url, 15000);
    const d = await res.json();

    weatherForecast = [];
    for(let i = 0; i < d.daily.time.length; i++) {
      const dt = new Date(d.daily.time[i] + 'T12:00:00');
      const dayName = dt.toLocaleDateString('en-US', {weekday:'short'});
      const code = d.daily.weathercode[i];
      const tMax = Math.round(d.daily.temperature_2m_max[i]);
      const tMin = Math.round(d.daily.temperature_2m_min[i]);
      const precip = d.daily.precipitation_sum[i] || 0;
      const wind = Math.round(d.daily.windspeed_10m_max[i] || 0);
      const {condition, icon} = weatherCodeToCondition(code, tMax);
      weatherForecast.push({date: d.daily.time[i], dayName, condition, icon, tempMax: tMax, tempMin: tMin, precip, wind, code});

      if(i === 0) {
        weatherData = {condition, temp: tMax, tempMin: tMin, icon, wind, rain: precip.toFixed(1), code, location: locName};
      }
    }

    terminalLog(`WEATHER_SENSOR: ${weatherData.icon} Today ${weatherData.temp}°C | ${weatherData.condition} | Location: ${locName}`, 'ok');
    terminalLog(`WEATHER_SENSOR: 7-day forecast loaded — ${weatherForecast[0]?.dayName}→${weatherForecast[6]?.dayName}`, 'ok');
    updateWeatherWindow();
  } catch(e) {
    terminalLog(`WEATHER_SENSOR: offline — ${e.message}. NIM will note data gap`, 'warn');
    weatherData = {condition:'Unknown', temp:null, icon:'❓', wind:0, rain:0, code:0, location: setupConfig?.location || 'unknown'};
    weatherForecast = [];
    try { updateWeatherWindow(); } catch(_) {}
  }
}

function getCalendar(forDate) {
  const ref = forDate instanceof Date ? forDate : new Date();

  // 1. Wizard-configured event takes highest priority
  const wizardEvent = setupConfig?.calendarEvent;
  if (wizardEvent && wizardEvent !== 'normal') {
    return { event: wizardEvent, type: wizardEvent };
  }

  // 2. Check localStorage calendar events for the target date
  try {
    const events = JSON.parse(localStorage.getItem('ct_calendar_events') || '[]');
    const dateKey = dateToIso(ref);
    const dayEvents = events.filter(e => e.date === dateKey);

    const allTitles = dayEvents.map(e => e.title.toLowerCase()).join(' ');
    if (allTitles.includes('holiday') || allTitles.includes('closed')) {
      return { event: 'Holiday', type: 'holiday' };
    }
    if (allTitles.includes('exam') || allTitles.includes('test') || allTitles.includes('final')) {
      return { event: 'Exam Week', type: 'exam_week' };
    }
    if (allTitles.includes('sports') || allTitles.includes('game') || allTitles.includes('tournament') || allTitles.includes('match')) {
      return { event: 'Sports Event', type: 'sports' };
    }
    if (dayEvents.length > 0) {
      return { event: dayEvents[0].title, type: 'event' };
    }
  } catch(e) { /* localStorage unavailable */ }

  // 3. Day-of-week heuristics as fallback
  const d = ref.getDay();
  if (d === 5) return { event: 'Friday', type: 'friday' };
  if (d === 1) return { event: 'Monday', type: 'monday' };

  // 4. Default
  return { event: 'Normal day', type: 'normal' };
}

function dateToIso(d) {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

function parseForecastTargetDate(msg) {
  const now = new Date();
  now.setHours(12, 0, 0, 0);
  const msgL = (msg || '').toLowerCase();

  if (msgL.includes('tomorrow')) {
    const d = new Date(now);
    d.setDate(d.getDate() + 1);
    return d;
  }
  if (msgL.includes('today')) return new Date(now);

  const days = ['sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday'];
  const dayAliases = {
    'sun':0,'mon':1,'tue':2,'wed':3,'thu':4,'fri':5,'sat':6,
    'moday':1,'monday':1,'tuseday':2,'thusday':4,'thrusday':4,
    'wendnesday':3,'wensday':3,'saterday':6,
  };
  for (const [alias, dayIdx] of Object.entries(dayAliases)) {
    if (msgL.includes(alias)) {
      const current = now.getDay();
      let diff = dayIdx - current;
      if (diff < 0) diff += 7;
      if (diff === 0 && !msgL.includes('next ' + alias)) diff = 0;
      const d = new Date(now);
      d.setDate(d.getDate() + diff);
      return d;
    }
  }
  for (let i = 0; i < days.length; i++) {
    if (msgL.includes(days[i])) {
      const target = i;
      const current = now.getDay();
      let diff = target - current;
      if (diff < 0) diff += 7;
      if (diff === 0 && !msgL.includes('next ' + days[i])) diff = 0;
      const d = new Date(now);
      d.setDate(d.getDate() + diff);
      return d;
    }
  }
  return new Date(now);
}

function getForecastForDate(date) {
  if (!weatherForecast || weatherForecast.length === 0) return null;
  const iso = dateToIso(date);
  const found = weatherForecast.find(f => f.date === iso);
  if (found) return found;
  const today = new Date();
  today.setHours(12, 0, 0, 0);
  const diffDays = Math.round((date - today) / 86400000);
  if (diffDays >= 0 && diffDays < weatherForecast.length) return weatherForecast[diffDays];
  return weatherForecast[0];
}

async function fetchWebContext(query, reason='scheduled') {
  if(nimWebFetchCount >= WEB_FETCH_LIMIT) {
    terminalLog(`WEB_SEARCH: Daily limit reached (${WEB_FETCH_LIMIT}/day). Using cached context.`, 'warn');
    return nimWebCache;
  }

  if(nimWebCache && nimWebLastFetch && reason !== 'user_request') {
    const hoursSince = (Date.now() - nimWebLastFetch) / 3600000;
    if(hoursSince < 4) {
      terminalLog(`WEB_SEARCH: Using cached data (${hoursSince.toFixed(1)}h old)`, 'ok');
      return nimWebCache;
    }
  }

  try {
    terminalLog(`WEB_SEARCH [${nimWebFetchCount+1}/${WEB_FETCH_LIMIT}]: Searching "${query}" (reason: ${reason})`, 'run');
    const url = `/proxy/ddg?format=json&no_html=1&skip_disambig=1&q=${encodeURIComponent(query)}`;
    const res = await fetch(url);
    if(!res.ok) throw new Error(`DDG ${res.status}`);
    const d = await res.json();

    const abstract = d.AbstractText || '';
    const relatedTopics = (d.RelatedTopics || [])
      .slice(0,5)
      .map(t => t.Text || '')
      .filter(t => t.length > 10)
      .join(' | ');

    const context = abstract
      ? `${abstract}. Related: ${relatedTopics}`
      : relatedTopics || 'No specific data found for this query.';

    nimWebCache = {query, context, fetchedAt: new Date().toISOString()};
    nimWebFetchCount++;
    nimWebLastFetch = Date.now();

    const counter = document.getElementById('web-count');
    if(counter) counter.textContent = `${nimWebFetchCount}/${WEB_FETCH_LIMIT}`;

    terminalLog(`WEB_SEARCH: Got context (${context.length} chars) — fetches remaining today: ${WEB_FETCH_LIMIT - nimWebFetchCount}`, 'ok');
    updateAILogsWindow('WEB_SEARCH', `"${query}" — ${context.substring(0,80)}...`, 'DATA_LOADED');
    return nimWebCache;

  } catch(e) {
    terminalLog(`WEB_SEARCH: Failed — ${e.message}`, 'err');
    return nimWebCache;
  }
}

const ML_API_URL = '/proxy/ml';

function mapMenuToCategory(menuItem) {
  const exact = (menuItem || '').trim();
  if (['Meat','Vegetables','Rice','Soup'].includes(exact)) return exact;
  const item = exact.toLowerCase();
  if (item.includes('meat') || item.includes('chicken') || item.includes('fish') || item.includes('beef') || item.includes('steak') || item.includes('nugget') || item.includes('curry') || item.includes('burger')) return 'Meat';
  if (item.includes('soup') || item.includes('broth') || item.includes('stew')) return 'Soup';
  if (item.includes('pasta') || item.includes('rice') || item.includes('noodle') || item.includes('pizza') || item.includes('carb')) return 'Rice';
  return 'Vegetables';
}

async function callLocalML(meal, section, category, dateStr) {
  try {
    const ctrl = new AbortController();
    const timeout = setTimeout(() => ctrl.abort(), 20000);
    const body = JSON.stringify({Date: dateStr, Meal: meal, Canteen_Section: section, Food_Category: category});
    const res = await fetch(ML_API_URL, {method:'POST', headers:{'Content-Type':'application/json'}, body, signal: ctrl.signal});
    clearTimeout(timeout);
    if(!res.ok) throw new Error(`ML API ${res.status}`);
    const d = await res.json();
    if(d.error) throw new Error(d.error);
    terminalLog(`ML_MODEL: Predicted ${d.predicted_waste_kg.toFixed(2)}kg for ${meal}/${section}/${category}`, 'ok');
    return d.predicted_waste_kg;
  } catch(e) {
    if(e.name === 'AbortError') terminalLog(`ML_MODEL: API timeout (20s) for ${meal}/${section}/${category}`, 'warn');
    else terminalLog(`ML_MODEL: Unavailable for ${meal}/${section}/${category} — ${e.message}`, 'warn');
    return null;
  }
}

async function refreshMLPrediction(forDate) {
  const ref = forDate instanceof Date ? forDate : new Date();
  const today = dateToIso(ref);
  const dayShort = ref.toLocaleDateString('en-US',{weekday:'short'}).toLowerCase();
  const todayMenu = setupConfig?.weeklyMenu?.[dayShort] || 'Rice';
  const category = mapMenuToCategory(todayMenu);
  
  terminalLog(`ML_MODEL: Querying predictions for Category: ${category} (Menu: "${todayMenu}") across all sections...`, 'run');
  
  const sections = ['A', 'B', 'C', 'D'];
  try {
    const promises = sections.map(sec => callLocalML('Lunch', sec, category, today));
    const results = await Promise.all(promises);
    
    let total = 0;
    let success = false;
    const breakdown = {};
    
    sections.forEach((sec, idx) => {
      const val = results[idx];
      if (val !== null) {
        total += val;
        breakdown[sec] = val;
        success = true;
      }
    });
    
    if (success) {
      lastMLPrediction = {
        total: total,
        category: category,
        breakdown: breakdown
      };
      terminalLog(`ML_MODEL: Total Canteen Prediction = ${total.toFixed(2)}kg for ${category} ✓`, 'ok');
    } else {
      lastMLPrediction = null;
      terminalLog('ML_MODEL: All predictions failed or returned null', 'warn');
    }
  } catch(e) {
    lastMLPrediction = null;
    terminalLog(`ML_MODEL: Batch prediction error — ${e.message}`, 'warn');
  }
}

async function requestNotificationPermission() {
  if(!('Notification' in window)) {
    terminalLog('NOTIFY: Browser does not support notifications', 'warn');
    return false;
  }
  if(Notification.permission === 'granted') {
    nimPushGranted = true;
    return true;
  }
  if(Notification.permission !== 'denied') {
    const perm = await Notification.requestPermission();
    nimPushGranted = perm === 'granted';
    terminalLog(`NOTIFY: Permission ${nimPushGranted ? 'GRANTED ✓' : 'DENIED'}`, nimPushGranted?'ok':'warn');
    return nimPushGranted;
  }
  return false;
}

function sendNotification(title, body, urgency='normal') {
  const icon = urgency==='high' ? '🚨' : urgency==='medium' ? '⚠️' : 'ℹ️';
  terminalLog(`NOTIFY: ${icon} ${title} — ${body}`, urgency==='high'?'warn':'ok');
  appendChatMessage('assistant', `${icon} **${title}**\n${body}`);

  if(nimPushGranted && Notification.permission === 'granted') {
    try {
      new Notification(`CanteenTycoon: ${title}`, {
        body,
        icon: 'assets/icon.png',
        badge: 'assets/icon.png',
        tag: `ct-${urgency}-${Date.now()}`,
        requireInteraction: urgency === 'high'
      });
    } catch(e) {
      terminalLog(`NOTIFY: Push failed — ${e.message}`, 'err');
    }
  }
}
