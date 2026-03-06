import { useEffect, useRef, useState, useCallback } from 'react'

// ── World constants ───────────────────────────────────────────────────────────
const W_W = 2400
const W_H = 2400
const SEG_R = 9
const SEG_GAP = 13
const SPEED = 2.5
const MAX_TURN = 0.072
const NUM_AI = 20
const FOOD_COUNT = 400
const INIT_LEN = 8

// ── Snake colors ──────────────────────────────────────────────────────────────
const COLORS = [
  '#FF6B6B', '#FF8E53', '#A8E063', '#4ECDC4', '#45B7D1',
  '#A18CD1', '#FBC2EB', '#89F7FE', '#66A6FF', '#FDA085',
  '#96C93D', '#43C6AC', '#C7CEEA', '#FFDAC1', '#56AB2F',
  '#FF9A9E', '#F6D365', '#89CFF0', '#B5EAD7', '#FFCC02',
]

// ── Helpers ───────────────────────────────────────────────────────────────────
function rand(a, b) { return a + Math.random() * (b - a) }
function randInt(a, b) { return Math.floor(rand(a, b + 1)) }
function dist2(a, b) { const dx = a.x - b.x, dy = a.y - b.y; return dx * dx + dy * dy }

function makeSnake(x, y, len, color, isPlayer) {
  const angle = rand(0, Math.PI * 2)
  const segs = []
  for (let i = 0; i < len; i++) {
    segs.push({ x: x - Math.cos(angle) * i * SEG_GAP, y: y - Math.sin(angle) * i * SEG_GAP })
  }
  return { segs, targetLen: len, angle, color, isPlayer, alive: true, aiTimer: rand(0, 60), aiAngle: angle }
}

function makeFood() {
  return { x: rand(40, W_W - 40), y: rand(40, W_H - 40), r: rand(4, 7), color: `hsl(${rand(0, 360)},80%,65%)` }
}

const IS_TOUCH = typeof window !== 'undefined' && ('ontouchstart' in window || navigator.maxTouchPoints > 0)

