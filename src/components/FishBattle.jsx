import { useEffect, useRef, useState } from 'react'
import { getSavedDiff, saveDiff, getBest, saveBest } from '../utils/gameUtils'

const W = 480
const H = 560
const GAME_ID = 'fishbattle'
const HUD_H = 56
const PAD = 14

const DIFFICULTIES = [
  { id: 'easy',   label: '쉬움',   emoji: '🌱', color: '#4CAF50', time: 45, spawnRate: 75,  speed: 2.0 },
  { id: 'normal', label: '보통',   emoji: '⚡', color: '#FFD700', time: 30, spawnRate: 50,  speed: 3.2 },
  { id: 'hard',   label: '어려움', emoji: '🔥', color: '#F44336', time: 20, spawnRate: 30,  speed: 4.8 },
]

const FISH_TYPES = [
  { emoji: '🐟', pts: 10,  ew: 36, weight: 5 },
  { emoji: '🐡', pts: 20,  ew: 48, weight: 3 },
  { emoji: '🐠', pts: 30,  ew: 56, weight: 2 },
  { emoji: '⭐', pts: 50,  ew: 40, weight: 1 },
  { emoji: '🦈', pts: -20, ew: 64, weight: 2 },
]

// ── iOS Safari: scale(-1,1) + fillText 이모지 조합 버그 → offscreen 캐시
const _emojiCache = {}
function emojiCanvas(emoji, size) {
  const key = `${emoji}_${size}`
  if (_emojiCache[key]) return _emojiCache[key]
  const oc = document.createElement('canvas')
  oc.width = size * 2; oc.height = size * 2
  const c = oc.getContext('2d')
  c.font = `${size * 1.2}px "Segoe UI Emoji", "Apple Color Emoji", serif`
  c.textAlign = 'center'
  c.textBaseline = 'middle'
  c.fillText(emoji, size, size)
  return (_emojiCache[key] = oc)
}

function drawFish(ctx, f) {
  const bobY = f.y + Math.sin(f.frame * 0.05) * 4
  const oc = emojiCanvas(f.emoji, f.ew)
  ctx.save()
  ctx.translate(f.x + f.ew / 2, bobY + f.ew / 2)
  if (f.vx > 0) ctx.scale(-1, 1)  // 오른쪽으로 이동 시 반전
  ctx.drawImage(oc, -f.ew, -f.ew, f.ew * 2, f.ew * 2)
  ctx.restore()
}

function pickType() {
  const total = FISH_TYPES.reduce((s, t) => s + t.weight, 0)
  let r = Math.random() * total
  for (const t of FISH_TYPES) {
    r -= t.weight
    if (r <= 0) return t
  }
  return FISH_TYPES[0]
}

function spawnFish(s) {
  const t = pickType()
  const fromLeft = Math.random() < 0.5
  const speed = s.speed * (0.7 + Math.random() * 0.6)
  const minY = HUD_H + 8
  const maxY = H - t.ew - 8
  s.fish.push({
    id: s.nextId++,
    x: fromLeft ? -t.ew - 10 : W + 10,
    y: minY + Math.random() * (maxY - minY),
    vx: fromLeft ? speed : -speed,
    frame: Math.floor(Math.random() * 100),
    ...t,
  })
}

function makeState(diff) {
  return {
    fish: [], popups: [],
    score: 0, frame: 0,
    startTime: Date.now(),
    endTime: Date.now() + diff.time * 1000,
    spawnRate: diff.spawnRate,
    speed: diff.speed,
    nextId: 0,
  }
}

// ── 드로우 ────────────────────────────────────────────────────────────

function drawScene(ctx, s, now, oceanGrad) {
  ctx.fillStyle = '#0f0f1e'
  ctx.fillRect(0, 0, W, H)

  // HUD
  ctx.fillStyle = '#0a1628'
  ctx.fillRect(0, 0, W, HUD_H)
  ctx.fillStyle = '#1a3a5a'
  ctx.fillRect(0, HUD_H - 1, W, 1)

  // 바다
  ctx.fillStyle = oceanGrad
  ctx.fillRect(0, HUD_H, W, H - HUD_H)

  // 시간 바
  const pct = Math.max(0, (s.endTime - now) / (s.endTime - s.startTime))
  const barW = W - 2 * PAD - 90
  ctx.fillStyle = '#0a1e36'
  ctx.fillRect(PAD, 18, barW, 18)
  ctx.fillStyle = pct > 0.5 ? '#4CAF50' : pct > 0.25 ? '#FFD700' : '#F44336'
  ctx.fillRect(PAD, 18, barW * pct, 18)
  ctx.strokeStyle = '#2a5a8a'
  ctx.lineWidth = 1
  ctx.strokeRect(PAD, 18, barW, 18)

  ctx.fillStyle = '#ddd'
  ctx.font = 'bold 12px "Segoe UI", sans-serif'
  ctx.textAlign = 'left'
  ctx.textBaseline = 'middle'
  ctx.fillText('⏱ ' + Math.ceil((s.endTime - now) / 1000) + 's', PAD + 4, 27)

  ctx.fillStyle = '#FFD700'
  ctx.font = 'bold 20px "Segoe UI", sans-serif'
  ctx.textAlign = 'right'
  ctx.fillText(s.score + '점', W - PAD, 27)
  ctx.textAlign = 'left'
  ctx.textBaseline = 'alphabetic'

  // 물고기
  for (const f of s.fish) drawFish(ctx, f)

  // 점수 팝업
  ctx.font = 'bold 22px "Segoe UI", sans-serif'
  for (const p of s.popups) {
    const alpha = p.life / 40
    ctx.fillStyle = p.pts > 0 ? `rgba(255,215,0,${alpha})` : `rgba(255,80,80,${alpha})`
    ctx.textAlign = 'center'
    ctx.textBaseline = 'middle'
    ctx.fillText(p.text, p.x, p.y)
  }
  ctx.textAlign = 'left'
  ctx.textBaseline = 'alphabetic'
}

