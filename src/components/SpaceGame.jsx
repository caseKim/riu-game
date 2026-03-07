import { useEffect, useRef, useState, useCallback } from 'react'

// ── 상수 ────────────────────────────────────────────────────────────
const W = 900
const H = 540
const PLAYER_Y = H - 72
const PS = 22           // 플레이어 충돌 반경
const BULLET_SPD = 12
const ALIEN_BULLET_SPD = 4.5
const FIRE_INTERVAL = 18
const ALIEN_COLS = 8
const ALIEN_ROWS = 3
const ALIEN_GAP_X = 88
const ALIEN_GAP_Y = 62
const ALIEN_W = 40      // 충돌 박스 너비
const ALIEN_H = 32      // 충돌 박스 높이
const ALIEN_START_X = 142  // 포메이션 좌우 대칭 시작 X
const ALIEN_START_Y = 55
const ALIEN_STEP_DOWN = 24

const ALIEN_CFG = [
  { emoji: '👾', hp: 2, pts: 30, color: '#ff88ff' },
  { emoji: '👽', hp: 1, pts: 20, color: '#88ff88' },
  { emoji: '🐛', hp: 1, pts: 10, color: '#ffcc44' },
]

const DIFFICULTIES = [
  { id: 'easy',   label: '쉬움',   emoji: '🟢', color: '#4CAF50', alienSpd: 0.7,  fireMin: 100, bossHp: 12 },
  { id: 'normal', label: '보통',   emoji: '🟡', color: '#FFD700', alienSpd: 1.2,  fireMin: 65,  bossHp: 20 },
  { id: 'hard',   label: '어려움', emoji: '🔴', color: '#F44336', alienSpd: 1.8,  fireMin: 38,  bossHp: 30 },
]

// ── 헬퍼 함수 ───────────────────────────────────────────────────────
function makeAliens() {
  const aliens = []
  for (let row = 0; row < ALIEN_ROWS; row++) {
    for (let col = 0; col < ALIEN_COLS; col++) {
      aliens.push({
        x: ALIEN_START_X + col * ALIEN_GAP_X,
        y: ALIEN_START_Y + row * ALIEN_GAP_Y,
        row, col,
        hp: ALIEN_CFG[row].hp,
        frame: Math.floor(Math.random() * 40),
      })
    }
  }
  return aliens
}

function makeBoss(wave, diff) {
  const hp = Math.round(diff.bossHp * (1 + (wave - 1) * 0.6))
  return {
    x: W / 2, y: 90,
    vx: 1.4 + wave * 0.25,
    hp, maxHp: hp,
    frame: 0, shootTimer: 0,
    nextShoot: Math.max(28, 55 - wave * 4),
  }
}

function makeInitialState(diff) {
  return {
    player: { x: W / 2, invincible: 0 },
    bullets: [],
    alienBullets: [],
    aliens: makeAliens(),
    boss: null,
    explosions: [],
    stars: Array.from({ length: 80 }, () => ({
      x: Math.random() * W,
      y: Math.random() * H,
      r: 0.5 + Math.random() * 1.5,
      spd: 0.3 + Math.random() * 0.5,
    })),
    score: 0,
    frame: 0,
    bulletTimer: 0,
    alienDx: diff.alienSpd,
    alienShootTimer: 0,
    nextAlienShoot: diff.fireMin + Math.floor(Math.random() * 40),
    lives: 3,
    wave: 1,
    wavePhase: 'wave',  // 'wave' | 'boss'
    ended: false,
  }
}

