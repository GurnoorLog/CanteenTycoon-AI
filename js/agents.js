// ══════════════════════════════════════════════════════════════════════════
// CLAUDE 3.5 SONNET — Primary AI Engine (all text/chat/routing tasks)
// Gemini — Vision fallback (map generation only)
// ══════════════════════════════════════════════════════════════════════════

async function callVisionAI(system, user, imageB64) {
  if(currentMode === 'local') return callOllama(system, user, imageB64, 'llama3.2-vision');
  return callClaude(system, user, imageB64);
}

async function callTextAI(system, user, maxTokens=1000) {
  if (currentMode === 'local') return callOllama(system, user, null, 'phi3.5');
  return callClaude(system, user, null);
}

async function callOllama(system, user, imageB64=null, model='phi3.5') {
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
  if(!res.ok) throw new Error(`Ollama ${res.status}`);
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
    body: JSON.stringify({model:CLAUDE_MODEL, max_tokens:1000, system, messages:[{role:'user',content}]})
  });
  if(!res.ok){const e=await res.json();throw new Error(`Claude: ${e.error?.message}`);}
  return (await res.json()).content[0].text;
}

// ── Claude Intent Router (JSON schema output) ────────────────────────────
// Returns: { intent, confidence, params, chat_reply }
async function callClaudeIntent(userMessage, contextData) {
  const now = new Date();
  const dateStr = now.toLocaleDateString('en-US', { weekday:'long', year:'numeric', month:'long', day:'numeric' });
  const tomorrow = new Date(now); tomorrow.setDate(tomorrow.getDate()+1);
  const tomorrowDate = tomorrow.toLocaleDateString('en-US', { weekday:'long', month:'long', day:'numeric' });
  const todayFc = weatherForecast.length > 0 ? `Today's forecast: High ${weatherForecast[0].tempMax}°C, Low ${weatherForecast[0].tempMin}°C, ${weatherForecast[0].condition}` : '';
  const tomorrowFc = weatherForecast.length > 1 ? `Tomorrow's forecast: High ${weatherForecast[1].tempMax}°C, Low ${weatherForecast[1].tempMin}°C, ${weatherForecast[1].condition}` : '';
  const system = `You are CMD_CORE, the AI router for CanteenTycoon — a school cafeteria food-waste reduction system.
You receive a user message and classify it into one of these intents, returning ONLY valid JSON.

Today is ${dateStr}. Tomorrow is ${tomorrowDate}.
${todayFc}
${tomorrowFc}

Context:
- Canteen: ${contextData.canteenName || 'Unknown'}
- Location: ${contextData.location || 'Unknown'}
- Today's weather: ${contextData.weather || 'Unknown'}
- Calendar event: ${contextData.event || 'Normal day'}
- Current waste today: ${contextData.wasteToday || 0}kg
- Canteen is currently: ${openOrClosed()}

Intent classification rules:
- FORECAST: user asks to predict waste for a specific day (today, tomorrow, monday, etc.), forecast outlook, run prediction model
- CHAT: general questions, create menus, write reports, make PDFs, advice, greetings — anything requiring a full assistant response
- SIMULATION_CONTROL: user wants to pause/play/speed up simulation
- DATA_QUERY: user wants to see specific data, logs, or stats

Respond ONLY with this JSON (no other text). Do NOT write chat replies — classification only:
{
  "intent": "FORECAST" | "CHAT" | "SIMULATION_CONTROL" | "DATA_QUERY",
  "confidence": 0.0-1.0,
  "params": { "target_day": "monday|tuesday|...|tomorrow|today|null" }
}`;

  try {
    const res = await fetch(CLAUDE_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': CLAUDE_API_KEY,
        'anthropic-version': '2023-06-01'
      },
      body: JSON.stringify({
        model: CLAUDE_MODEL,
        max_tokens: 400,
        system,
        messages: [{ role: 'user', content: userMessage }]
      })
    });
    if (!res.ok) {
      const e = await res.json().catch(() => ({}));
      throw new Error(`Claude Intent: ${e.error?.message || res.statusText}`);
    }
    const data = await res.json();
    const raw = data.content[0].text.trim();
    // Strip markdown code fences if present
    const jsonStr = raw.replace(/^```json?\s*/i, '').replace(/\s*```$/i, '').trim();
    return JSON.parse(jsonStr);
  } catch(e) {
    terminalLog(`INTENT_ROUTER: ${e.message} — defaulting to CHAT`, 'warn');
    return { intent: 'CHAT', confidence: 0.5, params: {}, chat_reply: null };
  }
}

// ── Claude Wizard (onboarding chat) ──────────────────────────────────────
// Returns { reply, extractedConfig, isComplete }
async function callClaudeWizard(history, currentConfig) {
  if (!CLAUDE_API_KEY) {
    return {
      reply: "⚠️ No Claude API key found. On Render, configure CLAUDE_API_KEY in environment variables. For local dev, paste your key in Settings.",
      extractedConfig: currentConfig,
      isComplete: false
    };
  }
  const system = `You are SETUP_CORE, a friendly and professional AI setup wizard for CanteenTycoon — a school cafeteria food-waste reduction platform.
Your job is to gather configuration details through natural conversation, then confirm everything.

Fields you need to collect (gather naturally, not all at once):
1. canteenName — the name of the cafeteria or canteen
2. location — city/country for weather data
3. avgStudents — average daily student count (number)
4. staffCount — number of kitchen/serving staff
5. managerName — the manager's name
6. managerContact — phone or email
7. shelterName — the local food shelter to donate surplus to
8. openTime — opening time (e.g. 07:00)
9. closeTime — closing time (e.g. 15:00)
10. weeklyMenu — what's on the menu each day (Mon-Sat): pasta, salad, pizza, soup, sandwich, special, or closed
11. efficiencyGoal — target waste reduction goal (80%, 90%, or 99%)
12. calendarEvent — any special event today: normal, exam_week, sports, holiday

Guidelines:
- Be warm, concise, and encouraging
- Ask 1-3 fields at a time, not all at once
- After you think you have enough info, say you're ready to finalize
- When ALL required fields are collected, end your reply with exactly this tag: [WIZARD_COMPLETE]
- Along with [WIZARD_COMPLETE], include a JSON block like this on its own line:
[CONFIG_JSON]{"canteenName":"...","location":"...","avgStudents":500,"staffCount":10,"managerName":"...","managerContact":"...","shelterName":"...","openTime":"07:00","closeTime":"15:00","weeklyMenu":{"mon":"Rice","tue":"Meat","wed":"Vegetables","thu":"Soup","fri":"Rice","sat":"closed"},"efficiencyGoal":"80% - Balanced Growth","calendarEvent":"normal"}

Currently collected config: ${JSON.stringify(currentConfig)}

Start by greeting the user warmly and asking the first few questions.`;

  try {
    const formattedHistory = history.map(h => ({ role: h.role, content: h.content }));
    const res = await fetch(CLAUDE_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': CLAUDE_API_KEY,
        'anthropic-version': '2023-06-01'
      },
      body: JSON.stringify({
        model: CLAUDE_MODEL,
        max_tokens: 600,
        system,
        messages: formattedHistory
      })
    });
    if (!res.ok) {
      const e = await res.json().catch(() => ({}));
      throw new Error(`Claude Wizard: ${e.error?.message || res.statusText}`);
    }
    const data = await res.json();
    const raw = data.content[0].text;
    const isComplete = raw.includes('[WIZARD_COMPLETE]');
    let extractedConfig = { ...currentConfig };
    if (isComplete) {
      const match = raw.match(/\[CONFIG_JSON\](\{[\s\S]+?\})/);
      if (match) {
        try { extractedConfig = JSON.parse(match[1]); } catch(_) {}
      }
    }
    // Clean up the reply for display
    const cleanReply = raw
      .replace('[WIZARD_COMPLETE]', '')
      .replace(/\[CONFIG_JSON\]\{[\s\S]+?\}/, '')
      .trim();
    return { reply: cleanReply, extractedConfig, isComplete };
  } catch(e) {
    terminalLog(`WIZARD_ERROR: ${e.message}`, 'err');
    return {
      reply: `⚠️ Connection issue: ${e.message}. Please try again or use the classic form.`,
      extractedConfig: currentConfig,
      isComplete: false
    };
  }
}

