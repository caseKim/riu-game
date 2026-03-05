import { useEffect, useRef, useState, useCallback } from 'react'

const W = 1000
const H = 420
const GROUND_Y = 350
const PLAYER_SIZE = 55
const GRAVITY = 0.65
const JUMP_FORCE = -15

const FRUITS = ['🍎', '🍊', '🍋', '🍇', '🍓', '🍒']
// 먹을 수 있는 높이 (너무 어렵지 않게 — 지면~낮은 점프 범위)
const FRUIT_HEIGHTS = [GROUND_Y - 45, GROUND_Y - 80, GROUND_Y - 120]

const DIFF_SETTINGS = {
  easy:   { baseSpeed: 4, intervalMax: 130, intervalMin: 60, doubleScore: 9999, doubleChance: 0,    maxSpeed: 9  },
  normal: { baseSpeed: 6, intervalMax: 100, intervalMin: 40, doubleScore: 30,   doubleChance: 0.30, maxSpeed: 14 },
  hard:   { baseSpeed: 8, intervalMax: 75,  intervalMin: 28, doubleScore: 15,   doubleChance: 0.45, maxSpeed: 18 },
}

export default function Game({ character, difficulty, onBack }) {
  const diff = DIFF_SETTINGS[difficulty.id]
  const bestKey = `best_${difficulty.id}`

  const canvasRef = useRef(null)
  const canvasWrapRef = useRef(null)
  const stateRef = useRef(null)
  const gameOverAtRef = useRef(0)
  if (!stateRef.current) stateRef.current = makeInitialState()
  const animRef = useRef(null)
  const [score, setScore] = useState(0)
  const [best, setBest] = useState(() => Number(localStorage.getItem(bestKey) || 0))
  const [phase, setPhase] = useState('idle')

  function makeInitialState() {
    return {
      player: { x: 120, y: GROUND_Y - PLAYER_SIZE, vy: 0, onGround: true, jumpCount: 0 },
      obstacles: [],
      fruits: [],
      fruitTimer: 0,
      nextFruitInterval: 200 + Math.floor(Math.random() * 100),
      fruitPopups: [],
      clouds: [
        { x: 160, y: 65, speed: 0.5 },
        { x: 460, y: 48, speed: 0.7 },
        { x: 760, y: 78, speed: 0.4 },
      ],
      stars: Array.from({ length: 60 }, () => ({
        x: Math.random() * W,
        y: Math.random() * (GROUND_Y * 0.85),
        r: 0.5 + Math.random() * 1.5,
        phase: Math.random() * Math.PI * 2,
      })),
      score: 0,
      frame: 0,
      speed: diff.baseSpeed,
    }
  }

  const jump = useCallback(() => {
    if (phase === 'gameover') return
    if (phase === 'idle') setPhase('playing')
    const p = stateRef.current.player
    if (p.jumpCount < 2) {
      p.vy = p.jumpCount === 0 ? JUMP_FORCE : JUMP_FORCE * 0.85
      p.onGround = false
      p.jumpCount++
    }
  }, [phase])

  const restart = useCallback(() => {
    stateRef.current = makeInitialState()
    setScore(0)
    setPhase('playing')
  }, [])

  useEffect(() => {
    const onKey = (e) => {
      if (e.code === 'Space' || e.code === 'ArrowUp') {
        e.preventDefault()
        if (phase === 'gameover') {
          if (Date.now() - gameOverAtRef.current < 800) return
          stateRef.current = makeInitialState()
          setScore(0)
          setPhase('playing')
        } else {
          jump()
        }
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [jump, phase])

  useEffect(() => {
    const wrap = canvasWrapRef.current
    if (!wrap) return
    const onTouch = (e) => {
      e.preventDefault()
      if (phase === 'gameover' && Date.now() - gameOverAtRef.current < 800) return
      jump()
    }
    wrap.addEventListener('touchstart', onTouch, { passive: false })
    return () => wrap.removeEventListener('touchstart', onTouch)
  }, [jump, phase])

  useEffect(() => {
    const canvas = canvasRef.current
    const ctx = canvas.getContext('2d')

    const loop = () => {
      const s = stateRef.current
      const playing = phase === 'playing'

      // 구름 위치 업데이트
      if (playing) {
        for (const cloud of s.clouds) {
          cloud.x -= cloud.speed
          if (cloud.x < -160) cloud.x = W + 60
        }
      }

      // 배경 (점수에 따라 낮→노을→밤)
      drawBackground(ctx, s, s.frame)

      if (playing) {
        // 플레이어 물리
        s.player.vy += GRAVITY
        s.player.y += s.player.vy
        if (s.player.y >= GROUND_Y - PLAYER_SIZE) {
          s.player.y = GROUND_Y - PLAYER_SIZE
          s.player.vy = 0
          s.player.onGround = true
          s.player.jumpCount = 0
        }

        // 장애물 생성
        s.frame++
        const interval = Math.max(diff.intervalMin, diff.intervalMax - Math.floor(s.score / 5))
        if (s.frame % interval === 0) {
          s.obstacles.push(makeObstacle(pickKind(s.score)))

          // 고득점 시 2연속 장애물
          if (s.score > diff.doubleScore && Math.random() < diff.doubleChance) {
            const o2 = makeObstacle(pickKind(s.score))
            o2.x += 190 + Math.random() * 70
            s.obstacles.push(o2)
          }
        }

        // 속도 증가
        s.speed = Math.min(diff.maxSpeed, diff.baseSpeed + Math.floor(s.score / 10) * 0.6)

        // 장애물 이동
        s.obstacles = s.obstacles.filter((o) => {
          o.x -= s.speed
          o.frame++
          return o.x + o.w > -30
        })

        // 과일 스폰
        s.fruitTimer++
        if (s.fruitTimer >= s.nextFruitInterval) {
          const emoji = FRUITS[Math.floor(Math.random() * FRUITS.length)]
          const y = FRUIT_HEIGHTS[Math.floor(Math.random() * FRUIT_HEIGHTS.length)]
          s.fruits.push({ emoji, x: W + 10, y, w: 38, h: 38, frame: 0 })
          s.fruitTimer = 0
          s.nextFruitInterval = 200 + Math.floor(Math.random() * 100)
        }

        // 과일 이동 및 수집
        const p = s.player
        s.fruits = s.fruits.filter((f) => {
          f.x -= s.speed
          f.frame++
          const collected =
            p.x + 10 < f.x + f.w &&
            p.x + PLAYER_SIZE - 10 > f.x &&
            p.y + 10 < f.y + f.h &&
            p.y + PLAYER_SIZE - 6 > f.y
          if (collected) {
            s.score += 10
            s.fruitPopups.push({ x: f.x + f.w / 2, y: f.y, life: 40 })
            return false
          }
          return f.x + f.w > -10
        })

        // +3 팝업 업데이트
        s.fruitPopups = s.fruitPopups.filter(fp => { fp.y -= 1.2; fp.life--; return fp.life > 0 })

        // 점수
        s.score += 0.05
        setScore(Math.floor(s.score))

        // 충돌 감지
        for (const o of s.obstacles) {
          if (
            p.x + 10 < o.x + o.w - 4 &&
            p.x + PLAYER_SIZE - 10 > o.x + 4 &&
            p.y + 10 < o.y + o.h &&
            p.y + PLAYER_SIZE - 6 > o.y
          ) {
            const finalScore = Math.floor(s.score)
            setBest(prev => {
              if (finalScore > prev) {
                localStorage.setItem(bestKey, finalScore)
                return finalScore
              }
              return prev
            })
            gameOverAtRef.current = Date.now()
            setPhase('gameover')
          }
        }
      }

      // 장애물 그리기
      for (const o of s.obstacles) {
        ctx.save()
        drawObstacle(ctx, o)
        ctx.restore()
      }

      // 과일 그리기
      for (const f of s.fruits) {
        const bob = Math.sin(f.frame * 0.12) * 4
        ctx.font = '34px serif'
        ctx.fillText(f.emoji, f.x, f.y + bob + f.h)
      }

      // +3 팝업 그리기
      for (const fp of s.fruitPopups) {
        const alpha = fp.life / 40
        ctx.globalAlpha = alpha
        ctx.font = 'bold 22px sans-serif'
        ctx.fillStyle = '#FFD700'
        ctx.strokeStyle = 'rgba(0,0,0,0.5)'
        ctx.lineWidth = 3
        ctx.strokeText('+10', fp.x - 18, fp.y)
        ctx.fillText('+10', fp.x - 18, fp.y)
        ctx.globalAlpha = 1
      }

      // 플레이어
      const p = s.player
      if (!p.onGround && p.jumpCount === 2) {
        ctx.font = '18px serif'
        ctx.fillText('✨', p.x + PLAYER_SIZE, p.y + 8)
        ctx.fillText('✨', p.x - 8, p.y + 22)
      }
      ctx.font = `${PLAYER_SIZE}px serif`
      ctx.fillText(character.emoji, p.x, p.y + PLAYER_SIZE)

      animRef.current = requestAnimationFrame(loop)
    }

    animRef.current = requestAnimationFrame(loop)
    return () => cancelAnimationFrame(animRef.current)
  }, [phase])

  return (
    <div style={styles.wrapper}>
      <div style={styles.topBar}>
        <button onClick={onBack} style={styles.backBtn}>← 뒤로</button>
      </div>
      <h1 style={styles.title}>🎮 점프 게임!</h1>
      <p style={styles.subtitle}>
        {character.emoji} {character.name} &nbsp;·&nbsp;
        <span style={{ ...styles.diffBadge, background: difficulty.color }}>{difficulty.emoji} {difficulty.label}</span>
      </p>
      <div ref={canvasWrapRef} style={styles.gameArea} onClick={jump}>
        <div style={styles.canvasWrap}>
          <canvas
            ref={canvasRef}
            width={W}
            height={H}
            style={styles.canvas}
          />
        </div>

        <div style={styles.scoreCard}>
        <div style={styles.scoreRow}>
          <div style={styles.scoreItem}>
            <span style={styles.scoreLabel}>점수</span>
            <span style={styles.score}>{score}</span>
          </div>
          <div style={styles.scoreDivider} />
          <div style={styles.scoreItem}>
            <span style={styles.scoreLabel}>🏆 최고</span>
            <span style={styles.best}>{best}</span>
          </div>
        </div>
        <div style={styles.hint}>스페이스바 / 탭으로 점프 &nbsp;·&nbsp; 두 번 누르면 2단 점프 ✨ &nbsp;·&nbsp; 🍎 과일 +10점!</div>
      </div>

        {phase === 'idle' && (
          <Overlay>
            <div style={styles.oEmoji}>{character.emoji}</div>
            <div style={styles.oTitle}>{character.name} 출동!</div>
            <div style={styles.oHint}>스페이스바 또는 화면을 클릭해서 시작!</div>
          </Overlay>
        )}

        {phase === 'gameover' && (
          <Overlay>
            <div style={styles.oEmoji}>{score >= best ? '🏆' : '😵'}</div>
            <div style={styles.oTitle}>{score >= best ? '신기록!' : '게임 오버!'}</div>
            <div style={styles.oScore}>점수: {score}</div>
            <div style={styles.oBest}>🏆 최고 점수: {best}</div>
            <div style={styles.btnRow}>
              <button onClick={restart} style={styles.btn}>다시 시작 🔄</button>
              <button onClick={onBack} style={styles.btnSecondary}>캐릭터 변경 🐾</button>
            </div>
          </Overlay>
        )}
    </div>
    </div>
  )
}

function Overlay({ children }) {
  return <div style={styles.overlay}>{children}</div>
}

// ─── 장애물 로직 ────────────────────────────────────────────

function pickKind(score) {
  const r = Math.random()
  if (score < 12) return r < 0.6 ? 'rock' : 'spike'
  if (score < 28) {
    if (r < 0.28) return 'rock'
    if (r < 0.52) return 'cactus'
    if (r < 0.72) return 'bird'
    return 'spike'
  }
  // 고득점: 5종류 전부
  if (r < 0.20) return 'rock'
  if (r < 0.40) return 'cactus'
  if (r < 0.58) return 'bird'
  if (r < 0.76) return 'spike'
  return 'fire'
}

function makeObstacle(kind) {
  if (kind === 'rock')   return { kind, frame: 0, x: W + 10, y: GROUND_Y - 44, w: 58, h: 44 }
  if (kind === 'cactus') {
    const h = 65 + Math.random() * 30
    return { kind, frame: 0, x: W + 10, y: GROUND_Y - h, w: 34, h }
  }
  if (kind === 'bird') {
    const by = 120 + Math.random() * 110
    return { kind, frame: 0, x: W + 10, y: by, w: 56, h: 40 }
  }
  if (kind === 'spike')  return { kind, frame: 0, x: W + 10, y: GROUND_Y - 62, w: 69, h: 62 }
  // fire
  const h = 55 + Math.random() * 25
  return { kind, frame: 0, x: W + 10, y: GROUND_Y - h, w: 38, h }
}

function drawObstacle(ctx, o) {
  if (o.kind === 'rock')   drawRock(ctx, o)
  else if (o.kind === 'cactus') drawCactus(ctx, o)
  else if (o.kind === 'bird')   drawBird(ctx, o)
  else if (o.kind === 'spike')  drawSpike(ctx, o)
  else if (o.kind === 'fire')   drawFire(ctx, o)
}

// ─── 장애물 그리기 ────────────────────────────────────────────

function drawRock(ctx, o) {
  const cx = o.x + o.w / 2
  const bottom = o.y + o.h

  // 그림자
  ctx.fillStyle = 'rgba(0,0,0,0.22)'
  ctx.beginPath()
  ctx.ellipse(cx, bottom + 5, o.w * 0.55, 7, 0, 0, Math.PI * 2)
  ctx.fill()

  // 왼쪽 작은 바위
  const rg2 = ctx.createRadialGradient(cx - 22, o.y + o.h * 0.32, 2, cx - 16, o.y + o.h * 0.5, o.w * 0.26)
  rg2.addColorStop(0, '#A09080'); rg2.addColorStop(1, '#3A2A1A')
  ctx.fillStyle = rg2
  ctx.beginPath()
  ctx.ellipse(cx - 17, o.y + o.h * 0.58, o.w * 0.25, o.h * 0.28, -0.3, 0, Math.PI * 2)
  ctx.fill()

  // 메인 바위 — 방사형 그라데이션으로 3D 구 느낌
  const rg = ctx.createRadialGradient(cx - 9, o.y + o.h * 0.28, 3, cx, o.y + o.h * 0.52, o.w * 0.52)
  rg.addColorStop(0, '#C0B0A0')
  rg.addColorStop(0.35, '#8A7A6A')
  rg.addColorStop(0.7, '#5A4A3A')
  rg.addColorStop(1, '#2A1A0A')
  ctx.fillStyle = rg
  ctx.beginPath()
  ctx.ellipse(cx, o.y + o.h * 0.55, o.w * 0.5, o.h * 0.52, 0, 0, Math.PI * 2)
  ctx.fill()

  // 균열
  ctx.strokeStyle = 'rgba(0,0,0,0.35)'
  ctx.lineWidth = 1.5; ctx.lineCap = 'round'
  ctx.beginPath()
  ctx.moveTo(cx - 2, o.y + o.h * 0.28)
  ctx.lineTo(cx + 5, o.y + o.h * 0.48)
  ctx.lineTo(cx, o.y + o.h * 0.68)
  ctx.stroke()
  ctx.beginPath()
  ctx.moveTo(cx + 8, o.y + o.h * 0.4); ctx.lineTo(cx + 14, o.y + o.h * 0.6)
  ctx.stroke()

  // 이끼
  ctx.fillStyle = 'rgba(70,150,70,0.38)'
  ctx.beginPath()
  ctx.ellipse(cx + 10, o.y + o.h * 0.68, 10, 6, 0.5, 0, Math.PI * 2)
  ctx.fill()
  ctx.beginPath()
  ctx.ellipse(cx - 7, o.y + o.h * 0.72, 7, 4, -0.3, 0, Math.PI * 2)
  ctx.fill()
}

function drawCactus(ctx, o) {
  const mx = o.x + o.w / 2
  const bottom = o.y + o.h

  // 그림자
  ctx.fillStyle = 'rgba(0,0,0,0.18)'
  ctx.beginPath()
  ctx.ellipse(mx, bottom + 4, 20, 6, 0, 0, Math.PI * 2)
  ctx.fill()

  // 몸통
  ctx.fillStyle = '#219150'
  ctx.beginPath()
  ctx.roundRect(mx - 11, o.y, 22, o.h, 8)
  ctx.fill()

  // 왼쪽 팔
  const armY = o.y + o.h * 0.32
  ctx.fillStyle = '#219150'
  ctx.beginPath()
  ctx.roundRect(mx - 30, armY, 22, 11, 5)
  ctx.fill()
  ctx.beginPath()
  ctx.roundRect(mx - 30, armY - 20, 13, 22, 5)
  ctx.fill()

  // 오른쪽 팔
  ctx.beginPath()
  ctx.roundRect(mx + 8, armY + 10, 22, 11, 5)
  ctx.fill()
  ctx.beginPath()
  ctx.roundRect(mx + 17, armY - 12, 13, 24, 5)
  ctx.fill()

  // 밝은 줄기 (입체감)
  ctx.fillStyle = '#2ECC71'
  ctx.beginPath()
  ctx.roundRect(mx - 4, o.y + 4, 8, o.h - 8, 4)
  ctx.fill()

  // 가시들
  ctx.strokeStyle = '#145A32'
  ctx.lineWidth = 1.5
  for (let i = 0; i < 4; i++) {
    const sy = o.y + 14 + i * (o.h * 0.2)
    ctx.beginPath(); ctx.moveTo(mx - 11, sy); ctx.lineTo(mx - 18, sy - 5); ctx.stroke()
    ctx.beginPath(); ctx.moveTo(mx + 11, sy); ctx.lineTo(mx + 18, sy - 5); ctx.stroke()
  }
}

function drawBird(ctx, o) {
  const cx = o.x + o.w / 2
  const cy = o.y + o.h / 2
  const wingUp = Math.sin(o.frame * 0.2) > 0

  // 그림자
  ctx.fillStyle = 'rgba(0,0,0,0.12)'
  ctx.beginPath()
  ctx.ellipse(cx, cy + o.h / 2 + 8, 24, 6, 0, 0, Math.PI * 2)
  ctx.fill()

  // 날개
  const wingColor = '#C0392B'
  const wingTip = wingUp ? -14 : 12
  ctx.fillStyle = wingColor
  // 왼쪽 날개
  ctx.beginPath()
  ctx.moveTo(cx, cy)
  ctx.quadraticCurveTo(cx - 18, cy + wingTip, cx - 34, cy + wingTip * 0.6)
  ctx.quadraticCurveTo(cx - 18, cy + wingTip * 0.2, cx, cy + 6)
  ctx.fill()
  // 오른쪽 날개
  ctx.beginPath()
  ctx.moveTo(cx, cy)
  ctx.quadraticCurveTo(cx + 18, cy + wingTip, cx + 34, cy + wingTip * 0.6)
  ctx.quadraticCurveTo(cx + 18, cy + wingTip * 0.2, cx, cy + 6)
  ctx.fill()

  // 꼬리
  ctx.fillStyle = '#96281B'
  ctx.beginPath()
  ctx.moveTo(cx - 8, cy + 6)
  ctx.lineTo(cx - 14, cy + 18)
  ctx.lineTo(cx, cy + 10)
  ctx.lineTo(cx + 14, cy + 18)
  ctx.lineTo(cx + 8, cy + 6)
  ctx.fill()

  // 몸통
  ctx.fillStyle = '#E74C3C'
  ctx.beginPath()
  ctx.ellipse(cx, cy, 15, 12, 0, 0, Math.PI * 2)
  ctx.fill()

  // 머리
  ctx.fillStyle = '#E74C3C'
  ctx.beginPath()
  ctx.arc(cx + 10, cy - 6, 11, 0, Math.PI * 2)
  ctx.fill()

  // 눈
  ctx.fillStyle = 'white'
  ctx.beginPath()
  ctx.arc(cx + 14, cy - 8, 4, 0, Math.PI * 2)
  ctx.fill()
  ctx.fillStyle = '#111'
  ctx.beginPath()
  ctx.arc(cx + 15, cy - 8, 2.2, 0, Math.PI * 2)
  ctx.fill()
  // 눈동자 반짝임
  ctx.fillStyle = 'white'
  ctx.beginPath()
  ctx.arc(cx + 16, cy - 9, 0.8, 0, Math.PI * 2)
  ctx.fill()

  // 부리
  ctx.fillStyle = '#F39C12'
  ctx.beginPath()
  ctx.moveTo(cx + 20, cy - 5)
  ctx.lineTo(cx + 30, cy - 2)
  ctx.lineTo(cx + 20, cy + 1)
  ctx.closePath()
  ctx.fill()
}

function drawSpike(ctx, o) {
  const count = 3
  const sw = o.w / count

  // 바닥 글로우
  ctx.fillStyle = 'rgba(180,0,255,0.18)'
  ctx.beginPath()
  ctx.ellipse(o.x + o.w / 2, o.y + o.h + 5, o.w * 0.6, 9, 0, 0, Math.PI * 2)
  ctx.fill()

  for (let i = 0; i < count; i++) {
    const bx = o.x + i * sw
    const tipX = bx + sw / 2
    const tipY = i === 1 ? o.y - 10 : o.y + 10  // 가운데가 가장 높음
    const baseY = o.y + o.h
    const baseOffset = sw * 0.18  // 밑단을 좁혀 더 뾰족하게

    // 크리스탈 그라데이션
    const grad = ctx.createLinearGradient(bx, tipY, bx + sw, baseY)
    grad.addColorStop(0, '#E1BEE7')
    grad.addColorStop(0.3, '#AB47BC')
    grad.addColorStop(0.7, '#6A1B9A')
    grad.addColorStop(1, '#3A0060')
    ctx.fillStyle = grad
    ctx.beginPath()
    ctx.moveTo(bx + baseOffset, baseY)
    ctx.lineTo(tipX, tipY)
    ctx.lineTo(bx + sw - baseOffset, baseY)
    ctx.closePath()
    ctx.fill()

    // 왼쪽 밝은 면
    ctx.fillStyle = 'rgba(255,255,255,0.28)'
    ctx.beginPath()
    ctx.moveTo(bx + baseOffset, baseY)
    ctx.lineTo(tipX, tipY)
    ctx.lineTo(tipX, baseY)
    ctx.closePath()
    ctx.fill()

    // 내부 광선
    ctx.strokeStyle = 'rgba(255,255,255,0.5)'
    ctx.lineWidth = 1
    ctx.beginPath()
    ctx.moveTo(tipX - sw * 0.15, tipY + (baseY - tipY) * 0.15)
    ctx.lineTo(tipX - sw * 0.25, baseY - 6)
    ctx.stroke()

    // 꼭대기 반짝임
    ctx.fillStyle = 'white'
    ctx.beginPath()
    ctx.arc(tipX, tipY, 2.5, 0, Math.PI * 2)
    ctx.fill()
    ctx.strokeStyle = 'rgba(255,255,255,0.85)'
    ctx.lineWidth = 1.5; ctx.lineCap = 'round'
    ctx.beginPath()
    ctx.moveTo(tipX - 7, tipY); ctx.lineTo(tipX + 7, tipY)
    ctx.moveTo(tipX, tipY - 7); ctx.lineTo(tipX, tipY + 5)
    ctx.stroke()
  }

  // 받침대
  const baseGrad = ctx.createLinearGradient(o.x, 0, o.x + o.w, 0)
  baseGrad.addColorStop(0, '#3A0060')
  baseGrad.addColorStop(0.5, '#7B1FA2')
  baseGrad.addColorStop(1, '#3A0060')
  ctx.fillStyle = baseGrad
  ctx.beginPath()
  ctx.roundRect(o.x - 3, o.y + o.h - 11, o.w + 6, 11, [0, 0, 5, 5])
  ctx.fill()
}

function drawFire(ctx, o) {
  const cx = o.x + o.w / 2
  const bottom = o.y + o.h
  const f = o.frame
  const fl  = Math.sin(f * 0.28) * 5
  const fl2 = Math.sin(f * 0.19 + 1) * 3

  // 그림자
  ctx.fillStyle = 'rgba(0,0,0,0.2)'
  ctx.beginPath()
  ctx.ellipse(cx, bottom + 4, 22, 6, 0, 0, Math.PI * 2)
  ctx.fill()

  // 화로 받침대
  ctx.fillStyle = '#555'
  ctx.beginPath()
  ctx.roundRect(cx - 14, bottom - 10, 28, 10, [0, 0, 4, 4])
  ctx.fill()
  ctx.fillStyle = '#333'
  ctx.fillRect(cx - 3, bottom - 18, 6, 10)
  ctx.fillStyle = '#444'
  ctx.beginPath()
  ctx.ellipse(cx, bottom - 18, 14, 5, 0, 0, Math.PI * 2)
  ctx.fill()

  // 바깥 글로우
  ctx.fillStyle = 'rgba(255,100,0,0.15)'
  ctx.beginPath()
  ctx.ellipse(cx, bottom - o.h * 0.4, o.w + 8, o.h * 0.7, 0, 0, Math.PI * 2)
  ctx.fill()

  // 바깥 불꽃 (짙은 빨강)
  ctx.fillStyle = '#B71C1C'
  ctx.beginPath()
  ctx.moveTo(o.x, bottom - 14)
  ctx.bezierCurveTo(o.x - 6, bottom - o.h * 0.55, cx - 13, bottom - o.h * 0.75 + fl, cx - 1, o.y - fl)
  ctx.bezierCurveTo(cx + 1, o.y - fl - 6, cx + 13, bottom - o.h * 0.75 - fl, o.x + o.w + 6, bottom - o.h * 0.55)
  ctx.lineTo(o.x + o.w, bottom - 14)
  ctx.closePath()
  ctx.fill()

  // 중간 불꽃 (주황)
  ctx.fillStyle = '#E65100'
  ctx.beginPath()
  ctx.moveTo(o.x + 4, bottom - 14)
  ctx.bezierCurveTo(o.x, bottom - o.h * 0.5, cx - 9, bottom - o.h * 0.7 + fl2, cx, o.y + 10 - fl)
  ctx.bezierCurveTo(cx + 9, bottom - o.h * 0.7 - fl2, o.x + o.w, bottom - o.h * 0.5, o.x + o.w - 4, bottom - 14)
  ctx.closePath()
  ctx.fill()

  // 안쪽 불꽃 (밝은 주황)
  ctx.fillStyle = '#FF8F00'
  ctx.beginPath()
  ctx.moveTo(o.x + 9, bottom - 14)
  ctx.bezierCurveTo(o.x + 4, bottom - o.h * 0.42, cx - 5, bottom - o.h * 0.62 + fl2, cx, o.y + 18 - fl * 0.7)
  ctx.bezierCurveTo(cx + 5, bottom - o.h * 0.62 - fl2, o.x + o.w - 4, bottom - o.h * 0.42, o.x + o.w - 9, bottom - 14)
  ctx.closePath()
  ctx.fill()

  // 코어 (노랑)
  ctx.fillStyle = '#FFEE58'
  ctx.beginPath()
  ctx.moveTo(cx - 6, bottom - 14)
  ctx.bezierCurveTo(cx - 5, bottom - o.h * 0.35, cx - 3, bottom - o.h * 0.5 + fl * 0.5, cx, o.y + 26 - fl * 0.5)
  ctx.bezierCurveTo(cx + 3, bottom - o.h * 0.5 - fl * 0.5, cx + 5, bottom - o.h * 0.35, cx + 6, bottom - 14)
  ctx.closePath()
  ctx.fill()

  // 흰 코어 빛
  ctx.fillStyle = 'rgba(255,255,240,0.85)'
  ctx.beginPath()
  ctx.ellipse(cx, bottom - o.h * 0.3 + fl * 0.2, 4, 10, 0, 0, Math.PI * 2)
  ctx.fill()

  // 불씨 파티클 (5개)
  for (let i = 0; i < 5; i++) {
    const px = cx + Math.sin(f * 0.25 + i * 1.3) * 14
    const py = o.y - 5 - Math.abs(Math.sin(f * 0.12 + i * 0.7)) * 20
    const alpha = 1 - Math.abs(Math.sin(f * 0.12 + i * 0.7))
    ctx.fillStyle = i % 2 === 0 ? `rgba(255,200,0,${alpha.toFixed(2)})` : `rgba(255,100,0,${alpha.toFixed(2)})`
    ctx.beginPath()
    ctx.arc(px, py, 1.8, 0, Math.PI * 2)
    ctx.fill()
  }
}

// ─── 배경 (점수에 따라 낮 → 노을 → 밤) ────────────────────────

function drawBackground(ctx, s, frame) {
  const score  = s.score
  const isDay    = score < 35
  const isSunset = score >= 35 && score < 70
  const isNight  = score >= 70

  // 하늘
  const skyGrad = ctx.createLinearGradient(0, 0, 0, GROUND_Y)
  if (isDay) {
    skyGrad.addColorStop(0, '#3A7BD5'); skyGrad.addColorStop(1, '#87CEEB')
  } else if (isSunset) {
    skyGrad.addColorStop(0, '#1C0535'); skyGrad.addColorStop(0.45, '#C0392B'); skyGrad.addColorStop(1, '#FF8C42')
  } else {
    skyGrad.addColorStop(0, '#06061A'); skyGrad.addColorStop(1, '#121230')
  }
  ctx.fillStyle = skyGrad
  ctx.fillRect(0, 0, W, H)

  // 별 (밤)
  if (isNight) {
    for (const st of s.stars) {
      const alpha = 0.35 + 0.65 * Math.abs(Math.sin(frame * 0.03 + st.phase))
      ctx.fillStyle = `rgba(255,255,255,${alpha.toFixed(2)})`
      ctx.beginPath(); ctx.arc(st.x, st.y, st.r, 0, Math.PI * 2); ctx.fill()
    }
    // 달
    ctx.fillStyle = '#FFFDE7'
    ctx.beginPath(); ctx.arc(760, 55, 32, 0, Math.PI * 2); ctx.fill()
    ctx.fillStyle = '#06061A'
    ctx.beginPath(); ctx.arc(774, 48, 28, 0, Math.PI * 2); ctx.fill()
    ctx.fillStyle = 'rgba(255,253,231,0.07)'
    ctx.beginPath(); ctx.arc(760, 55, 55, 0, Math.PI * 2); ctx.fill()
  }

  // 태양 (낮)
  if (isDay) {
    ctx.fillStyle = '#FFD700'
    ctx.beginPath(); ctx.arc(80, 55, 28, 0, Math.PI * 2); ctx.fill()
    ctx.fillStyle = 'rgba(255,215,0,0.14)'
    ctx.beginPath(); ctx.arc(80, 55, 52, 0, Math.PI * 2); ctx.fill()
    ctx.strokeStyle = 'rgba(255,215,0,0.45)'; ctx.lineWidth = 2.5
    for (let i = 0; i < 8; i++) {
      const a = (i / 8) * Math.PI * 2
      ctx.beginPath()
      ctx.moveTo(80 + Math.cos(a) * 33, 55 + Math.sin(a) * 33)
      ctx.lineTo(80 + Math.cos(a) * 47, 55 + Math.sin(a) * 47)
      ctx.stroke()
    }
  }

  // 지는 태양 (노을)
  if (isSunset) {
    ctx.fillStyle = 'rgba(255,120,0,0.18)'
    ctx.beginPath(); ctx.arc(W / 2, GROUND_Y, 92, Math.PI, 0); ctx.fill()
    ctx.fillStyle = '#FF5500'
    ctx.beginPath(); ctx.arc(W / 2, GROUND_Y, 48, Math.PI, 0); ctx.fill()
  }

  // 산
  const mtColor   = isDay ? '#8FA8BE' : isSunset ? '#4A1A5E' : '#0D0D2A'
  const snowColor = isDay ? '#E8F4F8' : null
  drawMountain(ctx, 60,  GROUND_Y, 200, 140, mtColor, snowColor)
  drawMountain(ctx, 290, GROUND_Y, 240, 120, mtColor, snowColor)
  drawMountain(ctx, 580, GROUND_Y, 210, 150, mtColor, snowColor)
  drawMountain(ctx, 830, GROUND_Y, 180, 110, mtColor, snowColor)

  // 구름 (밤엔 숨김)
  if (!isNight) {
    const base = isDay ? 'rgba(255,255,255,' : 'rgba(255,200,160,'
    drawCloud(ctx, s.clouds[0].x, s.clouds[0].y, base + '0.88)')
    drawCloud(ctx, s.clouds[1].x, s.clouds[1].y, base + '0.72)')
    drawCloud(ctx, s.clouds[2].x, s.clouds[2].y, base + '0.60)')
  }

  // 땅
  const gGrad = ctx.createLinearGradient(0, GROUND_Y, 0, H)
  if (isDay) {
    gGrad.addColorStop(0, '#5DBB5D'); gGrad.addColorStop(0.3, '#4AA44A'); gGrad.addColorStop(1, '#2E7D2E')
  } else if (isSunset) {
    gGrad.addColorStop(0, '#4A8A3A'); gGrad.addColorStop(1, '#2A5A1A')
  } else {
    gGrad.addColorStop(0, '#1A3A1A'); gGrad.addColorStop(1, '#0A1A0A')
  }
  ctx.fillStyle = gGrad
  ctx.fillRect(0, GROUND_Y, W, H - GROUND_Y)
  ctx.fillStyle = isDay ? '#3A9A3A' : isSunset ? '#2A6A2A' : '#0D2A0D'
  ctx.fillRect(0, GROUND_Y, W, 10)
}

function drawMountain(ctx, x, baseY, width, height, color, snowColor) {
  ctx.fillStyle = color
  ctx.beginPath()
  ctx.moveTo(x, baseY); ctx.lineTo(x + width / 2, baseY - height); ctx.lineTo(x + width, baseY)
  ctx.closePath(); ctx.fill()
  if (snowColor) {
    ctx.fillStyle = snowColor
    ctx.beginPath()
    ctx.moveTo(x + width * 0.28, baseY - height * 0.62)
    ctx.lineTo(x + width / 2, baseY - height)
    ctx.lineTo(x + width * 0.72, baseY - height * 0.62)
    ctx.closePath(); ctx.fill()
  }
}

function drawCloud(ctx, x, y, color = 'rgba(255,255,255,0.88)') {
  ctx.fillStyle = color
  ctx.beginPath()
  ctx.arc(x,      y,      28, 0, Math.PI * 2)
  ctx.arc(x + 34, y - 12, 34, 0, Math.PI * 2)
  ctx.arc(x + 70, y,      28, 0, Math.PI * 2)
  ctx.fill()
}

// ─── 스타일 ────────────────────────────────────────────────────

const styles = {
  wrapper: {
    fontFamily: '"Segoe UI", sans-serif',
    padding: 'clamp(12px, 4vw, 24px)',
    background: '#0f0f1e',
    minHeight: '100vh',
    boxSizing: 'border-box',
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 0,
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
    fontSize: 'clamp(26px, 7vw, 44px)',
    color: '#FFD700',
    margin: '0 0 8px',
    textShadow: '0 2px 14px rgba(255,215,0,0.4)',
  },
  subtitle: {
    fontSize: 'clamp(14px, 3.5vw, 18px)',
    color: '#aaa',
    margin: '0 0 14px',
    display: 'flex',
    alignItems: 'center',
    gap: 8,
  },
  diffBadge: {
    fontSize: 'clamp(11px, 2.5vw, 13px)',
    fontWeight: 'bold',
    color: '#111',
    padding: '3px 10px',
    borderRadius: 20,
  },
  gameArea: {
    position: 'relative',
    width: '100%',
    maxWidth: W,
    margin: '0 auto',
  },
  canvasWrap: {
    display: 'block',
    width: '100%',
    marginBottom: 12,
  },
  canvas: {
    cursor: 'pointer',
    border: '4px solid #FFD700',
    borderRadius: 14,
    display: 'block',
    boxShadow: '0 8px 40px rgba(0,0,0,0.6)',
    width: '100%',
    height: 'auto',
    touchAction: 'none',
  },
  overlay: {
    position: 'absolute',
    inset: 0,
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    justifyContent: 'center',
    background: 'rgba(0,0,0,0.82)',
    borderRadius: 10,
    color: 'white',
    zIndex: 10,
  },
  oEmoji: { fontSize: 'clamp(36px, 8vw, 64px)' },
  oTitle: { fontSize: 'clamp(20px, 5vw, 38px)', fontWeight: 'bold', marginTop: 8 },
  oHint:  { fontSize: 'clamp(12px, 3vw, 17px)', marginTop: 10, opacity: 0.88, padding: '0 12px', textAlign: 'center' },
  oScore: { fontSize: 'clamp(18px, 4vw, 28px)', margin: '10px 0 4px' },
  oBest:  { fontSize: 'clamp(13px, 3vw, 18px)', color: '#FFD700', marginBottom: 4, opacity: 0.9 },
  btnRow: { display: 'flex', flexWrap: 'wrap', justifyContent: 'center', gap: 12, marginTop: 14 },
  btn: {
    padding: 'clamp(10px, 2vw, 14px) clamp(20px, 4vw, 36px)',
    fontSize: 'clamp(15px, 3.5vw, 20px)',
    borderRadius: 14,
    border: 'none',
    background: 'linear-gradient(135deg, #FFD700, #FFA500)',
    cursor: 'pointer',
    fontWeight: 'bold',
    color: '#222',
    boxShadow: '0 4px 20px rgba(255,165,0,0.4)',
  },
  btnSecondary: {
    padding: 'clamp(10px, 2vw, 14px) clamp(20px, 4vw, 36px)',
    fontSize: 'clamp(15px, 3.5vw, 20px)',
    borderRadius: 14,
    border: '2px solid #444',
    background: 'transparent',
    cursor: 'pointer',
    fontWeight: 'bold',
    color: '#aaa',
  },
  scoreCard: {
    width: '100%',
    maxWidth: W,
    background: '#1e1e2e',
    border: '2px solid #333',
    borderRadius: 14,
    padding: 'clamp(10px, 2vw, 14px) clamp(16px, 3vw, 24px)',
    boxSizing: 'border-box',
  },
  scoreRow: {
    display: 'flex',
    justifyContent: 'center',
    alignItems: 'center',
    gap: 'clamp(16px, 5vw, 40px)',
  },
  scoreItem: {
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    gap: 2,
  },
  scoreLabel: {
    fontSize: 'clamp(11px, 2vw, 13px)',
    color: '#777',
    fontWeight: 'bold',
  },
  scoreDivider: {
    width: 2,
    height: 36,
    background: '#333',
    borderRadius: 2,
  },
  score: {
    fontSize: 'clamp(22px, 5vw, 34px)',
    fontWeight: 'bold',
    color: '#FFD700',
    textShadow: '0 2px 8px rgba(255,215,0,0.3)',
  },
  best: {
    fontSize: 'clamp(22px, 5vw, 34px)',
    fontWeight: 'bold',
    color: '#FFA500',
    textShadow: '0 2px 8px rgba(255,165,0,0.3)',
  },
  hint: {
    fontSize: 'clamp(10px, 2vw, 13px)',
    color: '#555',
    marginTop: 8,
    textAlign: 'center',
  },
}
