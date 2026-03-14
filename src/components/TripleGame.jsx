import { useRef, useEffect, useState } from 'react'
import { getBest, saveBest, getSavedDiff, saveDiff, fillRoundRect, randInt } from '../utils/gameUtils'

const W = 480, H = 700
const GAME_ID = 'triple'

const CW = 58, CH = 62, CR = 7    // board card
const GX = 48, GY = 52            // grid step
const BOARD_TOP = 50, BOARD_BOT = 590
const MAX_HAND = 7
const SW = 54, SH = 58            // slot card

const EMOJIS = ['🍎','🍊','🍋','🍇','🍓','🍑','🍒','🥝','🌸','⭐','🎯','🔥','💎','🎸','🌙','🦋']

const DIFFICULTIES = [
  { id: 'very_easy', label: '입문',   emoji: '🐣', color: '#64B5F6', types: 4,  sets: 1 }, // 12장
  { id: 'easy',      label: '쉬움',   emoji: '🌱', color: '#4CAF50', types: 5,  sets: 2 }, // 30장
  { id: 'normal',    label: '보통',   emoji: '⚡', color: '#FFD700', types: 7,  sets: 2 }, // 42장
  { id: 'hard',      label: '어려움', emoji: '🔥', color: '#FF7043', types: 9,  sets: 2 }, // 54장
  { id: 'very_hard', label: '최고',   emoji: '💀', color: '#F44336', types: 11, sets: 2 }, // 66장
]

function shuffle(a) {
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.random() * (i + 1) | 0
    ;[a[i], a[j]] = [a[j], a[i]]
  }
  return a
}


function rrPathFixed(ctx, x, y, w, h, r) {
  ctx.beginPath()
  if (ctx.roundRect) {
    ctx.roundRect(x, y, w, h, r)
    return
  }
  ctx.moveTo(x + r, y)
  ctx.lineTo(x + w - r, y)
  ctx.arcTo(x + w, y, x + w, y + r, r)
  ctx.lineTo(x + w, y + h - r)
  ctx.arcTo(x + w, y + h, x + w - r, y + h, r)
  ctx.lineTo(x + r, y + h)
  ctx.arcTo(x, y + h, x, y + h - r, r)
  ctx.lineTo(x, y + r)
  ctx.arcTo(x, y, x + r, y, r)
  ctx.closePath()
}

function pickGrid(n) {
  const opts = n <= 16 ? [[4,3],[3,4]]
             : n <= 32 ? [[6,3],[5,4],[4,5]]
             : n <= 50 ? [[7,4],[6,5],[5,6]]
             :           [[9,4],[8,5],[7,6]]
  return opts[randInt(0, opts.length - 1)]
}

function makeSpots(n) {
  const [BC, BR] = pickGrid(n)
  const maxL = Math.min(BC, BR)
  const extW = (BC - 1) * GX + (maxL - 1) * GX / 2
  const ox = (W - extW) / 2
  const oy = BOARD_TOP + ((BOARD_BOT - BOARD_TOP) - ((BR - 1) * GY + CH)) / 2

  const spots = []
  for (let l = 0; l < maxL; l++) {
    const cols = BC - l, rows = BR - l
    if (rows <= 0) break
    for (let r = 0; r < rows; r++) {
      for (let c = 0; c < cols; c++) {
        spots.push({
          x: ox + l * GX / 2 + c * GX + CW / 2,
          y: oy + l * GY / 2 + r * GY + CH / 2,
          layer: l,
        })
      }
    }
  }
  shuffle(spots)
  return spots.slice(0, n)
}

function makeBoard(diff) {
  const types = EMOJIS.slice(0, diff.types)
  const list = []
  for (const t of types) for (let i = 0; i < 3 * diff.sets; i++) list.push(t)
  shuffle(list)
  return makeSpots(list.length).map((pos, i) => ({
    id: i, type: list[i],
    x: pos.x, y: pos.y, layer: pos.layer,
    removed: false,
  }))
}

function isBlocked(card, active) {
  return active.some(o =>
    o.id !== card.id && o.layer > card.layer &&
    Math.abs(o.x - card.x) < CW * 0.8 &&
    Math.abs(o.y - card.y) < CH * 0.8
  )
}

