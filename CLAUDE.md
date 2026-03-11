# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Working Rules

- Never ask the user to paste full files
- Search before reading files (Grep/Glob)
- Read only the necessary sections
- Avoid reading entire files unless necessary

- Do not rewrite entire files
- Return minimal patches or diffs
- Do not reformat unrelated code
- Preserve existing code style

- Prefer working from git diff
- Focus only on relevant code

- Avoid long explanations
- Code first, explanation optional

## Commands

```bash
npm run dev      # Start dev server at http://localhost:5173
npm run build    # Production build
npm run preview  # Preview production build
npm run lint     # Run ESLint
```

No test framework is set up.

## Architecture

React + Vite single-page app. No routing — screen transitions are handled by conditional rendering in `App.jsx` via `gameId` state.

### Screen flow

```
App
 ├── GameSelect          (gameId === null)
 ├── JumpGame            (gameId === 'jump')
 ├── SnakeGame           (gameId === 'snake')
 ├── SpaceGame           (gameId === 'space')
 ├── MatchGame           (gameId === 'match')
 ├── PlatformGame        (gameId === 'platform')
 ├── FishingGame         (gameId === 'fishing')
 ├── WaveGame            (gameId === 'wave')
 └── WhackGame           (gameId === 'mole')
```

### Adding a new game

1. Copy `src/components/GameTemplate.jsx` → `src/components/YourGame.jsx`
2. Fill in the 6 `TODO` comments (GAME_ID, canvas size, DIFF_SETTINGS, update/collision/draw logic)
3. Add entry to `GAMES` array in `GameSelect.jsx` with `available: true`
4. Import and add to the `gameProps` block in `App.jsx`: `else if (gameId === 'your-id') screen = <YourGame {...gameProps} />`
5. Call `onStart?.()` at the top of `startGame()` in your game component

### Game component interface

All games receive `{ onBack, onStart }` props from App.jsx via `gameProps`:
- `onBack` — navigate back to game select
- `onStart` — call at the start of `startGame()` (triggers version check and any future app-level hooks)

### Shared utilities (`src/utils/gameUtils.js`)

Import from here instead of writing boilerplate each time:

```js
import { getBest, saveBest, getSavedDiff, saveDiff,
         drawEmoji, drawText, fillRoundRect, fillCircle,
         dist, randInt, clamp, hitRect, hitCircle,
         COLORS, STYLES } from '../utils/gameUtils'
```

| Export | Purpose |
|--------|---------|
| `getBest(gameId, diffId)` | localStorage 베스트 스코어 읽기 |
| `saveBest(gameId, diffId, score)` | 갱신 시에만 저장, `true` 반환 |
| `getSavedDiff(gameId, diffs)` | 저장된 난이도 객체 반환 |
| `saveDiff(gameId, diffId)` | 난이도 저장 |
| `drawEmoji(ctx, emoji, x, y, size, glow?)` | 이모지 그리기 |
| `drawText(ctx, text, x, y, opts?)` | 텍스트 그리기 |
| `fillRoundRect / fillCircle` | 도형 단축 |
| `dist / randInt / clamp` | 수학 유틸 |
| `hitRect(a, b) / hitCircle(...)` | 충돌 감지 |
| `COLORS` | 디자인 토큰 (bg, card, gold, border, muted) |
| `STYLES` | 공통 인라인 스타일 (root, header, canvas, overlay, hud 등) |

localStorage 키 규칙: `{gameId}_best_{diffId}`, `{gameId}_diff`

### State management

All state is local React state — no global store. Game physics live in `stateRef` (plain mutable object accessed inside `requestAnimationFrame`) to avoid re-renders every frame. `useState` is only used for `score`, `best`, and `phase` (UI-visible values).

Key refs in `JumpGame.jsx`:
- `stateRef` — all physics/game state (player, obstacles, fruits, speed, score, frame)
- `canvasRef` — the `<canvas>` element
- `canvasWrapRef` — the wrapper div; touch and click handlers are attached here (not on canvas) so overlays don't block input
- `gameOverAtRef` — timestamp of last game over; used to enforce 0.8s restart cooldown
- `animRef` — the `requestAnimationFrame` handle