async function callGeminiVision(system, user, imageB64=null) {
  const parts = [];
  if(imageB64) {
    const data = imageB64.replace(/^data:image\/\w+;base64,/,'');
    const mt = imageB64.startsWith('data:image/png') ? 'image/png' : 'image/jpeg';
    parts.push({inline_data:{mime_type:mt, data}});
  }
  parts.push({text: `${system}\n\n${user}`});
  const model = (typeof GEMINI_VIS_MODEL !== 'undefined' ? GEMINI_VIS_MODEL : 'gemini-1.5-flash');
  const url = `/proxy/gemini/v1beta/models/${model}:generateContent` + (GEMINI_API_KEY ? `?key=${GEMINI_API_KEY}` : '');
  
  try {
    const res = await fetch(url, {
      method:'POST',
      headers:{'Content-Type':'application/json'},
      body: JSON.stringify({contents:[{parts}]})
    });
    if(!res.ok){
      const errBody = await res.json().catch(() => ({}));
      const errMsg = errBody.error?.message || '';
      if(res.status === 404 || errMsg.includes('not found') || errMsg.includes('no longer available')) {
        terminalLog(`GEMINI: Model ${model} failed (404). Falling back to gemini-1.5-flash...`, 'warn');
        const fallbackUrl = `/proxy/gemini/v1beta/models/gemini-1.5-flash:generateContent` + (GEMINI_API_KEY ? `?key=${GEMINI_API_KEY}` : '');
        const fbRes = await fetch(fallbackUrl, {
          method:'POST',
          headers:{'Content-Type':'application/json'},
          body: JSON.stringify({contents:[{parts}]})
        });
        if(!fbRes.ok) {
          const fbe = await fbRes.json().catch(() => ({}));
          throw new Error(`Gemini Fallback: ${JSON.stringify(fbe.error || fbRes.statusText)}`);
        }
        const fbd = await fbRes.json();
        return fbd.candidates[0].content.parts[0].text;
      }
      throw new Error(`Gemini Vis: ${JSON.stringify(errBody.error || res.statusText)}`);
    }
    const d = await res.json();
    return d.candidates[0].content.parts[0].text;
  } catch(e) {
    terminalLog(`GEMINI_ERROR: ${e.message}`, 'err');
    throw e;
  }
}

// ── Claude Chat AI (multi-turn conversation) ─────────────────────────────
async function callChatAI(system, history) {
  if (currentMode === 'local') {
    const lastMsg = history[history.length - 1]?.content || '';
    return callOllama(system, lastMsg, null, 'phi3.5');
  }
  for (const { name, url, buildBody } of [
    {
      name: 'Claude',
      url: CLAUDE_URL,
      buildBody: () => ({
        model: CLAUDE_MODEL,
        max_tokens: 2000,
        system,
        messages: history.map(h => ({ role: h.role, content: h.content }))
      })
    },
    {
      name: 'Gemini',
      url: `/proxy/gemini/v1beta/models/gemini-1.5-flash:generateContent` + (GEMINI_API_KEY ? `?key=${GEMINI_API_KEY}` : ''),
      buildBody: () => {
        const contents = history.map(h => ({
          role: h.role === 'assistant' ? 'model' : 'user',
          parts: [{ text: h.content }]
        }));
        return { contents, systemInstruction: { parts: [{ text: system }] } };
      }
    }
  ]) {
    const headers = { 'Content-Type': 'application/json' };
    if (name === 'Claude') {
      headers['x-api-key'] = CLAUDE_API_KEY;
      headers['anthropic-version'] = '2023-06-01';
    }
    const res = await fetch(url, {
      method: 'POST',
      headers,
      body: JSON.stringify(buildBody())
    });
    if (!res.ok) continue;
    if (name === 'Claude') return (await res.json()).content[0].text;
    if (name === 'Gemini') return (await res.json()).candidates[0].content.parts[0].text;
  }
  throw new Error('Could not reach any AI model. Check server API key configuration.');
}

// ── Procedural pixel-art cafeteria map (fallback when Gemini fails) ──────────
function generateProceduralMap() {
  const SIZE = 512;
  const canvas = document.createElement('canvas');
  canvas.width = SIZE; canvas.height = SIZE;
  const ctx = canvas.getContext('2d');

  // Floor — warm checkerboard
  for(let y=0;y<SIZE;y+=16) for(let x=0;x<SIZE;x+=16) {
    ctx.fillStyle = ((x+y)/16)%2===0 ? '#f5deb3' : '#e8c99a';
    ctx.fillRect(x,y,16,16);
  }
  // Wall border
  ctx.fillStyle='#8B6914'; ctx.fillRect(0,0,SIZE,16); ctx.fillRect(0,SIZE-16,SIZE,16);
  ctx.fillRect(0,0,16,SIZE); ctx.fillRect(SIZE-16,0,16,SIZE);

  // Serving counter (north)
  ctx.fillStyle='#5c8a5c'; ctx.fillRect(24,20,SIZE-48,44);
  ctx.fillStyle='#4a7a4a'; ctx.fillRect(24,52,SIZE-48,8);
  // Food trays on counter
  const trayColors=['#e74c3c','#f39c12','#27ae60','#3498db','#9b59b6'];
  for(let i=0;i<5;i++){ctx.fillStyle=trayColors[i];ctx.fillRect(50+i*80,28,60,16);
    ctx.fillStyle='rgba(255,255,255,0.4)';ctx.fillRect(56+i*80,32,20,8);}

  // Dining tables (4 rows x 3 cols)
  const tableW=60,tableH=32,chairSize=10;
  for(let row=0;row<4;row++) for(let col=0;col<3;col++) {
    const tx=50+col*148, ty=100+row*98;
    // Table
    ctx.fillStyle='#c8a96e'; ctx.fillRect(tx,ty,tableW,tableH);
    ctx.strokeStyle='#8B6914'; ctx.lineWidth=2; ctx.strokeRect(tx,ty,tableW,tableH);
    // Chairs (top, bottom, left, right)
    ctx.fillStyle='#e8b86d';
    ctx.fillRect(tx+10,ty-chairSize-2,chairSize,chairSize);
    ctx.fillRect(tx+40,ty-chairSize-2,chairSize,chairSize);
    ctx.fillRect(tx+10,ty+tableH+2,chairSize,chairSize);
    ctx.fillRect(tx+40,ty+tableH+2,chairSize,chairSize);
    ctx.fillRect(tx-chairSize-2,ty+8,chairSize,chairSize);
    ctx.fillRect(tx+tableW+2,ty+8,chairSize,chairSize);
  }

  // Kitchen area (north-west)
  ctx.fillStyle='#7f8c8d'; ctx.fillRect(20,20,80,44);
  ctx.fillStyle='#95a5a6'; ctx.fillRect(24,24,72,36);
  ctx.fillStyle='#e74c3c'; ctx.fillRect(32,30,16,16); // stove
  ctx.fillStyle='#e67e22'; ctx.fillRect(56,30,16,16);
  ctx.fillStyle='#2c3e50'; ctx.fillRect(76,26,12,32);

  // Waste bins (south-east)
  [[420,460],[454,460]].forEach(([bx,by])=>{
    ctx.fillStyle='#2ecc71'; ctx.fillRect(bx,by,22,28);
    ctx.fillStyle='#27ae60'; ctx.fillRect(bx,by,22,6);
    ctx.fillStyle='rgba(0,0,0,0.2)'; ctx.fillRect(bx+4,by+8,14,16);
  });

  // Entrance door (south)
  ctx.fillStyle='#3498db'; ctx.fillRect(210,496,90,12);
  ctx.fillStyle='#2980b9'; ctx.fillRect(240,490,30,16);

  // Labels (tiny)
  ctx.fillStyle='rgba(0,0,0,0.5)'; ctx.font='9px monospace';
  ctx.fillText('SERVING',180,48); ctx.fillText('KITCHEN',22,76);
  ctx.fillText('WASTE',412,492); ctx.fillText('ENTRANCE',212,510);

  terminalLog('AGENT_1: Procedural pixel-art map generated (Gemini fallback)', 'warn');
  return canvas.toDataURL('image/png');
}

