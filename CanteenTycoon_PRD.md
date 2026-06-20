# CanteenTycoon AI — Product Requirements Document
**USAII Global AI Hackathon 2026 | High School Track | Challenge Brief 2 — Direction A: Food Waste Rescue Radar**
**Version 1.0 | June 15, 2026 | Team: 2 students**

---

## 1. EXECUTIVE SUMMARY

CanteenTycoon AI is a gamified digital twin of a real school cafeteria. A cafeteria manager uploads a single photo of their canteen — the AI generates a top-down pixel art simulation of that exact space, populates it with behaviorally accurate student NPCs, predicts which meals will be over-ordered, and automatically drafts a food rescue dispatch message to a local shelter. The manager confirms before anything is sent.

**The core innovation:** This is not a dashboard. It is a living simulation where AI-driven student agents behave according to real data — weather, school calendar, historical waste patterns — making food waste visible, predictable, and actionable in a way no static chart can.

---

## 2. PROBLEM STATEMENT

### The User
**Mr. Davis** — cafeteria manager at Springfield High School. Responsible for ordering, preparation, and disposal of food for 80–140 students daily.

### The Problem
Every week, Mr. Davis over-orders hot pasta on cold days and under-orders salad on warm days. He has no tool to predict this. On exam week, stressed students skip or abandon half their meals. On sports day, half the school is absent. He only discovers the waste *after* it happens — when 12kg of pasta goes into the bin at 2pm.

This generates:
- **Financial loss** — wasted food budget
- **Environmental damage** — 1kg food waste = 3kg CO₂ equivalent
- **Missed opportunity** — local shelters could have used that food

### Why AI is needed
Pattern detection across 6+ variables (weather × calendar × meal type × day-of-week × student population × historical data) is beyond human intuition. AI identifies these compound patterns and predicts waste 48 hours in advance.

---

## 3. SOLUTION OVERVIEW

### The Flow
```
User uploads cafeteria photo
        ↓
[GEMINI] Generates top-down pixel art map of that exact space
        ↓
[CLAUDE Agent 1 — Vision Mapper]
Analyzes pixel art → identifies serving line, seating, bins, kitchen, entrance
→ outputs zone coordinates as JSON
        ↓
[Canvas Game Engine]
Renders AI map as background
Spawns 10 student NPCs with type-based behavioral profiles
NPCs walk, queue, eat, abandon food — driven by waste probability
        ↓
[CLAUDE Agent 2 — Waste Predictor]
Inputs: live weather (Open-Meteo) + school calendar + 6-month synthetic history
Detects patterns → predicts waste risk, kg, CO₂ impact
→ outputs prediction JSON with confidence score
        ↓
[CLAUDE Agent 3 — Rescue Dispatcher]
Drafts a professional food rescue message to local shelter
→ outputs plain English text
        ↓
[HUMAN IN THE LOOP]
Manager reviews draft in approval modal
Manager edits, approves, or cancels
→ only on approval: rescue logged, stats updated
```

### The "Game" Layer
- NPCs walk real cafeteria zones (serving → seating → eating → bins → exit)
- NPC types match real student archetypes (Vegetarian, Eco, Athlete, Picky)
- Waste events fire when NPCs abandon food — visible, real-time accumulation
- CO₂ counter ticks up as waste grows
- Rescue approval triggers manager NPC to pull out phone — visual confirmation

---

## 4. AI ARCHITECTURE

### Model Selection

| Agent | Cloud | Local | Reason |
|-------|-------|-------|--------|
| Gemini (image gen) | gemini-2.0-flash-preview-image-generation | N/A | Only model with free image generation + photo-to-image |
| Agent 1 (vision) | claude-haiku-4-5-20251001 | llama3.2-vision | Fast, cheap, accurate JSON from image |
| Agent 2 (prediction) | claude-haiku-4-5-20251001 | phi3.5 | Strong reasoning, fast, very cheap |
| Agent 3 (dispatch) | claude-haiku-4-5-20251001 | phi3.5 | Text generation, no vision needed |

