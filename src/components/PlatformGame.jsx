import { useEffect, useRef, useState } from 'react'
import { getBest, saveBest, getSavedDiff, saveDiff, drawEmoji, fillRoundRect, randInt, STYLES } from '../utils/gameUtils'

// ── 상수 ────────────────────────────────────────────────────────────
const W = 480
const H = 700
const GAME_ID = 'platform'

const GRAVITY = 0.38
const JUMP_VY = -13
const PLAT_H = 12
const PLAYER_SIZE = 40
const PLAYER_HALF_W = 14
const PLAYER_FEET = 14
const CAM_THRESH = H * 0.38
const MOVE_SPD = 4.5

const DIFFICULTIES = [
  { id: 'easy',   label: '쉬움',   emoji: '🌱', color: '#4CAF50' },
  { id: 'normal', label: '보통',   emoji: '⚡', color: '#FFD700' },
  { id: 'hard',   label: '어려움', emoji: '🔥', color: '#F44336' },
]

const DIFF_SETTINGS = {
  easy:   { gapY: 85,  platWMin: 100, platWMax: 140, movingChance: 0,    moveSpd: 1.5 },
  normal: { gapY: 105, platWMin: 75,  platWMax: 110, movingChance: 0.25, moveSpd: 2.5 },
  hard:   { gapY: 125, platWMin: 58,  platWMax: 90,  movingChance: 0.45, moveSpd: 3.5 },
}

// ── 플랫폼 생성 헬퍼 ─────────────────────────────────────────────────
function makePlatforms(ds) {
  const platforms = []
  // 첫 발판: 넓고, 고정, 중앙
  platforms.push({ x: W / 2 - 70, y: H - 50, w: 140, vx: 0, dir: 1 })

  let y = H - 50
  while (y > -H * 2) {
    y -= randInt(ds.gapY - 15, ds.gapY + 25)
    const w = randInt(ds.platWMin, ds.platWMax)
    const x = randInt(5, W - w - 5)
    const moving = Math.random() < ds.movingChance
    platforms.push({ x, y, w, vx: moving ? ds.moveSpd : 0, dir: 1 })
  }
  return platforms
}

// ── 초기 게임 상태 ───────────────────────────────────────────────────
function makeInitialState(difficulty) {
  const ds = DIFF_SETTINGS[difficulty.id]
  const platforms = makePlatforms(ds)

  // nextPlatY: world y of topmost generated platform
  let minY = H - 50
  for (const p of platforms) {
    if (p.y < minY) minY = p.y
  }

  return {
    player: { x: W / 2, y: H - 80, vx: 0, vy: 0 },
    platforms,
    worldTop: 0,
    score: 0,
    nextPlatY: minY,
    ds,
  }
}

const CHARACTERS = ['🐸','🐰','🐱','🐶','🦊','🐼','🐧','🐯','🦁','🐥','🦄','🤖']

