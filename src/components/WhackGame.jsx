import { useEffect, useRef, useState } from 'react'
import { getBest, saveBest, getSavedDiff, saveDiff, drawEmoji, randInt, fillRoundRect, dist } from '../utils/gameUtils'

const W = 600
const H = 500
const GAME_ID = 'mole'
const GAME_DURATION = 60

const DIFFICULTIES = [
  { id: 'easy',   label: '쉬움',   emoji: '🌱', color: '#4CAF50' },
  { id: 'normal', label: '보통',   emoji: '⚡', color: '#FFD700' },
  { id: 'hard',   label: '어려움', emoji: '🔥', color: '#F44336' },
]

const DIFF_SETTINGS = {
  easy:   { upFrames: 90, riseSpeed: 0.03, maxMoles: 2, spawnMin: 85, spawnMax: 125 },
  normal: { upFrames: 58, riseSpeed: 0.05, maxMoles: 3, spawnMin: 50, spawnMax: 78 },
  hard:   { upFrames: 34, riseSpeed: 0.08, maxMoles: 4, spawnMin: 28, spawnMax: 48 },
}

// Hole centers: 3×3 grid
const HOLES = [
  { x: 100, y: 130 }, { x: 300, y: 130 }, { x: 500, y: 130 },
  { x: 100, y: 270 }, { x: 300, y: 270 }, { x: 500, y: 270 },
  { x: 100, y: 410 }, { x: 300, y: 410 }, { x: 500, y: 410 },
]
const HOLE_RX = 55
const HOLE_RY = 22
const HIT_R   = 52  // click detection radius

function makeState(diff) {
  return {
    holes: Array.from({ length: 9 }, () => ({
      state: 'empty',   // 'empty' | 'rising' | 'up' | 'falling'
      offset: 0,        // 0 = fully hidden, 1 = fully visible
      upTimer: 0,
      whacked: false,
      sparkTimer: 0,
    })),
    score: 0,
    frame: 0,
    timeLeft: GAME_DURATION,
    secTimer: 0,
    spawnTimer: 0,
    nextSpawn: randInt(diff.spawnMin, diff.spawnMax),
    diff,
  }
}

