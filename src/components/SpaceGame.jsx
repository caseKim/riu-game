import { useEffect, useRef, useState, useCallback } from 'react'

// ── 상수 ────────────────────────────────────────────────────────────
const W = 900
const H = 620
const PLAYER_Y = H - 72
const PS = 22           // 플레이어 충돌 반경
const BULLET_SPD = 13
const ALIEN_BULLET_SPD = 4.5
const FIRE_INTERVAL = 18
const ALIEN_GAP_X = 82
const ALIEN_GAP_Y = 60
const ALIEN_W = 40
const ALIEN_H = 32
const ALIEN_START_Y = 52
const ALIEN_STEP_DOWN = 24
const ITEM_SPEED = 1.8
const ITEM_RADIUS = 22
const ITEM_DROP_CHANCE = 0.18
const UFO_Y = 28
const UFO_SPD = 2.8

const ALIEN_CFG = [
  { emoji: '👾', hp: 2, pts: 30, color: '#ff88ff' },
  { emoji: '👽', hp: 1, pts: 20, color: '#88ff88' },
  { emoji: '🐛', hp: 1, pts: 10, color: '#ffcc44' },
  { emoji: '🤖', hp: 2, pts: 25, color: '#88ccff' },
]

const ITEM_TYPES = [
  { id: 'power',  emoji: '⚡', label: '강력탄', color: '#ffdd00', duration: 480 },
  { id: 'spread', emoji: '🔱', label: '확산탄', color: '#00ffcc', duration: 600 },
  { id: 'rapid',  emoji: '🔥', label: '속사',   color: '#ff6622', duration: 480 },
  { id: 'shield', emoji: '🛡️', label: '방어막', color: '#4488ff', duration: 360 },
  { id: 'life',   emoji: '❤️', label: '+목숨',  color: '#ff4488', duration: 0 },
  { id: 'bomb',   emoji: '💣', label: '폭탄',   color: '#ff8800', duration: 0 },
]

const WAVE_SUBTITLES = ['', '다이버 등장!', '포메이션 강화!', '5방향 보스!', '조준 사격!', '사인파 돌격!', '최후의 결전!']

const DIFFICULTIES = [
  { id: 'easy',   label: '쉬움',   emoji: '🟢', color: '#4CAF50', alienSpd: 0.7,  fireMin: 100, bossHp: 12 },
  { id: 'normal', label: '보통',   emoji: '🟡', color: '#FFD700', alienSpd: 1.2,  fireMin: 65,  bossHp: 20 },
  { id: 'hard',   label: '어려움', emoji: '🔴', color: '#F44336', alienSpd: 1.8,  fireMin: 38,  bossHp: 30 },
]

// ── 헬퍼 함수 ───────────────────────────────────────────────────────
function getWaveCfg(wave) {
  return {
    cols: Math.min(8 + Math.floor((wave - 1) / 2), 11),
    rows: Math.min(3 + Math.floor((wave - 1) / 2), 5),
    hasDivers:   wave >= 2,
    hasUfo:      wave >= 2,
    hasAimed:    wave >= 4,   // 조준 사격 (플레이어 방향으로 쏨)
    hasSineMove: wave >= 5,   // 사인파 상하 진동
  }
}

function makeAliens(wave = 1) {
  const { cols, rows } = getWaveCfg(wave)
  const startX = W / 2 - (cols - 1) * ALIEN_GAP_X / 2
  const aliens = []
  for (let row = 0; row < rows; row++) {
    const cfgIdx = Math.min(row, ALIEN_CFG.length - 1)
    for (let col = 0; col < cols; col++) {
      aliens.push({
        x: startX + col * ALIEN_GAP_X,
        y: ALIEN_START_Y + row * ALIEN_GAP_Y,
        cfgIdx, col,
        hp: ALIEN_CFG[cfgIdx].hp,
        frame: Math.floor(Math.random() * 40),
        isDiver: false, dvx: 0, dvy: 0,
      })
    }
  }
  return aliens
}

// 보스 이동 패턴: wave별로 다른 움직임
const BOSS_PATTERNS = ['linear', 'linear', 'zigzag', 'pendulum', 'erratic']