async function generateCafeteriaImage(userPhotoB64) {
  if (!userPhotoB64) {
    terminalLog('MAP: No photo uploaded — using procedural pixel-art map', 'warn');
    return generateProceduralMap();
  }
  terminalLog('MAP: Converting photo to pixel art (client-side)...', 'run');
  try {
    const img = await new Promise((resolve, reject) => {
      const i = new Image();
      i.onload = () => resolve(i);
      i.onerror = () => reject(new Error('Image load failed'));
      i.src = userPhotoB64;
    });
    const SIZE = 512;
    const BLOCK = 8;
    const canvas = document.createElement('canvas');
    canvas.width = SIZE; canvas.height = SIZE;
    const ctx = canvas.getContext('2d');
    ctx.imageSmoothingEnabled = false;
    // Step 1: draw photo at tiny resolution for pixel block effect
    const thumbSize = SIZE / BLOCK;
    ctx.drawImage(img, 0, 0, thumbSize, thumbSize);
    // Step 2: scale back up with nearest-neighbor for hard pixel edges
    ctx.imageSmoothingEnabled = false;
    ctx.drawImage(canvas, 0, 0, thumbSize, thumbSize, 0, 0, SIZE, SIZE);
    // Step 3: quantize colors to retro 16-color palette
    const palette = [
      [0,0,0],[255,255,255],[136,0,0],[170,255,238],
      [204,68,204],[0,204,85],[0,0,170],[238,238,119],
      [221,136,85],[102,68,0],[255,204,170],[15,23,42],
      [16,185,129],[100,116,139],[241,245,249],[203,213,225]
    ];
    const imageData = ctx.getImageData(0, 0, SIZE, SIZE);
    const d = imageData.data;
    for (let i = 0; i < d.length; i += 4) {
      let best = 0, bestDist = Infinity;
      for (let p = 0; p < palette.length; p++) {
        const dr = d[i] - palette[p][0];
        const dg = d[i+1] - palette[p][1];
        const db = d[i+2] - palette[p][2];
        const dist = dr*dr + dg*dg + db*db;
        if (dist < bestDist) { bestDist = dist; best = p; }
      }
      d[i] = palette[best][0]; d[i+1] = palette[best][1];
      d[i+2] = palette[best][2];
    }
    ctx.putImageData(imageData, 0, 0);
    terminalLog('MAP: Pixel art created from your photo ✓', 'ok');
    return canvas.toDataURL('image/png');
  } catch(e) {
    terminalLog(`MAP: Pixel conversion failed (${e.message}) — using procedural fallback`, 'warn');
    return generateProceduralMap();
  }
}


