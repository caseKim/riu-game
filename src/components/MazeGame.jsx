import { useEffect, useRef, useState, useCallback } from 'react'
import { getSavedDiff, saveDiff, dist } from '../utils/gameUtils'

// 점수제 시절 잘못된 기록 정리 (3초 이하는 무효)
;['easy','normal','hard','vhard','extreme'].forEach(id => {
  const key = `maze_best_${id}`
  const v = parseFloat(localStorage.getItem(key))
  if (!isNaN(v) && v <= 3000) localStorage.removeItem(key)
})

// 시간 기록 (낮을수록 좋음, 0 = 기록 없음)
function getBestTime(diffId) {
  const v = parseFloat(localStorage.getItem(`maze_best_${diffId}`))
  return isNaN(v) ? 0 : v
}
function saveBestTime(diffId, ms) {
  const prev = getBestTime(diffId)
  if (prev === 0 || ms < prev) {
    localStorage.setItem(`maze_best_${diffId}`, ms)
    return true
  }
  return false
}
function fmtTime(ms) {
  return ms > 0 ? `${(ms / 1000).toFixed(1)}초` : '-'
}

const IS_TOUCH = typeof window !== 'undefined' && ('ontouchstart' in window || navigator.maxTouchPoints > 0)

const W = 640
const H = 720
const GAME_ID = 'maze'
const HUD_H = 44
const MAZE_PAD = 8

const DIFFICULTIES = [
  { id: 'easy',    label: '쉬움',    emoji: '🌱', color: '#4CAF50' },
  { id: 'normal',  label: '보통',    emoji: '⚡', color: '#FFD700' },
  { id: 'hard',    label: '어려움',  emoji: '🔥', color: '#F44336' },
  { id: 'vhard',   label: '매우어려움', emoji: '💀', color: '#FF00FF' },
  { id: 'extreme', label: '극한',    emoji: '👹', color: '#FF0000' },
]

const DIFF_SETTINGS = {
  easy:    { cols: 9,  rows: 9  },
  normal:  { cols: 13, rows: 13 },
  hard:    { cols: 19, rows: 19 },
  vhard:   { cols: 25, rows: 25 },
  extreme: { cols: 31, rows: 31 },
}

const MOVE_DELAY    = 180  // 홀드 후 자동반복 시작까지 (ms)
const MOVE_INTERVAL = 90   // 자동반복 간격 (ms)

// Iterative DFS (recursive backtracking)
// Cell bitmask: N=1 S=2 E=4 W=8 (bit set = wall present)
function generateMaze(cols, rows) {
  const maze = Array.from({ length: rows }, () => new Array(cols).fill(15))
  const visited = Array.from({ length: rows }, () => new Array(cols).fill(false))
  const stack = [[0, 0]]
  visited[0][0] = true
  const DIRS = [
    { dr: -1, dc:  0, bit: 1, opp: 2 },
    { dr:  1, dc:  0, bit: 2, opp: 1 },
    { dr:  0, dc:  1, bit: 4, opp: 8 },
    { dr:  0, dc: -1, bit: 8, opp: 4 },
  ]
  while (stack.length > 0) {
    const [r, c] = stack[stack.length - 1]
    const shuffled = [...DIRS]
    for (let i = shuffled.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]]
    }
    let moved = false
    for (const { dr, dc, bit, opp } of shuffled) {
      const nr = r + dr, nc = c + dc
      if (nr >= 0 && nr < rows && nc >= 0 && nc < cols && !visited[nr][nc]) {
        maze[r][c] &= ~bit
        maze[nr][nc] &= ~opp
        visited[nr][nc] = true
        stack.push([nr, nc])
        moved = true
        break
      }
    }
    if (!moved) stack.pop()
  }
  return maze
}

function makeInitialState(diff) {
  const { cols, rows } = diff
  const maze = generateMaze(cols, rows)
  const availW = W - MAZE_PAD * 2
  const availH = H - HUD_H - MAZE_PAD * 2
  const cellSize = Math.floor(Math.min(availW / cols, availH / rows))
  const offX = Math.floor((W - cellSize * cols) / 2)
  const offY = HUD_H + Math.floor((H - HUD_H - cellSize * rows) / 2)
  const trail = Array.from({ length: rows }, () => new Array(cols).fill(false))
  trail[0][0] = true
  return { maze, cols, rows, cellSize, offX, offY, px: 0, py: 0, startTime: 0, elapsed: 0, score: 0, trail, lastMoveAt: 0 }
}

