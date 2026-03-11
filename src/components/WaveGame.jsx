import { useEffect, useRef, useState } from 'react'
import { getBest, saveBest, getSavedDiff, saveDiff, drawEmoji } from '../utils/gameUtils'

// ── 상수 ────────────────────────────────────────────────────────────
const W = 800
const H = 450
const GAME_ID = 'wave'
const PLAYER_X = 130
const PLAYER_R = 18    // 충돌 반경
const WALL_W = 44      // 파도 벽 너비
const GRAVITY = 0.38
const FLAP = -9

const DIFFICULTIES = [
  { id: 'easy',   label: '쉬움',   emoji: '🌱', color: '#4CAF50' },
  { id: 'normal', label: '보통',   emoji: '⚡', color: '#FFD700' },
  { id: 'hard',   label: '어려움', emoji: '🔥', color: '#F44336' },
]

const DIFF_SETTINGS = {
  easy:   { speed: 2.2, gapH: 210, interval: 165 },
  normal: { speed: 3.2, gapH: 170, interval: 135 },
  hard:   { speed: 4.6, gapH: 135, interval: 105 },
}

// ── 초기 상태 ────────────────────────────────────────────────────────
function makeState(diff) {
  return {
    player: { y: H / 2, vy: 0 },
    obstacles: [],
    nextOb: diff.interval,
    score: 0,
    frame: 0,
    waveOff: 0,
    cloudX: [100, 300, 580, 720],
  }
}