async function runAgent1(mapImageB64) {
  const system = `You analyze top-down pixel art cafeteria images. Output ONLY raw valid JSON, no markdown, no explanation.`;
  const user = `Analyze this top-down pixel art cafeteria (512×512px). Find pixel coords of each zone.
Return ONLY this JSON with real pixel values:
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
  const raw = await callVisionAI(system, user, mapImageB64);
  try {
    return JSON.parse(raw.replace(/```json\n?|```\n?/g,'').trim());
  } catch(e) {
    const avg = parseInt(setupConfig?.avgStudents) || 80;
    const tables = Math.max(4, Math.round(avg / 10));
    terminalLog('AGENT_1: JSON parse failed — using default zones', 'warn');
    return {
      capacity: avg,
      table_count: tables,
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

async function runAgent2(targetDate) {
  const now = new Date();
  const target = targetDate instanceof Date ? targetDate : now;
  const cal = getCalendar(target);
  const todayStr = now.toLocaleDateString('en-US', { weekday:'long', year:'numeric', month:'long', day:'numeric' });
  const targetStr = target.toLocaleDateString('en-US', { weekday:'long', year:'numeric', month:'long', day:'numeric' });
  const dayShort = target.toLocaleDateString('en-US',{weekday:'short'}).toLowerCase();
  const targetMenu = setupConfig?.weeklyMenu?.[dayShort] || 'Rice';
  const targetForecast = typeof getForecastForDate === 'function' ? getForecastForDate(target) : (weatherForecast[0] || null);
  const targetHigh = targetForecast ? targetForecast.tempMax : weatherData.temp;
  const targetCondition = targetForecast ? targetForecast.condition : weatherData.condition;
  const targetIcon = targetForecast ? targetForecast.icon : weatherData.icon;
  const mlContext = (lastMLPrediction && lastMLPrediction.total)
    ? `\nML_MODEL_REFERENCE: The LightGBM model predicts ${lastMLPrediction.total.toFixed(2)}kg (Category: ${lastMLPrediction.category}), but it only has 4 broad categories (Meat, Vegetables, Rice, Soup). Your menu item "${targetMenu}" may not match well — the model just maps it to a generic category. Use this as a loose reference only. Base your prediction primarily on weather, calendar, menu type, student count, and your food service knowledge.`
    : '';

  await refreshMLPrediction(target);

  const datasetSummary = DATASET_HISTORY.length > 0
    ? `\nREAL UNIVERSITY CANTEEN DATASET (${DATASET_HISTORY.length} records):\n` +
      `Date range: ${DATASET_HISTORY[0]?.date} to ${DATASET_HISTORY[DATASET_HISTORY.length-1]?.date}\n` +
      `Total waste observed: ${DATASET_HISTORY.reduce((s,r)=>s+r.waste_kg,0).toFixed(0)}kg\n` +
      `Meals: ${[...new Set(DATASET_HISTORY.map(r=>r.meal))].join(', ')}\n` +
      `Categories: ${[...new Set(DATASET_HISTORY.map(r=>r.category))].join(', ')}\n` +
      `Sections A-D waste patterns available.\n` +
      `Sample: ${DATASET_HISTORY.slice(-3).map(r => `${r.date} ${r.meal} ${r.category} ${r.waste_kg}kg €${r.cost_loss}`).join(' | ')}`
    : '\nNo historical dataset available.';

  const isOpen = openOrClosed();
  const system = `You are a food waste prediction AI for a school cafeteria. Today is ${todayStr}. You are predicting waste for TARGET DATE: ${targetStr}. The ML model reference is a loose guide only — it uses broad categories and may be inaccurate for this specific dish. Base your prediction PRIMARILY on weather (forecast high ${targetHigh}°C), calendar events, menu type, student count (${setupConfig?.avgStudents || 80}), operating hours, and your knowledge of food service operations. Output ONLY raw valid JSON, no markdown, no explanation.`;
  const forecastContext = weatherForecast.length > 0
    ? `\n7-DAY FORECAST:\n` + weatherForecast.map((f,i) => {
        const marker = f.date === dateToIso(target) ? '▶ TARGET' : (i === 0 ? '▶ TODAY' : f.dayName);
        return `${marker} (${f.date}): ${f.icon} ${f.condition} High:${f.tempMax}°C Low:${f.tempMin}°C${f.precip>0?` Precip:${f.precip}mm`:''}`;
      }).join('\n')
    : '';

  const user = `Today (reference): ${todayStr}.
TARGET FORECAST DATE: ${targetStr}
CANTEEN DETAILS:
- Canteen: ${setupConfig?.canteenName || 'Unknown'}
- Location: ${setupConfig?.location || 'Unknown'}
- Students expected: ${setupConfig?.avgStudents || 80}
- Staff: ${setupConfig?.staffCount || 10}
- Meal on target date (${targetStr}): ${targetMenu}
- Weather on target date: ${targetIcon} ${targetCondition}, forecast high ${targetHigh}°C
- School event on target date: ${cal.event}
- Efficiency goal: ${setupConfig?.efficiencyGoal || '80% - Balanced Growth'}
- Manager: ${setupConfig?.managerName || 'Unknown'}
- Receiving shelter: ${setupConfig?.shelterName || 'Unknown'}
- Operating hours: ${setupConfig?.openTime || '07:00'} to ${setupConfig?.closeTime || '15:00'}
- Canteen currently: ${isOpen} (predict for the TARGET DATE regardless)
${datasetSummary}
${mlContext}
${forecastContext}

Based on these conditions, estimate food waste risk for ${targetStr} ONLY and output ONLY this JSON:
{
  "waste_risk": "low"|"medium"|"high",
  "risk_pct": 25,
  "predicted_waste_kg": 5.2,
  "confidence": "75%",
  "main_cause": "Brief explanation of the primary risk factor citing weather, calendar, and menu",
  "at_risk_meals": ["meal_name"],
  "order_reduction": "Suggested reduction in portions",
  "co2_at_risk_kg": 15.6,
  "rescue_needed": false,
  "recommended_action": "What the manager should do"
}`;

  const raw = await callTextAI(system, user, 1200);
  return JSON.parse(raw.replace(/```json\n?|```\n?/g,'').trim());
}

async function runAgent3() {
  const system = `You write concise professional food rescue pickup request messages. Warm but practical. Maximum 110 words.`;
  const user = `Write a food rescue pickup request:

From: ${setupConfig?.canteenName || 'Springfield High'} Cafeteria
Manager: ${setupConfig?.managerName || 'Mr. Davis'}, Tel: ${setupConfig?.managerContact || '555-0100'}
To: ${setupConfig?.shelterName || 'City Food Bank'}

Surplus:
- Food: ${currentPrediction.at_risk_meals.join(' and ')}
- Quantity: ~${currentPrediction.predicted_waste_kg}kg
- Risk: ${currentPrediction.waste_risk.toUpperCase()} (${currentPrediction.risk_pct}%)
- CO₂ prevented if rescued: ${currentPrediction.co2_at_risk_kg}kg
- Reason: ${currentPrediction.main_cause}

Pickup time: tomorrow 2:00-2:30 PM after lunch service. Max 110 words. Professional and warm.`;

  return await callTextAI(system, user);
}

async function triggerAgent1() {
  if(generatedMapB64 && currentMapConfig) {
    terminalLog('AGENT_1: Map already generated during setup — skipping', 'ok');
    updateAILogsWindow('Agent 1', 'Map loaded from setup', 'SUCCESS');
    return;
  }
  terminalLog('AGENT_1: Initializing Vision Mapper...', 'run');
  updateAILogsWindow('Agent 1', 'Starting — generating pixel art from photo...');
  try {
    if(setupConfig?.cafeteriaPhoto && !uploadedPhotoB64) {
      uploadedPhotoB64 = await fileToBase64(setupConfig.cafeteriaPhoto);
    }
    terminalLog('AGENT_1: Calling Gemini image generation...', 'run');
    generatedMapB64 = await generateCafeteriaImage(uploadedPhotoB64);
    terminalLog('AGENT_1: Pixel art generated ✓', 'ok');
    setCanvasBackground(generatedMapB64);

    terminalLog('AGENT_1: Analyzing zones with Gemini...', 'run');
    currentMapConfig = await runAgent1(generatedMapB64);
    applyZones(currentMapConfig);

    terminalLog(`AGENT_1: Complete — ${currentMapConfig.table_count} tables, capacity ${currentMapConfig.capacity} ✓`, 'ok');
    updateAILogsWindow('Agent 1', `Map generated. ${currentMapConfig.table_count} tables detected. Zones calibrated.`, 'SUCCESS');
  } catch(err) {
    terminalLog(`AGENT_1: ERROR — ${err.message}`, 'err');
    updateAILogsWindow('Agent 1', err.message, 'ERROR');
  }
}

async function triggerAgent2() {
  terminalLog('AGENT_2: Sentinel online — analyzing 6-month history...', 'run');
  updateAILogsWindow('Agent 2', 'Scanning historical patterns + live weather...');
  try {
    currentPrediction = await runAgent2();
    const riskColors = {low:'#10b981', medium:'#f59e0b', high:'#ef4444'};
    terminalLog(`AGENT_2: ${currentPrediction.waste_risk.toUpperCase()} RISK — ${currentPrediction.predicted_waste_kg}kg predicted (${currentPrediction.confidence}) ✓`, 
      currentPrediction.waste_risk==='high'?'warn':'ok');
    
    updateWasteLogsWindow(currentPrediction);
    updateAILogsWindow('Agent 2', currentPrediction.main_cause, 
      currentPrediction.rescue_needed ? 'RESCUE_TRIGGER' : 'OPTIMAL');

    if(currentPrediction.waste_risk==='high') flashCanvas();

    updateSimWindow();

    if(currentPrediction.waste_risk==='high' && window.students && students.length > 0) {
      students.forEach(npc => npc.waste_prob = Math.min(0.6, npc.waste_prob * 1.6));
      terminalLog('AGENT_2: NPC waste probability elevated for high-risk scenario', 'warn');
    }

    if(currentPrediction.rescue_needed) {
      terminalLog('AGENT_2: 🚨 AI RECOMMENDS RESCUE — Preparing dispatch message...', 'warn');
      showRescueWindow();
      enableAgent3();
    }
  } catch(err) {
    terminalLog(`AGENT_2: ERROR — ${err.message}`, 'err');
    updateAILogsWindow('Agent 2', err.message, 'ERROR');
  }
}

async function triggerAgent3() {
  terminalLog('AGENT_3: Rescue Dispatcher drafting message...', 'run');
  updateAILogsWindow('Agent 3', 'Composing rescue dispatch to ' + (setupConfig?.shelterName || 'City Food Bank'));
  try {
    currentDraft = await runAgent3();
    terminalLog('AGENT_3: Draft ready — MANAGER APPROVAL REQUIRED ⚠️', 'warn');
    populateRescueWindow(currentDraft);
    updateAILogsWindow('Agent 3', 'Rescue draft ready. Awaiting manager approval.', 'PENDING_HUMAN');
  } catch(err) {
    terminalLog(`AGENT_3: ERROR — ${err.message}`, 'err');
  }
}

function confirmRescue() {
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

  recordObservation('rescue_confirmed', {
    meal: setupConfig?.weeklyMenu?.[dayShort] || 'unknown',
    served: parseInt(setupConfig?.avgStudents) || 0,
    wasted: parseFloat(wasteToday.toFixed(2)),
    rescued: r,
    confidence: currentPrediction.confidence,
    reasoning: currentPrediction.main_cause,
    shelter: setupConfig?.shelterName || 'Food Bank',
  });

  addRescueToWasteLogs({
    food: currentPrediction.at_risk_meals.join(', '),
    kg: r, meals, co2,
    shelter: setupConfig?.shelterName || 'City Food Bank',
    manager: setupConfig?.managerName || 'Manager',
    confidence: currentPrediction.confidence,
    risk: currentPrediction.waste_risk,
    reasoning: currentPrediction.main_cause,
  });

  terminalLog(`RESCUE_CONFIRMED: ${r}kg → ${setupConfig?.shelterName||'Food Bank'} ✓`, 'ok');
  terminalLog(`IMPACT: ${co2}kg CO₂ prevented | ${meals} meals donated ✓`, 'ok');
  updateAILogsWindow('RESCUE', `${r}kg confirmed | ${meals} meals | ${co2}kg CO₂ saved`, 'RESCUE_SUCCESS');

  if(window.manager){ manager.setMode('phone'); setTimeout(()=>manager.setMode('patrol'),5000); }

  const rw = document.getElementById('win-rescue');
  if(rw) rw.classList.add('hidden');

  updateSimWindow();

  setTimeout(async()=>{
    try {
      const msg = await callNIM(
        `You are CMD_CORE. The manager just approved a food rescue. One sentence, specific numbers, warm tone.`,
        `Rescued: ${r}kg. Meals: ${meals}. CO₂ prevented: ${co2}kg. Destination: ${setupConfig?.shelterName||'food bank'}.`
      );
      appendChatMessage('assistant', `✅ ${msg.trim()}`);
      terminalLog(`CMD_CORE: ${msg.trim()}`, 'ok');
    } catch(_){}
  }, 1500);
}

function fileToBase64(file) {
  return new Promise((res, rej) => {
    const reader = new FileReader();
    reader.onload = e => res(e.target.result);
    reader.onerror = rej;
    reader.readAsDataURL(file);
  });
}

// ══════════════════════════════════════════════════════════════
// AUTONOMOUS NIM SYSTEM — Zero hardcoded data, pure AI reasoning
// ══════════════════════════════════════════════════════════════

function recordObservation(type, data) {
  const obs = {
    timestamp: new Date().toISOString(),
    simTick,
    type,
    data,
    weather: {...weatherData},
    calendar: getCalendar().type,
    studentsActive: window.students ? students.length : 0,
    wasteAtTime: parseFloat(wasteToday.toFixed(2)),
    rescuedAtTime: parseFloat(rescuedToday.toFixed(2)),
  };
  nimObservations.push(obs);

  if(nimObservations.length > 200) nimObservations.shift();

  if(type === 'rescue_confirmed') {
    HISTORY.push({
      date: new Date().toISOString().split('T')[0],
      weather: weatherData.condition?.toLowerCase() || 'unknown',
      temp: weatherData.temp,
      event: getCalendar().type,
      meal: data.meal,
      served: data.served,
      wasted: data.wasted,
      rescued: data.rescued,
      co2_saved: parseFloat((data.rescued * CO2_PER_KG).toFixed(2)),
      meals_donated: Math.round(data.rescued * MEALS_PER_KG),
      nim_confidence: data.confidence,
      nim_reasoning: data.reasoning
    });
    terminalLog(`MEMORY: Rescue event saved to HISTORY (${HISTORY.length} records total)`, 'ok');
  }

  if(type === 'session_end_snapshot') {
    HISTORY.push({
      date: new Date().toISOString().split('T')[0],
      weather: weatherData.condition?.toLowerCase() || 'unknown',
      temp: weatherData.temp,
      event: getCalendar().type,
      meal: data.meal || 'unknown',
      served: parseInt(setupConfig?.avgStudents) || 0,
      wasted: parseFloat(wasteToday.toFixed(2)),
      rescued: parseFloat(rescuedToday.toFixed(2)),
      co2_saved: parseFloat((rescuedToday * CO2_PER_KG).toFixed(2)),
      meals_donated: mealsSaved,
      nim_confidence: 'observed',
      nim_reasoning: 'autonomous session snapshot'
    });
  }
}

function openOrClosed() {
  const now = new Date();
  const h = now.getHours(), m = now.getMinutes();
  const open = (setupConfig?.openTime || '07:00').split(':').map(Number);
  const close = (setupConfig?.closeTime || '15:00').split(':').map(Number);
  const nowMin = h * 60 + m;
  const openMin = open[0] * 60 + (open[1] || 0);
  const closeMin = close[0] * 60 + (close[1] || 0);
  if (nowMin >= openMin && nowMin < closeMin) return 'OPEN';
  if (nowMin < openMin) return 'CLOSED — opens at ' + setupConfig.openTime;
  return 'CLOSED — closed since ' + setupConfig.closeTime;
}

function onNPCWasteEvent(npc) {
  recordObservation('waste_event', {
    npcType: npc.label,
    npcColor: npc.color,
    wasteKg: WASTE_PER_EVENT,
    state: npc.state,
  });
}

async function runNIMAutonomousLoop() {
  nimLoopCycle++;
  const cycle = nimLoopCycle;

  const now = new Date();
  const hour = now.getHours();
  const min = String(now.getMinutes()).padStart(2,'0');
  const cal = getCalendar();
  const dayShort = now.toLocaleDateString('en-US',{weekday:'short'}).toLowerCase();
  const dayName = now.toLocaleDateString('en-US',{weekday:'long'});
  const todayMenu = setupConfig?.weeklyMenu?.[dayShort] || 'not specified';
  const mlContext = (lastMLPrediction && lastMLPrediction.total)
    ? `ML_MODEL_REFERENCE: LightGBM predicts ${lastMLPrediction.total.toFixed(2)}kg (Category: ${lastMLPrediction.category}) but it only has 4 broad categories — may not match today's "${todayMenu}" dish well. Use as loose reference only.\n`
    : 'ML_MODEL_REFERENCE: Not available. NIM will predict without it.\n';

  await refreshMLPrediction();

  const histContext = HISTORY.length > 0
    ? `REAL HISTORY (${HISTORY.length} confirmed rescue records):\n` +
      HISTORY.slice(-5).map(h=>`${h.date}: wasted=${h.wasted}kg rescued=${h.rescued}kg meal=${h.meal} weather=${h.weather} ${h.temp}°C event=${h.event}`).join('\n')
    : 'HISTORY: No rescue records yet this session.';

  const datasetContext = DATASET_HISTORY.length > 0
    ? `REAL UNIVERSITY CANTEEN DATASET (${DATASET_HISTORY.length} records, ${DATASET_HISTORY[0]?.date} to ${DATASET_HISTORY[DATASET_HISTORY.length-1]?.date}):
Total waste: ${DATASET_HISTORY.reduce((s,r)=>s+r.waste_kg,0).toFixed(0)}kg
Meals observed: ${[...new Set(DATASET_HISTORY.map(r=>r.meal))].join(', ')}
Sections: ${[...new Set(DATASET_HISTORY.map(r=>r.section))].join(', ')}
Sample waste patterns (last 7 records):
${DATASET_HISTORY.slice(-7).map(r => `${r.date} | ${r.meal} | ${r.category} | ${r.waste_kg}kg | cost €${r.cost_loss}`).join('\n')}`
    : 'UNIVERSITY DATASET: Not loaded.';

  const webCtx = nimWebCache
    ? `WEB CONTEXT (fetched ${new Date(nimWebCache.fetchedAt).toLocaleTimeString()}): ${nimWebCache.context.substring(0,300)}`
    : 'WEB CONTEXT: Not yet fetched.';

  const system = `You are CMD_CORE, an autonomous AI prediction agent for a school cafeteria.
You PREDICT outcomes based on cafeteria config, weather, calendar, and food science knowledge.
You MUST use the provided ML_MODEL_PREDICTION total as your starting baseline. Then, adjust it based on the weather, wind, rain, calendar event, and operating hours to calculate the final predicted waste.
Be analytical and specific with numbers. Always include attendance prediction and waste prediction.
Output format:
PREDICTED_ATTENDANCE: [number] out of [total] students — [brief reasoning]
PREDICTED_WASTE_KG: [number] kg — [brief reasoning]
PREDICTED_CO2_KG: [number] kg
RISK_LEVEL: [LOW/MEDIUM/HIGH]
CONFIDENCE: [LOW/MEDIUM/HIGH and why]
ACTION: [MONITOR | ALERT | RECOMMEND_RESCUE | SUGGEST_MENU_CHANGE | REQUEST_WEB_UPDATE]
REASONING: [3-4 sentence analysis of all factors]
NOTIFICATION: [null OR short message for manager]`;

  const user = `CYCLE ${cycle} — ${dayName} ${now.toLocaleDateString()} at ${hour}:${min}

CAFETERIA CONFIGURATION:
Name: ${setupConfig?.canteenName || 'Unknown'}
Location: ${setupConfig?.location || 'Unknown'}
Registered students: ${setupConfig?.avgStudents || 'Unknown'}
Staff count: ${setupConfig?.staffCount || 'Unknown'}
Today's menu: ${todayMenu}
Calendar event: ${cal.event}
Efficiency goal: ${setupConfig?.efficiencyGoal || 'Not set'}
Receiving shelter: ${setupConfig?.shelterName || 'Not set'}
Operating hours: ${setupConfig?.openTime || '07:00'} – ${setupConfig?.closeTime || '15:00'}
Currently ${openOrClosed()}

ENVIRONMENT:
Weather: ${weatherData.condition || 'Unknown'} ${weatherData.temp !== null ? weatherData.temp+'°C' : 'unknown'}
Wind: ${weatherData.wind || 0}km/h | Rain: ${weatherData.rain || 0}mm
Time of day: ${hour}:${min}

7-DAY FORECAST:
${weatherForecast.length > 0
  ? weatherForecast.map((f,i) => `${i===0?'▶ TODAY':f.dayName}: ${f.icon} ${f.condition} ${f.tempMax}°C/${f.tempMin}°C${f.precip>0?` ${f.precip}mm`:''}`).join('\n')
  : 'Forecast unavailable.'}

${histContext}

${datasetContext}

${mlContext}
${webCtx}

WEB FETCHES TODAY: ${nimWebFetchCount}/${WEB_FETCH_LIMIT}
${nimWebFetchCount < WEB_FETCH_LIMIT ? 'Can request web search if needed.' : 'Limit reached.'}

PREVIOUS RUN PREDICTION: ${currentPrediction ? JSON.stringify(currentPrediction) : 'None — first prediction cycle.'}

Based on this data, predict today's cafeteria outcomes. Consider:
- ML_MODEL_PREDICTION as your data-driven baseline (trained on 2600 real records)
- Real dataset patterns: which meals/sections produce most waste historically
- Weather effect on attendance (rainy/cold reduces, sunny increases)
- Calendar event effect (exam week increases, sports day decreases)
- Menu type effect on waste (pasta/soup = higher waste, salad = lower)
- Time of day vs operating hours (closed vs lunch rush vs off-peak)
- Efficiency goal target
- General food service knowledge`;

  try {
    const response = await callNIM(system, user, 1200);

    const attMatch  = response.match(/PREDICTED_ATTENDANCE:\s*(.+?)(?=PREDICTED_WASTE_KG:|$)/s);
    const wasteMatch= response.match(/PREDICTED_WASTE_KG:\s*(.+?)(?=PREDICTED_CO2_KG:|$)/s);
    const co2Match  = response.match(/PREDICTED_CO2_KG:\s*(.+?)(?=RISK_LEVEL:|$)/s);
    const riskMatch = response.match(/RISK_LEVEL:\s*([A-Z_]+)/);
    const confMatch = response.match(/CONFIDENCE:\s*(.+?)(?=ACTION:|$)/s);
    const actMatch  = response.match(/ACTION:\s*([A-Z_]+)/);
    const reasonMatch = response.match(/REASONING:\s*(.+?)(?=NOTIFICATION:|$)/s);
    const notifMatch = response.match(/NOTIFICATION:\s*(.+?)(?=\n|$)/);

    const attPred   = attMatch?.[1]?.trim() || 'Unknown';
    const wastePred = wasteMatch?.[1]?.trim() || 'Unknown';
    const co2Pred   = co2Match?.[1]?.trim() || 'Unknown';
    const riskLevel = riskMatch?.[1]?.trim() || 'LOW';
    const confidence = confMatch?.[1]?.trim() || 'MEDIUM';
    const action    = actMatch?.[1]?.trim() || 'MONITOR';
    const reasoning = reasonMatch?.[1]?.trim() || '';
    const notification = notifMatch?.[1]?.trim();
    const hasNotif = notification && notification.toLowerCase() !== 'null' && notification.length > 5;

    const autonomousPrediction = { attPred, wastePred, co2Pred, riskLevel, confidence, cycle, time: now.toLocaleTimeString() };

    terminalLog(`━━━ CMD_CORE [C${cycle}] ━━━`, 'run');
    terminalLog(`📊 Attendance: ${attPred}  |  Waste: ${wastePred}  |  CO2: ${co2Pred}`, 'run');
    terminalLog(`⚠️ Risk: ${riskLevel}  |  Confidence: ${confidence}  |  Action: ${action}`, riskLevel==='HIGH'?'warn':'ok');
    if(reasoning) terminalLog(`🧠 ${reasoning}`, 'ok');

    updateAILogsWindow(
      `CMD_CORE [C${cycle}]`,
      `Attendance: ${attPred} | Waste: ${wastePred} | Risk: ${riskLevel} | ${reasoning || ''}`,
      action
    );

    recordObservation('nim_prediction', {
      cycle, action, confidence, riskLevel,
      attendance: attPred, waste: wastePred, co2: co2Pred,
      reasoning,
    });

    if(action === 'REQUEST_WEB_UPDATE' && nimWebFetchCount < WEB_FETCH_LIMIT) {
      const query = `school cafeteria food waste ${weatherData.condition} weather ${cal.event} supply shortage`;
      const webData = await fetchWebContext(query, 'nim_autonomous');
      if(webData) {
        terminalLog(`CMD_CORE: Web context acquired — re-evaluating next cycle`, 'ok');
      }
    }

    if(action === 'ALERT' || riskLevel === 'HIGH') {
      if(riskLevel === 'HIGH') flashCanvas();
      terminalLog(`CMD_CORE: 🚨 ${riskLevel==='HIGH'?'HIGH RISK':'Alert'} — ${wastePred}`, 'warn');
      if(hasNotif) {
        sendNotification(`${riskLevel==='HIGH'?'⚠️':'📋'} Food Waste ${riskLevel==='HIGH'?'Alert':'Update'}`, notification, riskLevel==='HIGH'?'high':'medium');
      }
    }

    if(action === 'RECOMMEND_RESCUE') {
      terminalLog(`CMD_CORE: → Rescue needed per prediction`, 'warn');
      if(hasNotif) sendNotification('🚨 Rescue Recommended', notification, 'high');
      appendChatMessage('assistant', `📊 Prediction suggests rescue may be needed: ${wastePred}. I recommend running Agent 2 to confirm.`);
    }

    if(action === 'SUGGEST_MENU_CHANGE') {
      terminalLog(`CMD_CORE: 🔄 Menu change suggested based on prediction`, 'warn');
      if(hasNotif) sendNotification('🔄 Menu Suggestion', notification, 'low');
    }

    if(cycle === 1 && nimWebFetchCount === 0) {
      const location = setupConfig?.location || 'school';
      const query = `food shortage supply chain ${location} cafeteria prices 2026`;
      setTimeout(()=>fetchWebContext(query, 'session_start'), 5000);
    }

  } catch(err) {
    terminalLog(`CMD_CORE [C${cycle}]: Error — ${err.message}`, 'err');
    updateAILogsWindow(`CMD_CORE [C${cycle}]`, `Loop error: ${err.message}`, 'ERROR');
  }
}