// ── 컴포넌트 ─────────────────────────────────────────────────────────
export default function SpaceGame({ onBack }) {
  const canvasRef   = useRef(null)
  const wrapRef     = useRef(null)
  const stateRef    = useRef(null)
  const animRef     = useRef(null)
  const keysRef     = useRef({ left: false, right: false })
  const pointerXRef = useRef(null)

  const [difficulty, setDifficulty] = useState(() => {
    const saved = localStorage.getItem('space_diff')
    return DIFFICULTIES.find(d => d.id === saved) ?? DIFFICULTIES[1]
  })
  const [phase, setPhase]   = useState('idle')
  const [score, setScore]   = useState(0)
  const [lives, setLives]   = useState(3)
  const [wave, setWave]     = useState(1)
  const [best, setBest]     = useState(() => {
    const id = localStorage.getItem('space_diff') || 'normal'
    return Number(localStorage.getItem(`space_best_${id}`) || 0)
  })

  function pickDifficulty(d) {
    setDifficulty(d)
    localStorage.setItem('space_diff', d.id)
    setBest(Number(localStorage.getItem(`space_best_${d.id}`) || 0))
  }

  const startGame = useCallback(() => {
    stateRef.current = makeInitialState(difficulty)
    setScore(0); setLives(3); setWave(1)
    setPhase('playing')
  }, [difficulty])

  // ── 키보드 ──────────────────────────────────────────────────────
  useEffect(() => {
    const dn = (e) => {
      if (e.key === 'ArrowLeft'  || e.key === 'a' || e.key === 'A') keysRef.current.left  = true
      if (e.key === 'ArrowRight' || e.key === 'd' || e.key === 'D') keysRef.current.right = true
    }
    const up = (e) => {
      if (e.key === 'ArrowLeft'  || e.key === 'a' || e.key === 'A') keysRef.current.left  = false
      if (e.key === 'ArrowRight' || e.key === 'd' || e.key === 'D') keysRef.current.right = false
    }
    window.addEventListener('keydown', dn)
    window.addEventListener('keyup', up)
    return () => { window.removeEventListener('keydown', dn); window.removeEventListener('keyup', up) }
  }, [])

  // ── 터치 / 마우스 ────────────────────────────────────────────────
  useEffect(() => {
    if (phase !== 'playing') return
    const wrap = wrapRef.current
    if (!wrap) return
    const toX = (clientX) => {
      const rect = wrap.getBoundingClientRect()
      return (clientX - rect.left) * (W / rect.width)
    }
    const onTouchStart = (e) => { if (e.target.closest('button')) return; e.preventDefault(); pointerXRef.current = toX(e.touches[0].clientX) }
    const onTouchMove  = (e) => { e.preventDefault(); pointerXRef.current = toX(e.touches[0].clientX) }
    const onTouchEnd   = () => { pointerXRef.current = null }
    const onMouseMove  = (e) => { pointerXRef.current = toX(e.clientX) }
    wrap.addEventListener('touchstart', onTouchStart, { passive: false })
    wrap.addEventListener('touchmove',  onTouchMove,  { passive: false })
    wrap.addEventListener('touchend',   onTouchEnd)
    wrap.addEventListener('mousemove',  onMouseMove)
    return () => {
      wrap.removeEventListener('touchstart', onTouchStart)
      wrap.removeEventListener('touchmove',  onTouchMove)
      wrap.removeEventListener('touchend',   onTouchEnd)
      wrap.removeEventListener('mousemove',  onMouseMove)
    }
  }, [phase])

  // ── 게임 루프 ────────────────────────────────────────────────────
  useEffect(() => {
    if (phase !== 'playing') return
    const canvas = canvasRef.current
    const ctx = canvas.getContext('2d')
    const diff = difficulty

    const endGame = (finalScore) => {
      if (stateRef.current.ended) return
      stateRef.current.ended = true
      const key = `space_best_${diff.id}`
      const prev = Number(localStorage.getItem(key) || 0)
      if (finalScore > prev) localStorage.setItem(key, finalScore)
      setBest(b => Math.max(b, finalScore))
      setScore(finalScore)
      setPhase('gameover')
    }

    const loop = () => {
      const s = stateRef.current
      if (s.ended) return
      s.frame++

      // 별 이동
      for (const star of s.stars) {
        star.y += star.spd
        if (star.y > H) { star.y = 0; star.x = Math.random() * W }
      }

      // 플레이어 이동
      if (keysRef.current.left)  s.player.x -= 5.5
      if (keysRef.current.right) s.player.x += 5.5
      if (pointerXRef.current !== null) s.player.x += (pointerXRef.current - s.player.x) * 0.18
      s.player.x = Math.max(PS + 6, Math.min(W - PS - 6, s.player.x))
      if (s.player.invincible > 0) s.player.invincible--

      // 자동 발사
      s.bulletTimer++
      if (s.bulletTimer >= FIRE_INTERVAL) {
        s.bullets.push({ x: s.player.x, y: PLAYER_Y - 30 })
        s.bulletTimer = 0
      }

      // 플레이어 총알 이동
      s.bullets = s.bullets.filter(b => { b.y -= BULLET_SPD; return b.y > -10 })

      // ── 웨이브 페이즈 ─────────────────────────────────────────────
      if (s.wavePhase === 'wave') {
        // 외계인 이동
        if (s.aliens.length > 0) {
          const speedMul = 1 + (ALIEN_COLS * ALIEN_ROWS - s.aliens.length) * 0.04
          const spd = s.alienDx * speedMul
          let minX = Infinity, maxX = -Infinity
          for (const a of s.aliens) { if (a.x < minX) minX = a.x; if (a.x > maxX) maxX = a.x }
          const hitWall = (spd > 0 && maxX + ALIEN_W / 2 + spd > W - 8) ||
                          (spd < 0 && minX - ALIEN_W / 2 + spd < 8)
          if (hitWall) {
            s.alienDx *= -1
            for (const a of s.aliens) a.y += ALIEN_STEP_DOWN
          } else {
            for (const a of s.aliens) { a.x += spd; a.frame++ }
          }
        }

        // 외계인 사격
        s.alienShootTimer++
        if (s.alienShootTimer >= s.nextAlienShoot && s.aliens.length > 0) {
          const shooter = s.aliens[Math.floor(Math.random() * s.aliens.length)]
          s.alienBullets.push({ x: shooter.x, y: shooter.y + ALIEN_H / 2, vx: 0, vy: ALIEN_BULLET_SPD })
          s.alienShootTimer = 0
          s.nextAlienShoot = diff.fireMin + Math.floor(Math.random() * 50)
        }

        // 총알 vs 외계인
        for (let bi = s.bullets.length - 1; bi >= 0; bi--) {
          const b = s.bullets[bi]
          let hit = false
          for (let ai = s.aliens.length - 1; ai >= 0; ai--) {
            const a = s.aliens[ai]
            if (Math.abs(b.x - a.x) < ALIEN_W / 2 + 4 && Math.abs(b.y - a.y) < ALIEN_H / 2 + 4) {
              a.hp--; hit = true
              if (a.hp <= 0) {
                s.score += ALIEN_CFG[a.row].pts
                s.explosions.push({ x: a.x, y: a.y, frame: 0, max: 18, r: 22, color: ALIEN_CFG[a.row].color })
                s.aliens.splice(ai, 1)
              }
              break
            }
          }
          if (hit) s.bullets.splice(bi, 1)
        }

        // 전멸 → 보스 등장
        if (s.aliens.length === 0) {
          s.boss = makeBoss(s.wave, diff)
          s.wavePhase = 'boss'
        }

        // 외계인이 플레이어 높이까지 내려오면 게임 오버
        for (const a of s.aliens) {
          if (a.y + ALIEN_H / 2 > PLAYER_Y - 10) { endGame(s.score); return }
        }

      // ── 보스 페이즈 ───────────────────────────────────────────────
      } else if (s.boss) {
        const boss = s.boss
        boss.x += boss.vx
        boss.frame++
        if (boss.x > W - 80 || boss.x < 80) boss.vx *= -1

        // 보스 사격 (3방향 부채꼴)
        boss.shootTimer++
        if (boss.shootTimer >= boss.nextShoot) {
          const bx = boss.x, by = boss.y + 52
          s.alienBullets.push({ x: bx, y: by, vx: 0,    vy: ALIEN_BULLET_SPD + 1.5 })
          s.alienBullets.push({ x: bx, y: by, vx: -2.8, vy: ALIEN_BULLET_SPD })
          s.alienBullets.push({ x: bx, y: by, vx:  2.8, vy: ALIEN_BULLET_SPD })
          boss.shootTimer = 0
        }

        // 총알 vs 보스
        for (let bi = s.bullets.length - 1; bi >= 0; bi--) {
          const b = s.bullets[bi]
          if (Math.abs(b.x - boss.x) < 72 && Math.abs(b.y - boss.y) < 46) {
            boss.hp--
            s.bullets.splice(bi, 1)
            if (boss.hp <= 0) {
              s.score += 100 * s.wave
              s.explosions.push({ x: boss.x, y: boss.y, frame: 0, max: 45, r: 72, color: '#bb44ff' })
              s.boss = null
              s.wave++
              s.aliens = makeAliens()
              s.alienDx = diff.alienSpd * (1 + (s.wave - 1) * 0.18)
              s.nextAlienShoot = diff.fireMin + Math.floor(Math.random() * 40)
              s.alienShootTimer = 0
              s.wavePhase = 'wave'
            }
          }
        }
      }

      // 외계인 총알 이동 + 플레이어 충돌
      s.alienBullets = s.alienBullets.filter(b => {
        b.x += b.vx; b.y += b.vy
        if (s.player.invincible === 0 &&
            Math.abs(b.x - s.player.x) < PS + 6 &&
            Math.abs(b.y - PLAYER_Y) < PS + 10) {
          s.player.invincible = 110
          s.lives--
          s.explosions.push({ x: s.player.x, y: PLAYER_Y, frame: 0, max: 16, r: 18, color: '#44ccff' })
          if (s.lives <= 0) { endGame(s.score); return false }
          return false
        }
        return b.y < H + 10 && b.x > -20 && b.x < W + 20
      })

      // 폭발 업데이트
      s.explosions = s.explosions.filter(e => { e.frame++; return e.frame < e.max })

      // UI 업데이트
      if (s.frame % 6 === 0) {
        setScore(s.score)
        setLives(s.lives)
        setWave(s.wave)
      }

      drawScene(ctx, s)
      animRef.current = requestAnimationFrame(loop)
    }

    animRef.current = requestAnimationFrame(loop)
    return () => { if (animRef.current) cancelAnimationFrame(animRef.current) }
  }, [phase, difficulty])

  // ── 렌더 ──────────────────────────────────────────────────────────
  return (
    <div style={s.wrapper}>
      <div style={s.topBar}>
        <button style={s.backBtn} onClick={onBack}>← 나가기</button>
      </div>
      <h1 style={s.title}>🚀 우주 슈팅!</h1>
      <p style={s.subtitle}>
        {difficulty.emoji} {difficulty.label} &nbsp;·&nbsp; 웨이브 {wave}
      </p>

      <div ref={wrapRef} style={s.gameArea}>
        <canvas ref={canvasRef} width={W} height={H} style={s.canvas} />

        {/* 캔버스 아래 점수 바 */}
        <div style={s.scoreCard}>
          <div style={s.scoreRow}>
            <div style={s.scoreItem}>
              <span style={s.scoreLabel}>목숨</span>
              <span style={s.score}>{'🚀'.repeat(Math.max(0, lives))}</span>
            </div>
            <div style={s.scoreDivider} />
            <div style={s.scoreItem}>
              <span style={s.scoreLabel}>점수</span>
              <span style={s.score}>{score}</span>
            </div>
            <div style={s.scoreDivider} />
            <div style={s.scoreItem}>
              <span style={s.scoreLabel}>🏆 최고</span>
              <span style={s.scoreBest}>{best}</span>
            </div>
          </div>
        </div>

        {/* 시작 오버레이 */}
        {phase === 'idle' && (
          <div style={s.overlay}>
            <div style={s.box}>
              <div style={s.oTitle}>🚀 우주 슈팅!</div>
              <div style={s.desc}>
                <p>외계인 함대를 물리쳐요!</p>
                <p>보스를 쓰러뜨리면 다음 웨이브!</p>
              </div>
              <div>
                <div style={s.label}>난이도</div>
                <div style={s.diffRow}>
                  {DIFFICULTIES.map(d => (
                    <button key={d.id} onClick={() => pickDifficulty(d)} style={{
                      ...s.diffBtn,
                      borderColor: difficulty.id === d.id ? d.color : '#444',
                      color: difficulty.id === d.id ? d.color : '#888',
                      background: difficulty.id === d.id ? `${d.color}22` : 'transparent',
                    }}>
                      {d.emoji} {d.label}
                    </button>
                  ))}
                </div>
              </div>
              <div style={s.bestLine}>🏆 최고 {best}점</div>
              <div style={s.btnGroup}>
                <button style={s.btnPrimary} onClick={startGame}>시작하기</button>
                <button style={s.btnBack2} onClick={onBack}>← 게임 선택</button>
              </div>
            </div>
          </div>
        )}

        {/* 게임오버 오버레이 */}
        {phase === 'gameover' && (
          <div style={s.overlay}>
            <div style={s.box}>
              <div style={s.oEmoji}>{score >= best ? '🏆' : '😵'}</div>
              <div style={s.oTitle}>{score >= best ? '신기록!' : '게임 오버!'}</div>
              <div style={s.bigScore}>{score}점</div>
              <div style={s.bestScore}>최고 {best}점</div>
              {score >= best && <div style={s.newBest}>🎉 최고 기록!</div>}
              <div style={s.btnGroup}>
                <button style={s.btnPrimary} onClick={startGame}>다시 하기</button>
                <button style={s.btnBack2} onClick={onBack}>← 게임 선택</button>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}

// ── 드로잉 ───────────────────────────────────────────────────────────
function drawScene(ctx, s) {
  // 배경
  ctx.fillStyle = '#040810'
  ctx.fillRect(0, 0, W, H)

  // 별
  for (const star of s.stars) {
    ctx.globalAlpha = 0.4 + Math.sin(s.frame * 0.025 + star.x) * 0.25
    ctx.fillStyle = '#ffffff'
    ctx.beginPath()
    ctx.arc(star.x, star.y, star.r, 0, Math.PI * 2)
    ctx.fill()
  }
  ctx.globalAlpha = 1

  // 외계인
  for (const a of s.aliens) {
    const bob = Math.sin(a.frame * 0.08) * 3
    ctx.save()
    if (ALIEN_CFG[a.row].hp > 1 && a.hp < ALIEN_CFG[a.row].hp) ctx.globalAlpha = 0.55
    ctx.font = '34px serif'
    ctx.fillText(ALIEN_CFG[a.row].emoji, a.x - 17, a.y + bob + 18)
    ctx.restore()
  }

  // 보스
  if (s.boss) drawBoss(ctx, s.boss)

  // 플레이어 총알
  ctx.shadowColor = '#00ffff'; ctx.shadowBlur = 10
  ctx.fillStyle = '#88ffff'
  for (const b of s.bullets) {
    ctx.fillRect(b.x - 3, b.y, 6, 18)
  }
  ctx.shadowBlur = 0

  // 외계인 총알
  ctx.shadowColor = '#ff3333'; ctx.shadowBlur = 8
  ctx.fillStyle = '#ff6666'
  for (const b of s.alienBullets) {
    ctx.beginPath()
    ctx.arc(b.x, b.y, 5, 0, Math.PI * 2)
    ctx.fill()
  }
  ctx.shadowBlur = 0

  // 폭발
  for (const e of s.explosions) {
    const t = e.frame / e.max
    ctx.globalAlpha = 1 - t
    ctx.shadowColor = e.color; ctx.shadowBlur = 14
    ctx.strokeStyle = e.color
    ctx.lineWidth = 4 * (1 - t * 0.5)
    ctx.beginPath()
    ctx.arc(e.x, e.y, e.r * t, 0, Math.PI * 2)
    ctx.stroke()
    ctx.fillStyle = e.color
    ctx.globalAlpha = (1 - t) * 0.35
    ctx.beginPath()
    ctx.arc(e.x, e.y, e.r * t * 0.55, 0, Math.PI * 2)
    ctx.fill()
    ctx.globalAlpha = 1; ctx.shadowBlur = 0
  }

  // 플레이어
  drawPlayer(ctx, s.player.x, s.player.invincible, s.frame)
}

function drawPlayer(ctx, x, invincible, frame) {
  const blink = invincible > 0 && Math.floor(invincible / 6) % 2 === 1
  if (blink) return
  const y = PLAYER_Y
  ctx.save()
  ctx.translate(x, y)
  ctx.shadowColor = '#0088ff'; ctx.shadowBlur = 18

  // 날개
  ctx.fillStyle = '#4488cc'
  ctx.beginPath()
  ctx.moveTo(-10, 4); ctx.lineTo(-26, 20); ctx.lineTo(-14, 12)
  ctx.closePath(); ctx.fill()
  ctx.beginPath()
  ctx.moveTo(10, 4); ctx.lineTo(26, 20); ctx.lineTo(14, 12)
  ctx.closePath(); ctx.fill()

  // 동체
  ctx.fillStyle = '#aaddff'
  ctx.beginPath()
  ctx.moveTo(0, -28); ctx.lineTo(14, 12); ctx.lineTo(0, 8); ctx.lineTo(-14, 12)
  ctx.closePath(); ctx.fill()

  // 콕핏
  ctx.fillStyle = '#00ffff'
  ctx.shadowColor = '#00ffff'; ctx.shadowBlur = 8
  ctx.beginPath()
  ctx.ellipse(0, -8, 7, 11, 0, 0, Math.PI * 2)
  ctx.fill()

  // 엔진 불꽃
  const fl = Math.sin(frame * 0.4) * 5
  ctx.fillStyle = '#ff8800'
  ctx.shadowColor = '#ff8800'; ctx.shadowBlur = 12
  ctx.beginPath()
  ctx.moveTo(-8, 14); ctx.lineTo(0, 24 + fl); ctx.lineTo(8, 14)
  ctx.closePath(); ctx.fill()
  ctx.fillStyle = '#ffdd00'
  ctx.beginPath()
  ctx.moveTo(-4, 14); ctx.lineTo(0, 19 + fl * 0.5); ctx.lineTo(4, 14)
  ctx.closePath(); ctx.fill()

  ctx.restore()
}

function drawBoss(ctx, boss) {
  const { x, y, frame, hp, maxHp } = boss
  const pulse = Math.sin(frame * 0.12) * 4
  const hpRatio = hp / maxHp

  ctx.save()
  ctx.translate(x, y)
  ctx.shadowColor = '#bb44ff'; ctx.shadowBlur = 24

  // 본체 (접시 형태)
  const g = ctx.createRadialGradient(0, 5, 5, 0, 5, 74)
  g.addColorStop(0, `hsl(${280 - hpRatio * 60}, 80%, 65%)`)
  g.addColorStop(1, '#330055')
  ctx.fillStyle = g
  ctx.beginPath()
  ctx.ellipse(0, 10, 72 + pulse, 26, 0, 0, Math.PI * 2)
  ctx.fill()

  // 돔
  ctx.fillStyle = '#dd99ff'
  ctx.shadowColor = '#dd99ff'; ctx.shadowBlur = 10
  ctx.beginPath()
  ctx.ellipse(0, -8, 38, 32, 0, Math.PI, Math.PI * 2)
  ctx.fill()

  // 눈
  ctx.fillStyle = '#ff0033'
  ctx.shadowColor = '#ff0033'; ctx.shadowBlur = 14
  ctx.beginPath(); ctx.arc(-20, -12, 8, 0, Math.PI * 2); ctx.fill()
  ctx.beginPath(); ctx.arc( 20, -12, 8, 0, Math.PI * 2); ctx.fill()

  // 포신
  ctx.fillStyle = '#555'; ctx.shadowBlur = 0
  ctx.fillRect(-5, 26, 10, 22)
  ctx.fillRect(-26, 18, 8, 16)
  ctx.fillRect(18, 18, 8, 16)

  ctx.restore()

  // HP 바
  const bw = 160, bh = 10
  const bx = x - bw / 2, by = y - 62
  ctx.fillStyle = '#222'; ctx.fillRect(bx, by, bw, bh)
  ctx.fillStyle = `hsl(${hpRatio * 120}, 80%, 50%)`
  ctx.fillRect(bx, by, bw * hpRatio, bh)
  ctx.strokeStyle = '#555'; ctx.lineWidth = 1; ctx.strokeRect(bx, by, bw, bh)
  ctx.fillStyle = '#aaa'
  ctx.font = 'bold 10px sans-serif'
  ctx.textAlign = 'center'
  ctx.fillText('BOSS', x, by - 3)
  ctx.textAlign = 'left'
}

// ── 스타일 ───────────────────────────────────────────────────────────
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
  },
  canvas: {
    display: 'block',
    width: '100%',
    height: 'auto',
    background: '#040810',
    border: '4px solid #FFD700',
    borderRadius: 12,
    boxShadow: '0 8px 40px rgba(0,0,0,0.6)',
    touchAction: 'none',
  },
  scoreCard: {
    background: '#1e1e2e',
    border: '1px solid #333',
    borderTop: 'none',
    borderRadius: '0 0 12px 12px',
    padding: '10px 16px',
  },
  scoreRow: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 0,
  },
  scoreItem: {
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    flex: 1,
    gap: 2,
  },
  scoreLabel: { color: '#666', fontSize: 'clamp(10px, 2vw, 12px)' },
  score:      { color: '#FFD700', fontWeight: 'bold', fontSize: 'clamp(14px, 3vw, 18px)' },
  scoreBest:  { color: '#aaa', fontWeight: 'bold', fontSize: 'clamp(14px, 3vw, 18px)' },
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
  },
  box: {
    background: '#1e1e2e',
    border: '2px solid #333',
    borderRadius: 18,
    padding: 'clamp(24px, 5vw, 40px) clamp(28px, 6vw, 48px)',
    textAlign: 'center',
    display: 'flex',
    flexDirection: 'column',
    gap: 14,
    maxWidth: 340,
    width: '90%',
  },
  oEmoji: { fontSize: 'clamp(36px, 8vw, 56px)' },
  oTitle: {
    color: '#FFD700',
    fontSize: 'clamp(22px, 5vw, 34px)',
    fontWeight: 'bold',
    textShadow: '0 2px 18px rgba(255,215,0,0.4)',
  },
  desc: { color: '#ccc', fontSize: 'clamp(13px, 2.5vw, 15px)', lineHeight: 1.7 },
  label: { color: '#aaa', fontSize: 'clamp(11px, 2vw, 13px)', marginBottom: 8 },
  diffRow: { display: 'flex', gap: 8, justifyContent: 'center' },
  diffBtn: {
    flex: 1, padding: '8px 4px', borderRadius: 10,
    border: '2px solid #444', background: 'transparent',
    fontSize: 'clamp(12px, 2.5vw, 14px)', fontWeight: 'bold',
    cursor: 'pointer', transition: 'all 0.15s',
  },
  bestLine:  { color: '#aaa', fontSize: 'clamp(12px, 2.5vw, 14px)' },
  bigScore:  { color: '#fff', fontSize: 'clamp(28px, 6vw, 40px)', fontWeight: 'bold' },
  bestScore: { color: 'rgba(255,255,255,0.45)', fontSize: 'clamp(12px, 2.5vw, 15px)' },
  newBest:   { color: '#FFD700', fontSize: 'clamp(14px, 3vw, 18px)', fontWeight: 'bold' },
  btnGroup:  { display: 'flex', flexDirection: 'column', gap: 8, width: '100%' },
  btnPrimary: {
    background: 'linear-gradient(135deg, #FFD700, #FFA500)',
    color: '#1a1a2e', border: 'none', borderRadius: 14,
    padding: 'clamp(10px, 2vw, 14px) clamp(20px, 4vw, 36px)',
    fontSize: 'clamp(15px, 3vw, 18px)', fontWeight: 'bold',
    cursor: 'pointer', boxShadow: '0 4px 20px rgba(255,165,0,0.4)',
  },
  btnBack2: {
    background: 'transparent', color: '#aaa',
    border: '2px solid #444', borderRadius: 14,
    padding: 'clamp(8px, 1.5vw, 10px) clamp(16px, 3vw, 24px)',
    fontSize: 'clamp(13px, 2.5vw, 15px)', fontWeight: 'bold',
    cursor: 'pointer',
  },
}