// pulse: 0–1 glow intensity for available cards
function drawCard(ctx, x, y, type, blocked, w = CW, h = CH, pulse = 0) {
  ctx.save()
  if (!blocked) {
    ctx.shadowColor = pulse > 0.1 ? `rgba(255,230,80,${0.25 + pulse * 0.55})` : 'rgba(0,0,0,0.5)'
    ctx.shadowBlur   = pulse > 0.1 ? 4 + pulse * 12 : 6
    ctx.shadowOffsetY = 3
  }
  ctx.fillStyle = blocked ? '#505068' : '#fffff2'
  rrPathFixed(ctx, x - w / 2, y - h / 2, w, h, CR)
  ctx.fill()
  ctx.shadowColor = 'transparent'; ctx.shadowBlur = 0; ctx.shadowOffsetY = 0
  ctx.strokeStyle = blocked ? '#8080b8' : '#ccccaa'
  ctx.lineWidth = blocked ? 1 : 1.5
  rrPathFixed(ctx, x - w / 2, y - h / 2, w, h, CR)
  ctx.stroke()
  ctx.globalAlpha = blocked ? 0.82 : 1
  ctx.font = `${w * 0.7}px serif`
  ctx.textAlign = 'center'
  ctx.textBaseline = 'middle'
  ctx.fillStyle = '#000'
  ctx.fillText(type, x, y + h * 0.04)
  ctx.restore()
}

function drawScene(ctx, s) {
  s.frame = (s.frame || 0) + 1

  ctx.fillStyle = '#0f0f1e'
  ctx.fillRect(0, 0, W, H)

  fillRoundRect(ctx, 8, BOARD_TOP - 8, W - 16, BOARD_BOT - BOARD_TOP + 16, 12, '#1a1a2e')

  const active = s.board.filter(c => !c.removed)
  for (const card of [...active].sort((a, b) => a.layer - b.layer)) {
    const blocked = isBlocked(card, active)
    drawCard(ctx, card.x, card.y, card.type, blocked, CW, CH, 0)
  }

  // Slot area
  const slotBg = s.hand.length >= MAX_HAND ? '#1a0000' : '#0d0d1e'
  fillRoundRect(ctx, 8, BOARD_BOT + 8, W - 16, H - BOARD_BOT - 16, 10, slotBg)
  ctx.strokeStyle = s.hand.length >= 6 ? (s.frame % 20 < 10 ? '#ff4444' : '#551111') : '#333'
  ctx.lineWidth = s.hand.length >= 6 ? 2 : 1
  rrPathFixed(ctx, 8, BOARD_BOT + 8, W - 16, H - BOARD_BOT - 16, 10)
  ctx.stroke()

  const totalSW = MAX_HAND * SW + (MAX_HAND - 1) * 4
  const sx0 = (W - totalSW) / 2
  const sy = BOARD_BOT + 8 + (H - BOARD_BOT - 16) / 2

  for (let i = 0; i < MAX_HAND; i++) {
    const sx = sx0 + i * (SW + 4)
    const filled = i < s.hand.length
    ctx.strokeStyle = filled ? '#666' : '#3a3a3a'
    ctx.lineWidth = 1
    ctx.setLineDash([3, 3])
    rrPathFixed(ctx, sx, sy - SH / 2, SW, SH, 6)
    ctx.stroke()
    ctx.setLineDash([])
    if (filled) drawCard(ctx, sx + SW / 2, sy, s.hand[i].type, false, SW, SH, 0)
  }

  if (s.hand.length >= 5) {
    const col = s.hand.length >= MAX_HAND ? '#ff4444' : '#ff9944'
    ctx.fillStyle = col
    ctx.font = `bold 13px sans-serif`
    ctx.textAlign = 'center'
    ctx.textBaseline = 'middle'
    ctx.fillText(`✋ ${s.hand.length} / ${MAX_HAND}`, W / 2, BOARD_BOT + 5)
  }

  // Animations
  const anims = s.anims || []
  for (let i = anims.length - 1; i >= 0; i--) {
    const a = anims[i]
    a.t++
    if (a.t >= a.maxT) { anims.splice(i, 1); continue }
    const p = a.t / a.maxT

    if (a.type === 'pop') {
      // Card pops at pick position, scales up and fades
      const scale = 1 + Math.sin(p * Math.PI) * 0.55
      const alpha = 1 - p * p
      ctx.save()
      ctx.globalAlpha = alpha
      ctx.translate(a.x, a.y)
      ctx.scale(scale, scale)
      drawCard(ctx, 0, 0, a.emoji, false, CW, CH, 0)
      ctx.restore()

    } else if (a.type === 'triple') {
      // Sparkle particles burst + floating text
      const alpha = p < 0.6 ? 1 : 1 - (p - 0.6) / 0.4
      const rise = p * 70

      // particles
      for (let j = 0; j < 8; j++) {
        const angle = (j / 8) * Math.PI * 2 + p * 2
        const r = p * 55
        ctx.save()
        ctx.globalAlpha = alpha * (1 - p)
        ctx.font = j % 2 === 0 ? '16px serif' : '12px serif'
        ctx.textAlign = 'center'
        ctx.textBaseline = 'middle'
        ctx.fillText(j % 2 === 0 ? '✨' : '⭐', a.x + Math.cos(angle) * r, a.y + Math.sin(angle) * r)
        ctx.restore()
      }

      ctx.save()
      ctx.globalAlpha = alpha
      ctx.font = `bold ${18 + p * 10}px sans-serif`
      ctx.textAlign = 'center'
      ctx.textBaseline = 'middle'
      ctx.shadowColor = '#00ee66'
      ctx.shadowBlur = 12
      ctx.fillStyle = '#aaffaa'
      ctx.fillText(a.text, a.x, a.y - rise)
      ctx.restore()
    }
  }
}

