import { useEffect, useRef, useState } from 'react'
import { getSavedDiff, saveDiff, getBest, saveBest, clamp } from '../utils/gameUtils'

const W = 480
const H = 640
const GAME_ID = 'brick'
const HUD_H = 50
const PAD = 12
const BRICK_COLS = 8
const BRICK_GAP = 4
const BRICK_W = Math.floor((W - 2 * PAD - BRICK_GAP * (BRICK_COLS - 1)) / BRICK_COLS)
const BRICK_H = 20
const BALL_R = 8
const PADDLE_H = 12
const PADDLE_Y = H - 55
const LIVES = 3
const PADDLE_SPD = 7
const ITEM_W = 38
const ITEM_H = 18
const ITEM_SPD = 2
const DROP_CHANCE = 0.28

const ROW_COLORS = ['#ef5350', '#ff9800', '#ffee58', '#66bb6a', '#42a5f5', '#ab47bc', '#26c6da', '#ec407a']
const ROW_PTS    = [50, 40, 30, 20, 10, 5, 8, 15]

const ITEM_TYPES   = ['MULTI', 'WIDE', 'LIFE', 'NARROW', 'SPEED']
const ITEM_WEIGHTS = [3, 3, 2, 2, 2]
const ITEM_CFG = {
  MULTI:  { emoji: '🎱', color: '#0d47a1', border: '#42a5f5', label: '멀티볼' },
  WIDE:   { emoji: '↔',  color: '#1b5e20', border: '#66bb6a', label: '바 확장' },
  LIFE:   { emoji: '❤',  color: '#b71c1c', border: '#ef5350', label: '목숨+1' },
  NARROW: { emoji: '↕',  color: '#bf360c', border: '#ff7043', label: '바 축소' },
  SPEED:  { emoji: '⚡', color: '#e65100', border: '#ffa726', label: '속도↑'  },
}

const DIFFICULTIES = [
  { id: 'easy',   label: '쉬움',   emoji: '🌱', color: '#4CAF50', rows: 4, speed: 4.0, paddleW: 110 },
  { id: 'normal', label: '보통',   emoji: '⚡', color: '#FFD700', rows: 5, speed: 5.5, paddleW: 85  },
  { id: 'hard',   label: '어려움', emoji: '🔥', color: '#F44336', rows: 6, speed: 7.5, paddleW: 65  },
]

// ── 헬퍼 ─────────────────────────────────────────────────────────────

function rr(ctx, x, y, w, h, r) {
  ctx.beginPath()
  ctx.moveTo(x + r, y)
  ctx.lineTo(x + w - r, y)
  ctx.quadraticCurveTo(x + w, y, x + w, y + r)
  ctx.lineTo(x + w, y + h - r)
  ctx.quadraticCurveTo(x + w, y + h, x + w - r, y + h)
  ctx.lineTo(x + r, y + h)
  ctx.quadraticCurveTo(x, y + h, x, y + h - r)
  ctx.lineTo(x, y + r)
  ctx.quadraticCurveTo(x, y, x + r, y)
  ctx.closePath()
}

function pickItemType() {
  const total = ITEM_WEIGHTS.reduce((s, w) => s + w, 0)
  let r = Math.random() * total
  for (let i = 0; i < ITEM_TYPES.length; i++) {
    r -= ITEM_WEIGHTS[i]
    if (r <= 0) return ITEM_TYPES[i]
  }
  return ITEM_TYPES[0]
}

function makeBall(x, y) {
  return { x, y, vx: 0, vy: 0, launched: false }
}

function makeBricks(rows) {
  const bricks = []
  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < BRICK_COLS; c++) {
      bricks.push({
        x: PAD + c * (BRICK_W + BRICK_GAP),
        y: HUD_H + 20 + r * (BRICK_H + BRICK_GAP),
        w: BRICK_W, h: BRICK_H,
        color: ROW_COLORS[r % ROW_COLORS.length],
        pts: ROW_PTS[r % ROW_PTS.length],
        alive: true,
      })
    }
  }
  return bricks
}

function makeState(diff) {
  const paddleX = (W - diff.paddleW) / 2
  return {
    balls: [makeBall(W / 2, PADDLE_Y - BALL_R)],
    paddle: { x: paddleX, w: diff.paddleW, baseW: diff.paddleW, targetX: paddleX },
    bricks: makeBricks(diff.rows),
    items: [],
    score: 0, lives: LIVES, frame: 0,
    speed: diff.speed,
    stage: 1,
    baseRows: diff.rows,
  }
}

