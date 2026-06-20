---
name: CanteenTycoon AI
colors:
  surface: '#faf8ff'
  surface-dim: '#d2d9f4'
  surface-bright: '#faf8ff'
  surface-container-lowest: '#ffffff'
  surface-container-low: '#f2f3ff'
  surface-container: '#eaedff'
  surface-container-high: '#e2e7ff'
  surface-container-highest: '#dae2fd'
  on-surface: '#131b2e'
  on-surface-variant: '#3c4a42'
  inverse-surface: '#283044'
  inverse-on-surface: '#eef0ff'
  outline: '#6c7a71'
  outline-variant: '#bbcabf'
  surface-tint: '#006c49'
  primary: '#006c49'
  on-primary: '#ffffff'
  primary-container: '#10b981'
  on-primary-container: '#00422b'
  inverse-primary: '#4edea3'
  secondary: '#b61722'
  on-secondary: '#ffffff'
  secondary-container: '#da3437'
  on-secondary-container: '#fffbff'
  tertiary: '#855300'
  on-tertiary: '#ffffff'
  tertiary-container: '#e29100'
  on-tertiary-container: '#523200'
  error: '#ba1a1a'
  on-error: '#ffffff'
  error-container: '#ffdad6'
  on-error-container: '#93000a'
  primary-fixed: '#6ffbbe'
  primary-fixed-dim: '#4edea3'
  on-primary-fixed: '#002113'
  on-primary-fixed-variant: '#005236'
  secondary-fixed: '#ffdad7'
  secondary-fixed-dim: '#ffb3ad'
  on-secondary-fixed: '#410004'
  on-secondary-fixed-variant: '#930013'
  tertiary-fixed: '#ffddb8'
  tertiary-fixed-dim: '#ffb95f'
  on-tertiary-fixed: '#2a1700'
  on-tertiary-fixed-variant: '#653e00'
  background: '#faf8ff'
  on-background: '#131b2e'
  surface-variant: '#dae2fd'
  deep-slate-navy: '#0f172a'
  surface-bg: '#f1f5f9'
  surface-card: '#ffffff'
  on-surface-muted: '#3c4a42'
  on-surface-main: '#131b2e'
typography:
  display-lg:
    fontFamily: VT323
    fontSize: 52px
    fontWeight: '400'
    lineHeight: '1.1'
    letterSpacing: 0.08em
  headline-md:
    fontFamily: VT323
    fontSize: 26px
    fontWeight: '400'
    lineHeight: '1.2'
    letterSpacing: 0.02em
  body-lg:
    fontFamily: Plus Jakarta Sans
    fontSize: 18px
    fontWeight: '700'
    lineHeight: '1.5'
  body-md:
    fontFamily: Plus Jakarta Sans
    fontSize: 14px
    fontWeight: '500'
    lineHeight: '1.6'
  label-lg:
    fontFamily: Plus Jakarta Sans
    fontSize: 14px
    fontWeight: '800'
    lineHeight: '1.2'
    letterSpacing: 0.05em
  label-md:
    fontFamily: Plus Jakarta Sans
    fontSize: 12px
    fontWeight: '800'
    lineHeight: '1.2'
    letterSpacing: 0.02em
spacing:
  xs: 8px
  sm: 16px
  md: 24px
  lg: 40px
  border-width: 4px
  shadow-offset: 6px
---

## Brand & Style
CanteenTycoon AI is a high-energy simulation engine that blends industrial efficiency with a playful, nostalgic aesthetic. The brand personality is "Technical Whimsy"—it feels like a professional engineering tool found inside a 90s arcade cabinet. 

The design style is **Neo-Brutalism mixed with Pixel Art**. It utilizes heavy, high-contrast borders, deliberate "stepping" in animations, and a tactile, physical UI that prioritizes clarity and "crunchy" visual feedback. The goal is to make complex data simulation feel like a high-stakes, rewarding game.

## Colors
The palette is rooted in a high-contrast foundation of **Deep Slate Navy** (#0f172a) and **Cool Slate Grey** (#f1f5f9). 

- **Primary (Game Emerald):** #10b981. Used for positive actions, "active" states, and primary brand elements.
- **Secondary (Warning Crimson):** #ef4444. Reserved for high-alert metrics like CO2 levels or critical errors.
- **Tertiary (Warning Gold):** #f59e0b. Used for moderate warnings or specialized data highlights.
- **Surface Strategy:** Surfaces are predominantly white (#ffffff) to ensure readability, framed by the neutral navy border to create depth.

## Typography
The system uses a dual-font approach to separate "Meta/Game" data from "Instructional/UI" data.

- **Headlines & Display:** Uses **VT323**. This monospaced pixel font is used for brand titles, primary metrics, and any text that represents "live" simulation data. It should always be uppercase for display roles.
- **UI & Labels:** Uses **Plus Jakarta Sans**. A clean, contemporary sans-serif used for readability in forms, buttons, and descriptions. High font-weights (700-800) are preferred to match the heavy stroke-weight of the UI's borders.

## Layout & Spacing
The layout follows a **Fixed Sidebar / Fluid Content** model. 

- **Grid:** A rigid 12-column system is used within content areas, but the primary structure is defined by heavy-bordered panels.
- **Rhythm:** Spacing increments are strictly 8px-based. 
- **Breakpoints:**
  - **Desktop:** Sidebar is fixed at 380px. Main content area expands.
  - **Tablet:** Sidebar collapses into a slide-out drawer.
  - **Mobile:** Single column stack. Headline font sizes for `display-lg` scale down to 36px (`display-lg-mobile`).

## Elevation & Depth
Elevation is achieved through **Hard-Edge Isometric Shadows** rather than blurs.

- **The "Tactile" Rule:** Elements do not "float" using light sources; they "extrude" using solid blocks of color.
- **Shadows:** Use a solid offset of `6px 6px 0px 0px` in the neutral navy color.
- **State Changes:** On hover, the shadow offset increases to 8px while the element translates -2px (up/left). On active (click), the shadow shrinks to 2px while the element translates +4px (down/right), simulating a physical button press.
- **Outlines:** Every interactive or containing element must have a solid 4px border in the neutral navy color.

## Shapes
The shape language is strictly **Geometric and Sharp**. 

- **Corner Radius:** 0px globally. Roundness is considered "low-resolution" in this aesthetic.
- **Pixel Corners:** Decorative containers use "cut-out" corner accents—artificial 16x16px L-brackets that reinforce the tech-heavy, architectural look.
- **Interactive Elements:** Buttons and Inputs are sharp-edged rectangles.

## Components

### Buttons
- **Primary:** Emerald background, 4px Navy border, 6px Navy hard shadow. Text is white, bold, and uses `label-lg`.
- **Secondary:** White background, 4px Navy border, 6px Navy hard shadow. Text is Navy.
- **Icon Buttons:** Square 1:1 aspect ratio with centered Material Symbols.

### Cards (Tactile-Card)
- All cards have a white background and 4px border.
- **Header-Strips:** High-priority cards (like main metrics) include an 8px top border in the category's accent color (e.g., Crimson for CO2).

### Progress & Gauges
- Progress bars are "Chunky." They use a 4px Navy border and a solid color fill (no gradients). 
- The fill should not have rounded caps.

### Inputs & Dropzones
- **Dropzones:** Use dashed 4px borders with centered display icons.
- **Text Inputs:** White background, Navy border, 4px shadow offset.

### Simulation Feedback
- **Blinking Dot:** Used for "Live" status indicators. 12x12px square, emerald color, steps(2) animation.
- **Sparkles:** Small 8x8px polygon-clipped emerald shapes used for ambient celebratory "twinkle" effects.