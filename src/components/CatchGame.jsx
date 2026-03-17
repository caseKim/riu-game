import { useEffect, useRef, useState } from 'react'
import { getBest, saveBest, getSavedDiff, saveDiff, drawEmoji, drawText, randInt, fillRoundRect, clamp } from '../utils/gameUtils'

const W = 480
const H = 620
const GAME_ID = 'catch'
const BASKET_W = 88
const BASKET_H = 48
const BASKET_Y = H - 58
const INIT_LIVES = 3

const FRUITS = ['🍎','🍊','🍋','🍇','🍓','🍑','🍒','🍉','🍌','🍍']
const ITEM_SIZE = 44

const DIFFICULTIES = [
  { id: 'easy',   label: '쉬움',   emoji: '🌱', color: '#4CAF50' },
  { id: 'normal', label: '보통',   emoji: '⚡', color: '#FFD700' },
  { id: 'hard',   label: '어려움', emoji: '🔥', color: '#F44336' },
]

const DIFF_SETTINGS = {
  easy:   { fallSpeed: 2.2, spawnMin: 80, spawnMax: 115, bombChance: 0,    goldChance: 0.12, maxItems: 4, basketSpd: 7 },
  normal: { fallSpeed: 3.2, spawnMin: 52, spawnMax: 78,  bombChance: 0.20, goldChance: 0.10, maxItems: 5, basketSpd: 6 },
  hard:   { fallSpeed: 5.0, spawnMin: 28, spawnMax: 46,  bombChance: 0.32, goldChance: 0.08, maxItems: 6, basketSpd: 5.5 },
}

function makeState(diff) {
  return {
    basketX: W / 2,
    items: [],
    popups: [],
    score: 0,
    lives: INIT_LIVES,
    frame: 0,
    spawnTimer: 0,
    nextSpawn: randInt(diff.spawnMin, diff.spawnMax),
    diff,
  }
}