// ── 메인 컴포넌트 ────────────────────────────────────────────────────
export default function MazeGame({ onBack, onStart }) {
  const [difficulty, setDifficulty] = useState(() => getSavedDiff(GAME_ID, DIFFICULTIES))
  const [phase, setPhase]       = useState('idle')
  const [score, setScore]       = useState(0)   // 경과 ms
  const [best, setBest]         = useState(() => getBestTime(difficulty.id))
  const [newRecord, setNewRecord] = useState(false)

  const canvasRef      = useRef(null)
  const animRef        = useRef(null)
  const stateRef       = useRef(null)
  const phaseRef       = useRef('idle')
  const difficultyRef  = useRef(difficulty)
  const startGameRef   = useRef(null)
  const keysRef        = useRef({ dx: 0, dy: 0, heldSince: 0 })
  const wrapRef        = useRef(null)
  const joyRef         = useRef({ active: false, cx: 0, cy: 0, dx: 0, dy: 0 })
  const joyKnobRef     = useRef(null)
  const joyContainerRef = useRef(null)

  difficultyRef.current = difficulty

  if (stateRef.current == null) stateRef.current = makeInitialState(DIFF_SETTINGS[difficulty.id])

  // ── 초기/클리어/게임오버 시 미로 정지 화면 그리기 ─────────────────
  useEffect(() => {
    if (phase === 'playing') return
    const canvas = canvasRef.current
    if (!canvas) return
    draw(canvas.getContext('2d'), stateRef.current)
  }, [phase, difficulty])

  // ── 플레이어 이동 ──────────────────────────────────────────────────
  const movePlayer = useCallback((dx, dy) => {
    if (phaseRef.current !== 'playing') return
    const s = stateRef.current
    const nx = s.px + dx, ny = s.py + dy
    if (nx < 0 || nx >= s.cols || ny < 0 || ny >= s.rows) return
    if (dx ===  1 && (s.maze[s.py][s.px] & 4)) return  // E wall
    if (dx === -1 && (s.maze[s.py][s.px] & 8)) return  // W wall
    if (dy === -1 && (s.maze[s.py][s.px] & 1)) return  // N wall
    if (dy ===  1 && (s.maze[s.py][s.px] & 2)) return  // S wall
    s.px = nx; s.py = ny
    s.trail[ny][nx] = true
    if (nx === s.cols - 1 && ny === s.rows - 1) {
      const elapsed = Date.now() - s.startTime
      s.score = elapsed
      setScore(elapsed)
      const isNew = saveBestTime(difficultyRef.current.id, elapsed)
      if (isNew) setBest(elapsed)
      setNewRecord(isNew)
      phaseRef.current = 'clear'
      setPhase('clear')
    }
  }, [])

  // ── 게임 루프 ──────────────────────────────────────────────────────
  useEffect(() => {
    if (phase !== 'playing') return
    const canvas = canvasRef.current
    const ctx = canvas.getContext('2d')
    let alive = true

    function loop() {
      if (!alive || phaseRef.current !== 'playing') return
      animRef.current = requestAnimationFrame(loop)
      const s = stateRef.current
      const now = Date.now()
      s.elapsed = s.startTime > 0 ? now - s.startTime : 0

      // 조이스틱 방향 → keysRef 업데이트
      const joy = joyRef.current
      if (joy.active) {
        const adx = Math.abs(joy.dx), ady = Math.abs(joy.dy)
        let jdx = 0, jdy = 0
        if (adx > 12 || ady > 12) {
          if (adx > ady) jdx = joy.dx > 0 ? 1 : -1
          else jdy = joy.dy > 0 ? 1 : -1
        }
        const cur = keysRef.current
        if (jdx !== cur.dx || jdy !== cur.dy) {
          keysRef.current = { dx: jdx, dy: jdy, heldSince: now }
          if (jdx !== 0 || jdy !== 0) { movePlayer(jdx, jdy); s.lastMoveAt = now }
        }
      }

      // 키 홀드 자동 반복
      const k = keysRef.current
      if (k.dx !== 0 || k.dy !== 0) {
        if (now - k.heldSince > MOVE_DELAY && now - s.lastMoveAt > MOVE_INTERVAL) {
          movePlayer(k.dx, k.dy)
          s.lastMoveAt = now
        }
      }

      draw(ctx, s)
    }

    animRef.current = requestAnimationFrame(loop)
    return () => { alive = false; cancelAnimationFrame(animRef.current) }
  }, [phase, difficulty, movePlayer])

  // ── 시작 ─────────────────────────────────────────────────────────
  function startGame() {
    onStart?.()
    const s = makeInitialState(DIFF_SETTINGS[difficultyRef.current.id])
    s.startTime = Date.now()
    stateRef.current = s
    setScore(0)
    setNewRecord(false)
    setBest(getBestTime(difficultyRef.current.id))
    phaseRef.current = 'playing'
    setPhase('playing')
  }
  startGameRef.current = startGame

  // ── 난이도 변경 ───────────────────────────────────────────────────
  function changeDiff(d) {
    saveDiff(GAME_ID, d.id)
    setDifficulty(d)
    setBest(getBestTime(d.id))
    stateRef.current = makeInitialState(DIFF_SETTINGS[d.id])
    phaseRef.current = 'idle'
    setPhase('idle')
  }

  // ── 조이스틱 (터치) ────────────────────────────────────────────────
  useEffect(() => {
    if (!IS_TOUCH) return
    const wrap = wrapRef.current
    if (!wrap) return

    function onTouchStart(e) {
      if (e.target.closest('button')) return
      e.preventDefault()
      const touch = e.changedTouches[0]
      const cx = touch.clientX, cy = touch.clientY
      joyRef.current = { active: true, cx, cy, dx: 0, dy: 0 }
      const container = joyContainerRef.current
      if (container) {
        container.style.left = `${cx - 65}px`
        container.style.top  = `${cy - 65}px`
        container.style.display = 'flex'
      }
      if (phaseRef.current !== 'playing') startGameRef.current()
    }

    function onTouchMove(e) {
      e.preventDefault()
      const joy = joyRef.current
      if (!joy.active) return
      const touch = e.changedTouches[0]
      const rawDx = touch.clientX - joy.cx
      const rawDy = touch.clientY - joy.cy
      const maxR = 44
      const d = dist(0, 0, rawDx, rawDy)
      joy.dx = d > maxR ? rawDx / d * maxR : rawDx
      joy.dy = d > maxR ? rawDy / d * maxR : rawDy
      if (joyKnobRef.current) {
        joyKnobRef.current.style.transform = `translate(${joy.dx}px, ${joy.dy}px)`
      }
    }

    function onTouchEnd() {
      joyRef.current.active = false
      joyRef.current.dx = 0
      joyRef.current.dy = 0
      keysRef.current = { dx: 0, dy: 0, heldSince: 0 }
      if (joyKnobRef.current) joyKnobRef.current.style.transform = 'translate(0px, 0px)'
      if (joyContainerRef.current) joyContainerRef.current.style.display = 'none'
    }

    wrap.addEventListener('touchstart', onTouchStart, { passive: false })
    wrap.addEventListener('touchmove', onTouchMove, { passive: false })
    wrap.addEventListener('touchend', onTouchEnd)
    wrap.addEventListener('touchcancel', onTouchEnd)
    return () => {
      wrap.removeEventListener('touchstart', onTouchStart)
      wrap.removeEventListener('touchmove', onTouchMove)
      wrap.removeEventListener('touchend', onTouchEnd)
      wrap.removeEventListener('touchcancel', onTouchEnd)
    }
  }, [])

  // ── 키보드 ────────────────────────────────────────────────────────
  useEffect(() => {
    function getDirFromCode(code) {
      if (code === 'ArrowUp'    || code === 'KeyW') return { dx: 0,  dy: -1 }
      if (code === 'ArrowDown'  || code === 'KeyS') return { dx: 0,  dy:  1 }
      if (code === 'ArrowLeft'  || code === 'KeyA') return { dx: -1, dy:  0 }
      if (code === 'ArrowRight' || code === 'KeyD') return { dx: 1,  dy:  0 }
      return null
    }
    function onKeyDown(e) {
      const d = getDirFromCode(e.code)
      if (d) e.preventDefault()
      if (phaseRef.current !== 'playing') {
        if (e.code === 'Space' || e.code === 'Enter') startGameRef.current()
        return
      }
      if (!d) return
      const k = keysRef.current
      if (k.dx !== d.dx || k.dy !== d.dy) {
        keysRef.current = { ...d, heldSince: Date.now() }
        movePlayer(d.dx, d.dy)
        stateRef.current.lastMoveAt = Date.now()
      }
    }
    function onKeyUp(e) {
      const d = getDirFromCode(e.code)
      if (!d) return
      const k = keysRef.current
      if (k.dx === d.dx && k.dy === d.dy) keysRef.current = { dx: 0, dy: 0, heldSince: 0 }
    }
    window.addEventListener('keydown', onKeyDown)
    window.addEventListener('keyup', onKeyUp)
    return () => {
      window.removeEventListener('keydown', onKeyDown)
      window.removeEventListener('keyup', onKeyUp)
    }
  }, [movePlayer])


  const diffPicker = (
    <div>
      <div style={S.label}>난이도</div>
      <div style={S.diffRow}>
        {DIFFICULTIES.map(d => (
          <button key={d.id} onClick={() => changeDiff(d)} style={{
            ...S.diffBtn,
            borderColor: difficulty.id === d.id ? d.color : '#444',
            color:       difficulty.id === d.id ? d.color : '#888',
            background:  difficulty.id === d.id ? `${d.color}22` : 'transparent',
          }}>
            {d.emoji} {d.label}
          </button>
        ))}
      </div>
    </div>
  )

  // ── 렌더 ─────────────────────────────────────────────────────────
  return (
    <div style={S.wrapper}>
      <div style={S.topBar}>
        <button style={S.backBtn} onClick={onBack}>← 나가기</button>
        {phase === 'playing' && (
          <button style={S.refreshBtn} onClick={startGame} title="새 미로">🔄 새 미로</button>
        )}
      </div>
      <h1 style={S.title}>🌀 미로 탈출</h1>
      <p style={S.subtitle}>{difficulty.emoji} {difficulty.label} · 빠를수록 좋아요!</p>

      <div ref={wrapRef} style={S.gameArea}>
        <canvas ref={canvasRef} width={W} height={H} style={S.canvas} />

        {IS_TOUCH && (
          <div ref={joyContainerRef} style={S.joyContainer}>
            <div style={S.joyBase}>
              <div ref={joyKnobRef} style={S.joyKnob} />
            </div>
          </div>
        )}

        <div style={S.scoreCard}>
          <div style={S.scoreRow}>
            <div style={S.scoreItem}>
              <span style={S.scoreLabel}>기록</span>
              <span style={S.scoreVal}>{score > 0 ? fmtTime(score) : '-'}</span>
            </div>
            <div style={S.scoreDivider} />
            <div style={S.scoreItem}>
              <span style={S.scoreLabel}>🏆 최고</span>
              <span style={S.scoreBest}>{fmtTime(best)}</span>
            </div>
          </div>
        </div>


        {/* 시작 오버레이 */}
        {phase === 'idle' && (
          <div style={S.overlay}>
            <div style={S.box}>
              <div style={S.oTitle}>🌀 미로 탈출</div>
              <div style={S.desc}>
                <p>🐱 고양이를 출구 🚪까지 안내해요!<br />⏱ 얼마나 빨리 탈출할 수 있을까요?</p>
              </div>
              {diffPicker}
              <div style={S.bestLine}>🏆 최고 {fmtTime(best)}</div>
              <div style={S.btnGroup}>
                <button style={S.btnPrimary} onClick={startGame}>시작하기</button>
                <button style={S.btnBack2} onClick={onBack}>← 게임 선택</button>
              </div>
            </div>
          </div>
        )}

        {/* 클리어 오버레이 */}
        {phase === 'clear' && (
          <div style={S.overlay}>
            <div style={S.box}>
              <div style={S.oEmoji}>{newRecord ? '🏆' : '🎉'}</div>
              <div style={S.oTitle}>{newRecord ? '신기록!' : '탈출 성공!'}</div>
              <div style={S.bigScore}>{fmtTime(score)}</div>
              <div style={S.bestScore}>최고 {fmtTime(best)}</div>
              {newRecord && <div style={S.newBest}>🎉 최고 기록 갱신!</div>}
              {diffPicker}
              <div style={S.btnGroup}>
                <button style={S.btnPrimary} onClick={startGame}>다시 하기</button>
                <button style={S.btnBack2} onClick={onBack}>← 게임 선택</button>
              </div>
            </div>
          </div>
        )}

      </div>
    </div>
  )
}