// ── Component ─────────────────────────────────────────────────────────────────
export default function SnakeGame({ onBack }) {
  const canvasRef = useRef(null)
  const wrapRef = useRef(null)
  const stateRef = useRef(null)
  const animRef = useRef(null)
  const keysRef = useRef({})
  const pointerRef = useRef(null) // canvas-space {x, y}
  const joyRef = useRef({ active: false, cx: 0, cy: 0, dx: 0, dy: 0 })
  const joyKnobRef = useRef(null)

  const [phase, setPhase] = useState('idle')
  const [score, setScore] = useState(0)
  const [best, setBest] = useState(() => Number(localStorage.getItem('snake_best') || 0))
  const [aliveCount, setAliveCount] = useState(NUM_AI + 1)
  const [playerLen, setPlayerLen] = useState(INIT_LEN)

  // ── Init ──────────────────────────────────────────────────────────────────
  function initState() {
    const snakes = []
    const usedColors = new Set(['#FFD700'])
    snakes.push(makeSnake(W_W / 2, W_H / 2, INIT_LEN, '#FFD700', true))

    const aiColors = COLORS.filter(c => !usedColors.has(c))
    for (let i = 0; i < NUM_AI; i++) {
      const color = aiColors[i % aiColors.length]
      snakes.push(makeSnake(rand(120, W_W - 120), rand(120, W_H - 120), randInt(5, 22), color, false))
    }

    const foods = Array.from({ length: FOOD_COUNT }, makeFood)
    return { snakes, foods, frame: 0, score: 0 }
  }

  const startGame = useCallback(() => {
    stateRef.current = initState()
    setScore(0)
    setPlayerLen(INIT_LEN)
    setAliveCount(NUM_AI + 1)
    setPhase('playing')
  }, [])

  // ── Keyboard ──────────────────────────────────────────────────────────────
  useEffect(() => {
    const onKey = (e) => { keysRef.current[e.key] = e.type === 'keydown' }
    window.addEventListener('keydown', onKey)
    window.addEventListener('keyup', onKey)
    return () => {
      window.removeEventListener('keydown', onKey)
      window.removeEventListener('keyup', onKey)
    }
  }, [])

  // ── Game loop ─────────────────────────────────────────────────────────────
  useEffect(() => {
    if (phase !== 'playing') return
    const canvas = canvasRef.current
    const ctx = canvas.getContext('2d')

    function resize() {
      canvas.width = window.innerWidth
      canvas.height = window.innerHeight
    }
    resize()
    window.addEventListener('resize', resize)

    function loop() {
      animRef.current = requestAnimationFrame(loop)
      const s = stateRef.current
      if (!s) return
      s.frame++

      const CW = canvas.width
      const CH = canvas.height

      // ── Player steering ─────────────────────────────────────────────────
      const player = s.snakes.find(sn => sn.isPlayer && sn.alive)
      if (player) {
        const keys = keysRef.current
        const turnRate = MAX_TURN * 1.6
        if (keys['ArrowLeft'] || keys['a'] || keys['A']) player.angle -= turnRate
        if (keys['ArrowRight'] || keys['d'] || keys['D']) player.angle += turnRate

        // Joystick steering (mobile)
        const joy = joyRef.current
        if (joy.active && joy.dx * joy.dx + joy.dy * joy.dy > 8 * 8) {
          const target = Math.atan2(joy.dy, joy.dx)
          let diff = target - player.angle
          while (diff > Math.PI) diff -= Math.PI * 2
          while (diff < -Math.PI) diff += Math.PI * 2
          player.angle += Math.max(-turnRate, Math.min(turnRate, diff))
        }

        // Mouse steering (desktop, only when joystick not active)
        if (!joy.active && pointerRef.current) {
          const head = player.segs[0]
          const camX = Math.max(0, Math.min(W_W - CW, head.x - CW / 2))
          const camY = Math.max(0, Math.min(W_H - CH, head.y - CH / 2))
          const wx = pointerRef.current.x + camX
          const wy = pointerRef.current.y + camY
          const dx = wx - head.x, dy = wy - head.y
          if (dx * dx + dy * dy > 15 * 15) {
            const target = Math.atan2(dy, dx)
            let diff = target - player.angle
            while (diff > Math.PI) diff -= Math.PI * 2
            while (diff < -Math.PI) diff += Math.PI * 2
            player.angle += Math.max(-turnRate, Math.min(turnRate, diff))
          }
        }
      }

      // ── Update snakes ───────────────────────────────────────────────────
      for (const sn of s.snakes) {
        if (!sn.alive) continue

        // AI steering
        if (!sn.isPlayer) {
          sn.aiTimer--
          if (sn.aiTimer <= 0) {
            sn.aiTimer = randInt(25, 70)
            const head = sn.segs[0]
            const myLen = sn.segs.length
            let chaseTarget = null, chaseDist = Infinity
            let fleeTarget = null, fleeDist = Infinity

            for (const other of s.snakes) {
              if (!other.alive || other === sn) continue
              const d2 = dist2(head, other.segs[0])
              if (other.segs.length < myLen * 0.85 && d2 < 380 * 380) {
                if (d2 < chaseDist) { chaseDist = d2; chaseTarget = other }
              }
              if (other.segs.length > myLen * 1.15 && d2 < 320 * 320) {
                if (d2 < fleeDist) { fleeDist = d2; fleeTarget = other }
              }
            }

            if (fleeTarget) {
              const dx = head.x - fleeTarget.segs[0].x, dy = head.y - fleeTarget.segs[0].y
              sn.aiAngle = Math.atan2(dy, dx) + rand(-0.25, 0.25)
            } else if (chaseTarget) {
              const dx = chaseTarget.segs[0].x - head.x, dy = chaseTarget.segs[0].y - head.y
              sn.aiAngle = Math.atan2(dy, dx) + rand(-0.1, 0.1)
            } else {
              sn.aiAngle = sn.angle + rand(-0.7, 0.7)
            }

            // Wall avoidance
            const m = 100
            if (head.x < m) sn.aiAngle = rand(-0.4, 0.4)
            if (head.x > W_W - m) sn.aiAngle = Math.PI + rand(-0.4, 0.4)
            if (head.y < m) sn.aiAngle = Math.PI / 2 + rand(-0.4, 0.4)
            if (head.y > W_H - m) sn.aiAngle = -Math.PI / 2 + rand(-0.4, 0.4)
          }

          let diff = sn.aiAngle - sn.angle
          while (diff > Math.PI) diff -= Math.PI * 2
          while (diff < -Math.PI) diff += Math.PI * 2
          sn.angle += Math.max(-MAX_TURN, Math.min(MAX_TURN, diff))
        }

        // Move head
        const head = sn.segs[0]
        const nx = Math.max(SEG_R, Math.min(W_W - SEG_R, head.x + Math.cos(sn.angle) * SPEED))
        const ny = Math.max(SEG_R, Math.min(W_H - SEG_R, head.y + Math.sin(sn.angle) * SPEED))
        sn.segs.unshift({ x: nx, y: ny })
        while (sn.segs.length > sn.targetLen) sn.segs.pop()
      }

      // ── Food ────────────────────────────────────────────────────────────
      for (const sn of s.snakes) {
        if (!sn.alive) continue
        const head = sn.segs[0]
        for (let i = s.foods.length - 1; i >= 0; i--) {
          const f = s.foods[i]
          const dx = head.x - f.x, dy = head.y - f.y
          if (dx * dx + dy * dy < (SEG_R + f.r) * (SEG_R + f.r)) {
            s.foods.splice(i, 1)
            sn.targetLen += 1
            s.foods.push(makeFood())
            if (sn.isPlayer) s.score++
          }
        }
      }

      // ── Snake collisions ─────────────────────────────────────────────────
      const alive = s.snakes.filter(sn => sn.alive)
      for (let i = 0; i < alive.length; i++) {
        const a = alive[i]
        if (!a.alive) continue
        const headA = a.segs[0]
        const lenA = a.segs.length

        for (let j = 0; j < alive.length; j++) {
          if (i === j || !alive[j].alive) continue
          const b = alive[j]
          const lenB = b.segs.length
          const startK = (i < j) ? 0 : 1 // avoid double-checking own head

          for (let k = startK; k < b.segs.length; k++) {
            const seg = b.segs[k]
            const dx = headA.x - seg.x, dy = headA.y - seg.y
            if (dx * dx + dy * dy < (SEG_R * 1.5) * (SEG_R * 1.5)) {
              if (lenA >= lenB) {
                if (!b.alive) continue
                b.alive = false
                a.targetLen += Math.floor(lenB * 0.5)
                if (a.isPlayer) s.score += Math.max(5, Math.floor(lenB / 2))
                // Drop food where B dies
                b.segs.filter((_, idx) => idx % 4 === 0).forEach(sg =>
                  s.foods.push({ x: sg.x, y: sg.y, r: rand(4, 8), color: b.color })
                )
              } else {
                a.alive = false
              }
              break
            }
          }
          if (!a.alive) break
        }
      }

      // Respawn dead AI
      for (const sn of s.snakes) {
        if (!sn.alive && !sn.isPlayer) {
          Object.assign(sn, makeSnake(rand(120, W_W - 120), rand(120, W_H - 120), randInt(4, 14), sn.color, false))
        }
      }

      // Player death check
      const playerSnake = s.snakes.find(sn => sn.isPlayer)
      if (playerSnake && !playerSnake.alive) {
        const finalScore = s.score
        const newBest = Math.max(finalScore, best)
        if (newBest > best) {
          localStorage.setItem('snake_best', newBest)
          setBest(newBest)
        }
        setScore(finalScore)
        setPhase('gameover')
        return
      }

      // UI updates
      if (s.frame % 8 === 0 && playerSnake?.alive) {
        setScore(s.score)
        setAliveCount(s.snakes.filter(sn => sn.alive).length)
        setPlayerLen(playerSnake.segs.length)
      }

      // ── Draw ─────────────────────────────────────────────────────────────
      const pSn = s.snakes.find(sn => sn.isPlayer && sn.alive)
      let camX = 0, camY = 0
      if (pSn) {
        const ph = pSn.segs[0]
        camX = Math.max(0, Math.min(W_W - CW, ph.x - CW / 2))
        camY = Math.max(0, Math.min(W_H - CH, ph.y - CH / 2))
      }

      // Background
      ctx.fillStyle = '#0d1117'
      ctx.fillRect(0, 0, CW, CH)

      // Grid
      ctx.strokeStyle = 'rgba(255,255,255,0.04)'
      ctx.lineWidth = 1
      const gs = 80
      const gx0 = Math.floor(camX / gs) * gs
      const gy0 = Math.floor(camY / gs) * gs
      for (let x = gx0; x < camX + CW + gs; x += gs) {
        ctx.beginPath(); ctx.moveTo(x - camX, 0); ctx.lineTo(x - camX, CH); ctx.stroke()
      }
      for (let y = gy0; y < camY + CH + gs; y += gs) {
        ctx.beginPath(); ctx.moveTo(0, y - camY); ctx.lineTo(CW, y - camY); ctx.stroke()
      }

      // World border
      ctx.strokeStyle = 'rgba(255,70,70,0.7)'
      ctx.lineWidth = 4
      ctx.strokeRect(-camX, -camY, W_W, W_H)

      // Food
      for (const f of s.foods) {
        const fx = f.x - camX, fy = f.y - camY
        if (fx < -20 || fx > CW + 20 || fy < -20 || fy > CH + 20) continue
        ctx.beginPath()
        ctx.arc(fx, fy, f.r, 0, Math.PI * 2)
        ctx.fillStyle = f.color
        ctx.shadowBlur = 8
        ctx.shadowColor = f.color
        ctx.fill()
        ctx.shadowBlur = 0
      }

      // Snakes
      for (const sn of s.snakes) {
        if (!sn.alive || sn.segs.length === 0) continue

        // Body
        for (let i = sn.segs.length - 1; i >= 1; i--) {
          const seg = sn.segs[i]
          const sx = seg.x - camX, sy = seg.y - camY
          if (sx < -30 || sx > CW + 30 || sy < -30 || sy > CH + 30) continue
          const fade = 1 - (i / sn.segs.length) * 0.35
          ctx.beginPath()
          ctx.arc(sx, sy, SEG_R * (0.65 + 0.35 * fade), 0, Math.PI * 2)
          ctx.fillStyle = sn.color
          ctx.globalAlpha = fade * 0.88
          ctx.fill()
        }
        ctx.globalAlpha = 1

        // Head
        const head = sn.segs[0]
        const hx = head.x - camX, hy = head.y - camY
        const hr = sn.isPlayer ? SEG_R + 3 : SEG_R + 1
        ctx.beginPath()
        ctx.arc(hx, hy, hr, 0, Math.PI * 2)
        ctx.fillStyle = sn.color
        ctx.fill()
        if (sn.isPlayer) {
          ctx.strokeStyle = '#fff'
          ctx.lineWidth = 2
          ctx.stroke()
        }

        // Eyes
        for (const side of [-1, 1]) {
          const ex = hx + Math.cos(sn.angle + side * 0.9) * (SEG_R * 0.65)
          const ey = hy + Math.sin(sn.angle + side * 0.9) * (SEG_R * 0.65)
          ctx.beginPath(); ctx.arc(ex, ey, 3, 0, Math.PI * 2)
          ctx.fillStyle = '#fff'; ctx.fill()
          ctx.beginPath(); ctx.arc(ex + Math.cos(sn.angle), ey + Math.sin(sn.angle), 1.5, 0, Math.PI * 2)
          ctx.fillStyle = '#111'; ctx.fill()
        }

        // Length label above head
        if (hx > -20 && hx < CW + 20 && hy > -20 && hy < CH + 20) {
          ctx.fillStyle = sn.isPlayer ? '#FFD700' : 'rgba(255,255,255,0.75)'
          ctx.font = `bold ${sn.isPlayer ? 12 : 10}px monospace`
          ctx.textAlign = 'center'
          ctx.fillText(sn.segs.length, hx, hy - hr - 4)
        }
      }

      // Minimap
      const MM_W = 110, MM_H = 110
      const MM_X = CW - MM_W - 10, MM_Y = CH - MM_H - 10
      ctx.fillStyle = 'rgba(0,0,0,0.55)'
      ctx.fillRect(MM_X, MM_Y, MM_W, MM_H)
      ctx.strokeStyle = '#333'
      ctx.lineWidth = 1
      ctx.strokeRect(MM_X, MM_Y, MM_W, MM_H)
      // viewport rect on minimap
      ctx.strokeStyle = 'rgba(255,255,255,0.15)'
      ctx.strokeRect(
        MM_X + (camX / W_W) * MM_W,
        MM_Y + (camY / W_H) * MM_H,
        (CW / W_W) * MM_W,
        (CH / W_H) * MM_H,
      )
      for (const sn of s.snakes) {
        if (!sn.alive || sn.segs.length === 0) continue
        const mx = MM_X + (sn.segs[0].x / W_W) * MM_W
        const my = MM_Y + (sn.segs[0].y / W_H) * MM_H
        ctx.beginPath()
        ctx.arc(mx, my, sn.isPlayer ? 4 : 2, 0, Math.PI * 2)
        ctx.fillStyle = sn.isPlayer ? '#FFD700' : sn.color
        ctx.fill()
      }
    }

    loop()
    return () => {
      window.removeEventListener('resize', resize)
      if (animRef.current) cancelAnimationFrame(animRef.current)
    }
  }, [phase])

  // ── Pointer (mouse/touch) ─────────────────────────────────────────────────
  const getCanvasPos = useCallback((e) => {
    const canvas = canvasRef.current
    if (!canvas) return
    const rect = canvas.getBoundingClientRect()
    const src = e.touches ? e.touches[0] : e
    pointerRef.current = {
      x: (src.clientX - rect.left) * (canvas.width / rect.width),
      y: (src.clientY - rect.top) * (canvas.height / rect.height),
    }
  }, [])

  const clearPointer = useCallback(() => { pointerRef.current = null }, [])

  // ── Joystick (touch) ──────────────────────────────────────────────────────
  const onJoyStart = useCallback((e) => {
    e.preventDefault()
    const touch = e.targetTouches[0]
    const rect = e.currentTarget.getBoundingClientRect()
    joyRef.current = {
      active: true,
      cx: rect.left + rect.width / 2,
      cy: rect.top + rect.height / 2,
      dx: 0, dy: 0,
    }
  }, [])

  const onJoyMove = useCallback((e) => {
    e.preventDefault()
    const joy = joyRef.current
    if (!joy.active) return
    const touch = e.targetTouches[0]
    const rawDx = touch.clientX - joy.cx
    const rawDy = touch.clientY - joy.cy
    const maxR = 44
    const dist = Math.sqrt(rawDx * rawDx + rawDy * rawDy)
    joy.dx = dist > maxR ? rawDx / dist * maxR : rawDx
    joy.dy = dist > maxR ? rawDy / dist * maxR : rawDy
    if (joyKnobRef.current) {
      joyKnobRef.current.style.transform = `translate(${joy.dx}px, ${joy.dy}px)`
    }
  }, [])

  const onJoyEnd = useCallback((e) => {
    e.preventDefault()
    joyRef.current.active = false
    joyRef.current.dx = 0
    joyRef.current.dy = 0
    if (joyKnobRef.current) {
      joyKnobRef.current.style.transform = 'translate(0px, 0px)'
    }
  }, [])

  // ── Render ────────────────────────────────────────────────────────────────
  return (
    <div ref={wrapRef} style={s.wrap}>
      <canvas
        ref={canvasRef}
        style={s.canvas}
        onMouseMove={phase === 'playing' ? getCanvasPos : undefined}
        onMouseLeave={clearPointer}
      />

      {/* HUD */}
      {phase === 'playing' && (
        <div style={s.hud}>
          <div style={s.hudScore}>점수 {score}</div>
          <div style={s.hudInfo}>길이 {playerLen} · 생존 {aliveCount}/{NUM_AI + 1}</div>
          <div style={s.hudBest}>최고 {best}</div>
        </div>
      )}

      {/* Controls hint */}
      {phase === 'playing' && !IS_TOUCH && (
        <div style={s.hint}>← → 키 또는 마우스로 방향 조종</div>
      )}

      {/* Mobile joystick */}
      {phase === 'playing' && IS_TOUCH && (
        <div
          style={s.joyBase}
          onTouchStart={onJoyStart}
          onTouchMove={onJoyMove}
          onTouchEnd={onJoyEnd}
          onTouchCancel={onJoyEnd}
        >
          <div ref={joyKnobRef} style={s.joyKnob} />
        </div>
      )}

      {/* Start overlay */}
      {phase === 'idle' && (
        <div style={s.overlay}>
          <div style={s.box}>
            <div style={s.title}>뱀 게임</div>
            <div style={s.desc}>
              <p>더 작은 뱀을 먹어서 크게 자라요!</p>
              <p>나보다 큰 뱀은 조심하세요 위험해요!</p>
              <p style={{ fontSize: 'clamp(11px,2vw,13px)', color: '#888', marginTop: 4 }}>
                ← → 키 또는 터치로 방향 조종
              </p>
            </div>
            <button style={s.btnPrimary} onClick={startGame}>시작하기</button>
            <button style={s.btnBack} onClick={onBack}>← 돌아가기</button>
          </div>
        </div>
      )}

      {/* Game over overlay */}
      {phase === 'gameover' && (
        <div style={s.overlay}>
          <div style={s.box}>
            <div style={s.title}>게임 오버</div>
            <div style={s.bigScore}>{score}점</div>
            {score > 0 && score >= best && (
              <div style={s.newBest}>최고 기록!</div>
            )}
            <button style={s.btnPrimary} onClick={startGame}>다시 하기</button>
            <button style={s.btnBack} onClick={onBack}>← 돌아가기</button>
          </div>
        </div>
      )}
    </div>
  )
}