### Why Haiku 4.5 over Sonnet?
- 10x cheaper ($0.80/MTok vs $3/MTok input)
- Fast enough for real-time hackathon demo
- Perfectly capable for structured JSON extraction and text generation
- Budget stays under $2 for full demo run

### Agent Chaining
Each agent's JSON output becomes the next agent's context input. This is a real agentic pipeline, not three isolated calls.

```
Photo → Gemini → base64 image
base64 image → Agent 1 → zone JSON
zone JSON + weather + history → Agent 2 → prediction JSON
prediction JSON → Agent 3 → rescue text
```

---

## 5. NPC BEHAVIORAL SYSTEM

### Student Types (maps to Snoblin sprite colors)

| Type | Color | Waste Probability | Speed | Behavior |
|------|-------|------------------|-------|----------|
| Regular | Default (gray) | 15% | 1.0x | Standard eat-and-leave |
| Vegetarian | Blue | 10% | 0.9x | Avoids hot food station |
| Eco | Green | 5% | 1.1x | Fastest eater, least waste |
| Athlete | Red | 20% | 1.4x | Takes most food, eats fast |
| Picky | Yellow | 35% | 0.8x | Most likely to abandon meal |

### State Machine
```
SPAWNING → ENTERING → AT_COUNTER → FINDING_SEAT → EATING
                                                      ↓
                                               (waste_prob roll each frame)
                                                      ↓
                                               ABANDONING → [waste event] → LEAVING
                                                      ↓
                                               LEAVING → SPAWNING (loop)
```

### Waste Event
- Fires ONCE per ABANDONING transition
- Adds `WASTE_PER_EVENT = 0.3kg` to `wasteToday`
- Triggers hurt animation on NPC
- Logs to event log with CO₂ impact
- Updates CO₂ overlay counter

### Agent 2 Behavioral Influence
When Agent 2 predicts HIGH risk:
- All NPC `waste_prob` values are multiplied by 1.5
- More frequent abandonment events
- Red flash on canvas
- Event log fills with warnings

---

## 6. DUAL MODE ARCHITECTURE

### Why dual mode?
- **Accessibility**: Schools in low-income areas often have no internet budget
- **Privacy**: Some schools won't send cafeteria photos to cloud APIs
- **Hackathon judging**: Demonstrates responsible AI and inclusive design thinking
- **Devpost disclosure**: Both modes must be listed under Tools Used

### Implementation
```javascript
async function callAI(system, user, imageB64=null) {
  return currentMode === 'local'
    ? callOllama(system, user, imageB64)   // phi3.5 or llama3.2-vision
    : callClaude(system, user, imageB64);  // claude-haiku-4-5-20251001
}
```

Single toggle button. Zero code changes. Same prompts. Same JSON schemas.

### Local Mode Limitations (disclosed in UI)
- Gemini image generation NOT available in local mode (requires internet)
- Vision analysis uses llama3.2-vision (needs 7GB VRAM)
- Prediction uses phi3.5 (needs 2.5GB VRAM) — fast on RTX 4070
- Agent 3 uses phi3.5 — output quality slightly lower than Haiku

---

## 7. RESPONSIBLE AI REQUIREMENTS

### Risk 1: Inaccurate predictions
**The risk**: Agent 2 predicts low waste risk on a day that actually has high waste. Manager reduces order. Students don't get enough food.

**Mitigation**: 
- Confidence percentage shown on every prediction (e.g. "87% confidence")
- `order_reduction` field is a *suggestion*, clearly labeled as such
- Human must always approve before any action is taken

### Risk 2: Biased historical data
**The risk**: Synthetic data reflects assumptions that may not match a specific school's culture or demographics (e.g., assuming Italian school eating patterns).

**Mitigation**:
- Data source disclosed in UI ("synthetic — based on typical European high school patterns")
- Manager can update meal types and event types via simple text fields
- System clearly states it improves with real historical data

### Human-in-the-Loop Design
**The AI does NOT decide to contact the shelter.** This is a hard rule.