// ── 컴포넌트 ─────────────────────────────────────────────────────────

export default function FishBattle({ onBack, onStart }) {
  const [difficulty, setDifficulty] = useState(() => getSavedDiff(GAME_ID, DIFFICULTIES))
  const [phase, setPhase]           = useState('idle')
  const [score, setScore]           = useState(0)
  const [best, setBest]             = useState(() => getBest(GAME_ID, difficulty.id))

  const canvasRef = useRef(null)
  const wrapRef   = useRef(null)
  const animRef   = useRef(null)
  const stateRef  = useRef(null)

  // ── 게임 루프 ─────────────────────────────────────────────────────
  useEffect(() => {
    if (phase !== 'playing') return
    const canvas = canvasRef.current
    const ctx = canvas.getContext('2d')
    const oceanGrad = ctx.createLinearGradient(0, HUD_H, 0, H)
    oceanGrad.addColorStop(0, '#1565a8')
    oceanGrad.addColorStop(1, '#0a2744')
    let alive = true

    function loop() {
      if (!alive) return
      animRef.current = requestAnimationFrame(loop)
      const s = stateRef.current
      const now = Date.now()
      s.frame++

      for (const f of s.fish) { f.x += f.vx; f.frame++ }
      s.fish = s.fish.filter(f => f.x > -100 && f.x < W + 100)
      if (s.frame % s.spawnRate === 0) spawnFish(s)

      for (const p of s.popups) { p.life--; p.y -= 1 }
      s.popups = s.popups.filter(p => p.life > 0)

      if (now >= s.endTime) {
        alive = false
        cancelAnimationFrame(animRef.current)
        if (saveBest(GAME_ID, difficulty.id, s.score)) setBest(s.score)
        setScore(s.score)
        setPhase('gameover')
        return
      }

      setScore(s.score)
      drawScene(ctx, s, now, oceanGrad)
    }

    animRef.current = requestAnimationFrame(loop)
    return () => { alive = false; cancelAnimationFrame(animRef.current) }
  }, [phase, difficulty])

  // ── 클릭/터치 ─────────────────────────────────────────────────────
  useEffect(() => {
    const el = wrapRef.current
    if (!el || phase !== 'playing') return

    function tap(clientX, clientY) {
      const canvas = canvasRef.current
      const rect = canvas.getBoundingClientRect()
      const cx = (clientX - rect.left) * (W / rect.width)
      const cy = (clientY - rect.top) * (H / rect.height)
      const s = stateRef.current

      for (let i = s.fish.length - 1; i >= 0; i--) {
        const f = s.fish[i]
        const bobY = f.y + Math.sin(f.frame * 0.05) * 4
        if (cx >= f.x && cx <= f.x + f.ew && cy >= bobY && cy <= bobY + f.ew) {
          s.score += f.pts
          s.popups.push({ x: cx, y: cy - 10, text: f.pts > 0 ? `+${f.pts}` : `${f.pts}`, life: 40, pts: f.pts })
          s.fish.splice(i, 1)
          break
        }
      }
    }

    function onTouch(e) {
      if (e.target.closest('button')) return
      e.preventDefault()
      tap(e.touches[0].clientX, e.touches[0].clientY)
    }
    function onClick(e) {
      if (e.target.closest('button')) return
      tap(e.clientX, e.clientY)
    }
    el.addEventListener('touchstart', onTouch, { passive: false })
    el.addEventListener('click', onClick)
    return () => {
      el.removeEventListener('touchstart', onTouch)
      el.removeEventListener('click', onClick)
    }
  }, [phase, difficulty])

  // ── 시작 ─────────────────────────────────────────────────────────
  function startGame() {
    onStart?.()
    stateRef.current = makeState(difficulty)
    setScore(0)
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

  return (
    <div style={S.wrapper}>
      <div style={S.topBar}>
        <button style={S.backBtn} onClick={onBack}>← 나가기</button>
      </div>
      <h1 style={S.title}>🐟 낚시 배틀</h1>
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
              <div style={S.oTitle}>🐟 낚시 배틀</div>
              <div style={S.desc}>
                <p>헤엄치는 물고기를 빠르게 탭해서<br />잡아보세요!</p>
                <p>🐟 +10 &nbsp;🐡 +20 &nbsp;🐠 +30<br />⭐ +50 &nbsp;🦈 -20 (위험!)</p>
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
              <div style={S.oEmoji}>{isNewBest ? '🏆' : '🐟'}</div>
              <div style={S.oTitle}>{isNewBest ? '신기록!' : '시간 종료!'}</div>
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