export default function CatchGame({ onBack, onStart }) {
  const [difficulty, setDifficulty] = useState(() => getSavedDiff(GAME_ID, DIFFICULTIES))
  const diff = DIFF_SETTINGS[difficulty.id]

  const [phase, setPhase]   = useState('idle')
  const [score, setScore]   = useState(0)
  const [lives, setLives]   = useState(INIT_LIVES)
  const [best,  setBest]    = useState(() => getBest(GAME_ID, difficulty.id))

  const canvasRef     = useRef(null)
  const wrapRef       = useRef(null)
  const animRef       = useRef(null)
  const stateRef      = useRef(null)
  const keysRef       = useRef({})
  const gameOverAtRef = useRef(0)

  if (stateRef.current == null) stateRef.current = makeState(diff)

  // Keyboard
  useEffect(() => {
    const onDown = e => { keysRef.current[e.key] = true }
    const onUp   = e => { keysRef.current[e.key] = false }
    window.addEventListener('keydown', onDown)
    window.addEventListener('keyup', onUp)
    return () => {
      window.removeEventListener('keydown', onDown)
      window.removeEventListener('keyup', onUp)
    }
  }, [])

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

      // Basket movement via keys
      const spd = s.diff.basketSpd
      const keys = keysRef.current
      if (keys['ArrowLeft']  || keys['a'] || keys['A']) s.basketX -= spd
      if (keys['ArrowRight'] || keys['d'] || keys['D']) s.basketX += spd
      s.basketX = clamp(s.basketX, BASKET_W / 2, W - BASKET_W / 2)

      updateItems(s)
      spawnItems(s)
      setScore(s.score)
      setLives(s.lives)

      if (s.lives <= 0) {
        gameOverAtRef.current = Date.now()
        if (saveBest(GAME_ID, difficulty.id, s.score)) setBest(s.score)
        draw(ctx, s)
        setPhase('gameover')
        return
      }

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
    setLives(INIT_LIVES)
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

  // Touch: follow finger to move basket
  useEffect(() => {
    const el = wrapRef.current
    if (!el) return

    function getCanvasX(clientX) {
      const rect = canvasRef.current.getBoundingClientRect()
      return (clientX - rect.left) * (W / rect.width)
    }

    function onTouchStart(e) {
      if (e.target.closest('button')) return
      e.preventDefault()
      if (phase !== 'playing') { startGame(); return }
      stateRef.current.basketX = clamp(getCanvasX(e.touches[0].clientX), BASKET_W / 2, W - BASKET_W / 2)
    }

    function onTouchMove(e) {
      if (phase !== 'playing') return
      e.preventDefault()
      stateRef.current.basketX = clamp(getCanvasX(e.touches[0].clientX), BASKET_W / 2, W - BASKET_W / 2)
    }

    function onClick(e) {
      if (e.target.closest('button')) return
      if (phase !== 'playing') startGame()
    }

    el.addEventListener('touchstart', onTouchStart, { passive: false })
    el.addEventListener('touchmove',  onTouchMove,  { passive: false })
    el.addEventListener('click', onClick)
    return () => {
      el.removeEventListener('touchstart', onTouchStart)
      el.removeEventListener('touchmove',  onTouchMove)
      el.removeEventListener('click', onClick)
    }
  }, [phase]) // eslint-disable-line react-hooks/exhaustive-deps

  const isNewBest = score > 0 && score >= best
  const livesStr = '❤️'.repeat(lives) + '🖤'.repeat(Math.max(0, INIT_LIVES - lives))

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
      <h1 style={S.title}>🧺 낙하물 받기</h1>
      <p style={S.subtitle}>{difficulty.emoji} {difficulty.label} · {score}점 · {livesStr}</p>

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
              <div style={S.oTitle}>🧺 낙하물 받기</div>
              <div style={S.desc}>
                <p>바구니를 움직여 과일을 받아요!</p>
                <p>💣 폭탄을 받으면 목숨이 줄어요</p>
                <p>⭐ 별을 받으면 30점 보너스!</p>
                <p>❤️ 목숨 {INIT_LIVES}개 소진 시 종료</p>
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
              <div style={S.oEmoji}>{isNewBest ? '🏆' : '😢'}</div>
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

// ── Game logic ─────────────────────────────────────────────────────────

function updateItems(s) {
  for (let i = s.items.length - 1; i >= 0; i--) {
    const item = s.items[i]
    item.y += item.vy

    const basketLeft  = s.basketX - BASKET_W / 2 - ITEM_SIZE * 0.3
    const basketRight = s.basketX + BASKET_W / 2 + ITEM_SIZE * 0.3
    const catchTop    = BASKET_Y - BASKET_H * 0.55
    const catchBot    = BASKET_Y + BASKET_H * 0.1

    if (item.y >= catchTop && item.y <= catchBot && item.x >= basketLeft && item.x <= basketRight) {
      // Caught!
      if (item.isBomb) {
        s.lives = Math.max(0, s.lives - 1)
        s.popups.push({ text: '💥 -목숨', x: item.x, y: item.y, timer: 45, color: '#ff4444' })
      } else {
        const pts = item.isGold ? 30 : 10
        s.score += pts
        s.popups.push({ text: `+${pts}`, x: item.x, y: item.y - 10, timer: 45, color: item.isGold ? '#FFD700' : '#88ff88' })
      }
      s.items.splice(i, 1)
      continue
    }

    // Fell off screen — only bombs disappear silently, fruits do not penalize
    if (item.y - ITEM_SIZE / 2 > H) {
      s.items.splice(i, 1)
    }
  }

  for (let i = s.popups.length - 1; i >= 0; i--) {
    s.popups[i].timer--
    s.popups[i].y -= 0.8
    if (s.popups[i].timer <= 0) s.popups.splice(i, 1)
  }
}

function spawnItems(s) {
  const { diff } = s
  s.spawnTimer++
  if (s.spawnTimer < s.nextSpawn) return
  s.spawnTimer = 0
  s.nextSpawn = randInt(diff.spawnMin, diff.spawnMax)
  if (s.items.length >= diff.maxItems) return

  const r = Math.random()
  let emoji, isBomb = false, isGold = false
  if (r < diff.bombChance) {
    emoji = '💣'; isBomb = true
  } else if (r < diff.bombChance + diff.goldChance) {
    emoji = '⭐'; isGold = true
  } else {
    emoji = FRUITS[randInt(0, FRUITS.length - 1)]
  }

  s.items.push({
    emoji, isBomb, isGold,
    x:  randInt(ITEM_SIZE, W - ITEM_SIZE),
    y:  -ITEM_SIZE / 2,
    vy: diff.fallSpeed + Math.random() * 1.4,
  })
}

// ── Drawing ────────────────────────────────────────────────────────────

const bgCache = { gradient: null, ctx: null }

function draw(ctx, s) {
  // Sky background
  if (bgCache.ctx !== ctx) {
    bgCache.ctx = ctx
    const g = ctx.createLinearGradient(0, 0, 0, H)
    g.addColorStop(0,   '#5bb8f5')
    g.addColorStop(0.6, '#a8d8f0')
    g.addColorStop(1,   '#c8edc0')
    bgCache.gradient = g
  }
  ctx.fillStyle = bgCache.gradient
  ctx.fillRect(0, 0, W, H)

  // Ground
  ctx.fillStyle = '#7ec850'
  ctx.fillRect(0, H - 20, W, 20)
  ctx.fillStyle = '#5a9e2f'
  ctx.fillRect(0, H - 22, W, 5)

  // Clouds (decorative, position based on frame)
  drawClouds(ctx, s.frame)

  // Items
  for (const item of s.items) {
    if (item.isGold) {
      ctx.save()
      ctx.shadowBlur = 18
      ctx.shadowColor = '#FFD700'
      drawEmoji(ctx, item.emoji, item.x, item.y, ITEM_SIZE + 6)
      ctx.restore()
    } else {
      drawEmoji(ctx, item.emoji, item.x, item.y, ITEM_SIZE)
    }
  }

  // Basket
  drawBasket(ctx, s.basketX)

  // HUD: lives
  const hearts = '❤️'.repeat(s.lives) + '🖤'.repeat(Math.max(0, INIT_LIVES - s.lives))
  fillRoundRect(ctx, 8, 8, 94, 30, 8, 'rgba(0,0,0,0.28)')
  drawText(ctx, hearts, 13, 23, { size: 20, align: 'left' })

  // Popups
  for (const p of s.popups) {
    ctx.save()
    ctx.globalAlpha = Math.min(1, p.timer / 18)
    drawText(ctx, p.text, p.x, p.y, { size: 22, color: p.color || '#fff', bold: true, glow: { color: 'rgba(0,0,0,0.5)', blur: 6 } })
    ctx.restore()
  }
}

const CLOUD_DEFS = [
  { ox: 60,  speed: 0.12, y: 60, rx: 40, ry: 18 },
  { ox: 230, speed: 0.07, y: 38, rx: 55, ry: 22 },
  { ox: 380, speed: 0.10, y: 80, rx: 35, ry: 15 },
]

function drawClouds(ctx, frame) {
  ctx.save()
  ctx.fillStyle = 'rgba(255,255,255,0.75)'
  for (const c of CLOUD_DEFS) {
    const cx = (c.ox + frame * c.speed) % (W + 120) - 60
    ctx.beginPath()
    ctx.ellipse(cx, c.y, c.rx, c.ry, 0, 0, Math.PI * 2)
    ctx.fill()
    ctx.beginPath()
    ctx.ellipse(cx - c.rx * 0.4, c.y + 4, c.rx * 0.6, c.ry * 0.8, 0, 0, Math.PI * 2)
    ctx.fill()
    ctx.beginPath()
    ctx.ellipse(cx + c.rx * 0.4, c.y + 6, c.rx * 0.55, c.ry * 0.75, 0, 0, Math.PI * 2)
    ctx.fill()
  }
  ctx.restore()
}

function drawBasket(ctx, cx) {
  const x = cx - BASKET_W / 2
  const y = BASKET_Y - BASKET_H / 2

  ctx.save()
  ctx.shadowBlur = 10
  ctx.shadowColor = 'rgba(0,0,0,0.25)'

  // Rim
  fillRoundRect(ctx, x - 5, y, BASKET_W + 10, 14, 7, '#e8a020')

  // Body
  ctx.beginPath()
  ctx.moveTo(x, y + 10)
  ctx.lineTo(x + 6, y + BASKET_H)
  ctx.lineTo(x + BASKET_W - 6, y + BASKET_H)
  ctx.lineTo(x + BASKET_W, y + 10)
  ctx.closePath()
  ctx.fillStyle = '#c8860a'
  ctx.fill()

  // Weave lines (horizontal)
  ctx.save()
  ctx.beginPath()
  ctx.moveTo(x, y + 10)
  ctx.lineTo(x + 6, y + BASKET_H)
  ctx.lineTo(x + BASKET_W - 6, y + BASKET_H)
  ctx.lineTo(x + BASKET_W, y + 10)
  ctx.closePath()
  ctx.clip()
  ctx.strokeStyle = 'rgba(0,0,0,0.18)'
  ctx.lineWidth = 1.5
  for (let ly = y + 18; ly < y + BASKET_H; ly += 9) {
    ctx.beginPath(); ctx.moveTo(x, ly); ctx.lineTo(x + BASKET_W, ly); ctx.stroke()
  }
  for (let lx = x + 12; lx < x + BASKET_W; lx += 12) {
    ctx.beginPath(); ctx.moveTo(lx, y + 10); ctx.lineTo(lx, y + BASKET_H); ctx.stroke()
  }
  ctx.restore()

  ctx.restore()
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