function makeBoss(wave, diff) {
  const hp = Math.round(diff.bossHp * (1 + (wave - 1) * 0.6))
  const pattern = BOSS_PATTERNS[Math.min(wave - 1, BOSS_PATTERNS.length - 1)]
  return {
    x: W / 2, y: 90, baseY: 90,
    vx: 1.2 + wave * 0.2,
    hp, maxHp: hp,
    frame: 0, shootTimer: 0,
    nextShoot: Math.max(28, 58 - wave * 4),
    pattern,
  }
}

function spawnItem(s, x, y, count = 1) {
  for (let i = 0; i < count; i++) {
    const type = ITEM_TYPES[Math.floor(Math.random() * ITEM_TYPES.length)]
    s.items.push({ type, x: x + (i - (count - 1) / 2) * 32, y, frame: 0 })
  }
}

function applyItem(s, item) {
  const { type } = item
  if (type.duration > 0) {
    s.powerups[type.id] = type.duration
  } else if (type.id === 'life') {
    s.lives = Math.min(s.lives + 1, 7)
  } else if (type.id === 'bomb') {
    for (const a of s.aliens) {
      s.score += ALIEN_CFG[a.cfgIdx].pts
      s.explosions.push({ x: a.x, y: a.y, frame: 0, max: 22, r: 24, color: ALIEN_CFG[a.cfgIdx].color })
    }
    s.aliens = []
    s.alienBullets = []
    s.explosions.push({ x: W / 2, y: H / 2, frame: 0, max: 44, r: 300, color: '#ff8800' })
    if (s.boss) {
      s.boss.hp = Math.ceil(s.boss.hp / 2)
      s.explosions.push({ x: s.boss.x, y: s.boss.y, frame: 0, max: 30, r: 70, color: '#ff8800' })
    }
  }
  s.popups.push({ text: type.label, x: s.player.x, y: PLAYER_Y - 44, frame: 0, color: type.color })
}