// ── 그리기 (컴포넌트 밖) ─────────────────────────────────────────────
function draw(ctx, s) {
  const { maze, cols, rows, cellSize, offX, offY, px, py, trail } = s

  // 배경
  ctx.fillStyle = '#0f0f1e'
  ctx.fillRect(0, 0, W, H)

  // HUD 배경
  ctx.fillStyle = '#111127'
  ctx.fillRect(0, 0, W, HUD_H)

  // 경과 시간 표시
  const secs = (s.elapsed / 1000).toFixed(1)
  ctx.fillStyle = '#fff'
  ctx.font = 'bold 16px "Segoe UI", sans-serif'
  ctx.textAlign = 'center'
  ctx.textBaseline = 'middle'
  ctx.fillText(`⏱ ${secs}초`, W / 2, HUD_H / 2)

  // 셀 배경 (trail + 출구 하이라이트)
  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      const x = offX + c * cellSize
      const y = offY + r * cellSize
      const isExit = c === cols - 1 && r === rows - 1
      const isPlayer = c === px && r === py
      if (!isExit && !isPlayer && trail[r][c]) {
        ctx.fillStyle = '#4a9eff35'
        ctx.fillRect(x + 1, y + 1, cellSize - 2, cellSize - 2)
      }
    }
  }

  // 벽 그리기
  ctx.strokeStyle = '#4a9eff'
  ctx.lineWidth = cellSize > 28 ? 2 : 1.5
  ctx.beginPath()
  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      const x = offX + c * cellSize
      const y = offY + r * cellSize
      const cell = maze[r][c]
      if (cell & 1) { ctx.moveTo(x, y);             ctx.lineTo(x + cellSize, y) }
      if (cell & 2) { ctx.moveTo(x, y + cellSize);  ctx.lineTo(x + cellSize, y + cellSize) }
      if (cell & 4) { ctx.moveTo(x + cellSize, y);  ctx.lineTo(x + cellSize, y + cellSize) }
      if (cell & 8) { ctx.moveTo(x, y);             ctx.lineTo(x, y + cellSize) }
    }
  }
  ctx.stroke()

  // 이모지 크기
  const es = Math.max(10, cellSize - 6)
  ctx.globalAlpha = 1
  ctx.fillStyle = '#fff'
  ctx.font = `${es}px serif`
  ctx.textAlign = 'center'
  ctx.textBaseline = 'middle'

  // 출구
  ctx.fillText('🚪',
    offX + (cols - 1) * cellSize + cellSize / 2,
    offY + (rows - 1) * cellSize + cellSize / 2)

  // 시작점 (플레이어가 떠난 후 표시)
  if (px !== 0 || py !== 0) {
    ctx.globalAlpha = 0.25
    ctx.fillText('🏁', offX + cellSize / 2, offY + cellSize / 2)
    ctx.globalAlpha = 1
  }

  // 플레이어
  ctx.fillText('🐱', offX + px * cellSize + cellSize / 2, offY + py * cellSize + cellSize / 2)
}