Agent 3 drafts the message. The manager sees it in a modal with three options:
1. **Approve & Send** — logs the rescue, updates stats
2. **Edit First** — makes draft editable in-place before approving
3. **Cancel** — nothing happens, no record created

This is explicitly labeled in the UI: *"This decision belongs to you, not the AI."*

---

## 8. TECH STACK

### Frontend
- **HTML5 + Vanilla JavaScript** — no framework, no build step, runs in any browser
- **Canvas API** — game loop at 60fps via `requestAnimationFrame`
- **CSS3** — dark theme, flex layout, no external UI library

### AI APIs
- **Claude Haiku 4.5** (`claude-haiku-4-5-20251001`) — Agents 1, 2, 3
- **Gemini 2.0 Flash Image Generation** — pixel art map from photo
- **Ollama** (local mode) — phi3.5 + llama3.2-vision

### Data APIs
- **Open-Meteo** — live weather, free, no key required
- **Synthetic dataset** — 24 records spanning Dec 2025–June 2026, hardcoded in `data.js`

### Assets
- **Snoblin Prototype Characters** (itch.io, free) — student NPCs, 5 color variants
- **LimeZu Modern Interiors** (itch.io, free for non-commercial) — Adam manager character
- All assets disclosed in Devpost Tool & Data Disclosure section

---

## 9. FILE STRUCTURE

```
canteentycoon/
├── index.html              ← Full UI layout, modal, action bar
├── css/
│   └── style.css           ← Dark theme, sidebar, canvas, modal styling
├── js/
│   ├── config.js           ← API keys, constants, global state, mode toggle
│   ├── data.js             ← 24-record synthetic history, weather fetch, calendar
│   ├── agents.js           ← callAI(), callClaude(), callOllama(), Gemini gen,
│   │                          runAgent1(), runAgent2(), runAgent3(),
│   │                          triggerAgent1/2/3(), upload handler, modal logic
│   ├── npc.js              ← ZONES, applyZones(), StudentNPC class, ManagerNPC class,
│   │                          onHighRisk(), onRescueApproved()
│   ├── simulation.js       ← Canvas init, drawBackground(), drawZoneOverlays(),
│   │                          gameLoop(), spawnAll(), setBackground()
│   └── ui.js               ← logEvent(), updateStatsPanel(), updateWeeklyPanel(),
│                              window.onload init
└── assets/
    ├── snoblin/
    │   ├── Default/  walk.png idle.png hurt.png
    │   ├── Blue/     walk.png idle.png hurt.png
    │   ├── Green/    walk.png idle.png hurt.png
    │   ├── Red/      walk.png idle.png hurt.png
    │   └── Yellow/   walk.png idle.png hurt.png
    └── limezu/
        ├── Adam_run_16x16.png
        ├── Adam_idle_anim_16x16.png
        └── Adam_phone_16x16.png
```

---

## 10. CANVAS RENDERING SYSTEM

### Canvas Size
`1100 × 750px` — fills available viewport space after navbar and action bar

### Render Order (each frame)
1. `drawBackground()` — AI-generated pixel art OR dark placeholder screen
2. `drawZoneOverlays()` — optional semi-transparent zone labels (toggle button)
3. `manager.draw(ctx)` — Adam NPC, always on top of background
4. `npc.draw(ctx)` for each student — on top of background, behind nothing
5. Stats update every 30 frames

### Sprite Rendering

**Snoblin (students):**
- Source: 32×32px per frame from walk/idle/hurt spritesheets
- Render: 48×48px on canvas (1.5x scale)
- Row: always srcY=0 (facing south/viewer)
- Walk frames: 4 (srcX = 0, 32, 64, 96)
- Idle/hurt frames: 2 (srcX = 0, 32)
- State dot: 4px circle above NPC head, color = current state

**Adam (manager):**
- Source: 16×16px per frame
- Render: 48×48px on canvas (3x scale)
- Patrol mode: walk east/west along serving line
  - East: frames 12-15 (srcX = 192, 208, 224, 240)
  - West: frames 8-11 (srcX = 128, 144, 160, 176)
