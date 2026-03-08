import { useState, useRef, useEffect } from 'react'

const COLS = 8
const ROWS = 8
const MAX_MOVES = 30
const GEMS = ['🔴', '🟠', '🟡', '🟢', '🔵', '🟣']
const GEM_BG = [
  'rgba(255,60,60,0.28)',  'rgba(255,140,0,0.28)',  'rgba(255,220,0,0.28)',
  'rgba(60,200,60,0.28)',  'rgba(60,140,255,0.28)', 'rgba(180,60,255,0.28)',
]
const GEM_GLOW = ['#ff6060', '#ff9020', '#ffe060', '#60d060', '#6090ff', '#c060ff']

let _nextId = 1
function mkId() { return _nextId++ }
function rnd() { return Math.floor(Math.random() * GEMS.length) }
function mkCell(color, kind = 'normal') { return { color, kind, id: mkId() } }
function cellIdx(r, c) { return r * COLS + c }
function cellPos(i) { return { r: Math.floor(i / COLS), c: i % COLS } }
function inBounds(r, c) { return r >= 0 && r < ROWS && c >= 0 && c < COLS }

function wouldMatch(g, r, c, color) {
  const h1 = c >= 1 ? g[cellIdx(r, c - 1)] : null
  const h2 = c >= 2 ? g[cellIdx(r, c - 2)] : null
  const v1 = r >= 1 ? g[cellIdx(r - 1, c)] : null
  const v2 = r >= 2 ? g[cellIdx(r - 2, c)] : null
  if (h1?.color === color && h2?.color === color) return true
  if (v1?.color === color && v2?.color === color) return true
  return false
}

function makeGrid() {
  const g = new Array(ROWS * COLS)
  for (let i = 0; i < ROWS * COLS; i++) {
    const { r, c } = cellPos(i)
    let color, tries = 0
    do { color = rnd(); tries++ } while (tries < 20 && wouldMatch(g, r, c, color))
    g[i] = mkCell(color)
  }
  return g
}

function findMatches(g) {
  const groups = []
  for (let r = 0; r < ROWS; r++) {
    let c = 0
    while (c < COLS) {
      const cell = g[cellIdx(r, c)]
      if (!cell || cell.kind !== 'normal') { c++; continue }
      let len = 1
      while (c + len < COLS) {
        const nx = g[cellIdx(r, c + len)]
        if (nx && nx.kind === 'normal' && nx.color === cell.color) len++
        else break
      }
      if (len >= 3) groups.push({ cells: Array.from({ length: len }, (_, i) => ({ r, c: c + i })), dir: 'h', color: cell.color, len })
      c += len
    }
  }
  for (let c = 0; c < COLS; c++) {
    let r = 0
    while (r < ROWS) {
      const cell = g[cellIdx(r, c)]
      if (!cell || cell.kind !== 'normal') { r++; continue }
      let len = 1
      while (r + len < ROWS) {
        const nx = g[cellIdx(r + len, c)]
        if (nx && nx.kind === 'normal' && nx.color === cell.color) len++
        else break
      }
      if (len >= 3) groups.push({ cells: Array.from({ length: len }, (_, i) => ({ r: r + i, c })), dir: 'v', color: cell.color, len })
      r += len
    }
  }
  return groups
}

// Returns { g, freshIds } — freshIds contains ids of newly created cells
function applyGravity(g) {
  const newG = [...g]
  const freshIds = new Set()
  for (let c = 0; c < COLS; c++) {
    const col = []
    for (let r = ROWS - 1; r >= 0; r--) {
      if (newG[cellIdx(r, c)] !== null) col.push(newG[cellIdx(r, c)])
    }
    for (let r = ROWS - 1; r >= 0; r--) {
      const ci = ROWS - 1 - r
      if (ci < col.length) {
        newG[cellIdx(r, c)] = col[ci]
      } else {
        const cell = mkCell(rnd())
        newG[cellIdx(r, c)] = cell
        freshIds.add(cell.id)
      }
    }
  }
  return { g: newG, freshIds }
}