function startNIMAutonomousLoop() {
  if(nimLoopInterval) clearInterval(nimLoopInterval);
  terminalLog('CMD_CORE: Autonomous prediction online — cycle every 30s', 'ok');
  updateAILogsWindow('CMD_CORE', 'Autonomous prediction system initialized', 'ONLINE');
  setTimeout(runNIMAutonomousLoop, 5000);
  nimLoopInterval = setInterval(runNIMAutonomousLoop, 30000);
}

function stopNIMAutonomousLoop() {
  if(nimLoopInterval){ clearInterval(nimLoopInterval); nimLoopInterval=null; }
  terminalLog('CMD_CORE: Autonomous monitoring paused', 'warn');
  updateAILogsWindow('CMD_CORE', 'Autonomous monitoring paused by user', 'PAUSED');
}

function addRescueToWasteLogs(record) {
  const table = document.querySelector('#win-waste-logs table tbody');
  if(table) {
    const tr = document.createElement('tr');
    tr.style.cssText = 'background:#d1fae5;';
    tr.innerHTML = `
      <td style="font-weight:bold;color:#10b981;">${new Date().toISOString().split('T')[0]} ✅</td>
      <td>${record.food}</td>
      <td style="color:#10b981;font-weight:bold;">${record.kg}kg RESCUED</td>
      <td style="color:#10b981;font-weight:bold;">CONFIRMED</td>`;
    table.insertBefore(tr, table.firstChild);
  }

  let panel = document.getElementById('rescue-records-panel');
  if(!panel) {
    const winContent = document.querySelector('#win-waste-logs .os-content');
    if(!winContent) return;
    panel = document.createElement('div');
    panel.id = 'rescue-records-panel';
    panel.style.cssText = 'padding:10px;border-top:2px solid #10b981;margin-top:8px;';
    panel.innerHTML = `
      <div style="font-size:10px;font-family:monospace;color:#10b981;font-weight:bold;margin-bottom:8px;">
        ✅ REAL RESCUE RECORDS — Manager-Confirmed Saves This Session
      </div>
      <div id="rescue-records-list"></div>`;
    winContent.appendChild(panel);
  }

  const list = document.getElementById('rescue-records-list');
  if(!list) return;
  const entry = document.createElement('div');
  entry.style.cssText = 'background:#f0fdf4;border:2px solid #10b981;padding:10px;margin-bottom:8px;font-family:monospace;font-size:11px;';
  entry.innerHTML = `
    <div style="font-weight:bold;color:#10b981;margin-bottom:4px;">🎉 ${new Date().toLocaleString()}</div>
    <div>📦 Food: <b>${record.food}</b></div>
    <div>⚖️ Rescued: <b>${record.kg}kg</b></div>
    <div>🍽️ Meals donated: <b>${record.meals}</b> to <b>${record.shelter}</b></div>
    <div>🌍 CO₂ prevented: <b>${record.co2}kg</b></div>
    <div>👤 Approved by: ${record.manager}</div>
    <div>🤖 AI confidence: ${record.confidence} | Risk: ${record.risk?.toUpperCase()}</div>
    <div style="color:#6b7280;font-size:10px;margin-top:4px;">Reasoning: ${record.reasoning}</div>`;
  list.insertBefore(entry, list.firstChild);
}