// ── 메인 컴포넌트 ────────────────────────────────────────────────────
export default function WaveGame({ onBack, onStart }) {
  const [difficulty, setDifficulty] = useState(() => getSavedDiff(GAME_ID, DIFFICULTIES))
  const diff = DIFF_SETTINGS[difficulty.id]

  const [phase, setPhase]       = useState('idle')
  const [countdown, setCountdown] = useState(0)
  const [score, setScore]       = useState(0)
  const [best, setBest]         = useState(() => getBest(GAME_ID, difficulty.id))

  const canvasRef     = useRef(null)
  const wrapRef       = useRef(null)
  const animRef       = useRef(null)
  const stateRef      = useRef(null)
  const gameOverAtRef = useRef(0)

  if (stateRef.current == null) stateRef.current = makeState(diff)

  // ── 카운트다운 ────────────────────────────────────────────────────
  useEffect(() => {
    if (phase !== 'countdown') return
    // 초기 장면 한 프레임 그리기
    const canvas = canvasRef.current
    const ctx = canvas.getContext('2d')
    const skyGrad = ctx.createLinearGradient(0, 0, 0, H * 0.55)
    skyGrad.addColorStop(0, '#87ceeb')
    skyGrad.addColorStop(1, '#b3e5fc')
    const seaGrad = ctx.createLinearGradient(0, H * 0.55, 0, H)
    seaGrad.addColorStop(0, '#0288d1')
    seaGrad.addColorStop(1, '#01579b')
    draw(ctx, stateRef.current, diff, skyGrad, seaGrad)
  }, [phase]) // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (phase !== 'countdown') return
    if (countdown <= 0) { setPhase('playing'); return }
    const t = setTimeout(() => setCountdown(c => c - 1), 1000)
    return () => clearTimeout(t)
  }, [phase, countdown])

  // ── 게임 루프 ──────────────────────────────────────────────────────
  useEffect(() => {
    if (phase !== 'playing') return
    const canvas = canvasRef.current
    const ctx = canvas.getContext('2d')
    let alive = true
    let lastScore = -1

    const skyGrad = ctx.createLinearGradient(0, 0, 0, H * 0.55)
    skyGrad.addColorStop(0, '#87ceeb')
    skyGrad.addColorStop(1, '#b3e5fc')
    const seaGrad = ctx.createLinearGradient(0, H * 0.55, 0, H)
    seaGrad.addColorStop(0, '#0288d1')
    seaGrad.addColorStop(1, '#01579b')

    function loop() {
      if (!alive) return
      animRef.current = requestAnimationFrame(loop)
      const s = stateRef.current
      s.frame++
      s.waveOff = (s.waveOff + diff.speed * 0.6) % (W * 2)

      // 구름 이동
      for (let i = 0; i < s.cloudX.length; i++) {
        s.cloudX[i] -= diff.speed * 0.3
        if (s.cloudX[i] < -80) s.cloudX[i] = W + 40
      }

      // 플레이어 물리
      s.player.vy += GRAVITY
      s.player.y += s.player.vy

      // 장애물 스폰
      s.nextOb--
      if (s.nextOb <= 0) {
        const margin = 55
        const gapY = margin + Math.random() * (H - margin * 2 - diff.gapH)
        s.obstacles.push({ x: W + WALL_W, gapY, passed: false })
        s.nextOb = diff.interval
      }

      // 장애물 이동 + 통과 점수
      for (const ob of s.obstacles) {
        ob.x -= diff.speed
        if (!ob.passed && ob.x + WALL_W < PLAYER_X - PLAYER_R) {
          ob.passed = true
          s.score++
        }
      }
      s.obstacles = s.obstacles.filter(ob => ob.x > -WALL_W - 10)

      // 충돌
      if (isDead(s, diff)) {
        gameOverAtRef.current = Date.now()
        if (saveBest(GAME_ID, difficulty.id, s.score)) setBest(s.score)
        setPhase('gameover')
        return
      }

      if (s.score !== lastScore) { lastScore = s.score; setScore(s.score) }
      draw(ctx, s, diff, skyGrad, seaGrad)
    }

    animRef.current = requestAnimationFrame(loop)
    return () => { alive = false; cancelAnimationFrame(animRef.current) }
  }, [phase, difficulty]) // eslint-disable-line react-hooks/exhaustive-deps

  // ── 재시작 ────────────────────────────────────────────────────────
  function startGame() {
    if (Date.now() - gameOverAtRef.current < 800) return
    onStart?.()
    stateRef.current = makeState(diff)
    setScore(0)
    setBest(getBest(GAME_ID, difficulty.id))
    setCountdown(3)
    setPhase('countdown')
  }

  // ── 난이도 변경 ───────────────────────────────────────────────────
  function changeDiff(d) {
    saveDiff(GAME_ID, d.id)
    setDifficulty(d)
    setBest(getBest(GAME_ID, d.id))
    stateRef.current = makeState(DIFF_SETTINGS[d.id])
    setPhase('idle')
  }

  // ── 키보드 ────────────────────────────────────────────────────────
  useEffect(() => {
    function onKey(e) {
      if (e.code === 'Space' || e.code === 'ArrowUp') {
        e.preventDefault()
        if (phase === 'countdown') return
        if (phase !== 'playing') { startGame(); return }
        flap(stateRef.current)
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [phase]) // eslint-disable-line react-hooks/exhaustive-deps

  // ── 터치/클릭 ─────────────────────────────────────────────────────
  useEffect(() => {
    const el = wrapRef.current
    if (!el) return
    function onTouch(e) {
      if (e.target.closest('button')) return
      e.preventDefault()
      if (phase === 'countdown') return
      if (phase !== 'playing') { startGame(); return }
      flap(stateRef.current)
    }
    el.addEventListener('touchstart', onTouch, { passive: false })
    el.addEventListener('click', onTouch)
    return () => {
      el.removeEventListener('touchstart', onTouch)
      el.removeEventListener('click', onTouch)
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

  // ── 렌더 ─────────────────────────────────────────────────────────
  return (
    <div style={S.wrapper}>
      <div style={S.topBar}>
        <button style={S.backBtn} onClick={onBack}>← 나가기</button>
      </div>
      <h1 style={S.title}>🌊 파도 피하기</h1>
      <p style={S.subtitle}>{difficulty.emoji} {difficulty.label} · {score}개 통과</p>

      <div ref={wrapRef} style={S.gameArea}>
        <canvas ref={canvasRef} width={W} height={H} style={S.canvas} />

        <div style={S.scoreCard}>
          <div style={S.scoreRow}>
            <div style={S.scoreItem}>
              <span style={S.scoreLabel}>통과</span>
              <span style={S.scoreVal}>{score}개</span>
            </div>
            <div style={S.scoreDivider} />
            <div style={S.scoreItem}>
              <span style={S.scoreLabel}>🏆 최고</span>
              <span style={S.scoreBest}>{best}개</span>
            </div>
          </div>
        </div>

        {phase === 'playing' && (
          <div style={S.hudScore}>{score}개</div>
        )}

        {phase === 'countdown' && (
          <div style={S.countdownOverlay}>
            <div style={S.countdownNum}>{countdown}</div>
          </div>
        )}

        {phase === 'idle' && (
          <div style={S.overlay}>
            <div style={S.box}>
              <div style={S.oTitle}>🌊 파도 피하기</div>
              <div style={S.desc}>
                <p>밀려오는 파도 사이를 헤쳐나가요!</p>
                <p>탭하거나 스페이스를 누르면<br />서퍼가 위로 올라가요 🏄</p>
              </div>
              {diffPicker}
              <div style={S.bestLine}>🏆 최고 {best}개 통과</div>
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
              <div style={S.oEmoji}>{isNewBest ? '🏆' : '🌊'}</div>
              <div style={S.oTitle}>{isNewBest ? '신기록!' : '파도에 휩쓸렸어요!'}</div>
              <div style={S.bigScore}>{score}개 통과</div>
              <div style={S.bestScore}>최고 {best}개</div>
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

// ── 게임 로직 ─────────────────────────────────────────────────────────

function flap(s) {
  s.player.vy = FLAP
}

function isDead(s, diff) {
  const py = s.player.y
  // 화면 위아래
  if (py - PLAYER_R < 0 || py + PLAYER_R > H) return true
  // 파도 벽 충돌
  for (const ob of s.obstacles) {
    if (ob.x > PLAYER_X + PLAYER_R + 4 || ob.x + WALL_W < PLAYER_X - PLAYER_R - 4) continue
    if (py - PLAYER_R < ob.gapY || py + PLAYER_R > ob.gapY + diff.gapH) return true
  }
  return false
}

function draw(ctx, s, diff, skyGrad, seaGrad) {
  const { player, obstacles, waveOff, cloudX } = s

  // 배경: 하늘
  ctx.fillStyle = skyGrad
  ctx.fillRect(0, 0, W, H * 0.55)

  // 배경: 바다
  ctx.fillStyle = seaGrad
  ctx.fillRect(0, H * 0.55, W, H * 0.45)

  // 구름
  for (const cx of cloudX) {
    drawCloud(ctx, cx, 55)
  }

  // 바다 반짝임
  for (let i = 0; i < 5; i++) {
    const wx = ((i * 170 + waveOff * 0.4) % W)
    const wy = H * 0.58 + Math.sin(waveOff / 30 + i) * 8
    ctx.fillStyle = 'rgba(255,255,255,0.18)'
    ctx.beginPath()
    ctx.ellipse(wx, wy, 28, 5, 0, 0, Math.PI * 2)
    ctx.fill()
  }

  // 파도 벽
  for (const ob of obstacles) {
    drawWall(ctx, ob, diff.gapH, waveOff)
  }

  // 수면선 (장식)
  ctx.strokeStyle = 'rgba(255,255,255,0.35)'
  ctx.lineWidth = 2
  ctx.beginPath()
  for (let x = 0; x <= W; x += 6) {
    const y = H * 0.55 + Math.sin((x + waveOff) / 50) * 6
    x === 0 ? ctx.moveTo(x, y) : ctx.lineTo(x, y)
  }
  ctx.stroke()

  // 플레이어 서퍼
  const angle = Math.min(Math.max(player.vy * 0.05, -0.5), 0.5)
  ctx.save()
  ctx.translate(PLAYER_X, player.y)
  ctx.rotate(angle)
  drawEmoji(ctx, '🏄', 0, 0, 44)
  ctx.restore()
}

function drawCloud(ctx, x, y) {
  ctx.fillStyle = 'rgba(255,255,255,0.85)'
  ctx.beginPath()
  ctx.ellipse(x, y, 38, 18, 0, 0, Math.PI * 2)
  ctx.ellipse(x + 28, y + 4, 26, 14, 0, 0, Math.PI * 2)
  ctx.ellipse(x - 24, y + 5, 22, 13, 0, 0, Math.PI * 2)
  ctx.fill()
}

function drawWall(ctx, ob, gapH, waveOff) {
  const { x, gapY } = ob
  const botY = gapY + gapH

  // 위쪽 벽
  const wallGrad = ctx.createLinearGradient(x, 0, x + WALL_W, 0)
  wallGrad.addColorStop(0, '#0d47a1')
  wallGrad.addColorStop(0.5, '#1565c0')
  wallGrad.addColorStop(1, '#0d47a1')
  ctx.fillStyle = wallGrad
  ctx.fillRect(x, 0, WALL_W, gapY)

  // 위쪽 벽 파도 하단
  ctx.fillStyle = '#29b6f6'
  ctx.beginPath()
  const cx = x + WALL_W / 2
  for (let i = 0; i <= WALL_W; i++) {
    const wy = gapY + Math.sin((i + waveOff * 1.5) / 12) * 7 + 7
    i === 0 ? ctx.moveTo(x + i, wy) : ctx.lineTo(x + i, wy)
  }
  ctx.lineTo(x + WALL_W, gapY)
  ctx.lineTo(x, gapY)
  ctx.closePath()
  ctx.fill()

  // 흰 거품 (위쪽 벽 하단)
  ctx.fillStyle = 'rgba(255,255,255,0.75)'
  ctx.beginPath()
  ctx.ellipse(cx, gapY + 6, WALL_W / 2 - 2, 7, 0, 0, Math.PI * 2)
  ctx.fill()

  // 아래쪽 벽
  ctx.fillStyle = wallGrad
  ctx.fillRect(x, botY, WALL_W, H - botY)

  // 아래쪽 벽 파도 상단
  ctx.fillStyle = '#29b6f6'
  ctx.beginPath()
  ctx.moveTo(x, botY)
  for (let i = 0; i <= WALL_W; i++) {
    const wy = botY - Math.sin((i + waveOff * 1.5) / 12) * 7 - 7
    ctx.lineTo(x + i, wy)
  }
  ctx.lineTo(x + WALL_W, botY)
  ctx.closePath()
  ctx.fill()

  // 흰 거품 (아래쪽 벽 상단)
  ctx.fillStyle = 'rgba(255,255,255,0.75)'
  ctx.beginPath()
  ctx.ellipse(cx, botY - 6, WALL_W / 2 - 2, 7, 0, 0, Math.PI * 2)
  ctx.fill()
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
  hudScore: {
    position: 'absolute',
    top: 12, right: 16,
    fontSize: 18, fontWeight: 'bold',
    color: '#fff', textShadow: '0 1px 4px #000',
    pointerEvents: 'none',
  },
  countdownOverlay: {
    position: 'absolute',
    inset: 0,
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    pointerEvents: 'none',
  },
  countdownNum: {
    fontSize: 'clamp(80px, 20vw, 120px)',
    fontWeight: 'bold',
    color: '#fff',
    textShadow: '0 4px 24px rgba(0,0,0,0.6)',
    lineHeight: 1,
  },
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