const s = {
  wrap: {
    position: 'relative',
    width: '100vw',
    height: '100vh',
    overflow: 'hidden',
    background: '#0d1117',
    fontFamily: '"Segoe UI", sans-serif',
    touchAction: 'none',
  },
  canvas: {
    display: 'block',
    width: '100%',
    height: '100%',
  },
  hud: {
    position: 'absolute',
    top: 12,
    left: 14,
    pointerEvents: 'none',
    display: 'flex',
    flexDirection: 'column',
    gap: 3,
  },
  hudScore: {
    color: '#FFD700',
    fontSize: 'clamp(18px, 3.5vw, 24px)',
    fontWeight: 'bold',
    textShadow: '0 1px 8px rgba(0,0,0,0.9)',
  },
  hudInfo: {
    color: '#ccc',
    fontSize: 'clamp(12px, 2.2vw, 16px)',
    textShadow: '0 1px 6px rgba(0,0,0,0.9)',
  },
  hudBest: {
    color: '#888',
    fontSize: 'clamp(11px, 2vw, 14px)',
    textShadow: '0 1px 6px rgba(0,0,0,0.9)',
  },
  hint: {
    position: 'absolute',
    bottom: 130,
    left: '50%',
    transform: 'translateX(-50%)',
    color: 'rgba(255,255,255,0.3)',
    fontSize: 'clamp(11px, 2vw, 13px)',
    pointerEvents: 'none',
    whiteSpace: 'nowrap',
  },
  overlay: {
    position: 'absolute',
    inset: 0,
    background: 'rgba(0,0,0,0.78)',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
  },
  box: {
    background: '#1e1e2e',
    border: '2px solid #333',
    borderRadius: 18,
    padding: 'clamp(24px, 5vw, 40px) clamp(28px, 6vw, 48px)',
    textAlign: 'center',
    display: 'flex',
    flexDirection: 'column',
    gap: 16,
    maxWidth: 340,
    width: '90%',
  },
  title: {
    color: '#FFD700',
    fontSize: 'clamp(26px, 6vw, 36px)',
    fontWeight: 'bold',
    textShadow: '0 2px 18px rgba(255,215,0,0.4)',
  },
  desc: {
    color: '#ccc',
    fontSize: 'clamp(13px, 2.5vw, 16px)',
    lineHeight: 1.75,
  },
  bigScore: {
    color: '#fff',
    fontSize: 'clamp(28px, 6vw, 40px)',
    fontWeight: 'bold',
  },
  newBest: {
    color: '#FFD700',
    fontSize: 'clamp(15px, 3vw, 20px)',
    fontWeight: 'bold',
  },
  btnPrimary: {
    background: '#FFD700',
    color: '#1a1a2e',
    border: 'none',
    borderRadius: 10,
    padding: '12px 32px',
    fontSize: 'clamp(15px, 3vw, 18px)',
    fontWeight: 'bold',
    cursor: 'pointer',
  },
  btnBack: {
    background: 'transparent',
    color: '#888',
    border: '1px solid #444',
    borderRadius: 10,
    padding: '8px 20px',
    fontSize: 'clamp(13px, 2.5vw, 15px)',
    cursor: 'pointer',
  },
  joyBase: {
    position: 'absolute',
    bottom: 30,
    left: 30,
    width: 130,
    height: 130,
    borderRadius: '50%',
    background: 'rgba(255,255,255,0.07)',
    border: '2px solid rgba(255,255,255,0.18)',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    touchAction: 'none',
    userSelect: 'none',
  },
  joyKnob: {
    width: 54,
    height: 54,
    borderRadius: '50%',
    background: 'rgba(255,255,255,0.38)',
    border: '2px solid rgba(255,255,255,0.55)',
    pointerEvents: 'none',
    willChange: 'transform',
  },
}