function activateAt(g, i) {
  const { r, c } = cellPos(i)
  const cell = g[i]
  const newG = [...g]
  newG[i] = null
  if (!cell) return newG
  if (cell.kind === 'hline') for (let cc = 0; cc < COLS; cc++) newG[cellIdx(r, cc)] = null
  else if (cell.kind === 'vline') for (let rr = 0; rr < ROWS; rr++) newG[cellIdx(rr, c)] = null
  else if (cell.kind === 'bomb') {
    for (let dr = -1; dr <= 1; dr++) for (let dc = -1; dc <= 1; dc++) {
      if (inBounds(r + dr, c + dc)) newG[cellIdx(r + dr, c + dc)] = null
    }
  }
  return newG
}

function activateSpecialSwap(g, posA, posB) {
  const a = g[posA], b = g[posB]
  let newG = [...g]
  if (a?.kind === 'rainbow' || b?.kind === 'rainbow') {
    const rainbowPos = a?.kind === 'rainbow' ? posA : posB
    const partnerPos = rainbowPos === posA ? posB : posA
    const partner = newG[partnerPos]
    newG[rainbowPos] = null
    if (partner?.kind === 'rainbow') {
      for (let i = 0; i < newG.length; i++) newG[i] = null
    } else {
      const targetColor = partner?.color ?? 0
      for (let i = 0; i < newG.length; i++) {
        if (newG[i]?.color === targetColor) newG[i] = null
      }
      if (partner?.kind !== 'normal') newG = activateAt(newG, partnerPos)
      else newG[partnerPos] = null
    }
    return newG
  }
  if (a?.kind !== 'normal') newG = activateAt(newG, posA)
  if (b?.kind !== 'normal') newG = activateAt(newG, posB)
  return newG
}

// Compute which cells a special swap will clear, and the dominant kind for animation
function getSpecialAnimInfo(g, posA, posB) {
  const a = g[posA], b = g[posB]
  const cleared = new Set()
  let kind = 'bomb'
  if (a?.kind === 'rainbow' || b?.kind === 'rainbow') {
    kind = 'rainbow'
    const rainbowPos = a?.kind === 'rainbow' ? posA : posB
    const partnerPos = rainbowPos === posA ? posB : posA
    const partner = g[partnerPos]
    cleared.add(rainbowPos)
    if (partner?.kind === 'rainbow') {
      for (let i = 0; i < g.length; i++) { if (g[i]) cleared.add(i) }
    } else {
      for (let i = 0; i < g.length; i++) { if (g[i]?.color === (partner?.color ?? 0)) cleared.add(i) }
      cleared.add(partnerPos)
    }
  } else {
    const specs = []
    if (a?.kind !== 'normal') specs.push({ k: a.kind, pos: posA })
    if (b?.kind !== 'normal') specs.push({ k: b.kind, pos: posB })
    kind = specs.length === 1 ? specs[0].k : 'bomb'
    specs.forEach(({ k, pos }) => {
      cleared.add(pos)
      const { r, c } = cellPos(pos)
      if (k === 'hline') for (let cc = 0; cc < COLS; cc++) cleared.add(cellIdx(r, cc))
      else if (k === 'vline') for (let rr = 0; rr < ROWS; rr++) cleared.add(cellIdx(rr, c))
      else if (k === 'bomb') {
        for (let dr = -1; dr <= 1; dr++) for (let dc = -1; dc <= 1; dc++) {
          if (inBounds(r + dr, c + dc)) cleared.add(cellIdx(r + dr, c + dc))
        }
      }
    })
  }
  return { cleared, kind }
}

// Pick the CSS animation name for a flash kind
function flashAnim(kind) {
  if (kind === 'hline') return 'lineBlastH 0.34s ease-out forwards'
  if (kind === 'vline') return 'lineBlastV 0.34s ease-out forwards'
  if (kind === 'bomb')  return 'bombBurst 0.34s ease-out forwards'
  if (kind === 'rainbow') return 'rainbowPop 0.40s ease-out forwards'
  return 'gemPop 0.32s ease-out forwards'  // 'match'
}