async function generateDailySummary() {
  terminalLog('SUMMARY: Requesting daily report from CMD_CORE...', 'run');

  const obsLog = nimObservations
    .slice(-50)
    .map(o=>`[${new Date(o.timestamp).toLocaleTimeString()}] ${o.type}: ${JSON.stringify(o.data).substring(0,100)}`)
    .join('\n');

  const system = `You are CMD_CORE. Write a daily operations report for this cafeteria.
Use ONLY the data provided — do not invent numbers.
If data is sparse (early in session), say so honestly.
Plain text only. No markdown. No asterisks. No hashtags.
Sections: EXECUTIVE SUMMARY | TODAY'S PERFORMANCE | AI REASONING LOG | PATTERNS DETECTED | TOMORROW'S RECOMMENDATION | CLIMATE IMPACT.
Be specific with real numbers. Max 80 words per section.`;

  const user = `Generate daily report for ${new Date().toLocaleDateString('en-US',{weekday:'long',year:'numeric',month:'long',day:'numeric'})}.

CAFETERIA: ${setupConfig?.canteenName||'Unknown'} | ${setupConfig?.location||'Unknown'}
MANAGER: ${setupConfig?.managerName||'Unknown'}

REAL SESSION DATA:
Waste generated: ${wasteToday.toFixed(2)}kg
Food rescued: ${rescuedToday.toFixed(2)}kg
CO₂ prevented: ${(rescuedToday*CO2_PER_KG).toFixed(2)}kg
Meals donated: ${mealsSaved}
Rescue rate: ${wasteToday>0?((rescuedToday/(wasteToday+rescuedToday))*100).toFixed(0):0}%
Weather: ${weatherData.condition} ${weatherData.temp}°C
Calendar: ${getCalendar().event}
History records built this session: ${HISTORY.length}
Autonomous NIM cycles completed: ${nimLoopCycle}
Web searches used: ${nimWebFetchCount}/${WEB_FETCH_LIMIT}

${DATASET_HISTORY.length > 0
  ? `REAL UNIVERSITY DATASET FOR COMPARISON (${DATASET_HISTORY.length} records):
Total waste in dataset: ${DATASET_HISTORY.reduce((s,r)=>s+r.waste_kg,0).toFixed(0)}kg
Daily avg waste: ${(DATASET_HISTORY.reduce((s,r)=>s+r.waste_kg,0)/DATASET_HISTORY.length).toFixed(2)}kg
Most wasted meal: ${DATASET_HISTORY.reduce((a,b)=>a.waste_kg>b.waste_kg?a:b).meal} (${DATASET_HISTORY.reduce((a,b)=>a.waste_kg>b.waste_kg?a:b).waste_kg}kg)
Most wasted category: ${DATASET_HISTORY.reduce((a,b)=>a.waste_kg>b.waste_kg?a:b).category}
Date range: ${DATASET_HISTORY[0]?.date} to ${DATASET_HISTORY[DATASET_HISTORY.length-1]?.date}
`
  : 'No reference dataset loaded.\n'}

OBSERVATION LOG (last 50 events):
${obsLog || 'No observations recorded yet.'}

WEB CONTEXT USED:
${nimWebCache ? nimWebCache.context.substring(0,400) : 'None fetched this session.'}

Write the report now. Be honest about data gaps if session was short.`;

  try {
    const report = await callNIM(system, user, 1500);
    dailySummaryText = report;
    showSummaryWindow(report);
    terminalLog('SUMMARY: Daily report generated by CMD_CORE ✓', 'ok');
    updateAILogsWindow('CMD_CORE', 'Daily operations report generated — stored in AI logs', 'SUMMARY_READY');
  } catch(err) {
    terminalLog(`SUMMARY: Error — ${err.message}`, 'err');
  }
}