- Phone mode: Adam_phone_16x16.png, all 9 frames (5 seconds after rescue approved)
- Label: "👔 Manager" in gold above head

---

## 11. ZONES SYSTEM

### Default zones (before Agent 1 runs)
```javascript
ZONES = {
  serving:  { x:55,  y:90,  w:780, h:55  },
  seating:  { x:55,  y:185, w:900, h:440 },
  bins:     [{ x:970, y:550 }, { x:970, y:610 }],
  entrance: { x:400, y:700, w:200, h:40  },
}
```

### After Agent 1 runs
Agent 1 returns coordinates in 512×512 pixel space (Gemini image size).
These are scaled to canvas coordinates:
```javascript
const sx = CANVAS_W / 512; // 1100/512 ≈ 2.148
const sy = CANVAS_H / 512; // 750/512  ≈ 1.465
```

NPC pathfinding updates immediately. Manager NPC repositions to new serving zone.

---

## 12. SYNTHETIC DATA

### Source
24 historical records spanning Dec 2025 – Jun 2026.
Designed to demonstrate clear, learnable patterns:

| Condition | Avg Waste | Risk |
|-----------|-----------|------|
| Cold + pasta + exam week | 14–16 kg | HIGH |
| Sports day (any meal) | 7–9 kg | MEDIUM-HIGH |
| Rainy + normal | 4–5 kg | MEDIUM |
| Sunny + salad | 0.8–1.5 kg | LOW |
| Holiday special | 11–12 kg | HIGH |

### Why synthetic?
- Brief explicitly says synthetic data is acceptable and expected
- Judges reward thoughtful assumptions over no data
- No privacy risk from real school data
- Fully disclosed in Devpost Data Disclosure section

---

## 13. DEVPOST SUBMISSION FIELDS

### Project Description
CanteenTycoon AI turns a single cafeteria photo into a living simulation. A cafeteria manager uploads their photo, AI generates a pixel art twin of that exact space, student NPCs walk the map with behavior driven by weather and calendar data, and three chained AI agents predict food waste before it happens and draft a rescue message to a local shelter — which the manager must approve before anything is sent.

### AI Architecture Explanation
- **Input**: Cafeteria photo + live weather (Open-Meteo) + school calendar + 6-month synthetic waste history
- **Agent 1 (Vision Mapper)**: Gemini generates pixel art from photo; Claude Vision analyzes zones → JSON
- **Agent 2 (Waste Predictor)**: Claude Haiku detects patterns across all inputs → risk level, predicted kg, CO₂, recommendation
- **Agent 3 (Rescue Dispatcher)**: Claude Haiku drafts shelter pickup request from prediction data → plain text
- **Output**: Live simulation + waste prediction dashboard + rescue message draft

### Human-in-the-Loop Design
The AI does NOT contact the shelter. Agent 3 only drafts a message. The cafeteria manager must open the approval modal, read the full draft, review the stats (kg, CO₂, meals), and explicitly click "Approve & Send." They can also edit the draft first. If they cancel, nothing is logged. The decision is always the manager's.

### Responsible AI Guardrail
**Risk**: Agent 2 could predict low waste on a high-waste day, causing under-ordering.
**Mitigation**: Every prediction shows a confidence percentage and clearly labels the order reduction as a "suggestion." The system never acts autonomously. The manager always decides. The UI displays this warning: "AI predictions have uncertainty. Always use your local knowledge."

### Decision Impact Statement
**Before CanteenTycoon AI**: Mr. Davis orders by gut feeling. He discovers the 12kg pasta surplus at 2pm, too late for the shelter. Food goes in the bin. CO₂ emitted. Budget wasted. Shelter doesn't receive food it needed.

**After CanteenTycoon AI**: At 8am, Mr. Davis opens the app. Agent 2 flags HIGH risk for Tuesday pasta. Agent 3 drafts a shelter pickup message. Mr. Davis approves it, adjusts his order, and the shelter confirms pickup. 10kg reaches families who needed it. 30kg CO₂ stays out of the atmosphere.