// ── 스타일 ───────────────────────────────────────────────────────────
const S = {
  wrapper: {
    fontFamily: '"Segoe UI", sans-serif',
    background: '#0f0f1e',
    minHeight: '100vh',
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    justifyContent: 'center',
    padding: 'clamp(4px, 1vw, 8px)',
    boxSizing: 'border-box',
  },
  topBar: { width: '100%', maxWidth: W, display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8 },
  backBtn: { fontSize: 'clamp(12px, 2.5vw, 14px)', fontWeight: 'bold', padding: '6px 14px', borderRadius: 20, border: '2px solid #444', background: 'transparent', color: '#aaa', cursor: 'pointer' },
  refreshBtn: { fontSize: 'clamp(12px, 2.5vw, 14px)', fontWeight: 'bold', padding: '6px 14px', borderRadius: 20, border: '2px solid #4a9eff', background: 'transparent', color: '#4a9eff', cursor: 'pointer', marginLeft: 'auto' },
  title: { color: '#FFD700', fontSize: 'clamp(22px, 5vw, 32px)', fontWeight: 'bold', textShadow: '0 2px 18px rgba(255,215,0,0.45)', margin: '0 0 4px', textAlign: 'center' },
  subtitle: { color: '#aaa', fontSize: 'clamp(12px, 2.5vw, 15px)', margin: '0 0 10px', textAlign: 'center' },
  gameArea: { position: 'relative', width: '100%', maxWidth: W, margin: '0 auto' },
  canvas: { display: 'block', width: '100%', height: 'auto', border: '4px solid #FFD700', borderRadius: '12px 12px 0 0', touchAction: 'none', userSelect: 'none' },
  scoreCard: { background: '#1e1e2e', border: '1px solid #333', borderTop: 'none', borderRadius: '0 0 12px 12px', padding: '10px 16px', marginBottom: 8 },
  scoreRow:     { display: 'flex', alignItems: 'center', justifyContent: 'center' },
  scoreItem:    { display: 'flex', flexDirection: 'column', alignItems: 'center', flex: 1, gap: 2 },
  scoreLabel:   { color: '#666', fontSize: 'clamp(10px, 2vw, 12px)' },
  scoreVal:     { color: '#FFD700', fontWeight: 'bold', fontSize: 'clamp(14px, 3vw, 18px)' },
  scoreBest:    { color: '#aaa', fontWeight: 'bold', fontSize: 'clamp(14px, 3vw, 18px)' },
  scoreDivider: { width: 1, height: 32, background: '#333', margin: '0 8px' },
  overlay: { position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.78)', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', zIndex: 100, overflowY: 'auto', padding: '16px 0' },
  box: { background: '#1e1e2e', border: '2px solid #333', borderRadius: 18, padding: 'clamp(20px, 4vw, 36px) clamp(24px, 5vw, 44px)', textAlign: 'center', display: 'flex', flexDirection: 'column', gap: 14, maxWidth: 360, width: '90%' },
  oEmoji:    { fontSize: 'clamp(36px, 8vw, 56px)' },
  oTitle:    { color: '#FFD700', fontSize: 'clamp(22px, 5vw, 34px)', fontWeight: 'bold', textShadow: '0 2px 18px rgba(255,215,0,0.4)' },
  desc:      { color: '#ccc', fontSize: 'clamp(13px, 2.5vw, 15px)', lineHeight: 1.7 },
  label:     { color: '#aaa', fontSize: 'clamp(11px, 2vw, 13px)', marginBottom: 8 },
  diffRow:   { display: 'flex', gap: 6, justifyContent: 'center', flexWrap: 'wrap' },
  diffBtn:   { padding: '8px 10px', borderRadius: 10, border: '2px solid #444', background: 'transparent', fontSize: 'clamp(11px, 2vw, 13px)', fontWeight: 'bold', cursor: 'pointer', transition: 'all 0.15s', color: '#888' },
  bestLine:  { color: '#aaa', fontSize: 'clamp(12px, 2.5vw, 14px)' },
  bigScore:  { color: '#fff', fontSize: 'clamp(28px, 6vw, 40px)', fontWeight: 'bold' },
  bestScore: { color: 'rgba(255,255,255,0.45)', fontSize: 'clamp(12px, 2.5vw, 15px)' },
  newBest:   { color: '#FFD700', fontSize: 'clamp(14px, 3vw, 18px)', fontWeight: 'bold' },
  btnGroup:  { display: 'flex', flexDirection: 'column', gap: 8, width: '100%' },
  btnPrimary: { background: 'linear-gradient(135deg, #FFD700, #FFA500)', color: '#1a1a2e', border: 'none', borderRadius: 14, padding: 'clamp(10px, 2vw, 14px) clamp(20px, 4vw, 36px)', fontSize: 'clamp(15px, 3vw, 18px)', fontWeight: 'bold', cursor: 'pointer', boxShadow: '0 4px 20px rgba(255,165,0,0.4)' },
  btnBack2:   { background: 'transparent', color: '#aaa', border: '2px solid #444', borderRadius: 14, padding: 'clamp(8px, 1.5vw, 10px) clamp(16px, 3vw, 24px)', fontSize: 'clamp(13px, 2.5vw, 15px)', fontWeight: 'bold', cursor: 'pointer' },
  joyContainer: { position: 'fixed', display: 'none', alignItems: 'center', justifyContent: 'center', width: 130, height: 130, pointerEvents: 'none', zIndex: 50 },
  joyBase: { width: 130, height: 130, borderRadius: '50%', background: 'rgba(255,255,255,0.07)', border: '2px solid rgba(255,255,255,0.2)', display: 'flex', alignItems: 'center', justifyContent: 'center' },
  joyKnob: { width: 54, height: 54, borderRadius: '50%', background: 'rgba(255,255,255,0.38)', border: '2px solid rgba(255,255,255,0.55)', pointerEvents: 'none', willChange: 'transform' },
}