function showSummaryWindow(text) {
  const existing = document.getElementById('win-summary');
  if(existing) existing.remove();

  const win = document.createElement('div');
  win.id = 'win-summary';
  win.className = 'os-window absolute z-[70]';
  win.style.cssText = 'top:60px;left:50%;transform:translateX(-50%);width:640px;max-height:88vh;';

  win.innerHTML = `
    <div class="os-titlebar" style="cursor:move;">
      <div class="flex items-center gap-2">
        <span>📋</span>
        <span class="font-bold text-[10px] uppercase">CMD_CORE — Daily AI Operations Report</span>
      </div>
      <div style="display:flex;gap:6px;align-items:center;">
        <button onclick="downloadSummary()"
          style="font-size:10px;font-family:monospace;background:#10b981;color:white;border:2px solid #0f172a;padding:2px 10px;cursor:pointer;font-weight:bold;">
          ⬇ DOWNLOAD .TXT
        </button>
        <div class="window-button bg-secondary" onclick="document.getElementById('win-summary').remove()"></div>
      </div>
    </div>
    <div style="padding:16px;overflow-y:auto;max-height:calc(88vh - 44px);">
      <div style="background:#0f172a;border:2px solid #10b981;padding:16px;font-family:monospace;font-size:11px;line-height:1.8;color:#e2e8f0;white-space:pre-wrap;margin-bottom:12px;" id="summary-text">${text}</div>
      <div style="display:flex;justify-content:space-between;align-items:center;">
        <span style="font-size:10px;color:#6b7280;font-family:monospace;">
          Generated by CMD_CORE via NVIDIA NIM · ${new Date().toLocaleString()} · ${nimLoopCycle} cycles observed
        </span>
        <button onclick="downloadSummary()"
          style="background:#0f172a;color:#10b981;border:2px solid #10b981;padding:6px 16px;font-family:monospace;font-size:11px;font-weight:bold;cursor:pointer;">
          ⬇ DOWNLOAD
        </button>
      </div>
    </div>`;

  document.getElementById('desktop-os').appendChild(win);

  const tb = win.querySelector('.os-titlebar');
  let drag=false, ox=0, oy=0;
  tb.addEventListener('mousedown',e=>{drag=true;win.style.transform='none';win.style.bottom='auto';win.style.right='auto';ox=e.clientX-win.getBoundingClientRect().left;oy=e.clientY-win.getBoundingClientRect().top;});
  document.addEventListener('mousemove',e=>{if(drag){win.style.left=(e.clientX-ox)+'px';win.style.top=(e.clientY-oy)+'px';}});
  document.addEventListener('mouseup',()=>drag=false);
}