### Game loop

Single `requestAnimationFrame` loop in a `useEffect` that re-mounts when `phase` changes (`idle` | `playing` | `gameover`). The loop reads/writes `stateRef.current` directly and calls `setScore`/`setPhase` sparingly.

### Input handling

- Keyboard: `window` keydown listener (Space / ArrowUp)
- Touch/click: non-passive `touchstart` + `onClick` both on `canvasWrapRef` — **not** on the canvas itself, because overlays cover the canvas in idle/gameover phases
- Restart cooldown: `gameOverAtRef` prevents accidental restart when spacebar/touch is held through the moment of death

### Key constants in `Game.jsx`

| Constant | Value | Purpose |
|----------|-------|---------|
| `W / H` | 1000 / 420 | Canvas dimensions |
| `GROUND_Y` | 350 | Y position of ground surface |
| `PLAYER_SIZE` | 55 | Emoji font size = hitbox reference |
| `GRAVITY / JUMP_FORCE` | 0.65 / -15 | Physics tuning |
| `DIFF_SETTINGS` | object | Per-difficulty speed/interval/spawn config |
| `FRUIT_HEIGHTS` | [305, 270, 230] | Spawn Y positions for fruits (reachable without hard jumps) |

### Obstacle system

Each obstacle is `{ kind, frame, x, y, w, h }`. The `frame` counter drives animations (bird wing flap, fire flicker). Five kinds: `rock`, `cactus`, `bird`, `spike`, `fire`. Birds spawn mid-air; all others at ground level. `pickKind(score)` controls which kinds appear based on current score.

### Fruit system

Fruits (`FRUITS` array of emoji) spawn on a separate timer (`fruitTimer` / `nextFruitInterval` in `stateRef`), every ~200–300 frames. They are plain objects `{ emoji, x, y, w, h, frame }` and use the same movement/collision logic as obstacles, but collecting them adds +10 to `s.score` and spawns a popup. Heights are limited to `FRUIT_HEIGHTS` so they are always reachable.

### Background theming

`drawBackground()` switches based on `s.score`:
- `< 35` — day (blue sky, sun)
- `35–69` — sunset (red/orange sky)
- `≥ 70` — night (dark sky, stars, crescent moon)

### Character & difficulty data

- `CHARACTERS` in `CharacterSelect.jsx` — 16 emoji characters, two tabs (animals / heroes)
- `DIFFICULTIES` in `CharacterSelect.jsx` — 3 levels; `DIFF_SETTINGS` in `Game.jsx` holds numeric tuning keyed by `difficulty.id`
- Best scores: `localStorage` keys `best_easy`, `best_normal`, `best_hard`

### Styling

All styles are inline JS objects (no CSS modules or Tailwind). Common tokens and style objects live in `COLORS` / `STYLES` from `gameUtils.js`. Game-specific styles extend `STYLES` with spreads:

```js
const S = { ...STYLES, myCustomStyle: { ... } }
```

Design language:
- Background: `#0f0f1e` (`COLORS.bg`)
- Cards: `#1e1e2e` / `border: 2px solid #333` (`COLORS.card` / `COLORS.border`)
- Title: `#FFD700` glow (`COLORS.gold`)
- All sizes use `clamp()` for mobile responsiveness
- Canvas scales via CSS `width: 100%; height: auto`

---

## SnakeGame.jsx

### Overview

Full-screen canvas snake game. World is 2400×2400; viewport follows the player. 20 AI snakes + 1 player. Eat smaller snakes to grow; larger snakes kill you.

### Key constants

| Constant | Value | Purpose |
|----------|-------|---------|
| `W_W / W_H` | 2400 / 2400 | World dimensions |
| `SEG_R` | 9 | Segment radius (px) |
| `SEG_GAP` | 13 | Center-to-center segment spacing |
| `MAX_TURN` | 0.072 | Max radians/frame steering |
| `NUM_AI` | 20 | Number of AI snakes |
| `INIT_LEN` | 8 | Starting snake length |
| `DIFFICULTIES` | array | Per-difficulty speed/food/AI config |