// ── 메인 컴포넌트 ────────────────────────────────────────────────────
export default function PlatformGame({ onBack }) {
  const [difficulty, setDifficulty] = useState(() => getSavedDiff(GAME_ID, DIFFICULTIES))
  const [character, setCharacter] = useState(() => localStorage.getItem(`${GAME_ID}_char`) || '🐸')

  const [phase, setPhase] = useState('idle')
  const [score, setScore] = useState(0)
  const [best, setBest] = useState(() => getBest(GAME_ID, difficulty.id))

  const canvasRef = useRef(null)
  const wrapRef = useRef(null)
  const animRef = useRef(null)
  const stateRef = useRef(null)
  const gameOverAtRef = useRef(0)
  const keysRef = useRef({})
  const touchRef = useRef({ left: false, right: false })

  if (stateRef.current == null) stateRef.current = makeInitialState(difficulty)

  // ── idle/gameover 일 때 캔버스 초기 그리기 ────────────────────────
  useEffect(() => {
    if (phase === 'playing') return
    const canvas = canvasRef.current
    if (!canvas) return
    draw(canvas.getContext('2d'), stateRef.current, character)
  }, [phase, character])

  // ── 게임 루프 ──────────────────────────────────────────────────────
  useEffect(() => {
    if (phase !== 'playing') return

    const canvas = canvasRef.current
    const ctx = canvas.getContext('2d')
    let alive = true

    function loop() {
      if (!alive) return
      animRef.current = requestAnimationFrame(loop)

      const s = stateRef.current
      const p = s.player
      const ds = s.ds

      // 1. 이동 발판 업데이트
      for (const pl of s.platforms) {
        if (pl.vx !== 0) {
          pl.x += pl.vx * pl.dir
          if (pl.x < 5 || pl.x + pl.w > W - 5) pl.dir *= -1
        }
      }

      // 2. 입력 읽기
      const goLeft  = keysRef.current['ArrowLeft']  || keysRef.current['a'] || keysRef.current['A'] || touchRef.current.left
      const goRight = keysRef.current['ArrowRight'] || keysRef.current['d'] || keysRef.current['D'] || touchRef.current.right

      // 3. 플레이어 수평 속도
      p.vx = goLeft ? -MOVE_SPD : goRight ? MOVE_SPD : 0

      // 4. 중력
      p.vy += GRAVITY

      // 5. 플레이어 이동
      p.x += p.vx
      p.y += p.vy

      // 6. 수평 래핑
      if (p.x < -10) p.x = W + 10
      if (p.x > W + 10) p.x = -10

      // 7. 발판 충돌 (낙하 중에만)
      if (p.vy > 0) {
        const pFeet = p.y + PLAYER_FEET
        for (const pl of s.platforms) {
          if (
            pFeet >= pl.y &&
            pFeet <= pl.y + PLAT_H + Math.abs(p.vy) + 2 &&
            p.x + PLAYER_HALF_W > pl.x &&
            p.x - PLAYER_HALF_W < pl.x + pl.w
          ) {
            p.vy = JUMP_VY
            p.y = pl.y - PLAYER_FEET
            break
          }
        }
      }

      // 8. 카메라 업데이트
      const screenY = p.y - s.worldTop
      if (screenY < CAM_THRESH) {
        s.worldTop = p.y - CAM_THRESH
      }

      // 9. 점수 갱신
      const newScore = Math.max(s.score, Math.floor(-s.worldTop / 8))
      s.score = newScore

      // 10. 새 발판 생성
      while (s.nextPlatY > s.worldTop - H) {
        const w = randInt(ds.platWMin, ds.platWMax)
        const x = randInt(5, W - w - 5)
        const moving = Math.random() < ds.movingChance
        s.platforms.push({ x, y: s.nextPlatY, w, vx: moving ? ds.moveSpd : 0, dir: 1 })
        s.nextPlatY -= randInt(ds.gapY - 15, ds.gapY + 25)
      }

      // 11. 오래된 발판 제거
      s.platforms = s.platforms.filter(pl => pl.y <= s.worldTop + H + 100)

      // 12. 게임오버 판정
      if (p.y - s.worldTop > H + 60) {
        alive = false
        gameOverAtRef.current = Date.now()
        if (saveBest(GAME_ID, difficulty.id, s.score)) {
          setBest(s.score)
        }
        setPhase('gameover')
        return
      }

      setScore(s.score)
      draw(ctx, s, character)
    }

    animRef.current = requestAnimationFrame(loop)
    return () => {
      alive = false
      cancelAnimationFrame(animRef.current)
    }
  }, [phase, difficulty, character])

  // ── 재시작 ────────────────────────────────────────────────────────
  function startGame() {
    if (Date.now() - gameOverAtRef.current < 800) return
    stateRef.current = makeInitialState(difficulty)
    setScore(0)
    setBest(getBest(GAME_ID, difficulty.id))
    setPhase('playing')
  }

  // ── 입력: 키보드 ──────────────────────────────────────────────────
  useEffect(() => {
    function onKeyDown(e) {
      keysRef.current[e.key] = true
      if (e.code === 'Space' || e.code === 'ArrowUp') {
        e.preventDefault()
        if (phase === 'idle' || phase === 'gameover') startGame()
      }
    }
    function onKeyUp(e) {
      keysRef.current[e.key] = false
    }
    window.addEventListener('keydown', onKeyDown)
    window.addEventListener('keyup', onKeyUp)
    return () => {
      window.removeEventListener('keydown', onKeyDown)
      window.removeEventListener('keyup', onKeyUp)
    }
  }, [phase]) // eslint-disable-line react-hooks/exhaustive-deps

  // ── 입력: 터치 ────────────────────────────────────────────────────
  useEffect(() => {
    const el = wrapRef.current
    if (!el) return

    function getTouchSides(touches) {
      let left = false, right = false
      const rect = el.getBoundingClientRect()
      const scaleX = W / rect.width
      for (let i = 0; i < touches.length; i++) {
        const cx = (touches[i].clientX - rect.left) * scaleX
        if (cx < W / 2) left = true
        else right = true
      }
      return { left, right }
    }

    function onTouchStart(e) {
      if (e.target.closest('button')) return
      e.preventDefault()
      if (phase === 'idle' || phase === 'gameover') {
        startGame()
        return
      }
      const { left, right } = getTouchSides(e.touches)
      touchRef.current = { left, right }
    }

    function onTouchEnd(e) {
      e.preventDefault()
      const { left, right } = getTouchSides(e.touches)
      touchRef.current = { left, right }
    }

    el.addEventListener('touchstart',  onTouchStart,  { passive: false })
    el.addEventListener('touchend',    onTouchEnd,    { passive: false })
    el.addEventListener('touchcancel', onTouchEnd,    { passive: false })
    return () => {
      el.removeEventListener('touchstart',  onTouchStart)
      el.removeEventListener('touchend',    onTouchEnd)
      el.removeEventListener('touchcancel', onTouchEnd)
    }
  }, [phase]) // eslint-disable-line react-hooks/exhaustive-deps

  function pickDifficulty(d) {
    saveDiff(GAME_ID, d.id)
    setDifficulty(d)
    setBest(getBest(GAME_ID, d.id))
    stateRef.current = makeInitialState(d)
    setPhase('idle')
  }

  function pickCharacter(c) {
    localStorage.setItem(`${GAME_ID}_char`, c)
    setCharacter(c)
  }

  const isNewBest = score > 0 && score >= best

  const diffPicker = (
    <div>
      <div style={S.label}>난이도</div>
      <div style={S.diffRow}>
        {DIFFICULTIES.map(d => (
          <button key={d.id} onClick={() => pickDifficulty(d)} style={{
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

  const charPicker = (label) => (
    <div>
      <div style={S.label}>{label}</div>
      <div style={S.charGrid}>
        {CHARACTERS.map(c => (
          <button key={c} onClick={() => pickCharacter(c)} style={{
            ...S.charBtn,
            background:  character === c ? 'rgba(255,215,0,0.15)' : 'transparent',
            outline:     character === c ? '2px solid #FFD700' : '2px solid transparent',
          }}>
            {c}
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
      <h1 style={S.title}>🐸 플랫폼 점프!</h1>
      <p style={S.subtitle}>{difficulty.emoji} {difficulty.label} · {character} {score}층</p>

      <div ref={wrapRef} style={S.gameArea}>
        <canvas ref={canvasRef} width={W} height={H} style={S.canvas} />

        {/* 스코어카드 */}
        <div style={S.scoreCard}>
          <div style={S.scoreRow}>
            <div style={S.scoreItem}>
              <span style={S.scoreLabel}>점수</span>
              <span style={S.scoreVal}>{score}층</span>
            </div>
            <div style={S.scoreDivider} />
            <div style={S.scoreItem}>
              <span style={S.scoreLabel}>🏆 최고</span>
              <span style={S.scoreBest}>{best}층</span>
            </div>
          </div>
        </div>

        {/* 인게임 HUD */}
        {phase === 'playing' && (
          <>
            <div style={S.hudScore}>{score}층</div>
            <div style={S.leftHint}>◀</div>
            <div style={S.rightHint}>▶</div>
          </>
        )}

        {/* 시작 오버레이 */}
        {phase === 'idle' && (
          <div style={S.overlay}>
            <div style={S.box}>
              <div style={S.oTitle}>🐸 플랫폼 점프!</div>
              <div style={S.desc}>
                <p>발판을 밟고 높이높이 올라가요!</p>
                <p>🟢 고정 발판 &nbsp;·&nbsp; 🔴 움직이는 발판</p>
              </div>
              {charPicker('캐릭터 선택')}
              {diffPicker}
              <div style={S.bestLine}>🏆 최고 {best}층</div>
              <div style={S.btnGroup}>
                <button style={S.btnPrimary} onClick={startGame}>시작하기</button>
                <button style={S.btnBack2} onClick={onBack}>← 게임 선택</button>
              </div>
            </div>
          </div>
        )}

        {/* 게임오버 오버레이 */}
        {phase === 'gameover' && (
          <div style={S.overlay}>
            <div style={S.box}>
              <div style={S.oEmoji}>{isNewBest ? '🏆' : '😵'}</div>
              <div style={S.oTitle}>{isNewBest ? '신기록!' : '게임 오버!'}</div>
              <div style={S.bigScore}>{score}층</div>
              <div style={S.bestScore}>최고 {best}층</div>
              {isNewBest && <div style={S.newBest}>🎉 최고 기록!</div>}
              {charPicker('캐릭터 바꾸기')}
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

function draw(ctx, s, character) {
  const height = -s.worldTop

  // 1. 배경 그라디언트
  const grad = ctx.createLinearGradient(0, 0, 0, H)
  if (height < 1000) {
    grad.addColorStop(0, '#87CEEB')
    grad.addColorStop(1, '#B0E2FF')
  } else if (height < 3000) {
    grad.addColorStop(0, '#FF8C69')
    grad.addColorStop(1, '#FFB347')
  } else {
    grad.addColorStop(0, '#0a0a2e')
    grad.addColorStop(1, '#1a1a4e')
  }
  ctx.fillStyle = grad
  ctx.fillRect(0, 0, W, H)

  // 2. 별 (밤)
  if (height >= 3000) {
    const seed = Math.floor(s.worldTop / 100)
    ctx.fillStyle = 'rgba(255,255,255,0.8)'
    for (let i = 0; i < 30; i++) {
      const sx = (((seed * 1013 + i * 317) % 470) + 470) % 470 + 5
      const sy = (((seed * 571  + i * 137) % 680) + 680) % 680 + 5
      const sr = (((i * 73 + seed) % 3) + 3) % 3 * 0.5 + 0.5
      ctx.beginPath()
      ctx.arc(sx, sy, sr, 0, Math.PI * 2)
      ctx.fill()
    }
  }

  // 3. 발판
  for (const p of s.platforms) {
    const sy = p.y - s.worldTop
    if (sy < -20 || sy > H + 20) continue
    const color = p.vx !== 0 ? '#e74c3c' : '#2ecc71'
    fillRoundRect(ctx, p.x, sy, p.w, PLAT_H, 4, color)
    ctx.fillStyle = 'rgba(255,255,255,0.25)'
    ctx.fillRect(p.x + 4, sy + 2, p.w - 8, 3)
  }

  // 4. 플레이어
  drawEmoji(ctx, character, s.player.x, s.player.y - s.worldTop, PLAYER_SIZE)
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
  leftHint: {
    position: 'absolute',
    left: 0, top: '50%', transform: 'translateY(-50%)',
    fontSize: 28, color: 'rgba(255,255,255,0.25)',
    pointerEvents: 'none', padding: '0 10px',
  },
  rightHint: {
    position: 'absolute',
    right: 0, top: '50%', transform: 'translateY(-50%)',
    fontSize: 28, color: 'rgba(255,255,255,0.25)',
    pointerEvents: 'none', padding: '0 10px',
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
  charGrid:  { display: 'flex', flexWrap: 'wrap', gap: 6, justifyContent: 'center' },
  charBtn:   { width: 44, height: 44, borderRadius: 10, border: 'none', fontSize: 24, cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center' },
  bestLine:  { color: '#aaa', fontSize: 'clamp(12px, 2.5vw, 14px)' },
  bigScore:  { color: '#fff', fontSize: 'clamp(28px, 6vw, 40px)', fontWeight: 'bold' },
  bestScore: { color: 'rgba(255,255,255,0.45)', fontSize: 'clamp(12px, 2.5vw, 15px)' },
  newBest:   { color: '#FFD700', fontSize: 'clamp(14px, 3vw, 18px)', fontWeight: 'bold' },
  btnGroup:  { display: 'flex', flexDirection: 'column', gap: 8, width: '100%' },
  btnPrimary: { background: 'linear-gradient(135deg, #FFD700, #FFA500)', color: '#1a1a2e', border: 'none', borderRadius: 14, padding: 'clamp(10px, 2vw, 14px) clamp(20px, 4vw, 36px)', fontSize: 'clamp(15px, 3vw, 18px)', fontWeight: 'bold', cursor: 'pointer', boxShadow: '0 4px 20px rgba(255,165,0,0.4)' },
  btnBack2:   { background: 'transparent', color: '#aaa', border: '2px solid #444', borderRadius: 14, padding: 'clamp(8px, 1.5vw, 10px) clamp(16px, 3vw, 24px)', fontSize: 'clamp(13px, 2.5vw, 15px)', fontWeight: 'bold', cursor: 'pointer' },
}