function downloadSummary() {
  const text = document.getElementById('summary-text')?.textContent || dailySummaryText;
  if(!text || text.trim()==='') {
    terminalLog('SUMMARY: No report to download — run Generate Daily Report first', 'warn');
    appendChatMessage('assistant', 'No report generated yet. Click "Generate Daily Report" first.');
    return;
  }
  const date = new Date().toISOString().split('T')[0];
  const name = (setupConfig?.canteenName||'Cafeteria').replace(/\s+/g,'_');
  const filename = `CanteenTycoon_Report_${name}_${date}.txt`;
  const header = `CANTEENTYCOON AI — DAILY OPERATIONS REPORT\nGenerated: ${new Date().toLocaleString()}\nCafeteria: ${setupConfig?.canteenName||'Unknown'}\nManager: ${setupConfig?.managerName||'Unknown'}\nAI: CMD_CORE via NVIDIA NIM (${NIM_MODEL})\nCycles: ${nimLoopCycle} | Web fetches: ${nimWebFetchCount}/${WEB_FETCH_LIMIT}\n${'='.repeat(60)}\n\n`;
  const blob = new Blob([header+text], {type:'text/plain'});
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href=url; a.download=filename;
  document.body.appendChild(a); a.click();
  document.body.removeChild(a); URL.revokeObjectURL(url);
  terminalLog(`SUMMARY: Downloaded — ${filename} ✓`, 'ok');
}