function makeInitialState(diff) {
  return {
    player: { x: W / 2, invincible: 0 },
    powerups: {},
    bullets: [],
    alienBullets: [],
    aliens: makeAliens(1),
    items: [],
    popups: [],
    ufo: null,
    ufoTimer: 0,
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
    alienTotal: getWaveCfg(1).cols * getWaveCfg(1).rows,
    alienShootTimer: 0,
    nextAlienShoot: diff.fireMin + Math.floor(Math.random() * 40),
    alienDiveTimer: 0,
    nextDiveInterval: 180,
    lives: 3,
    wave: 1,
    wavePhase: 'wave',
    waveAnnounce: 90,
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
  const [phase, setPhase] = useState('idle')
  const [score, setScore] = useState(0)
  const [lives, setLives] = useState(3)
  const [wave, setWave]   = useState(1)
  const [best, setBest]   = useState(() => {
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
      if ((e.key === ' ' || e.key === 'Enter') && stateRef.current?.wavePhase === 'transition') {
        stateRef.current.transitionReady = true
      }
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
    const onTouchStart = (e) => {
      if (e.target.closest('button')) return
      e.preventDefault()
      if (stateRef.current?.wavePhase === 'transition') { stateRef.current.transitionReady = true; return }
      pointerXRef.current = toX(e.touches[0].clientX)
    }
    const onTouchMove  = (e) => { e.preventDefault(); pointerXRef.current = toX(e.touches[0].clientX) }
    const onTouchEnd   = () => { pointerXRef.current = null }
    const onMouseMove  = (e) => { pointerXRef.current = toX(e.clientX) }
    const onClick      = ()  => { if (stateRef.current?.wavePhase === 'transition') stateRef.current.transitionReady = true }
    wrap.addEventListener('touchstart', onTouchStart, { passive: false })
    wrap.addEventListener('touchmove',  onTouchMove,  { passive: false })
    wrap.addEventListener('touchend',   onTouchEnd)
    wrap.addEventListener('mousemove',  onMouseMove)
    wrap.addEventListener('click',      onClick)
    return () => {
      wrap.removeEventListener('touchstart', onTouchStart)
      wrap.removeEventListener('touchmove',  onTouchMove)
      wrap.removeEventListener('touchend',   onTouchEnd)
      wrap.removeEventListener('mousemove',  onMouseMove)
      wrap.removeEventListener('click',      onClick)
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

      // 파워업 감소
      for (const key of Object.keys(s.powerups)) {
        s.powerups[key]--
        if (s.powerups[key] <= 0) delete s.powerups[key]
      }

      // 파워업 값 계산
      const dmg         = s.powerups.power  ? 2 : 1
      const fireRate     = s.powerups.rapid  ? Math.ceil(FIRE_INTERVAL / 2.2) : FIRE_INTERVAL
      const hasSpread    = !!s.powerups.spread
      const hasShield    = !!s.powerups.shield

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
      if (s.bulletTimer >= fireRate) {
        const px = s.player.x, py = PLAYER_Y - 30
        if (hasSpread) {
          s.bullets.push({ x: px, y: py, vx: -4, vy: -BULLET_SPD, dmg })
          s.bullets.push({ x: px, y: py, vx:  0, vy: -BULLET_SPD, dmg })
          s.bullets.push({ x: px, y: py, vx:  4, vy: -BULLET_SPD, dmg })
        } else {
          s.bullets.push({ x: px, y: py, vx: 0, vy: -BULLET_SPD, dmg })
        }
        s.bulletTimer = 0
      }

      // 총알 이동
      s.bullets = s.bullets.filter(b => {
        b.x += b.vx; b.y += b.vy
        return b.y > -10 && b.x > -20 && b.x < W + 20
      })

      // UFO (wave 2+)
      const wcfg = getWaveCfg(s.wave)
      if (wcfg.hasUfo && s.wavePhase === 'wave') {
        s.ufoTimer++
        if (!s.ufo && s.ufoTimer >= 500) {
          const fromLeft = Math.random() < 0.5
          s.ufo = { x: fromLeft ? -65 : W + 65, y: UFO_Y, vx: fromLeft ? UFO_SPD + s.wave * 0.15 : -(UFO_SPD + s.wave * 0.15), frame: 0 }
          s.ufoTimer = 0
        }
        if (s.ufo) {
          s.ufo.x += s.ufo.vx
          s.ufo.frame++
          if (s.ufo.x < -80 || s.ufo.x > W + 80) {
            s.ufo = null
          } else {
            for (let bi = s.bullets.length - 1; bi >= 0; bi--) {
              const b = s.bullets[bi]
              if (Math.abs(b.x - s.ufo.x) < 36 && Math.abs(b.y - s.ufo.y) < 18) {
                s.score += 200
                spawnItem(s, s.ufo.x, s.ufo.y, 1)
                s.explosions.push({ x: s.ufo.x, y: s.ufo.y, frame: 0, max: 26, r: 34, color: '#ff44ff' })
                s.ufo = null
                s.bullets.splice(bi, 1)
                break
              }
            }
          }
        }
      }

      // ── 웨이브 페이즈 ─────────────────────────────────────────────
      if (s.wavePhase === 'wave') {
        if (s.aliens.length > 0) {
          const speedMul = 1 + (s.alienTotal - s.aliens.length) * 0.035
          const spd = s.alienDx * speedMul
          const formAliens = s.aliens.filter(a => !a.isDiver)
          let minX = Infinity, maxX = -Infinity
          for (const a of formAliens) { if (a.x < minX) minX = a.x; if (a.x > maxX) maxX = a.x }
          if (formAliens.length > 0) {
            const hitWall = (spd > 0 && maxX + ALIEN_W / 2 + spd > W - 8) ||
                            (spd < 0 && minX - ALIEN_W / 2 + spd < 8)
            if (hitWall) {
              s.alienDx *= -1
              for (const a of formAliens) a.y += ALIEN_STEP_DOWN
            } else {
              for (const a of formAliens) { a.x += spd; a.frame++ }
            }
          }

          // 다이버 (wave 2+)
          if (wcfg.hasDivers && formAliens.length > 2) {
            s.alienDiveTimer++
            if (s.alienDiveTimer >= s.nextDiveInterval) {
              s.alienDiveTimer = 0
              s.nextDiveInterval = Math.max(70, 200 - s.wave * 15)
              const idx = Math.floor(Math.random() * formAliens.length)
              const diver = formAliens[idx]
              diver.isDiver = true
              const angle = Math.atan2(PLAYER_Y - diver.y, s.player.x - diver.x)
              const dspd = 3.5 + s.wave * 0.25
              diver.dvx = Math.cos(angle) * dspd
              diver.dvy = Math.abs(Math.sin(angle)) * dspd + 1.5
            }
          }

          // 다이버 이동
          for (const a of s.aliens) {
            if (!a.isDiver) continue
            a.x += a.dvx; a.y += a.dvy; a.frame++
          }

          // 다이버 충돌/제거
          s.aliens = s.aliens.filter(a => {
            if (!a.isDiver) return true
            if (a.y > H + 20 || a.x < -50 || a.x > W + 50) return false
            if (!s.ended && s.player.invincible === 0 &&
                Math.abs(a.x - s.player.x) < PS + 18 && Math.abs(a.y - PLAYER_Y) < PS + 18) {
              if (hasShield) {
                delete s.powerups.shield
              } else {
                s.player.invincible = 110; s.lives--
                s.explosions.push({ x: s.player.x, y: PLAYER_Y, frame: 0, max: 16, r: 18, color: '#44ccff' })
                if (s.lives <= 0) endGame(s.score)
              }
              return false
            }
            return true
          })
          if (s.ended) return
        }

        // 사인파 진동 (wave 5+) — 포메이션 전체에 상하 진동 추가
        if (wcfg.hasSineMove) {
          const sineOff = Math.sin(s.frame * 0.04) * 0.8
          for (const a of s.aliens) { if (!a.isDiver) a.y += sineOff }
        }

        // 외계인 사격
        s.alienShootTimer++
        if (s.alienShootTimer >= s.nextAlienShoot && s.aliens.length > 0) {
          const nonDivers = s.aliens.filter(a => !a.isDiver)
          if (nonDivers.length > 0) {
            const shooter = nonDivers[Math.floor(Math.random() * nonDivers.length)]
            const sx = shooter.x, sy = shooter.y + ALIEN_H / 2
            if (wcfg.hasAimed) {
              // 조준 사격: 플레이어 방향으로 날아오는 총알
              const angle = Math.atan2(PLAYER_Y - sy, s.player.x - sx)
              s.alienBullets.push({ x: sx, y: sy, vx: Math.cos(angle) * ALIEN_BULLET_SPD, vy: Math.sin(angle) * ALIEN_BULLET_SPD })
            } else {
              s.alienBullets.push({ x: sx, y: sy, vx: 0, vy: ALIEN_BULLET_SPD })
            }
          }
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
              a.hp -= b.dmg; hit = true
              if (a.hp <= 0) {
                s.score += ALIEN_CFG[a.cfgIdx].pts
                s.explosions.push({ x: a.x, y: a.y, frame: 0, max: 18, r: 22, color: ALIEN_CFG[a.cfgIdx].color })
                if (Math.random() < ITEM_DROP_CHANCE) spawnItem(s, a.x, a.y, 1)
                s.aliens.splice(ai, 1)
              }
              break
            }
          }
          if (hit) s.bullets.splice(bi, 1)
        }

        // 전멸 → 보스
        if (s.aliens.length === 0) {
          s.boss = makeBoss(s.wave, diff)
          s.wavePhase = 'boss'
          s.ufo = null
        }

        // 외계인이 바닥까지 → 게임 오버
        for (const a of s.aliens) {
          if (!a.isDiver && a.y + ALIEN_H / 2 > PLAYER_Y - 10) { endGame(s.score); return }
        }

      // ── 보스 페이즈 ───────────────────────────────────────────────
      } else if (s.boss) {
        const boss = s.boss
        const bossRage = boss.hp / boss.maxHp < 0.3   // 분노 모드: HP 30% 이하
        const bossSpd = bossRage ? Math.abs(boss.vx) * 1.6 : Math.abs(boss.vx)
        boss.x += boss.vx > 0 ? bossSpd : -bossSpd
        boss.frame++
        if (boss.x > W - 80 || boss.x < 80) boss.vx *= -1

        boss.shootTimer++
        const shootInterval = bossRage ? Math.ceil(boss.nextShoot * 0.6) : boss.nextShoot
        if (boss.shootTimer >= shootInterval) {
          const bx = boss.x, by = boss.y + 52
          if (s.wave >= 3 || bossRage) {
            // 5방향 부채꼴 (wave 3+ 또는 분노 시)
            const spd = ALIEN_BULLET_SPD + 1.2 + (bossRage ? 1 : 0)
            for (const vx of [-4.2, -2.0, 0, 2.0, 4.2]) {
              s.alienBullets.push({ x: bx, y: by, vx, vy: vx === 0 ? spd + 0.5 : spd })
            }
          } else {
            s.alienBullets.push({ x: bx, y: by, vx: 0,    vy: ALIEN_BULLET_SPD + 1.5 })
            s.alienBullets.push({ x: bx, y: by, vx: -2.8, vy: ALIEN_BULLET_SPD })
            s.alienBullets.push({ x: bx, y: by, vx:  2.8, vy: ALIEN_BULLET_SPD })
          }
          boss.shootTimer = 0
        }

        // 총알 vs 보스
        for (let bi = s.bullets.length - 1; bi >= 0; bi--) {
          const b = s.bullets[bi]
          if (Math.abs(b.x - boss.x) < 72 && Math.abs(b.y - boss.y) < 46) {
            boss.hp -= b.dmg
            s.bullets.splice(bi, 1)
            if (boss.hp <= 0) {
              s.score += 100 * s.wave
              s.explosions.push({ x: boss.x, y: boss.y, frame: 0, max: 45, r: 72, color: '#bb44ff' })
              spawnItem(s, boss.x, boss.y, 2)
              s.boss = null
              s.wave++
              s.wavePhase = 'transition'
              s.transitionReady = false
              // 게임보드 정리
              s.bullets = []
              s.alienBullets = []
              s.items = []
              s.ufoTimer = 0
            }
          }
        }
      }

      // ── 웨이브 전환 (클릭 / 스페이스 대기) ────────────────────────
      if (s.wavePhase === 'transition') {
        if (s.transitionReady) {
          s.transitionReady = false
          const nextWcfg = getWaveCfg(s.wave)
          s.aliens = makeAliens(s.wave)
          s.alienTotal = nextWcfg.cols * nextWcfg.rows
          s.alienDx = diff.alienSpd * (1 + (s.wave - 1) * 0.18)
          s.nextAlienShoot = diff.fireMin + Math.floor(Math.random() * 40)
          s.alienShootTimer = 0
          s.alienDiveTimer = 0
          s.nextDiveInterval = Math.max(70, 200 - s.wave * 15)
          s.wavePhase = 'wave'
          s.waveAnnounce = 90
        }
      }

      // 외계인 총알 이동 + 플레이어 충돌
      s.alienBullets = s.alienBullets.filter(b => {
        b.x += b.vx; b.y += b.vy
        // 방어막 흡수
        if (hasShield &&
            Math.abs(b.x - s.player.x) < PS + 32 &&
            Math.abs(b.y - PLAYER_Y) < PS + 32) {
          return false
        }
        if (!s.ended && s.player.invincible === 0 &&
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

      // 아이템 이동 + 수집
      s.items = s.items.filter(item => {
        item.y += ITEM_SPEED; item.frame++
        if (Math.abs(item.x - s.player.x) < ITEM_RADIUS + PS &&
            Math.abs(item.y - PLAYER_Y) < ITEM_RADIUS + PS) {
          applyItem(s, item)
          return false
        }
        return item.y < H + 30
      })

      // 폭발 업데이트
      s.explosions = s.explosions.filter(e => { e.frame++; return e.frame < e.max })

      // 팝업 업데이트
      s.popups = s.popups.filter(p => { p.frame++; p.y -= 0.7; return p.frame < 55 })

      // 웨이브 텍스트 타이머
      if (s.waveAnnounce > 0) s.waveAnnounce--

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
    <div style={st.wrapper}>
      <div style={st.topBar}>
        <button style={st.backBtn} onClick={onBack}>← 나가기</button>
      </div>
      <h1 style={st.title}>🚀 우주 슈팅!</h1>
      <p style={st.subtitle}>
        {difficulty.emoji} {difficulty.label} &nbsp;·&nbsp; 웨이브 {wave}
      </p>

      <div ref={wrapRef} style={st.gameArea}>
        <canvas ref={canvasRef} width={W} height={H} style={st.canvas} />

        <div style={st.scoreCard}>
          <div style={st.scoreRow}>
            <div style={st.scoreItem}>
              <span style={st.scoreLabel}>목숨</span>
              <span style={st.scoreVal}>{'🚀'.repeat(Math.max(0, lives))}</span>
            </div>
            <div style={st.scoreDivider} />
            <div style={st.scoreItem}>
              <span style={st.scoreLabel}>점수</span>
              <span style={st.scoreVal}>{score}</span>
            </div>
            <div style={st.scoreDivider} />
            <div style={st.scoreItem}>
              <span style={st.scoreLabel}>🏆 최고</span>
              <span style={st.scoreBest}>{best}</span>
            </div>
          </div>
        </div>

        {/* 시작 오버레이 */}
        {phase === 'idle' && (
          <div style={st.overlay}>
            <div style={st.box}>
              <div style={st.oTitle}>🚀 우주 슈팅!</div>
              <div style={st.desc}>
                <p>외계인 함대를 물리쳐요!</p>
                <p>보스를 쓰러뜨리면 다음 웨이브!</p>
              </div>
              <div style={{ fontSize: 'clamp(12px, 2.5vw, 14px)', color: '#aaa', lineHeight: 1.9 }}>
                {ITEM_TYPES.map(t => (
                  <span key={t.id} style={{ marginRight: 10, color: t.color, fontWeight: 'bold' }}>
                    {t.emoji} {t.label}
                  </span>
                ))}
              </div>
              <div>
                <div style={st.label}>난이도</div>
                <div style={st.diffRow}>
                  {DIFFICULTIES.map(d => (
                    <button key={d.id} onClick={() => pickDifficulty(d)} style={{
                      ...st.diffBtn,
                      borderColor: difficulty.id === d.id ? d.color : '#444',
                      color: difficulty.id === d.id ? d.color : '#888',
                      background: difficulty.id === d.id ? `${d.color}22` : 'transparent',
                    }}>
                      {d.emoji} {d.label}
                    </button>
                  ))}
                </div>
              </div>
              <div style={st.bestLine}>🏆 최고 {best}점</div>
              <div style={st.btnGroup}>
                <button style={st.btnPrimary} onClick={startGame}>시작하기</button>
                <button style={st.btnBack2} onClick={onBack}>← 게임 선택</button>
              </div>
            </div>
          </div>
        )}

        {/* 게임오버 오버레이 */}
        {phase === 'gameover' && (
          <div style={st.overlay}>
            <div style={st.box}>
              <div style={st.oEmoji}>{score >= best ? '🏆' : '😵'}</div>
              <div style={st.oTitle}>{score >= best ? '신기록!' : '게임 오버!'}</div>
              <div style={st.bigScore}>{score}점</div>
              <div style={st.bestScore}>최고 {best}점</div>
              {score >= best && <div style={st.newBest}>🎉 최고 기록!</div>}
              <div style={st.btnGroup}>
                <button style={st.btnPrimary} onClick={startGame}>다시 하기</button>
                <button style={st.btnBack2} onClick={onBack}>← 게임 선택</button>
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

  // UFO
  if (s.ufo) drawUfo(ctx, s.ufo)

  // 외계인
  for (const a of s.aliens) {
    const bob = Math.sin(a.frame * 0.08) * 3
    ctx.save()
    if (ALIEN_CFG[a.cfgIdx].hp > 1 && a.hp < ALIEN_CFG[a.cfgIdx].hp) ctx.globalAlpha = 0.55
    if (a.isDiver) {
      ctx.shadowColor = '#ff4444'; ctx.shadowBlur = 14
    }
    ctx.font = '34px serif'
    ctx.fillText(ALIEN_CFG[a.cfgIdx].emoji, a.x - 17, a.y + bob + 18)
    ctx.restore()
  }

  // 보스
  if (s.boss) drawBoss(ctx, s.boss)

  // 아이템
  for (const item of s.items) {
    const bob = Math.sin(item.frame * 0.14) * 4
    ctx.save()
    ctx.shadowColor = item.type.color; ctx.shadowBlur = 18
    ctx.strokeStyle = item.type.color
    ctx.lineWidth = 2
    ctx.globalAlpha = 0.65 + Math.sin(item.frame * 0.18) * 0.3
    ctx.beginPath()
    ctx.arc(item.x, item.y + bob, ITEM_RADIUS, 0, Math.PI * 2)
    ctx.stroke()
    ctx.globalAlpha = 0.15
    ctx.fillStyle = item.type.color
    ctx.fill()
    ctx.globalAlpha = 1
    ctx.shadowBlur = 0
    ctx.font = '18px serif'
    ctx.textAlign = 'center'
    ctx.textBaseline = 'middle'
    ctx.fillText(item.type.emoji, item.x, item.y + bob)
    ctx.restore()
  }
  ctx.textAlign = 'left'
  ctx.textBaseline = 'alphabetic'

  // 플레이어 총알
  const hasPower = !!s.powerups.power
  ctx.shadowColor = hasPower ? '#ffdd00' : '#00ffff'
  ctx.shadowBlur   = hasPower ? 14 : 10
  ctx.fillStyle    = hasPower ? '#ffee88' : '#88ffff'
  for (const b of s.bullets) {
    ctx.fillRect(b.x - (hasPower ? 4 : 3), b.y, hasPower ? 8 : 6, hasPower ? 22 : 18)
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

  // 팝업 텍스트
  ctx.textAlign = 'center'
  for (const p of s.popups) {
    const alpha = p.frame < 10 ? p.frame / 10 : 1 - (p.frame - 10) / 45
    ctx.globalAlpha = Math.max(0, alpha)
    ctx.shadowColor = p.color; ctx.shadowBlur = 8
    ctx.fillStyle = p.color
    ctx.font = 'bold 16px sans-serif'
    ctx.fillText(p.text, p.x, p.y)
  }
  ctx.globalAlpha = 1; ctx.shadowBlur = 0; ctx.textAlign = 'left'

  // 플레이어
  drawPlayer(ctx, s.player, s.powerups, s.frame)

  // 파워업 HUD (캔버스 우상단)
  drawPowerupHud(ctx, s.powerups)

  // 웨이브 전환 — 클릭/스페이스 안내
  if (s.wavePhase === 'transition') {
    const blink = Math.floor(s.frame / 28) % 2 === 0
    ctx.save()
    ctx.globalAlpha = blink ? 1 : 0.45
    ctx.textAlign = 'center'
    ctx.font = 'bold 28px sans-serif'
    ctx.fillStyle = '#aaddff'
    ctx.shadowColor = '#4488ff'; ctx.shadowBlur = 16
    ctx.fillText('클릭 또는 스페이스로 다음 웨이브 시작!', W / 2, H / 2 + 60)
    ctx.restore()
    ctx.textAlign = 'left'
  }

  // 웨이브 알림 텍스트
  if (s.waveAnnounce > 0) {
    const timer = s.waveAnnounce
    let alpha
    if (timer > 70) alpha = (90 - timer) / 20
    else if (timer < 20) alpha = timer / 20
    else alpha = 1
    ctx.save()
    ctx.globalAlpha = alpha
    ctx.textAlign = 'center'
    ctx.font = 'bold 62px sans-serif'
    ctx.fillStyle = '#FFD700'
    ctx.shadowColor = '#FFD700'; ctx.shadowBlur = 28
    ctx.fillText(`WAVE ${s.wave}`, W / 2, H / 2 - 18)
    const sub = WAVE_SUBTITLES[Math.min(s.wave, WAVE_SUBTITLES.length - 1)]
    if (s.wave > 1 && sub) {
      ctx.font = 'bold 26px sans-serif'
      ctx.fillStyle = '#ffffff'
      ctx.shadowBlur = 10
      ctx.fillText(sub, W / 2, H / 2 + 26)
    }
    ctx.restore()
    ctx.textAlign = 'left'
  }
}

function drawUfo(ctx, ufo) {
  ctx.save()
  ctx.translate(ufo.x, ufo.y)
  ctx.shadowColor = '#ff44ff'; ctx.shadowBlur = 16

  // 본체
  ctx.fillStyle = '#cc66ff'
  ctx.beginPath()
  ctx.ellipse(0, 5, 32, 10, 0, 0, Math.PI * 2)
  ctx.fill()

  // 돔
  ctx.fillStyle = '#eeccff'
  ctx.shadowColor = '#eeccff'; ctx.shadowBlur = 8
  ctx.beginPath()
  ctx.ellipse(0, -4, 18, 14, 0, Math.PI, Math.PI * 2)
  ctx.fill()

  // 점멸 등
  const blink = Math.floor(ufo.frame / 6) % 2 === 0
  for (let i = -16; i <= 16; i += 8) {
    ctx.fillStyle = blink ? '#ffff44' : '#ff4444'
    ctx.shadowColor = ctx.fillStyle; ctx.shadowBlur = 6
    ctx.beginPath(); ctx.arc(i, 6, 3, 0, Math.PI * 2); ctx.fill()
  }

  ctx.restore()
  ctx.font = 'bold 11px sans-serif'
  ctx.fillStyle = '#ff88ff'
  ctx.textAlign = 'center'
  ctx.fillText('+200 🎁', ufo.x, ufo.y - 20)
  ctx.textAlign = 'left'
}

function drawPowerupHud(ctx, powerups) {
  let py = 10
  ctx.textAlign = 'left'
  for (const cfg of ITEM_TYPES) {
    const t = powerups[cfg.id]
    if (!t || cfg.duration === 0) continue
    const ratio = t / cfg.duration
    ctx.globalAlpha = 0.9
    ctx.font = '16px serif'
    ctx.fillText(cfg.emoji, W - 104, py + 14)
    ctx.fillStyle = 'rgba(0,0,0,0.5)'
    ctx.fillRect(W - 82, py + 3, 70, 10)
    ctx.fillStyle = cfg.color
    ctx.shadowColor = cfg.color; ctx.shadowBlur = 6
    ctx.fillRect(W - 82, py + 3, 70 * ratio, 10)
    ctx.shadowBlur = 0
    ctx.strokeStyle = cfg.color + '88'
    ctx.lineWidth = 1
    ctx.strokeRect(W - 82, py + 3, 70, 10)
    ctx.globalAlpha = 1
    py += 24
  }
}

function drawPlayer(ctx, player, powerups, frame) {
  const blink = player.invincible > 0 && Math.floor(player.invincible / 6) % 2 === 1
  if (blink) return
  const { x } = player
  const y = PLAYER_Y
  ctx.save()
  ctx.translate(x, y)

  // 방어막
  if (powerups.shield) {
    const pulse = Math.sin(frame * 0.18) * 5
    ctx.shadowColor = '#4488ff'; ctx.shadowBlur = 20
    ctx.strokeStyle = `rgba(68,136,255,${0.5 + Math.sin(frame * 0.18) * 0.35})`
    ctx.lineWidth = 3
    ctx.beginPath()
    ctx.arc(0, -4, 38 + pulse, 0, Math.PI * 2)
    ctx.stroke()
    ctx.shadowBlur = 0
  }

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

  const g = ctx.createRadialGradient(0, 5, 5, 0, 5, 74)
  g.addColorStop(0, `hsl(${280 - hpRatio * 60}, 80%, 65%)`)
  g.addColorStop(1, '#330055')
  ctx.fillStyle = g
  ctx.beginPath()
  ctx.ellipse(0, 10, 72 + pulse, 26, 0, 0, Math.PI * 2)
  ctx.fill()

  ctx.fillStyle = '#dd99ff'
  ctx.shadowColor = '#dd99ff'; ctx.shadowBlur = 10
  ctx.beginPath()
  ctx.ellipse(0, -8, 38, 32, 0, Math.PI, Math.PI * 2)
  ctx.fill()

  const eyeColor = hpRatio < 0.4 ? '#ff0000' : '#ff0033'
  const eyeR = hpRatio < 0.4 ? 10 + Math.sin(frame * 0.3) * 2 : 8
  ctx.fillStyle = eyeColor
  ctx.shadowColor = eyeColor; ctx.shadowBlur = hpRatio < 0.4 ? 22 : 14
  ctx.beginPath(); ctx.arc(-20, -12, eyeR, 0, Math.PI * 2); ctx.fill()
  ctx.beginPath(); ctx.arc( 20, -12, eyeR, 0, Math.PI * 2); ctx.fill()

  ctx.fillStyle = '#555'; ctx.shadowBlur = 0
  ctx.fillRect(-5, 26, 10, 22)
  ctx.fillRect(-26, 18, 8, 16)
  ctx.fillRect(18, 18, 8, 16)

  ctx.restore()

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
const st = {
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
    marginBottom: 12,
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
  scoreVal:   { color: '#FFD700', fontWeight: 'bold', fontSize: 'clamp(14px, 3vw, 18px)' },
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
    maxWidth: 360,
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