### Tools Used
- Claude Haiku 4.5 API (`claude-haiku-4-5-20251001`) — paid, cloud
- Gemini 2.0 Flash Image Generation API — free tier
- Open-Meteo Weather API — free, no key
- Ollama (local mode) — free, open source
- phi3.5 via Ollama — free, open source
- llama3.2-vision via Ollama — free, open source
- Snoblin Prototype Characters — free, itch.io
- LimeZu Modern Interiors Free — free, itch.io
- Claude (Anthropic) — used to assist in code architecture planning

### Data Disclosure
All data is synthetic. A 24-record dataset spanning December 2025 – June 2026 was designed to represent a typical European high school cafeteria (80–140 students/day). Records include: date, weather condition, temperature, school event type, meal type, portions served, kg wasted, kg rescued. Dataset was created by hand based on real-world food waste research patterns from ReFED and WRAP. Live weather data is fetched in real-time from Open-Meteo (free, public API). No real student, school, or personal data is used or stored.

---

## 14. 7-DAY BUILD TIMELINE

| Day | Date | Tasks | Owner |
|-----|------|-------|-------|
| 1 | Jun 15 | index.html + style.css + config.js + assets placed | Both |
| 2 | Jun 16 | npc.js (StudentNPC + ManagerNPC) + simulation.js game loop | Dev 1 |
| 2 | Jun 16 | agents.js (callClaude + callOllama + Gemini gen) + data.js | Dev 2 |
| 3 | Jun 17 | Agent 1 end-to-end: photo → Gemini → pixel art → Claude zones | Both |
| 4 | Jun 18 | Agent 2 end-to-end: weather + history → prediction JSON | Dev 2 |
| 4 | Jun 18 | NPC behavior influenced by Agent 2 output | Dev 1 |
| 5 | Jun 19 | Agent 3 + approval modal + human-in-the-loop flow | Both |
| 6 | Jun 20 | Polish: UI, event log, CO₂ counter, weekly impact panel | Dev 1 |
| 6 | Jun 20 | Devpost submission text + local mode testing | Dev 2 |
| 7 | Jun 21 | Demo video recording + final submission by 11:59 PM ET | Both |

---

## 15. KNOWN RISKS & MITIGATIONS

| Risk | Likelihood | Impact | Mitigation |
|------|-----------|--------|------------|
| Gemini image gen unavailable/changed | Medium | High | Show dark placeholder, skip to Agent 2 |
| Claude API rate limit during demo | Low | High | Local mode fallback (Ollama) |
| Snoblin hurt.png missing in some colors | Medium | Low | Fallback to idle anim on abandon |
| Agent 1 returns invalid JSON | Medium | Medium | try/catch with hardcoded default zones |
| Agent 2 returns invalid JSON | Low | High | try/catch + error display in sidebar |
| Canvas performance on older hardware | Low | Low | NPCs capped at 10, 60fps target |
| CORS issues with Ollama | Medium | Medium | Document OLLAMA_ORIGINS=* in README |

---

## 16. SUCCESS CRITERIA

### Must have (submission blockers)
- [ ] NPCs walking on canvas with animation
- [ ] Agent 2 returns valid prediction JSON
- [ ] Agent 3 returns rescue text
- [ ] Approval modal with 3 options
- [ ] CO₂ counter visible and updating
- [ ] Cloud/local toggle working

### Should have (score boosters)
- [ ] Agent 1 generating real pixel art from photo
- [ ] Zone overlays matching generated map
- [ ] Manager NPC patrolling serving line
- [ ] onHighRisk() red flash animation
- [ ] onRescueApproved() phone animation
- [ ] Weekly impact panel with CO₂ equivalence

### Nice to have (if time allows)
- [ ] NPC waste_prob multiplied when Agent 2 returns HIGH risk
- [ ] Edit-in-place for rescue draft
- [ ] Local mode fully tested end-to-end
- [ ] Smooth NPC spawn stagger

---

*CanteenTycoon AI — USAII Global AI Hackathon 2026*
*"Making food waste visible, predictable, and rescuable — one cafeteria at a time."*
