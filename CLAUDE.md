# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Commands

```bash
npm run dev      # Start dev server at http://localhost:5173
npm run build    # Production build
npm run preview  # Preview production build
npm run lint     # Run ESLint
```

No test framework is set up.

## Architecture

React + Vite single-page game. No routing — screen transitions are handled by conditional rendering in `App.jsx` via a single `selection` state (`null` = character select, object = game).

### Screen flow

```
App
 ├── CharacterSelect  (selection === null)
 └── Game             (selection !== null)
       props: { character, difficulty, onBack }
```

### State management

All state is local React state — no global store. Game physics live in `stateRef` (plain mutable object accessed inside `requestAnimationFrame`) to avoid re-renders every frame. `useState` is only used for `score`, `best`, and `phase` (UI-visible values).

Key refs in `Game.jsx`:
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

All styles are inline JS objects (no CSS modules or Tailwind). Both screens share the same design language:
- Background: `#0f0f1e`
- Cards: `background: #1e1e2e`, `border: 2px solid #333`, `borderRadius: 14`
- Title: `color: #FFD700`, `textShadow` glow
- All sizes use `clamp()` for mobile responsiveness
- Canvas scales via CSS `width: 100%; height: auto` — internal resolution stays 1000×420