export default function MatchGame({ onBack }) {
  const [grid, setGrid] = useState(() => makeGrid())
  const [selected, setSelected] = useState(null)
  const [phase, setPhase] = useState('idle')
  const [score, setScore] = useState(0)
  const [best, setBest] = useState(() => parseInt(localStorage.getItem('match_best') || '0'))
  const [moves, setMoves] = useState(MAX_MOVES)
  const [flashSet, setFlashSet] = useState(new Set())     // indices being removed
  const [flashKind, setFlashKind] = useState('match')     // which removal animation
  const [fallingIds, setFallingIds] = useState(new Set()) // ids of newly spawned cells
  const [comboText, setComboText] = useState(null)
  const [newBest, setNewBest] = useState(false)
  const [swapAnim, setSwapAnim] = useState(null)          // { from, to, dr, dc }

  const busyRef = useRef(false)
  const scoreRef = useRef(0)
  const movesRef = useRef(MAX_MOVES)
  const comboKeyRef = useRef(0)
  const gridElRef = useRef(null)   // DOM ref — touch events attached here
  const doSwapRef = useRef(null)   // always-current swap fn (used by touch handler)
  const handleTapRef = useRef(null) // always-current tap fn (used by touch handler)

  function startGame() {
    busyRef.current = false
    scoreRef.current = 0
    movesRef.current = MAX_MOVES
    setGrid(makeGrid())
    setScore(0)
    setMoves(MAX_MOVES)
    setSelected(null)
    setFlashSet(new Set())
    setFlashKind('match')
    setFallingIds(new Set())
    setComboText(null)
    setSwapAnim(null)
    setNewBest(false)
    setPhase('playing')
  }

  function endGame() {
    const finalScore = scoreRef.current
    const prevBest = parseInt(localStorage.getItem('match_best') || '0')
    if (finalScore > prevBest) {
      localStorage.setItem('match_best', finalScore)
      setBest(finalScore)
      setNewBest(true)
    }
    setPhase('gameover')
  }

  function processChain(g, swapPos, chain) {
    setFallingIds(new Set()) // clear fall anim before checking matches
    const matches = findMatches(g)
    if (matches.length === 0) {
      busyRef.current = false
      setFlashSet(new Set())
      if (movesRef.current <= 0) endGame()
      return
    }

    let pts = 0
    matches.forEach(m => { pts += (m.len === 3 ? 30 : m.len === 4 ? 100 : 300) * chain })
    scoreRef.current += pts
    setScore(scoreRef.current)

    if (chain >= 2) {
      setComboText({ text: `${chain}× 콤보!  +${pts}`, key: ++comboKeyRef.current })
      setTimeout(() => setComboText(null), 1100)
    }

    const allMatchedIdx = new Set()
    matches.forEach(m => m.cells.forEach(({ r, c }) => allMatchedIdx.add(cellIdx(r, c))))
    setFlashSet(allMatchedIdx)
    setFlashKind('match')

    setTimeout(() => {
      const newG = [...g]

      const hCells = new Set()
      const vCells = new Set()
      matches.forEach(m => m.cells.forEach(({ r, c }) => {
        if (m.dir === 'h') hCells.add(cellIdx(r, c))
        else vCells.add(cellIdx(r, c))
      }))
      const tlCells = [...hCells].filter(i => vCells.has(i))

      const specialsToPlace = new Map()
      matches.forEach(m => {
        if (m.len >= 5) {
          const target = (swapPos != null && m.cells.some(({ r, c }) => cellIdx(r, c) === swapPos))
            ? swapPos : cellIdx(m.cells[0].r, m.cells[0].c)
          specialsToPlace.set(target, 'rainbow')
        } else if (m.len === 4) {
          const kind = m.dir === 'h' ? 'hline' : 'vline'
          const target = (swapPos != null && m.cells.some(({ r, c }) => cellIdx(r, c) === swapPos))
            ? swapPos : cellIdx(m.cells[0].r, m.cells[0].c)
          if (!specialsToPlace.has(target)) specialsToPlace.set(target, kind)
        }
      })
      tlCells.forEach(i => specialsToPlace.set(i, 'bomb'))

      allMatchedIdx.forEach(i => { newG[i] = null })
      specialsToPlace.forEach((kind, i) => {
        newG[i] = mkCell(g[i]?.color ?? rnd(), kind)
      })

      const { g: fallen, freshIds } = applyGravity(newG)
      setFlashSet(new Set())
      setFallingIds(freshIds)
      setGrid(fallen)

      setTimeout(() => processChain(fallen, null, chain + 1), 290)
    }, 330)
  }

  // Shared swap logic — called by both click and touch drag
  function performSwap(fromIdx, toIdx) {
    const { r: r1, c: c1 } = cellPos(fromIdx)
    const { r: r2, c: c2 } = cellPos(toIdx)
    const dr = r2 - r1
    const dc = c2 - c1
    setSelected(null)
    busyRef.current = true
    setSwapAnim({ from: fromIdx, to: toIdx, dr, dc })

    setTimeout(() => {
      const swapped = [...grid]
      ;[swapped[fromIdx], swapped[toIdx]] = [swapped[toIdx], swapped[fromIdx]]

      const a = swapped[toIdx]
      const b = swapped[fromIdx]
      const hasSpecial = a?.kind !== 'normal' || b?.kind !== 'normal'

      if (!hasSpecial && findMatches(swapped).length === 0) {
        setSwapAnim(null)
        setTimeout(() => { busyRef.current = false }, 200)
        return
      }

      movesRef.current -= 1
      setMoves(movesRef.current)
      setSwapAnim(null)

      if (hasSpecial) {
        const { cleared, kind } = getSpecialAnimInfo(swapped, toIdx, fromIdx)
        setFlashSet(cleared)
        setFlashKind(kind)
        setGrid(swapped)
        setTimeout(() => {
          const afterSpecial = activateSpecialSwap(swapped, toIdx, fromIdx)
          const { g: fallen, freshIds } = applyGravity(afterSpecial)
          setFlashSet(new Set())
          setFallingIds(freshIds)
          setGrid(fallen)
          processChain(fallen, null, 1)
        }, 360)
      } else {
        setGrid(swapped)
        processChain(swapped, toIdx, 1)
      }
    }, 160)
  }

  function handleCellClick(i) {
    if (phase !== 'playing' || busyRef.current) return
    if (selected === null) {
      if (grid[i]) setSelected(i)
      return
    }
    if (selected === i) { setSelected(null); return }
    const { r: r1, c: c1 } = cellPos(selected)
    const { r: r2, c: c2 } = cellPos(i)
    const isAdj = (Math.abs(r1 - r2) === 1 && c1 === c2) || (r1 === r2 && Math.abs(c1 - c2) === 1)
    if (!isAdj) { setSelected(i); return }
    performSwap(selected, i)
  }

  // Keep refs current every render so touch handler always has latest closures
  doSwapRef.current = performSwap
  handleTapRef.current = handleCellClick

  // Attach touch events once — passive: false so we can call preventDefault
  useEffect(() => {
    const el = gridElRef.current
    if (!el) return
    let drag = null

    const onTouchStart = (e) => {
      e.preventDefault()
      const touch = e.touches[0]
      const target = document.elementFromPoint(touch.clientX, touch.clientY)
      const btn = target?.closest('[data-ci]')
      if (!btn) return
      drag = { startX: touch.clientX, startY: touch.clientY, fromIdx: parseInt(btn.dataset.ci) }
    }
    const onTouchMove  = (e) => { e.preventDefault() }
    const onTouchEnd   = (e) => {
      if (!drag) return
      const touch = e.changedTouches[0]
      const { startX, startY, fromIdx } = drag
      drag = null
      const dx = touch.clientX - startX
      const dy = touch.clientY - startY
      if (Math.abs(dx) < 14 && Math.abs(dy) < 14) {
        handleTapRef.current?.(fromIdx)
        return
      }
      let dr = 0, dc = 0
      if (Math.abs(dx) > Math.abs(dy)) dc = dx > 0 ? 1 : -1
      else dr = dy > 0 ? 1 : -1
      const { r, c } = cellPos(fromIdx)
      const toR = r + dr, toC = c + dc
      if (!inBounds(toR, toC)) return
      doSwapRef.current?.(fromIdx, cellIdx(toR, toC))
    }

    el.addEventListener('touchstart', onTouchStart, { passive: false })
    el.addEventListener('touchmove',  onTouchMove,  { passive: false })
    el.addEventListener('touchend',   onTouchEnd)
    return () => {
      el.removeEventListener('touchstart', onTouchStart)
      el.removeEventListener('touchmove',  onTouchMove)
      el.removeEventListener('touchend',   onTouchEnd)
    }
  }, [])

  return (
    <div style={s.wrapper}>
      <style>{`
        @keyframes gemPop {
          0%   { transform: scale(1);    opacity: 1; filter: brightness(1); }
          40%  { transform: scale(1.45); opacity: 0.9; filter: brightness(2.5); }
          100% { transform: scale(0);    opacity: 0; filter: brightness(1); }
        }
        @keyframes lineBlastH {
          0%   { transform: scaleX(1)   scaleY(1);    opacity: 1; filter: brightness(1); }
          30%  { transform: scaleX(1.1) scaleY(0.7);  opacity: 0.95; filter: brightness(3) saturate(0); }
          100% { transform: scaleX(1.5) scaleY(0);    opacity: 0; filter: brightness(4); }
        }
        @keyframes lineBlastV {
          0%   { transform: scaleX(1)   scaleY(1);    opacity: 1; filter: brightness(1); }
          30%  { transform: scaleX(0.7) scaleY(1.1);  opacity: 0.95; filter: brightness(3) saturate(0); }
          100% { transform: scaleX(0)   scaleY(1.5);  opacity: 0; filter: brightness(4); }
        }
        @keyframes bombBurst {
          0%   { transform: scale(1);   opacity: 1; filter: brightness(1); }
          25%  { transform: scale(1.7); opacity: 0.9; filter: brightness(4) saturate(0); }
          100% { transform: scale(0);   opacity: 0; filter: brightness(1); }
        }
        @keyframes rainbowPop {
          0%   { transform: scale(1)   rotate(0deg);   opacity: 1;   filter: hue-rotate(0deg) brightness(1); }
          50%  { transform: scale(1.4) rotate(180deg); opacity: 0.85; filter: hue-rotate(180deg) brightness(3); }
          100% { transform: scale(0)   rotate(360deg); opacity: 0;   filter: hue-rotate(360deg); }
        }
        @keyframes dropIn {
          0%   { transform: translateY(-120%) scale(0.7); opacity: 0; }
          70%  { transform: translateY(8%)    scale(1.05); opacity: 1; }
          100% { transform: translateY(0)     scale(1);    opacity: 1; }
        }
        @keyframes gemPulse {
          0%, 100% { box-shadow: var(--glow) }
          50%      { box-shadow: var(--glow), 0 0 16px var(--glowColor) }
        }
        @keyframes fadeUp {
          0%   { opacity: 1; transform: translateY(0) scale(1.1); }
          100% { opacity: 0; transform: translateY(-48px) scale(0.85); }
        }
      `}</style>

      {/* Top bar */}
      <div style={s.topBar}>
        <button style={s.backBtn} onClick={onBack}>← 나가기</button>
      </div>

      <h1 style={s.title}>💎 보석 맞추기!</h1>

      {/* Game area */}
      <div style={s.gameArea}>
        {/* Grid */}
        <div ref={gridElRef} style={s.grid}>
          {grid.map((cell, i) => {
              const isSel = selected === i
              const isFlash = flashSet.has(i)
              const isFalling = cell && fallingIds.has(cell.id)
              const isSpecial = cell && cell.kind !== 'normal'

              let swapTranslate = ''
              if (swapAnim) {
                if (swapAnim.from === i) swapTranslate = `translate(${swapAnim.dc * 100}%, ${swapAnim.dr * 100}%)`
                else if (swapAnim.to === i) swapTranslate = `translate(${-swapAnim.dc * 100}%, ${-swapAnim.dr * 100}%)`
              }

              let transform = 'scale(1)'
              let animation = isSpecial ? 'gemPulse 1.8s ease-in-out infinite' : 'none'

              if (isFlash) {
                transform = 'scale(1)'
                animation = flashAnim(flashKind)
              } else if (isFalling) {
                animation = 'dropIn 0.26s cubic-bezier(0.22,1,0.36,1) forwards'
              } else if (swapTranslate) {
                transform = swapTranslate
                animation = 'none'
              } else if (isSel) {
                transform = 'scale(0.84)'
              }

              let emoji = null
              let badge = null
              if (cell) {
                if (cell.kind === 'rainbow') emoji = '🌈'
                else {
                  emoji = GEMS[cell.color]
                  if (cell.kind === 'hline') badge = '↔'
                  else if (cell.kind === 'vline') badge = '↕'
                  else if (cell.kind === 'bomb') badge = '💣'
                }
              }

              const transitionProp = swapTranslate
                ? 'transform 0.16s cubic-bezier(0.4,0,0.2,1)'
                : isFlash || isFalling
                ? 'none'
                : 'transform 0.18s, box-shadow 0.15s'

              return (
                <button
                  key={cell?.id ?? i}
                  data-ci={i}
                  style={{
                    ...s.cell,
                    background: cell ? GEM_BG[cell.color] : 'rgba(255,255,255,0.03)',
                    outline: isSel ? '3px solid rgba(255,255,255,0.85)' : 'none',
                    outlineOffset: -3,
                    boxShadow: isSpecial && !isFlash
                      ? `0 0 8px ${GEM_GLOW[cell.color]}, inset 0 0 8px ${GEM_GLOW[cell.color]}44`
                      : 'none',
                    transform,
                    animation,
                    transition: transitionProp,
                    zIndex: swapTranslate ? 2 : 1,
                  }}
                  onClick={() => handleCellClick(i)}
                >
                  {emoji && <span style={{ fontSize: 'clamp(15px, 3.8vw, 24px)', lineHeight: 1, pointerEvents: 'none' }}>{emoji}</span>}
                  {badge && <span style={s.badge}>{badge}</span>}
                </button>
              )
            })}
        </div>

        {/* Score card — below grid, same style as other games */}
        <div style={s.scoreCard}>
          <div style={s.scoreRow}>
            <div style={s.scoreItem}>
              <span style={s.scoreLabel}>점수</span>
              <span style={s.scoreVal}>{score}</span>
            </div>
            <div style={s.scoreDivider} />
            <div style={s.scoreItem}>
              <span style={s.scoreLabel}>남은 횟수</span>
              <span style={{ ...s.scoreVal, color: moves <= 5 ? '#ff5555' : moves <= 10 ? '#ffaa00' : '#FFD700' }}>
                {moves}
              </span>
            </div>
            <div style={s.scoreDivider} />
            <div style={s.scoreItem}>
              <span style={s.scoreLabel}>🏆 최고</span>
              <span style={{ ...s.scoreVal, color: '#aaa' }}>{best}</span>
            </div>
          </div>
          <div style={s.hint}>4개→줄폭탄  ·  5개→🌈 무지개  ·  ㄱ자→💣 폭탄</div>
        </div>

        {/* Combo text — floats above the grid */}
        {comboText && (
          <div key={comboText.key} style={s.comboText}>{comboText.text}</div>
        )}

        {/* Idle overlay */}
        {phase === 'idle' && (
          <div style={s.overlay}>
            <div style={s.overlayBox}>
              <div style={s.oEmoji}>💎</div>
              <div style={s.oTitle}>보석 맞추기!</div>
              <div style={s.oHint}>같은 보석 3개를 맞추세요!</div>
              <div style={s.hintBox}>
                <div>4개 일직선 → <b style={{ color: '#ffe060' }}>줄 폭탄 ↔↕</b></div>
                <div>5개 일직선 → <b style={{ color: '#c060ff' }}>무지개 🌈</b></div>
                <div>ㄱ자 / T자 → <b style={{ color: '#ff8c00' }}>폭탄 💣</b></div>
              </div>
              <div style={{ fontSize: 'clamp(11px,2vw,13px)', color: '#777' }}>총 {MAX_MOVES}번 이동 가능</div>
              <button style={s.btnPrimary} onClick={startGame}>시작!</button>
            </div>
          </div>
        )}

        {/* Gameover overlay */}
        {phase === 'gameover' && (
          <div style={s.overlay}>
            <div style={s.overlayBox}>
              <div style={s.oEmoji}>{newBest ? '🏆' : '😵'}</div>
              <div style={s.oTitle}>{newBest ? '신기록!' : '게임 끝!'}</div>
              <div style={s.bigScore}>{score}점</div>
              <div style={s.bestScore}>최고 {best}점</div>
              {newBest && <div style={s.newBest}>🎉 최고 기록 달성!</div>}
              <div style={s.btnGroup}>
                <button style={s.btnPrimary} onClick={startGame}>다시 하기</button>
                <button style={s.btnSecondary} onClick={onBack}>← 나가기</button>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}

const s = {
  wrapper: {
    fontFamily: '"Segoe UI", sans-serif',
    background: '#0f0f1e',
    minHeight: '100vh',
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    justifyContent: 'center',
    padding: 'clamp(8px, 2vw, 16px)',
    boxSizing: 'border-box',
    userSelect: 'none',
  },
  topBar: {
    width: '100%',
    maxWidth: 520,
    display: 'flex',
    alignItems: 'center',
    marginBottom: 6,
  },
  backBtn: {
    fontSize: 'clamp(12px, 2.5vw, 14px)',
    fontWeight: 'bold',
    padding: '6px 14px',
    borderRadius: 20,
    border: '2px solid #444',
    background: 'transparent',
    color: '#aaa',
    cursor: 'pointer',
  },
  title: {
    color: '#FFD700',
    fontSize: 'clamp(22px, 5vw, 32px)',
    fontWeight: 'bold',
    textShadow: '0 2px 18px rgba(255,215,0,0.45)',
    margin: '0 0 8px',
    textAlign: 'center',
  },
  gameArea: {
    position: 'relative',
    width: '100%',
    maxWidth: 520,
    margin: '0 auto',
  },
  grid: {
    display: 'grid',
    gridTemplateColumns: 'repeat(8, 1fr)',
    gap: 'clamp(2px, 0.7vw, 5px)',
    width: '100%',
    aspectRatio: '1',
    background: '#11112a',
    border: '4px solid #FFD700',
    borderRadius: 12,
    padding: 'clamp(4px, 1.2vw, 10px)',
    boxSizing: 'border-box',
    boxShadow: '0 8px 40px rgba(0,0,0,0.6)',
    touchAction: 'none',
    marginBottom: 12,
  },
  cell: {
    position: 'relative',
    border: 'none',
    borderRadius: 8,
    cursor: 'pointer',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    aspectRatio: '1',
    padding: 0,
    minWidth: 0,
  },
  badge: {
    position: 'absolute',
    bottom: 1,
    right: 2,
    fontSize: 9,
    lineHeight: 1,
    pointerEvents: 'none',
  },
  scoreCard: {
    background: '#1e1e2e',
    border: '1px solid #333',
    borderRadius: 12,
    padding: '10px 16px',
  },
  scoreRow: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
  },
  scoreDivider: { width: 1, height: 32, background: '#333', margin: '0 8px' },
  scoreItem: {
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    flex: 1,
    gap: 2,
  },
  scoreLabel: { color: '#666', fontSize: 'clamp(10px,2vw,12px)' },
  scoreVal: { color: '#FFD700', fontWeight: 'bold', fontSize: 'clamp(14px,3vw,18px)' },
  hint: {
    textAlign: 'center',
    color: '#444',
    fontSize: 'clamp(10px,2vw,12px)',
    marginTop: 6,
  },
  comboText: {
    position: 'absolute',
    top: '30%',
    left: '50%',
    transform: 'translateX(-50%)',
    fontSize: 'clamp(18px,4vw,24px)',
    fontWeight: 'bold',
    color: '#ff8c00',
    textShadow: '0 0 16px #ff8c00',
    pointerEvents: 'none',
    whiteSpace: 'nowrap',
    zIndex: 5,
    animation: 'fadeUp 1.1s ease-out forwards',
  },
  overlay: {
    position: 'fixed',
    inset: 0,
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    background: 'rgba(0,0,0,0.72)',
    color: 'white',
    zIndex: 100,
  },
  overlayBox: {
    background: '#1e1e2e',
    border: '2px solid #333',
    borderRadius: 18,
    padding: 'clamp(24px,5vw,40px) clamp(28px,6vw,48px)',
    textAlign: 'center',
    display: 'flex',
    flexDirection: 'column',
    gap: 10,
    maxWidth: 340,
    width: '90%',
  },
  oEmoji: { fontSize: 'clamp(36px,8vw,56px)' },
  oTitle: {
    fontSize: 'clamp(22px,5vw,34px)',
    fontWeight: 'bold',
    color: '#FFD700',
    textShadow: '0 2px 18px rgba(255,215,0,0.4)',
  },
  oHint: { fontSize: 'clamp(12px,3vw,15px)', color: '#ccc', lineHeight: 1.5 },
  hintBox: {
    fontSize: 'clamp(12px,2.5vw,14px)',
    color: '#999',
    display: 'flex',
    flexDirection: 'column',
    gap: 4,
    background: '#12122a',
    border: '1px solid #2a2a4a',
    borderRadius: 10,
    padding: '10px 16px',
    lineHeight: 1.6,
    textAlign: 'left',
  },
  bigScore:  { color: '#fff', fontSize: 'clamp(28px,6vw,40px)', fontWeight: 'bold' },
  bestScore: { color: 'rgba(255,255,255,0.45)', fontSize: 'clamp(12px,2.5vw,15px)' },
  newBest:   { color: '#FFD700', fontSize: 'clamp(14px,3vw,18px)', fontWeight: 'bold' },
  btnGroup:  { display: 'flex', flexDirection: 'column', gap: 8, width: '100%' },
  btnPrimary: {
    padding: 'clamp(10px,2vw,14px) clamp(20px,4vw,36px)',
    fontSize: 'clamp(15px,3.5vw,20px)',
    borderRadius: 14,
    border: 'none',
    background: 'linear-gradient(135deg, #FFD700, #FFA500)',
    cursor: 'pointer',
    fontWeight: 'bold',
    color: '#222',
    boxShadow: '0 4px 20px rgba(255,165,0,0.4)',
  },
  btnSecondary: {
    padding: 'clamp(8px,1.5vw,10px) clamp(16px,3vw,24px)',
    fontSize: 'clamp(13px,2.5vw,15px)',
    borderRadius: 14,
    border: '2px solid #444',
    background: 'transparent',
    cursor: 'pointer',
    fontWeight: 'bold',
    color: '#aaa',
  },
}