function launchBall(s) {
  const ball = s.balls.find(b => !b.launched)
  if (!ball) return
  const angle = (Math.random() - 0.5) * (Math.PI / 3)
  ball.vx = s.speed * Math.sin(angle)
  ball.vy = -s.speed * Math.cos(angle)
  ball.launched = true
}

function applyItem(s, type) {
  switch (type) {
    case 'MULTI': {
      const src = s.balls.find(b => b.launched)
      if (src) {
        s.balls.push({ x: src.x, y: src.y, vx: -src.vx, vy: src.vy, launched: true })
      } else {
        // 대기 중인 공을 발사하고 하나 더 추가
        launchBall(s)
        const launched = s.balls.find(b => b.launched)
        if (launched) s.balls.push({ x: launched.x, y: launched.y, vx: -launched.vx, vy: launched.vy, launched: true })
      }
      break
    }
    case 'WIDE':
      s.paddle.w = Math.min(Math.round(s.paddle.baseW * 1.6), W - 2 * PAD)
      break
    case 'LIFE':
      s.lives = Math.min(s.lives + 1, 9)
      break
    case 'NARROW':
      s.paddle.w = Math.max(Math.round(s.paddle.baseW * 0.55), 32)
      break
    case 'SPEED':
      s.speed = Math.min(s.speed * 1.25, 16)
      for (const b of s.balls) {
        if (!b.launched) continue
        const cur = Math.sqrt(b.vx ** 2 + b.vy ** 2)
        if (cur === 0) continue
        b.vx = b.vx / cur * s.speed
        b.vy = b.vy / cur * s.speed
      }
      break
  }
}

function nextStage(s) {
  s.stage++
  const rows = Math.min(s.baseRows + s.stage - 1, 8)
  s.bricks = makeBricks(rows)
  s.items = []
  s.speed += 0.4
  s.paddle.w = s.paddle.baseW
  s.balls = [makeBall(s.paddle.x + s.paddle.w / 2, PADDLE_Y - BALL_R)]
}

// ── 드로우 ────────────────────────────────────────────────────────────

function drawScene(ctx, s, paddleGrad) {
  const { balls, paddle, bricks, items, score, lives, stage } = s

  ctx.fillStyle = '#0f0f1e'
  ctx.fillRect(0, 0, W, H)

  // HUD
  ctx.fillStyle = '#13132a'
  ctx.fillRect(0, 0, W, HUD_H)
  ctx.fillStyle = '#2a2a4a'
  ctx.fillRect(0, HUD_H - 1, W, 1)

  ctx.textBaseline = 'middle'
  ctx.fillStyle = '#FFD700'
  ctx.font = 'bold 18px "Segoe UI", sans-serif'
  ctx.textAlign = 'left'
  ctx.fillText(score + '점', PAD + 6, HUD_H / 2)

  ctx.fillStyle = '#aaa'
  ctx.font = 'bold 14px "Segoe UI", sans-serif'
  ctx.textAlign = 'center'
  ctx.fillText('STAGE ' + stage, W / 2, HUD_H / 2)

  ctx.fillStyle = '#eee'
  ctx.font = '16px "Segoe UI Emoji", serif'
  ctx.textAlign = 'right'
  ctx.fillText('❤ × ' + lives, W - PAD - 6, HUD_H / 2)
  ctx.textAlign = 'left'
  ctx.textBaseline = 'alphabetic'

  // 벽돌
  for (const b of bricks) {
    if (!b.alive) continue
    ctx.fillStyle = b.color
    rr(ctx, b.x, b.y, b.w, b.h, 3)
    ctx.fill()
    ctx.fillStyle = 'rgba(255,255,255,0.18)'
    ctx.fillRect(b.x + 2, b.y + 2, b.w - 4, 5)
  }

  // 아이템
  ctx.font = '13px "Segoe UI Emoji", sans-serif'
  for (const item of items) {
    const cfg = ITEM_CFG[item.type]
    ctx.fillStyle = cfg.color
    rr(ctx, item.x, item.y, ITEM_W, ITEM_H, 4)
    ctx.fill()
    ctx.strokeStyle = cfg.border
    ctx.lineWidth = 1.5
    rr(ctx, item.x, item.y, ITEM_W, ITEM_H, 4)
    ctx.stroke()
    ctx.fillStyle = '#fff'
    ctx.textAlign = 'center'
    ctx.textBaseline = 'middle'
    ctx.fillText(cfg.emoji, item.x + ITEM_W / 2, item.y + ITEM_H / 2)
  }
  ctx.textAlign = 'left'
  ctx.textBaseline = 'alphabetic'

  // 패들
  ctx.fillStyle = paddleGrad
  rr(ctx, paddle.x, PADDLE_Y, paddle.w, PADDLE_H, 6)
  ctx.fill()

  // 공들
  ctx.shadowColor = '#87CEEB'
  ctx.shadowBlur = 14
  for (const ball of balls) {
    ctx.beginPath()
    ctx.arc(ball.x, ball.y, BALL_R, 0, Math.PI * 2)
    ctx.fillStyle = '#ffffff'
    ctx.fill()
  }
  ctx.shadowBlur = 0

  // 발사 힌트
  if (balls.some(b => !b.launched)) {
    ctx.fillStyle = 'rgba(255,255,255,0.65)'
    ctx.font = '15px "Segoe UI", sans-serif'
    ctx.textAlign = 'center'
    ctx.textBaseline = 'middle'
    ctx.fillText('탭하여 공 발사!', W / 2, PADDLE_Y - 28)
    ctx.textAlign = 'left'
    ctx.textBaseline = 'alphabetic'
  }
}