### State pattern

Same `stateRef` pattern as Game.jsx — all mutable game state in a plain object, `useState` only for `score`, `best`, `phase`, `aliveCount`, `playerLen`, `playerColor`, `difficulty`.

Key refs: `canvasRef`, `wrapRef`, `stateRef`, `animRef`, `keysRef`, `pointerRef`, `joyRef`, `joyKnobRef`, `joyContainerRef`

### Snake object shape

`{ segs: [{x,y}...], targetLen, angle, color, isPlayer, alive, aiTimer, aiAngle }`

### Controls

- **Desktop**: ← → arrow keys / A D, mouse direction following
- **Mobile**: dynamic virtual joystick (appears at touch point, disappears on lift)
- Touch events are on `wrapRef` via native `addEventListener({ passive: false })` to prevent scroll

### AI behavior

Every `aiTimer` frames: scan nearby snakes, chase smaller ones within `aiChaseRange`, flee from larger ones within `aiFleeRange`, wander otherwise. Wall avoidance near borders. Respawn length = player length ±15%.

### Difficulty settings (`DIFFICULTIES` array)

Each entry: `{ id, label, emoji, color, speed, foodCount, aiChaseRange, aiFleeRange, aiTimerMin, aiTimerMax }`
Best scores: `localStorage` keys `snake_best_easy`, `snake_best_normal`, `snake_best_hard`

### Player preferences

- Color: `localStorage` key `snake_color`
- Difficulty: `localStorage` key `snake_diff`

---

## PlatformGame.jsx

### Overview

Portrait canvas (480×700) Doodle Jump-style game. Player auto-bounces on platforms and climbs upward. Camera follows player. 12 selectable characters, 20 AI-free.

### Key constants

| Constant | Value | Purpose |
|----------|-------|---------|
| `W / H` | 480 / 700 | Canvas dimensions (portrait) |
| `GRAVITY` | 0.38 | Downward acceleration per frame |
| `JUMP_VY` | -13 | Vertical velocity on platform bounce |
| `PLAT_H` | 12 | Platform height |
| `PLAYER_FEET` | 14 | Feet offset from center (collision) |
| `CAM_THRESH` | H×0.38 | Camera scrolls when player above this screen Y |
| `MOVE_SPD` | 4.5 | Horizontal move speed |

### State pattern

Same `stateRef` pattern — mutable game state in plain object, `useState` only for `score`, `best`, `phase`.

Key refs: `canvasRef`, `wrapRef`, `stateRef`, `animRef`, `keysRef`, `touchRef`, `characterRef`

`characterRef` keeps character in sync without restarting the game loop (not in `useEffect` deps).

### Platform object shape

`{ x, y, w, vx, dir }` — `vx=0` = static (green), `vx≠0` = moving (red)

### Coordinate system

- World Y increases downward. `worldTop` = world Y at screen top (goes negative as player rises).
- `screenY = worldY - worldTop`
- Score = `Math.floor(-worldTop / 8)` (층 단위)

### Controls

- **Desktop**: ← → / A D keys
- **Mobile**: touch left half → left, touch right half → right
- Touch handler checks `e.target.closest('button')` before `e.preventDefault()` (both touchstart and touchend) to allow overlay button taps

### Difficulty settings

Each entry: `{ id, label, emoji, color, gapY, platWMin, platWMax, movingChance, moveSpd }`
Best scores: `localStorage` keys `platform_best_easy`, `platform_best_normal`, `platform_best_hard`

### Player preferences

- Character: `localStorage` key `platform_char`
- Difficulty: `localStorage` key `platform_diff`

### Background theming

`draw()` switches gradient by height (`-worldTop`):
- `< 1000` — 낮 (sky blue)
- `1000–3000` — 노을 (orange)
- `≥ 3000` — 밤 (dark + stars)

Gradient is cached in `bgCache` module-level object; recreated only when threshold level changes.