export default function WhackGame({ onBack, onStart }) {
  const [difficulty, setDifficulty] = useState(() => getSavedDiff(GAME_ID, DIFFICULTIES))
  const diff = DIFF_SETTINGS[difficulty.id]

  const [phase, setPhase]   = useState('idle')
  const [score, setScore]   = useState(0)
  const [best,  setBest]    = useState(() => getBest(GAME_ID, difficulty.id))

  const canvasRef     = useRef(null)
  const wrapRef       = useRef(null)
  const animRef       = useRef(null)
  const stateRef      = useRef(null)
  const gameOverAtRef = useRef(0)

  if (stateRef.current == null) stateRef.current = makeState(diff)

  // Game loop
  useEffect(() => {
    if (phase !== 'playing') return
    const canvas = canvasRef.current
    const ctx = canvas.getContext('2d')
    let alive = true

    function loop() {
      if (!alive) return
      animRef.current = requestAnimationFrame(loop)
      const s = stateRef.current
      s.frame++

      // Countdown
      s.secTimer++
      if (s.secTimer >= 60) {
        s.secTimer = 0
        s.timeLeft = Math.max(0, s.timeLeft - 1)
        if (s.timeLeft === 0) {
          gameOverAtRef.current = Date.now()
          if (saveBest(GAME_ID, difficulty.id, s.score)) setBest(s.score)
          draw(ctx, s)
          setPhase('gameover')
          return
        }
      }

      updateMoles(s)
      spawnMoles(s)
      setScore(s.score)
      draw(ctx, s)
    }

    animRef.current = requestAnimationFrame(loop)
    return () => { alive = false; cancelAnimationFrame(animRef.current) }
  }, [phase, difficulty])

  function startGame() {
    if (Date.now() - gameOverAtRef.current < 800) return
    onStart?.()
    stateRef.current = makeState(diff)
    setScore(0)
    setBest(getBest(GAME_ID, difficulty.id))
    setPhase('playing')
  }

  function changeDiff(d) {
    saveDiff(GAME_ID, d.id)
    setDifficulty(d)
    setBest(getBest(GAME_ID, d.id))
    stateRef.current = makeState(DIFF_SETTINGS[d.id])
    setPhase('idle')
  }

  // Whack input (touch + click)
  useEffect(() => {
    const el = wrapRef.current
    if (!el) return

    function onInput(e) {
      if (e.target.closest('button')) return
      e.preventDefault()

      if (phase !== 'playing') { startGame(); return }

      const canvas = canvasRef.current
      const rect = canvas.getBoundingClientRect()
      const clientX = e.touches ? e.touches[0].clientX : e.clientX
      const clientY = e.touches ? e.touches[0].clientY : e.clientY
      const cx = (clientX - rect.left) * (W / rect.width)
      const cy = (clientY - rect.top) * (H / rect.height)
      tryWhack(stateRef.current, cx, cy)
    }

    el.addEventListener('touchstart', onInput, { passive: false })
    el.addEventListener('click', onInput)
    return () => {
      el.removeEventListener('touchstart', onInput)
      el.removeEventListener('click', onInput)
    }
  }, [phase]) // eslint-disable-line react-hooks/exhaustive-deps

  const isNewBest = score > 0 && score >= best

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

  return (
    <div style={S.wrapper}>
      <div style={S.topBar}>
        <button style={S.backBtn} onClick={onBack}>← 나가기</button>
      </div>
      <h1 style={S.title}>🐭 두더지 잡기</h1>
      <p style={S.subtitle}>{difficulty.emoji} {difficulty.label} · {score}점</p>

      <div ref={wrapRef} style={S.gameArea}>
        <canvas ref={canvasRef} width={W} height={H} style={S.canvas} />

        <div style={S.scoreCard}>
          <div style={S.scoreRow}>
            <div style={S.scoreItem}>
              <span style={S.scoreLabel}>점수</span>
              <span style={S.scoreVal}>{score}점</span>
            </div>
            <div style={S.scoreDivider} />
            <div style={S.scoreItem}>
              <span style={S.scoreLabel}>🏆 최고</span>
              <span style={S.scoreBest}>{best}점</span>
            </div>
          </div>
        </div>

        {phase === 'idle' && (
          <div style={S.overlay}>
            <div style={S.box}>
              <div style={S.oTitle}>🐭 두더지 잡기</div>
              <div style={S.desc}>
                <p>두더지가 나타나면 빠르게 탭하세요!</p>
                <p>⏱️ 60초 안에 최대한 많이 잡아요</p>
              </div>
              {diffPicker}
              <div style={S.bestLine}>🏆 최고 {best}점</div>
              <div style={S.btnGroup}>
                <button style={S.btnPrimary} onClick={startGame}>시작하기</button>
                <button style={S.btnBack2} onClick={onBack}>← 게임 선택</button>
              </div>
            </div>
          </div>
        )}

        {phase === 'gameover' && (
          <div style={S.overlay}>
            <div style={S.box}>
              <div style={S.oEmoji}>{isNewBest ? '🏆' : '😵'}</div>
              <div style={S.oTitle}>{isNewBest ? '신기록!' : '게임 오버!'}</div>
              <div style={S.bigScore}>{score}점</div>
              <div style={S.bestScore}>최고 {best}점</div>
              {isNewBest && <div style={S.newBest}>🎉 최고 기록!</div>}
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

// ── Game logic ────────────────────────────────────────────────────────

function updateMoles(s) {
  const { diff } = s
  for (const h of s.holes) {
    if (h.sparkTimer > 0) h.sparkTimer--

    if (h.state === 'rising') {
      h.offset = Math.min(1, h.offset + diff.riseSpeed)
      if (h.offset === 1) { h.state = 'up'; h.upTimer = diff.upFrames }
    } else if (h.state === 'up') {
      h.upTimer--
      if (h.upTimer <= 0) h.state = 'falling'
    } else if (h.state === 'falling') {
      h.offset = Math.max(0, h.offset - diff.riseSpeed * 1.6)
      if (h.offset === 0) { h.state = 'empty'; h.whacked = false }
    }
  }
}

function spawnMoles(s) {
  const { diff } = s
  s.spawnTimer++
  if (s.spawnTimer < s.nextSpawn) return
  s.spawnTimer = 0
  s.nextSpawn = randInt(diff.spawnMin, diff.spawnMax)

  let active = 0
  const empty = []
  for (let i = 0; i < s.holes.length; i++) {
    if (s.holes[i].state === 'empty') empty.push(i)
    else active++
  }
  if (active >= diff.maxMoles || empty.length === 0) return

  const idx = empty[randInt(0, empty.length - 1)]
  Object.assign(s.holes[idx], { state: 'rising', offset: 0, whacked: false, upTimer: 0 })
}

function tryWhack(s, cx, cy) {
  for (let i = 0; i < s.holes.length; i++) {
    const h = s.holes[i]
    if (h.state === 'empty' || h.whacked || h.offset < 0.25) continue
    const { x, y } = HOLES[i]
    const moleY = getMoleY(y, h.offset)
    if (dist(cx, cy, x, moleY) < HIT_R) {
      h.whacked = true
      h.state = 'falling'
      h.sparkTimer = 28
      s.score += 10
      return
    }
  }
}

// ── Drawing ───────────────────────────────────────────────────────────

function draw(ctx, s) {
  drawBg(ctx)
  for (let i = 0; i < HOLES.length; i++) drawHole(ctx, i, s.holes[i])
  drawTimerBar(ctx, s)
}

const bgCache = { ctx: null, sky: null, gnd: null }

function drawBg(ctx) {
  if (bgCache.ctx !== ctx) {
    bgCache.ctx = ctx
    const sky = ctx.createLinearGradient(0, 0, 0, H * 0.38)
    sky.addColorStop(0, '#87CEEB')
    sky.addColorStop(1, '#b0e0f5')
    bgCache.sky = sky
    const gnd = ctx.createLinearGradient(0, H * 0.38, 0, H)
    gnd.addColorStop(0, '#7ec850')
    gnd.addColorStop(0.08, '#5a9e2f')
    gnd.addColorStop(0.12, '#8B6914')
    gnd.addColorStop(1, '#6B4E11')
    bgCache.gnd = gnd
  }
  ctx.fillStyle = bgCache.sky
  ctx.fillRect(0, 0, W, H * 0.38)
  ctx.fillStyle = bgCache.gnd
  ctx.fillRect(0, H * 0.38, W, H)
}

const MOLE_R = 28

function getMoleY(holeY, offset) {
  // offset=0: fully hidden below clip; offset=1: head+body above hole center
  return holeY + 42 - offset * 57
}

function drawHole(ctx, idx, h) {
  const { x, y } = HOLES[idx]

  // 1. Dark hole interior + rim — drawn BEFORE mole, so mole is on top
  ctx.save()
  ctx.beginPath()
  ctx.ellipse(x, y, HOLE_RX, HOLE_RY, 0, 0, Math.PI * 2)
  ctx.fillStyle = '#1a0a04'
  ctx.fill()
  ctx.strokeStyle = '#3d2008'
  ctx.lineWidth = 3
  ctx.stroke()
  ctx.restore()

  // 2. Mole — clipped at hole center (y) so lower body stays hidden inside hole
  if (h.offset > 0) {
    const moleY = getMoleY(y, h.offset)

    ctx.save()
    ctx.beginPath()
    ctx.rect(0, 0, W, y)   // only draw above hole center
    ctx.clip()
    drawMole(ctx, x, moleY, MOLE_R, h.whacked)
    ctx.restore()

    if (h.sparkTimer > 0) {
      ctx.save()
      ctx.globalAlpha = h.sparkTimer / 28
      drawEmoji(ctx, '✨', x + 32, moleY - 22, 26)
      drawEmoji(ctx, '⭐', x - 28, moleY - 16, 20)
      ctx.restore()
    }
  }
}

function drawMole(ctx, x, y, r, whacked) {
  ctx.save()

  // Body: rounded top + taller body
  ctx.fillStyle = '#7B4F2E'
  ctx.beginPath()
  ctx.arc(x, y - r * 0.3, r, Math.PI, 0)   // top dome
  ctx.lineTo(x + r, y + r * 0.9)            // right side down
  ctx.lineTo(x - r, y + r * 0.9)            // left side
  ctx.closePath()
  ctx.fill()

  if (whacked) {
    // X eyes
    ctx.strokeStyle = '#fff'
    ctx.lineWidth = r * 0.13
    ctx.lineCap = 'round'
    const d = r * 0.15
    for (const ox of [-r * 0.35, r * 0.35]) {
      const ex = x + ox, ey = y - r * 0.5
      ctx.beginPath()
      ctx.moveTo(ex - d, ey - d); ctx.lineTo(ex + d, ey + d)
      ctx.moveTo(ex + d, ey - d); ctx.lineTo(ex - d, ey + d)
      ctx.stroke()
    }
  } else {
    // Eyes
    ctx.fillStyle = '#1a1a1a'
    ctx.beginPath(); ctx.arc(x - r * 0.35, y - r * 0.5, r * 0.13, 0, Math.PI * 2); ctx.fill()
    ctx.beginPath(); ctx.arc(x + r * 0.35, y - r * 0.5, r * 0.13, 0, Math.PI * 2); ctx.fill()
    // Shine
    ctx.fillStyle = '#fff'
    ctx.beginPath(); ctx.arc(x - r * 0.3, y - r * 0.56, r * 0.05, 0, Math.PI * 2); ctx.fill()
    ctx.beginPath(); ctx.arc(x + r * 0.4, y - r * 0.56, r * 0.05, 0, Math.PI * 2); ctx.fill()
    // Cute nose (small pink oval)
    ctx.fillStyle = '#ff9ab8'
    ctx.beginPath()
    ctx.ellipse(x, y - r * 0.2, r * 0.17, r * 0.12, 0, 0, Math.PI * 2)
    ctx.fill()
  }

  ctx.restore()
}

function drawTimerBar(ctx, s) {
  const bx = 20, by = 10, bw = W - 40, bh = 18, r = 9
  const ratio = s.timeLeft / GAME_DURATION
  const fillColor = ratio > 0.5 ? '#4CAF50' : ratio > 0.25 ? '#FFD700' : '#F44336'

  fillRoundRect(ctx, bx, by, bw, bh, r, 'rgba(0,0,0,0.45)')
  if (ratio > 0) {
    fillRoundRect(ctx, bx, by, Math.max(bw * ratio, r * 2), bh, r, fillColor)
  }

  // Time text
  ctx.fillStyle = '#fff'
  ctx.font = 'bold 13px sans-serif'
  ctx.textAlign = 'center'
  ctx.textBaseline = 'middle'
  ctx.fillText(`⏱ ${s.timeLeft}초`, W / 2, by + bh / 2)
  ctx.textAlign = 'left'
  ctx.textBaseline = 'alphabetic'
}

// ── Styles ────────────────────────────────────────────────────────────

const S = {
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
  },
  topBar: {
    width: '100%',
    maxWidth: W,
    display: 'flex',
    alignItems: 'center',
    marginBottom: 8,
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
    margin: '0 0 4px',
    textAlign: 'center',
  },
  subtitle: {
    color: '#aaa',
    fontSize: 'clamp(12px, 2.5vw, 15px)',
    margin: '0 0 10px',
    textAlign: 'center',
  },
  gameArea: {
    position: 'relative',
    width: '100%',
    maxWidth: W,
    margin: '0 auto',
    touchAction: 'none',
  },
  canvas: {
    display: 'block',
    width: '100%',
    height: 'auto',
    border: '4px solid #FFD700',
    borderRadius: '12px 12px 0 0',
    touchAction: 'none',
    userSelect: 'none',
  },
  scoreCard: {
    background: '#1e1e2e',
    border: '1px solid #333',
    borderTop: 'none',
    borderRadius: '0 0 12px 12px',
    padding: '10px 16px',
    marginBottom: 12,
  },
  scoreRow:     { display: 'flex', alignItems: 'center', justifyContent: 'center' },
  scoreItem:    { display: 'flex', flexDirection: 'column', alignItems: 'center', flex: 1, gap: 2 },
  scoreLabel:   { color: '#666', fontSize: 'clamp(10px, 2vw, 12px)' },
  scoreVal:     { color: '#FFD700', fontWeight: 'bold', fontSize: 'clamp(14px, 3vw, 18px)' },
  scoreBest:    { color: '#aaa', fontWeight: 'bold', fontSize: 'clamp(14px, 3vw, 18px)' },
  scoreDivider: { width: 1, height: 32, background: '#333', margin: '0 8px' },
  overlay: {
    position: 'fixed',
    inset: 0,
    background: 'rgba(0,0,0,0.78)',
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    justifyContent: 'center',
    zIndex: 100,
    overflowY: 'auto',
    padding: '16px 0',
  },
  box: {
    background: '#1e1e2e',
    border: '2px solid #333',
    borderRadius: 18,
    padding: 'clamp(20px, 4vw, 36px) clamp(24px, 5vw, 44px)',
    textAlign: 'center',
    display: 'flex',
    flexDirection: 'column',
    gap: 14,
    maxWidth: 360,
    width: '90%',
  },
  oEmoji:    { fontSize: 'clamp(36px, 8vw, 56px)' },
  oTitle:    { color: '#FFD700', fontSize: 'clamp(22px, 5vw, 34px)', fontWeight: 'bold', textShadow: '0 2px 18px rgba(255,215,0,0.4)' },
  desc:      { color: '#ccc', fontSize: 'clamp(13px, 2.5vw, 15px)', lineHeight: 1.7 },
  label:     { color: '#aaa', fontSize: 'clamp(11px, 2vw, 13px)', marginBottom: 8 },
  diffRow:   { display: 'flex', gap: 8, justifyContent: 'center' },
  diffBtn:   { flex: 1, padding: '8px 4px', borderRadius: 10, border: '2px solid #444', background: 'transparent', fontSize: 'clamp(12px, 2.5vw, 14px)', fontWeight: 'bold', cursor: 'pointer', transition: 'all 0.15s', color: '#888' },
  bestLine:  { color: '#aaa', fontSize: 'clamp(12px, 2.5vw, 14px)' },
  bigScore:  { color: '#fff', fontSize: 'clamp(28px, 6vw, 40px)', fontWeight: 'bold' },
  bestScore: { color: 'rgba(255,255,255,0.45)', fontSize: 'clamp(12px, 2.5vw, 15px)' },
  newBest:   { color: '#FFD700', fontSize: 'clamp(14px, 3vw, 18px)', fontWeight: 'bold' },
  btnGroup:  { display: 'flex', flexDirection: 'column', gap: 8, width: '100%' },
  btnPrimary: { background: 'linear-gradient(135deg, #FFD700, #FFA500)', color: '#1a1a2e', border: 'none', borderRadius: 14, padding: 'clamp(10px, 2vw, 14px) clamp(20px, 4vw, 36px)', fontSize: 'clamp(15px, 3vw, 18px)', fontWeight: 'bold', cursor: 'pointer', boxShadow: '0 4px 20px rgba(255,165,0,0.4)' },
  btnBack2:   { background: 'transparent', color: '#aaa', border: '2px solid #444', borderRadius: 14, padding: 'clamp(8px, 1.5vw, 10px) clamp(16px, 3vw, 24px)', fontSize: 'clamp(13px, 2.5vw, 15px)', fontWeight: 'bold', cursor: 'pointer' },
}