// ── 컴포넌트 ─────────────────────────────────────────────────────────

export default function BrickGame({ onBack, onStart }) {
  const [difficulty, setDifficulty] = useState(() => getSavedDiff(GAME_ID, DIFFICULTIES))
  const [phase, setPhase]           = useState('idle')
  const [score, setScore]           = useState(0)
  const [stage, setStage]           = useState(1)
  const [best, setBest]             = useState(() => getBest(GAME_ID, difficulty.id))

  const canvasRef = useRef(null)
  const wrapRef   = useRef(null)
  const animRef   = useRef(null)
  const stateRef  = useRef(null)
  const keysRef   = useRef(new Set())

  // ── 키보드 ────────────────────────────────────────────────────────
  useEffect(() => {
    function onKeyDown(e) {
      keysRef.current.add(e.code)
      if (['Space', 'ArrowLeft', 'ArrowRight', 'KeyA', 'KeyD'].includes(e.code)) e.preventDefault()
      if (e.code === 'Space' && phase === 'playing' && stateRef.current) launchBall(stateRef.current)
    }
    function onKeyUp(e) { keysRef.current.delete(e.code) }
    window.addEventListener('keydown', onKeyDown)
    window.addEventListener('keyup', onKeyUp)
    return () => {
      window.removeEventListener('keydown', onKeyDown)
      window.removeEventListener('keyup', onKeyUp)
    }
  }, [phase])

  // ── 마우스/터치 패들 조작 ─────────────────────────────────────────
  useEffect(() => {
    const el = wrapRef.current
    if (!el || phase !== 'playing') return

    function movePaddle(clientX) {
      const rect = canvasRef.current.getBoundingClientRect()
      const cx = (clientX - rect.left) * (W / rect.width)
      const s = stateRef.current
      if (s) s.paddle.targetX = cx - s.paddle.w / 2
    }

    function onMouseMove(e) { movePaddle(e.clientX) }
    function onTouchMove(e) { e.preventDefault(); movePaddle(e.touches[0].clientX) }
    function onTouchStart(e) {
      if (e.target.closest('button')) return
      e.preventDefault()
      movePaddle(e.touches[0].clientX)
      if (stateRef.current) launchBall(stateRef.current)
    }
    function onClick(e) {
      if (e.target.closest('button')) return
      if (stateRef.current) launchBall(stateRef.current)
    }

    el.addEventListener('mousemove', onMouseMove)
    el.addEventListener('touchmove', onTouchMove, { passive: false })
    el.addEventListener('touchstart', onTouchStart, { passive: false })
    el.addEventListener('click', onClick)
    return () => {
      el.removeEventListener('mousemove', onMouseMove)
      el.removeEventListener('touchmove', onTouchMove)
      el.removeEventListener('touchstart', onTouchStart)
      el.removeEventListener('click', onClick)
    }
  }, [phase])

  // ── 게임 루프 ─────────────────────────────────────────────────────
  useEffect(() => {
    if (phase !== 'playing') return
    const canvas = canvasRef.current
    const ctx = canvas.getContext('2d')
    const paddleGrad = ctx.createLinearGradient(0, PADDLE_Y, 0, PADDLE_Y + PADDLE_H)
    paddleGrad.addColorStop(0, '#FFD700')
    paddleGrad.addColorStop(1, '#FFA500')
    let alive = true

    function loop() {
      if (!alive) return
      animRef.current = requestAnimationFrame(loop)
      const s = stateRef.current
      s.frame++

      // 패들 이동
      if (keysRef.current.has('ArrowLeft') || keysRef.current.has('KeyA')) {
        s.paddle.x = clamp(s.paddle.x - PADDLE_SPD, PAD, W - PAD - s.paddle.w)
        s.paddle.targetX = s.paddle.x
      }
      if (keysRef.current.has('ArrowRight') || keysRef.current.has('KeyD')) {
        s.paddle.x = clamp(s.paddle.x + PADDLE_SPD, PAD, W - PAD - s.paddle.w)
        s.paddle.targetX = s.paddle.x
      }
      s.paddle.x += (s.paddle.targetX - s.paddle.x) * 0.4
      s.paddle.x = clamp(s.paddle.x, PAD, W - PAD - s.paddle.w)

      // 공 이동 & 충돌
      for (let bi = s.balls.length - 1; bi >= 0; bi--) {
        const ball = s.balls[bi]
        if (!ball.launched) {
          ball.x = s.paddle.x + s.paddle.w / 2
          ball.y = PADDLE_Y - BALL_R
          continue
        }

        ball.x += ball.vx
        ball.y += ball.vy

        // 벽
        if (ball.x - BALL_R <= PAD)     { ball.x = PAD + BALL_R;     ball.vx =  Math.abs(ball.vx) }
        if (ball.x + BALL_R >= W - PAD) { ball.x = W - PAD - BALL_R; ball.vx = -Math.abs(ball.vx) }
        if (ball.y - BALL_R <= HUD_H)   { ball.y = HUD_H + BALL_R;   ball.vy =  Math.abs(ball.vy) }

        // 패들
        if (ball.vy > 0 &&
            ball.y + BALL_R >= PADDLE_Y &&
            ball.y - BALL_R <= PADDLE_Y + PADDLE_H &&
            ball.x >= s.paddle.x - BALL_R &&
            ball.x <= s.paddle.x + s.paddle.w + BALL_R) {
          ball.y = PADDLE_Y - BALL_R
          const hitPos = (ball.x - s.paddle.x) / s.paddle.w
          const angle = (hitPos - 0.5) * (Math.PI * 2 / 3)
          ball.vx = s.speed * Math.sin(angle)
          ball.vy = -s.speed * Math.cos(angle)
        }

        // 낙사
        if (ball.y - BALL_R > H) {
          if (s.balls.length > 1) { s.balls.splice(bi, 1); continue }
          s.lives--
          if (s.lives <= 0) {
            alive = false
            cancelAnimationFrame(animRef.current)
            if (saveBest(GAME_ID, difficulty.id, s.score)) setBest(s.score)
            setScore(s.score)
            setPhase('gameover')
            return
          }
          ball.x = s.paddle.x + s.paddle.w / 2
          ball.y = PADDLE_Y - BALL_R
          ball.vx = 0; ball.vy = 0; ball.launched = false
        }

        // 벽돌 충돌
        for (const b of s.bricks) {
          if (!b.alive) continue
          if (ball.x + BALL_R < b.x || ball.x - BALL_R > b.x + b.w) continue
          if (ball.y + BALL_R < b.y || ball.y - BALL_R > b.y + b.h) continue
          b.alive = false
          s.score += b.pts
          if (Math.random() < DROP_CHANCE) {
            s.items.push({ x: b.x + b.w / 2 - ITEM_W / 2, y: b.y + b.h, type: pickItemType() })
          }
          const ox = Math.min(ball.x + BALL_R - b.x, b.x + b.w - (ball.x - BALL_R))
          const oy = Math.min(ball.y + BALL_R - b.y, b.y + b.h - (ball.y - BALL_R))
          if (oy < ox) ball.vy = -ball.vy; else ball.vx = -ball.vx
          break
        }
      }

      // 아이템 이동 & 획득
      for (let ii = s.items.length - 1; ii >= 0; ii--) {
        const item = s.items[ii]
        item.y += ITEM_SPD
        if (item.y + ITEM_H >= PADDLE_Y &&
            item.y <= PADDLE_Y + PADDLE_H + ITEM_SPD &&
            item.x + ITEM_W >= s.paddle.x &&
            item.x <= s.paddle.x + s.paddle.w) {
          applyItem(s, item.type)
          s.items.splice(ii, 1)
        } else if (item.y > H) {
          s.items.splice(ii, 1)
        }
      }

      // 스테이지 클리어
      if (s.bricks.every(b => !b.alive)) {
        nextStage(s)
        setStage(s.stage)
      }

      setScore(s.score)
      drawScene(ctx, s, paddleGrad)
    }

    animRef.current = requestAnimationFrame(loop)
    return () => { alive = false; cancelAnimationFrame(animRef.current) }
  }, [phase, difficulty])

  // ── 시작 ─────────────────────────────────────────────────────────
  function startGame() {
    onStart?.()
    stateRef.current = makeState(difficulty)
    setScore(0)
    setStage(1)
    setPhase('playing')
  }

  function changeDiff(d) {
    saveDiff(GAME_ID, d.id)
    setDifficulty(d)
    setBest(getBest(GAME_ID, d.id))
    setPhase('idle')
  }

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

  const resultOverlay = (phase === 'gameover') && (
    <div style={S.overlay}>
      <div style={S.box}>
        <div style={S.oEmoji}>{isNewBest ? '🏆' : '💔'}</div>
        <div style={S.oTitle}>{isNewBest ? '신기록!' : '게임 오버!'}</div>
        <div style={S.stageReached}>🏰 {stage}스테이지까지!</div>
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
  )

  return (
    <div style={S.wrapper}>
      <div style={S.topBar}>
        <button style={S.backBtn} onClick={onBack}>← 나가기</button>
      </div>
      <h1 style={S.title}>🧱 벽돌 깨기</h1>
      <p style={S.subtitle}>{difficulty.emoji} {difficulty.label} · STAGE {stage} · {score}점</p>

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
              <span style={S.scoreLabel}>스테이지</span>
              <span style={S.scoreVal}>{stage}</span>
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
              <div style={S.oTitle}>🧱 벽돌 깨기</div>
              <div style={S.desc}>
                <p>공을 튕겨 벽돌을 부수고<br />스테이지를 클리어하세요!</p>
                <p>🎱 멀티볼 &nbsp; ↔ 바 확장 &nbsp; ❤ 목숨+1<br />↕ 바 축소 &nbsp; ⚡ 속도↑ (조심!)</p>
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

        {resultOverlay}
      </div>
    </div>
  )
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
  oEmoji:      { fontSize: 'clamp(36px, 8vw, 56px)' },
  oTitle:      { color: '#FFD700', fontSize: 'clamp(22px, 5vw, 34px)', fontWeight: 'bold', textShadow: '0 2px 18px rgba(255,215,0,0.4)' },
  stageReached:{ color: '#aaa', fontSize: 'clamp(14px, 3vw, 18px)' },
  desc:        { color: '#ccc', fontSize: 'clamp(13px, 2.5vw, 15px)', lineHeight: 1.7 },
  label:       { color: '#aaa', fontSize: 'clamp(11px, 2vw, 13px)', marginBottom: 8 },
  diffRow:     { display: 'flex', gap: 8, justifyContent: 'center' },
  diffBtn:     { flex: 1, padding: '8px 4px', borderRadius: 10, border: '2px solid #444', background: 'transparent', fontSize: 'clamp(12px, 2.5vw, 14px)', fontWeight: 'bold', cursor: 'pointer', transition: 'all 0.15s', color: '#888' },
  bestLine:    { color: '#aaa', fontSize: 'clamp(12px, 2.5vw, 14px)' },
  bigScore:    { color: '#fff', fontSize: 'clamp(28px, 6vw, 40px)', fontWeight: 'bold' },
  bestScore:   { color: 'rgba(255,255,255,0.45)', fontSize: 'clamp(12px, 2.5vw, 15px)' },
  newBest:     { color: '#FFD700', fontSize: 'clamp(14px, 3vw, 18px)', fontWeight: 'bold' },
  btnGroup:    { display: 'flex', flexDirection: 'column', gap: 8, width: '100%' },
  btnPrimary:  { background: 'linear-gradient(135deg, #FFD700, #FFA500)', color: '#1a1a2e', border: 'none', borderRadius: 14, padding: 'clamp(10px, 2vw, 14px) clamp(20px, 4vw, 36px)', fontSize: 'clamp(15px, 3vw, 18px)', fontWeight: 'bold', cursor: 'pointer', boxShadow: '0 4px 20px rgba(255,165,0,0.4)' },
  btnBack2:    { background: 'transparent', color: '#aaa', border: '2px solid #444', borderRadius: 14, padding: 'clamp(8px, 1.5vw, 10px) clamp(16px, 3vw, 24px)', fontSize: 'clamp(13px, 2.5vw, 15px)', fontWeight: 'bold', cursor: 'pointer' },
}
