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

// ── Difficulty settings ───────────────────────────────────────────────────────
const DIFFICULTIES = [
  {
    id: 'easy',
    label: '쉬움',
    emoji: '🌱',
    color: '#4CAF50',
    speed: 1.8,
    foodCount: 550,
    aiChaseRange: 240,
    aiFleeRange: 180,
    aiTimerMin: 45, aiTimerMax: 110,
  },
  {
    id: 'normal',
    label: '보통',
    emoji: '⚡',
    color: '#2196F3',
    speed: 2.5,
    foodCount: 400,
    aiChaseRange: 380,
    aiFleeRange: 320,
    aiTimerMin: 25, aiTimerMax: 70,
  },
  {
    id: 'hard',
    label: '어려움',
    emoji: '🔥',
    color: '#FF5722',
    speed: 3.3,
    foodCount: 260,
    aiChaseRange: 500,
    aiFleeRange: 420,
    aiTimerMin: 12, aiTimerMax: 40,
  },
]

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
  const joyContainerRef = useRef(null)

  const [phase, setPhase] = useState('idle')
  const [score, setScore] = useState(0)
  const [difficulty, setDifficulty] = useState(() => {
    const saved = localStorage.getItem('snake_diff')
    return DIFFICULTIES.find(d => d.id === saved) ?? DIFFICULTIES[1]
  })
  const [best, setBest] = useState(() => Number(localStorage.getItem(`snake_best_${localStorage.getItem('snake_diff') || 'normal'}`) || 0))
  const [aliveCount, setAliveCount] = useState(NUM_AI + 1)
  const [playerLen, setPlayerLen] = useState(INIT_LEN)
  const [playerColor, setPlayerColor] = useState(() => localStorage.getItem('snake_color') || '#FFD700')

  useEffect(() => {
    setBest(Number(localStorage.getItem(`snake_best_${difficulty.id}`) || 0))
  }, [difficulty.id])

  // ── Init ──────────────────────────────────────────────────────────────────
  function initState(color, diff) {
    const snakes = []
    const usedColors = new Set([color])
    snakes.push(makeSnake(W_W / 2, W_H / 2, INIT_LEN, color, true))

    const aiColors = COLORS.filter(c => !usedColors.has(c))
    for (let i = 0; i < NUM_AI; i++) {
      const c = aiColors[i % aiColors.length]
      snakes.push(makeSnake(rand(120, W_W - 120), rand(120, W_H - 120), randInt(5, 22), c, false))
    }

    const foods = Array.from({ length: diff.foodCount }, makeFood)
    return { snakes, foods, frame: 0, score: 0, diff }
  }

  const startGame = useCallback(() => {
    stateRef.current = initState(playerColor, difficulty)
    setScore(0)
    setPlayerLen(INIT_LEN)
    setAliveCount(NUM_AI + 1)
    setPhase('playing')
  }, [playerColor, difficulty])

  const pickDifficulty = useCallback((diff) => {
    setDifficulty(diff)
    localStorage.setItem('snake_diff', diff.id)
  }, [])

  const pickColor = useCallback((color) => {
    setPlayerColor(color)
    localStorage.setItem('snake_color', color)
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
            sn.aiTimer = randInt(s.diff.aiTimerMin, s.diff.aiTimerMax)
            const head = sn.segs[0]
            const myLen = sn.segs.length
            let chaseTarget = null, chaseDist = Infinity
            let fleeTarget = null, fleeDist = Infinity
            const chaseR = s.diff.aiChaseRange, fleeR = s.diff.aiFleeRange

            for (const other of s.snakes) {
              if (!other.alive || other === sn) continue
              const d2 = dist2(head, other.segs[0])
              if (other.segs.length < myLen * 0.85 && d2 < chaseR * chaseR) {
                if (d2 < chaseDist) { chaseDist = d2; chaseTarget = other }
              }
              if (other.segs.length > myLen * 1.15 && d2 < fleeR * fleeR) {
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
        const spd = s.diff.speed
        const nx = Math.max(SEG_R, Math.min(W_W - SEG_R, head.x + Math.cos(sn.angle) * spd))
        const ny = Math.max(SEG_R, Math.min(W_H - SEG_R, head.y + Math.sin(sn.angle) * spd))
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

      // Respawn dead AI (length based on player ±15%)
      const curPlayerLen = s.snakes.find(sn => sn.isPlayer)?.segs.length ?? 10
      for (const sn of s.snakes) {
        if (!sn.alive && !sn.isPlayer) {
          const base = Math.max(5, curPlayerLen)
          const newLen = randInt(Math.max(3, Math.floor(base * 0.85)), Math.ceil(base * 1.15))
          Object.assign(sn, makeSnake(rand(120, W_W - 120), rand(120, W_H - 120), newLen, sn.color, false))
        }
      }

      // Player death check
      const playerSnake = s.snakes.find(sn => sn.isPlayer)
      if (playerSnake && !playerSnake.alive) {
        const finalScore = s.score
        const bestKey = `snake_best_${s.diff.id}`
        const prevBest = Number(localStorage.getItem(bestKey) || 0)
        const newBest = Math.max(finalScore, prevBest)
        if (newBest > prevBest) {
          localStorage.setItem(bestKey, newBest)
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

      // Find longest snake for crown
      const liveSns = s.snakes.filter(sn => sn.alive)
      const longestSn = liveSns.length > 0 ? liveSns.reduce((a, b) => a.segs.length >= b.segs.length ? a : b) : null

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

        // Length label + crown above head
        if (hx > -20 && hx < CW + 20 && hy > -20 && hy < CH + 20) {
          if (sn === longestSn) {
            ctx.font = '16px serif'
            ctx.textAlign = 'center'
            ctx.fillText('👑', hx, hy - hr - 16)
          }
          ctx.fillStyle = sn.isPlayer ? '#FFD700' : 'rgba(255,255,255,0.75)'
          ctx.font = `bold ${sn.isPlayer ? 12 : 10}px monospace`
          ctx.textAlign = 'center'
          ctx.fillText(sn.segs.length, hx, hy - hr - (sn === longestSn ? 4 : 4))
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

  // ── Dynamic joystick (touch events on wrap) ───────────────────────────────
  useEffect(() => {
    if (!IS_TOUCH || phase !== 'playing') return
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
        container.style.top = `${cy - 65}px`
        container.style.display = 'flex'
      }
    }

    function onTouchMove(e) {
      e.preventDefault()
      const joy = joyRef.current
      if (!joy.active) return
      const touch = e.changedTouches[0]
      const rawDx = touch.clientX - joy.cx
      const rawDy = touch.clientY - joy.cy
      const maxR = 44
      const dist = Math.sqrt(rawDx * rawDx + rawDy * rawDy)
      joy.dx = dist > maxR ? rawDx / dist * maxR : rawDx
      joy.dy = dist > maxR ? rawDy / dist * maxR : rawDy
      if (joyKnobRef.current) {
        joyKnobRef.current.style.transform = `translate(${joy.dx}px, ${joy.dy}px)`
      }
    }

    function onTouchEnd() {
      joyRef.current.active = false
      joyRef.current.dx = 0
      joyRef.current.dy = 0
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
  }, [phase])

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
          <div style={s.hudBest}>최고 {best} · {difficulty.emoji} {difficulty.label}</div>
        </div>
      )}

      {/* Back button during gameplay */}
      {phase === 'playing' && (
        <button style={s.backInGame} onClick={() => setPhase('idle')}>← 나가기</button>
      )}

      {/* Controls hint */}
      {phase === 'playing' && !IS_TOUCH && (
        <div style={s.hint}>← → 키 또는 마우스로 방향 조종</div>
      )}

      {/* Dynamic joystick (shown/hidden via ref) */}
      {IS_TOUCH && (
        <div ref={joyContainerRef} style={s.joyContainer}>
          <div style={s.joyBase}>
            <div ref={joyKnobRef} style={s.joyKnob} />
          </div>
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
            </div>
            <div>
              <div style={s.colorLabel}>난이도</div>
              <div style={s.diffRow}>
                {DIFFICULTIES.map(d => (
                  <button
                    key={d.id}
                    onClick={() => pickDifficulty(d)}
                    style={{
                      ...s.diffBtn,
                      borderColor: difficulty.id === d.id ? d.color : '#444',
                      color: difficulty.id === d.id ? d.color : '#888',
                      background: difficulty.id === d.id ? `${d.color}22` : 'transparent',
                    }}
                  >
                    {d.emoji} {d.label}
                  </button>
                ))}
              </div>
            </div>
            <div>
              <div style={s.colorLabel}>내 뱀 색깔</div>
              <div style={s.colorGrid}>
                {['#FFD700', ...COLORS].map(c => (
                  <button
                    key={c}
                    onClick={() => pickColor(c)}
                    style={{
                      ...s.colorSwatch,
                      background: c,
                      transform: playerColor === c ? 'scale(1.25)' : 'scale(1)',
                      outline: playerColor === c ? `3px solid #fff` : '3px solid transparent',
                    }}
                  />
                ))}
              </div>
            </div>
            <button style={{ ...s.btnPrimary, background: playerColor }} onClick={startGame}>
              시작하기
            </button>
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
            <div>
              <div style={s.colorLabel}>난이도</div>
              <div style={s.diffRow}>
                {DIFFICULTIES.map(d => (
                  <button
                    key={d.id}
                    onClick={() => pickDifficulty(d)}
                    style={{
                      ...s.diffBtn,
                      borderColor: difficulty.id === d.id ? d.color : '#444',
                      color: difficulty.id === d.id ? d.color : '#888',
                      background: difficulty.id === d.id ? `${d.color}22` : 'transparent',
                    }}
                  >
                    {d.emoji} {d.label}
                  </button>
                ))}
              </div>
            </div>
            <div>
              <div style={s.colorLabel}>색깔 바꾸기</div>
              <div style={s.colorGrid}>
                {['#FFD700', ...COLORS].map(c => (
                  <button
                    key={c}
                    onClick={() => pickColor(c)}
                    style={{
                      ...s.colorSwatch,
                      background: c,
                      transform: playerColor === c ? 'scale(1.25)' : 'scale(1)',
                      outline: playerColor === c ? `3px solid #fff` : '3px solid transparent',
                    }}
                  />
                ))}
              </div>
            </div>
            <button style={{ ...s.btnPrimary, background: playerColor }} onClick={startGame}>다시 하기</button>
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
  backInGame: {
    position: 'absolute',
    top: 12,
    right: 14,
    background: 'rgba(0,0,0,0.55)',
    border: '1px solid #444',
    color: '#aaa',
    fontSize: 'clamp(12px, 2.5vw, 14px)',
    borderRadius: 20,
    padding: '5px 14px',
    cursor: 'pointer',
  },
  joyContainer: {
    position: 'absolute',
    display: 'none',
    alignItems: 'center',
    justifyContent: 'center',
    width: 130,
    height: 130,
    pointerEvents: 'none',
  },
  diffRow: {
    display: 'flex',
    gap: 8,
    justifyContent: 'center',
  },
  diffBtn: {
    flex: 1,
    padding: '8px 4px',
    borderRadius: 10,
    border: '2px solid #444',
    background: 'transparent',
    fontSize: 'clamp(12px, 2.5vw, 14px)',
    fontWeight: 'bold',
    cursor: 'pointer',
    transition: 'all 0.15s',
  },
  colorLabel: {
    color: '#aaa',
    fontSize: 'clamp(11px, 2vw, 13px)',
    marginBottom: 10,
  },
  colorGrid: {
    display: 'flex',
    flexWrap: 'wrap',
    gap: 8,
    justifyContent: 'center',
  },
  colorSwatch: {
    width: 28,
    height: 28,
    borderRadius: '50%',
    border: 'none',
    cursor: 'pointer',
    padding: 0,
    transition: 'transform 0.12s, outline 0.12s',
    outlineOffset: 2,
  },
  btnPrimary: {
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
    width: 130,
    height: 130,
    borderRadius: '50%',
    background: 'rgba(255,255,255,0.07)',
    border: '2px solid rgba(255,255,255,0.2)',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
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