// ── Component ──────────────────────────────────────────────────────────────

export default function TripleGame({ onBack, onStart }) {
  const [difficulty, setDifficulty] = useState(() => getSavedDiff(GAME_ID, DIFFICULTIES))
  const [phase, setPhase]   = useState('idle')
  const [score, setScore]   = useState(0)
  const [best,  setBest]    = useState(() => getBest(GAME_ID, difficulty.id))

  const canvasRef     = useRef(null)
  const wrapRef       = useRef(null)
  const animRef       = useRef(null)
  const stateRef      = useRef(null)
  const gameOverAtRef = useRef(0)

  if (stateRef.current == null) {
    stateRef.current = { board: makeBoard(difficulty), hand: [], sets: 0, anims: [], frame: 0 }
  }

  // DPR 대응: 고해상도 디스플레이에서 선명하게
  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return
    const dpr = window.devicePixelRatio || 1
    canvas.width = W * dpr
    canvas.height = H * dpr
    canvas.getContext('2d').scale(dpr, dpr)
  }, [])

  useEffect(() => {
    if (phase !== 'playing') return
    const canvas = canvasRef.current
    const ctx = canvas.getContext('2d')
    let alive = true
    function loop() {
      if (!alive) return
      animRef.current = requestAnimationFrame(loop)
      drawScene(ctx, stateRef.current)
    }
    animRef.current = requestAnimationFrame(loop)
    return () => { alive = false; cancelAnimationFrame(animRef.current) }
  }, [phase, difficulty])

  useEffect(() => {
    if (phase === 'playing') return
    const canvas = canvasRef.current
    if (!canvas) return
    drawScene(canvas.getContext('2d'), stateRef.current)
  }, [phase])

  function startGame(d = difficulty) {
    if (Date.now() - gameOverAtRef.current < 500) return
    onStart?.()
    stateRef.current = { board: makeBoard(d), hand: [], sets: 0, anims: [], frame: 0 }
    setScore(0)
    setBest(getBest(GAME_ID, d.id))
    setPhase('playing')
  }

  function restartNow() {
    // Skip cooldown for explicit restart button
    gameOverAtRef.current = 0
    startGame()
  }

  function changeDiff(d) {
    saveDiff(GAME_ID, d.id)
    setDifficulty(d)
    setBest(getBest(GAME_ID, d.id))
    stateRef.current = { board: makeBoard(d), hand: [], sets: 0, anims: [], frame: 0 }
    setPhase('idle')
  }

  // ── Input ───────────────────────────────────────────────────────────────
  useEffect(() => {
    const el = wrapRef.current
    if (!el) return

    function onInput(e) {
      if (e.target.closest('button')) return
      e.preventDefault()
      if (phase !== 'playing') { startGame(); return }

      const canvas = canvasRef.current
      const rect = canvas.getBoundingClientRect()
      const clientX = e.touches ? e.touches[0].clientX : e.clientX
      const clientY = e.touches ? e.touches[0].clientY : e.clientY
      const cx = (clientX - rect.left) * (W / rect.width)
      const cy = (clientY - rect.top) * (H / rect.height)

      const s = stateRef.current
      if (s.hand.length >= MAX_HAND) return
      const active = s.board.filter(c => !c.removed)
      const hits = active.filter(c =>
        !isBlocked(c, active) &&
        Math.abs(cx - c.x) < CW / 2 &&
        Math.abs(cy - c.y) < CH / 2
      )
      if (!hits.length) return
      hits.sort((a, b) => b.layer - a.layer || b.y - a.y)
      const picked = hits[0]

      // Pop animation at pick position
      s.anims.push({ type: 'pop', x: picked.x, y: picked.y, emoji: picked.type, t: 0, maxT: 18 })

      picked.removed = true
      let ins = s.hand.length
      for (let i = s.hand.length - 1; i >= 0; i--) {
        if (s.hand[i].type === picked.type) { ins = i + 1; break }
      }
      s.hand.splice(ins, 0, { type: picked.type })

      // Remove triples
      let again = true
      while (again) {
        again = false
        const cnt = {}
        for (const c of s.hand) cnt[c.type] = (cnt[c.type] || 0) + 1
        for (const [type, n] of Object.entries(cnt)) {
          if (n >= 3) {
            let rem = 3
            for (let i = s.hand.length - 1; i >= 0 && rem > 0; i--) {
              if (s.hand[i].type === type) { s.hand.splice(i, 1); rem-- }
            }
            s.sets++
            // Triple sparkle animation at center-bottom of board
            s.anims.push({
              type: 'triple',
              x: W / 2, y: BOARD_BOT - 30,
              text: `${type}${type}${type} 완성!`,
              t: 0, maxT: 60,
            })
            again = true
            break
          }
        }
      }

      setScore(s.sets)

      if (s.board.every(c => c.removed)) {
        gameOverAtRef.current = Date.now()
        if (saveBest(GAME_ID, difficulty.id, s.sets)) setBest(s.sets)
        setPhase('win')
        return
      }
      if (s.hand.length >= MAX_HAND) {
        gameOverAtRef.current = Date.now()
        if (saveBest(GAME_ID, difficulty.id, s.sets)) setBest(s.sets)
        setPhase('gameover')
      }
    }

    el.addEventListener('touchstart', onInput, { passive: false })
    el.addEventListener('click', onInput)
    return () => {
      el.removeEventListener('touchstart', onInput)
      el.removeEventListener('click', onInput)
    }
  }, [phase, difficulty]) // eslint-disable-line react-hooks/exhaustive-deps

  const isNewBest = score > 0 && score >= best
  const totalSets = difficulty.types * difficulty.sets

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
        {phase === 'playing' && (
          <button style={S.refreshBtn} onClick={restartNow} title="새 게임">🔄 새 게임</button>
        )}
      </div>
      <h1 style={S.title}>🃏 세 장 모으기</h1>
      <p style={S.subtitle}>{difficulty.emoji} {difficulty.label} · {score}세트</p>

      <div ref={wrapRef} style={S.gameArea}>
        <canvas ref={canvasRef} style={S.canvas} />

        <div style={S.scoreCard}>
          <div style={S.scoreRow}>
            <div style={S.scoreItem}>
              <span style={S.scoreLabel}>세트</span>
              <span style={S.scoreVal}>{score} / {totalSets}</span>
            </div>
            <div style={S.scoreDivider} />
            <div style={S.scoreItem}>
              <span style={S.scoreLabel}>🏆 최고</span>
              <span style={S.scoreBest}>{best}세트</span>
            </div>
          </div>
        </div>

        {phase === 'idle' && (
          <div style={S.overlay}>
            <div style={S.box}>
              <div style={S.oTitle}>🃏 세 장 모으기</div>
              <div style={S.desc}>
                <p>카드를 눌러 손에 가져오세요!</p>
                <p>🃏🃏🃏 같은 카드 3장 → 사라짐</p>
                <p>✋ 7장이 가득 차면 실패!</p>
              </div>
              {diffPicker}
              <div style={S.bestLine}>🏆 최고 {best}세트</div>
              <div style={S.btnGroup}>
                <button style={S.btnPrimary} onClick={() => startGame()}>시작하기</button>
                <button style={S.btnBack2} onClick={onBack}>← 게임 선택</button>
              </div>
            </div>
          </div>
        )}

        {phase === 'win' && (
          <div style={S.overlay}>
            <div style={S.box}>
              <div style={S.oEmoji}>🎉</div>
              <div style={{ ...S.oTitle, color: '#FFD700' }}>성공!</div>
              <div style={S.bigScore}>{score}세트</div>
              <div style={S.bestScore}>최고 {best}세트</div>
              {isNewBest && <div style={S.newBest}>🏆 최고 기록!</div>}
              {diffPicker}
              <div style={S.btnGroup}>
                <button style={S.btnPrimary} onClick={() => startGame()}>다시 하기</button>
                <button style={S.btnBack2} onClick={onBack}>← 게임 선택</button>
              </div>
            </div>
          </div>
        )}

        {phase === 'gameover' && (
          <div style={S.overlay}>
            <div style={S.box}>
              <div style={S.oEmoji}>😵</div>
              <div style={{ ...S.oTitle, color: '#ff6b6b' }}>손이 가득 찼어요!</div>
              <div style={S.bigScore}>{score}세트</div>
              <div style={S.bestScore}>최고 {best}세트</div>
              {isNewBest && <div style={S.newBest}>🏆 최고 기록!</div>}
              {diffPicker}
              <div style={S.btnGroup}>
                <button style={S.btnPrimary} onClick={() => startGame()}>다시 하기</button>
                <button style={S.btnBack2} onClick={onBack}>← 게임 선택</button>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}

// ── Styles ─────────────────────────────────────────────────────────────────

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
    gap: 8,
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
  refreshBtn: { fontSize: 'clamp(12px, 2.5vw, 14px)', fontWeight: 'bold', padding: '6px 14px', borderRadius: 20, border: '2px solid #4a9eff', background: 'transparent', color: '#4a9eff', cursor: 'pointer', marginLeft: 'auto' },
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
    padding: 'clamp(20px, 4vw, 32px) clamp(20px, 4vw, 36px)',
    textAlign: 'center',
    display: 'flex',
    flexDirection: 'column',
    gap: 14,
    maxWidth: 380,
    width: '92%',
  },
  oEmoji:    { fontSize: 'clamp(36px, 8vw, 56px)' },
  oTitle:    { color: '#FFD700', fontSize: 'clamp(20px, 5vw, 30px)', fontWeight: 'bold', textShadow: '0 2px 18px rgba(255,215,0,0.4)' },
  desc:      { color: '#ccc', fontSize: 'clamp(13px, 2.5vw, 15px)', lineHeight: 1.8 },
  label:     { color: '#aaa', fontSize: 'clamp(11px, 2vw, 13px)', marginBottom: 6 },
  diffRow:   { display: 'flex', flexWrap: 'wrap', gap: 6, justifyContent: 'center' },
  diffBtn:   { flex: '0 0 calc(33.333% - 4px)', padding: '8px 4px', borderRadius: 10, border: '2px solid #444', background: 'transparent', fontSize: 'clamp(11px, 2vw, 13px)', fontWeight: 'bold', cursor: 'pointer', transition: 'all 0.15s', color: '#888', textAlign: 'center' },
  bestLine:  { color: '#aaa', fontSize: 'clamp(12px, 2.5vw, 14px)' },
  bigScore:  { color: '#fff', fontSize: 'clamp(28px, 6vw, 40px)', fontWeight: 'bold' },
  bestScore: { color: 'rgba(255,255,255,0.45)', fontSize: 'clamp(12px, 2.5vw, 15px)' },
  newBest:   { color: '#FFD700', fontSize: 'clamp(14px, 3vw, 18px)', fontWeight: 'bold' },
  btnGroup:  { display: 'flex', flexDirection: 'column', gap: 8, width: '100%' },
  btnPrimary: { background: 'linear-gradient(135deg, #FFD700, #FFA500)', color: '#1a1a2e', border: 'none', borderRadius: 14, padding: 'clamp(10px, 2vw, 14px) clamp(20px, 4vw, 36px)', fontSize: 'clamp(15px, 3vw, 18px)', fontWeight: 'bold', cursor: 'pointer', boxShadow: '0 4px 20px rgba(255,165,0,0.4)' },
  btnBack2:   { background: 'transparent', color: '#aaa', border: '2px solid #444', borderRadius: 14, padding: 'clamp(8px, 1.5vw, 10px) clamp(16px, 3vw, 24px)', fontSize: 'clamp(13px, 2.5vw, 15px)', fontWeight: 'bold', cursor: 'pointer' },
}
