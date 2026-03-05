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

This is a React + Vite single-page game. No routing library — screen transitions are handled by conditional rendering in `App.jsx` via a single `selection` state (`null` = character select screen, object = game screen).

### Screen flow

```
App
 ├── CharacterSelect  (selection === null)
 └── Game             (selection !== null)
       props: { character, difficulty, onBack }
```

### State management

All state is local React state — no global store. Game physics state lives in `stateRef` (a plain mutable object accessed inside the `requestAnimationFrame` loop) to avoid triggering re-renders on every frame. React `useState` is only used for `score`, `best`, and `phase` (the values that need to update the UI).

### Game loop

`Game.jsx` runs a single `requestAnimationFrame` loop inside a `useEffect` that re-mounts when `phase` changes. The loop reads/writes `stateRef.current` directly for physics, and calls `setScore`/`setPhase` sparingly for UI updates.

### Data that persists across sessions

Best scores are saved to `localStorage` with keys `best_easy`, `best_normal`, `best_hard`. No other persistence.

### Key constants in `Game.jsx`

| Constant | Value | Purpose |
|----------|-------|---------|
| `W / H` | 1000 / 420 | Canvas dimensions |
| `GROUND_Y` | 350 | Y position of ground surface |
| `PLAYER_SIZE` | 55 | Emoji font size = hitbox reference |
| `DIFF_SETTINGS` | object | Per-difficulty speed/interval/spawn config |

### Obstacle system

Each obstacle is a plain object `{ kind, frame, x, y, w, h }`. The `frame` counter increments each tick and drives animations (bird wing flap, fire flicker). Five kinds: `rock`, `cactus`, `bird`, `spike`, `fire`. Birds spawn mid-air; all others spawn at ground level.

### Background theming

Background changes based on `s.score` inside `drawBackground()`:
- `< 35` → day (blue sky, sun)
- `35–69` → sunset (red/orange sky, half-sun at horizon)
- `≥ 70` → night (dark sky, twinkling stars, crescent moon)

### Character & difficulty data

Both are defined as module-level constants in their respective files:
- `CHARACTERS` in `CharacterSelect.jsx` — 16 emoji characters in two tabs (animals / heroes)
- `DIFFICULTIES` in `CharacterSelect.jsx` — 3 levels; `DIFF_SETTINGS` in `Game.jsx` holds the numeric tuning values keyed by `difficulty.id`
