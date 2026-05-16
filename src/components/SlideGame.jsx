import { useEffect, useRef, useState } from 'react'
import { getSavedDiff, saveDiff } from '../utils/gameUtils'

const W = 480
const H = 560
const GAME_ID = 'slide'
const HUD_H = 54
const PAD = 14

const DIFFICULTIES = [
  { id: 'easy',   label: '쉬움',   emoji: '🌱', color: '#4CAF50', cols: 3, rows: 3, shuffles: 80  },
  { id: 'normal', label: '보통',   emoji: '⚡', color: '#FFD700', cols: 4, rows: 4, shuffles: 150 },
  { id: 'hard',   label: '어려움', emoji: '🔥', color: '#F44336', cols: 5, rows: 5, shuffles: 250 },
]

const TILE_EMOJIS = {
  3: ['🐶','🐱','🐭','🐹','🐰','🦊','🐻','🐼'],
  4: ['🐶','🐱','🐭','🐹','🐰','🦊','🐻','🐼','🐨','🐯','🦁','🐮','🐷','🐸','🐙'],
  5: ['🐶','🐱','🐭','🐹','🐰','🦊','🐻','🐼','🐨','🐯','🦁','🐮','🐷','🐸','🐙','🦋','🐝','🦄','🐲','🌸','🍎','🍊','🍋','🍇'],
}

// ── 헬퍼 ─────────────────────────────────────────────────────────────

function getBestTime(diffId) {
  return parseInt(localStorage.getItem(`${GAME_ID}_best_${diffId}`) || '0', 10)
}
function saveBestTime(diffId, ms) {
  const prev = getBestTime(diffId)
  if (prev === 0 || ms < prev) {
    localStorage.setItem(`${GAME_ID}_best_${diffId}`, String(ms))
    return true
  }
  return false
}
function fmtTime(ms) {
  if (!ms) return '--'
  const s = Math.floor(ms / 1000)
  const m = Math.floor(s / 60)
  const sec = s % 60
  const d = Math.floor((ms % 1000) / 100)
  return m > 0 ? `${m}:${String(sec).padStart(2, '0')}.${d}` : `${sec}.${d}초`
}
function getNeighbors(idx, cols, rows) {
  const r = Math.floor(idx / cols), c = idx % cols
  const nb = []
  if (r > 0) nb.push(idx - cols)
  if (r < rows - 1) nb.push(idx + cols)
  if (c > 0) nb.push(idx - 1)
  if (c < cols - 1) nb.push(idx + 1)
  return nb
}
function createBoard(cols, rows, shuffles) {
  const N = cols * rows
  const board = Array.from({ length: N }, (_, i) => (i + 1) % N)
  let emptyIdx = N - 1, prev = -1
  for (let i = 0; i < shuffles; i++) {
    const nb = getNeighbors(emptyIdx, cols, rows).filter(n => n !== prev)
    const ni = nb[Math.floor(Math.random() * nb.length)]
    board[emptyIdx] = board[ni]
    board[ni] = 0
    prev = emptyIdx
    emptyIdx = ni
  }
  return { board, emptyIdx }
}
function isSolved(board) {
  const N = board.length
  for (let i = 0; i < N - 1; i++) if (board[i] !== i + 1) return false
  return board[N - 1] === 0
}

// ── 드로우 ────────────────────────────────────────────────────────────

function rrect(ctx, x, y, w, h, r) {
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

function drawBoard(ctx, s) {
  const { board, cols, rows, elapsed, moves } = s
  const N = cols * rows
  const tileSize = (W - 2 * PAD) / cols
  const puzzleTop = HUD_H + PAD
  const emojis = TILE_EMOJIS[cols]
  const fontSize = Math.floor(tileSize * 0.50)
  const numSize = Math.max(10, Math.floor(tileSize * 0.18))
  const radius = Math.max(6, Math.floor(tileSize * 0.1))
  const emojiFont = `${fontSize}px "Segoe UI Emoji", "Apple Color Emoji", serif`
  const numFont = `bold ${numSize}px "Segoe UI", sans-serif`

  ctx.fillStyle = '#0f0f1e'
  ctx.fillRect(0, 0, W, H)

  ctx.fillStyle = '#13132a'
  ctx.fillRect(0, 0, W, HUD_H)
  ctx.fillStyle = '#2a2a4a'
  ctx.fillRect(0, HUD_H - 1, W, 1)

  ctx.font = `bold 17px "Segoe UI", sans-serif`
  ctx.textBaseline = 'middle'
  ctx.textAlign = 'left'
  ctx.fillStyle = '#eee'
  ctx.fillText('⏱ ' + fmtTime(elapsed), PAD + 8, HUD_H / 2)
  ctx.textAlign = 'right'
  ctx.fillStyle = '#aaa'
  ctx.fillText('이동 ' + moves + '번', W - PAD - 8, HUD_H / 2)
  ctx.textAlign = 'left'
  ctx.textBaseline = 'alphabetic'

  for (let i = 0; i < N; i++) {
    const col = i % cols
    const row = Math.floor(i / cols)
    const x = PAD + col * tileSize
    const y = puzzleTop + row * tileSize
    const val = board[i]
    const inner = tileSize - 6

    if (val === 0) {
      ctx.fillStyle = '#090914'
      rrect(ctx, x + 3, y + 3, inner, inner, radius)
      ctx.fill()
      ctx.strokeStyle = '#1c1c36'
      ctx.lineWidth = 1.5
      rrect(ctx, x + 3, y + 3, inner, inner, radius)
      ctx.stroke()
    } else {
      const correct = val === i + 1
      ctx.fillStyle = correct ? '#1a3528' : '#252545'
      rrect(ctx, x + 3, y + 3, inner, inner, radius)
      ctx.fill()
      ctx.strokeStyle = correct ? '#3a8a5a' : '#4a4a9a'
      ctx.lineWidth = 2
      rrect(ctx, x + 3, y + 3, inner, inner, radius)
      ctx.stroke()

      ctx.font = emojiFont
      ctx.textAlign = 'center'
      ctx.textBaseline = 'middle'
      ctx.fillText(emojis[val - 1], x + tileSize / 2, y + tileSize / 2)

      ctx.font = numFont
      ctx.fillStyle = 'rgba(255,255,255,0.4)'
      ctx.textAlign = 'right'
      ctx.textBaseline = 'bottom'
      ctx.fillText(val, x + tileSize - 6, y + tileSize - 4)
      ctx.textAlign = 'left'
      ctx.textBaseline = 'alphabetic'
    }
  }
}

// ── 컴포넌트 ─────────────────────────────────────────────────────────

export default function SlideGame({ onBack, onStart }) {
  const [difficulty, setDifficulty] = useState(() => getSavedDiff(GAME_ID, DIFFICULTIES))
  const [phase, setPhase]           = useState('idle')
  const [elapsed, setElapsed]       = useState(0)
  const [moves, setMoves]           = useState(0)
  const [best, setBest]             = useState(() => getBestTime(difficulty.id))
  const [isNewBest, setIsNewBest]   = useState(false)

  const canvasRef = useRef(null)
  const wrapRef   = useRef(null)
  const animRef   = useRef(null)
  const stateRef  = useRef(null)

  // ── 게임 루프 (타이머 + 렌더) ─────────────────────────────────────
  useEffect(() => {
    if (phase !== 'playing') return
    const canvas = canvasRef.current
    const ctx = canvas.getContext('2d')
    let alive = true
    function loop() {
      if (!alive) return
      animRef.current = requestAnimationFrame(loop)
      const s = stateRef.current
      s.elapsed = Date.now() - s.startTime
      setElapsed(s.elapsed)
      drawBoard(ctx, s)
    }
    animRef.current = requestAnimationFrame(loop)
    return () => { alive = false; cancelAnimationFrame(animRef.current) }
  }, [phase, difficulty])

  // ── 클릭/터치 핸들러 ─────────────────────────────────────────────
  useEffect(() => {
    const el = wrapRef.current
    if (!el || phase !== 'playing') return

    function tap(clientX, clientY) {
      const canvas = canvasRef.current
      const rect = canvas.getBoundingClientRect()
      const cx = (clientX - rect.left) * (W / rect.width)
      const cy = (clientY - rect.top) * (H / rect.height)
      const s = stateRef.current
      const { cols, rows, board } = s
      const tileSize = (W - 2 * PAD) / cols
      const col = Math.floor((cx - PAD) / tileSize)
      const row = Math.floor((cy - HUD_H - PAD) / tileSize)
      if (col < 0 || col >= cols || row < 0 || row >= rows) return
      const tappedIdx = row * cols + col
      if (!getNeighbors(s.emptyIdx, cols, rows).includes(tappedIdx)) return

      board[s.emptyIdx] = board[tappedIdx]
      board[tappedIdx] = 0
      s.emptyIdx = tappedIdx
      s.moves++
      setMoves(s.moves)

      if (isSolved(board)) {
        const t = Date.now() - s.startTime
        const nb = saveBestTime(difficulty.id, t)
        cancelAnimationFrame(animRef.current)
        s.elapsed = t
        drawBoard(canvas.getContext('2d'), s)
        setBest(getBestTime(difficulty.id))
        setElapsed(t)
        setIsNewBest(nb)
        setPhase('win')
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
    const { cols, rows, shuffles } = difficulty
    const { board, emptyIdx } = createBoard(cols, rows, shuffles)
    stateRef.current = { board, emptyIdx, cols, rows, startTime: Date.now(), elapsed: 0, moves: 0 }
    setElapsed(0)
    setMoves(0)
    setIsNewBest(false)
    setPhase('playing')
  }

  function changeDiff(d) {
    saveDiff(GAME_ID, d.id)
    setDifficulty(d)
    setBest(getBestTime(d.id))
    setPhase('idle')
  }

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
      <h1 style={S.title}>🧩 그림 맞추기</h1>
      <p style={S.subtitle}>{difficulty.emoji} {difficulty.label} · {fmtTime(elapsed)}</p>

      <div ref={wrapRef} style={S.gameArea}>
        <canvas ref={canvasRef} width={W} height={H} style={S.canvas} />

        <div style={S.scoreCard}>
          <div style={S.scoreRow}>
            <div style={S.scoreItem}>
              <span style={S.scoreLabel}>이동 횟수</span>
              <span style={S.scoreVal}>{moves}번</span>
            </div>
            <div style={S.scoreDivider} />
            <div style={S.scoreItem}>
              <span style={S.scoreLabel}>🏆 최고 기록</span>
              <span style={S.scoreBest}>{fmtTime(best)}</span>
            </div>
          </div>
        </div>

        {phase === 'idle' && (
          <div style={S.overlay}>
            <div style={S.box}>
              <div style={S.oTitle}>🧩 그림 맞추기</div>
              <div style={S.desc}>
                <p>아래 순서대로 타일을 맞춰보세요!<br />빈 칸 옆 타일을 탭하면 이동해요</p>
              </div>
              <div style={{ ...S.desc, paddingBottom: 4 }}>
                <div style={{ color: '#FFD700', fontSize: 12, marginBottom: 6 }}>🎯 목표</div>
                <div style={{
                  display: 'grid',
                  gridTemplateColumns: `repeat(${difficulty.cols}, 1fr)`,
                  gap: 3,
                  width: 'fit-content',
                  margin: '0 auto',
                }}>
                  {Array.from({ length: difficulty.cols * difficulty.rows }, (_, i) => {
                    const isEmpty = i === difficulty.cols * difficulty.rows - 1
                    return (
                      <div key={i} style={{
                        width: 36, height: 36,
                        background: isEmpty ? '#090914' : '#252545',
                        border: `1px solid ${isEmpty ? '#1c1c36' : '#4a4a9a'}`,
                        borderRadius: 6,
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        fontSize: isEmpty ? 0 : Math.max(14, 28 - difficulty.cols * 2),
                        position: 'relative',
                      }}>
                        {!isEmpty && TILE_EMOJIS[difficulty.cols][i]}
                        {!isEmpty && (
                          <span style={{
                            position: 'absolute',
                            right: 2, bottom: 1,
                            fontSize: 8,
                            color: 'rgba(255,255,255,0.4)',
                            fontWeight: 'bold',
                            lineHeight: 1,
                          }}>{i + 1}</span>
                        )}
                      </div>
                    )
                  })}
                </div>
              </div>
              {diffPicker}
              <div style={S.bestLine}>🏆 최고 {fmtTime(best)}</div>
              <div style={S.btnGroup}>
                <button style={S.btnPrimary} onClick={startGame}>시작하기</button>
                <button style={S.btnBack2} onClick={onBack}>← 게임 선택</button>
              </div>
            </div>
          </div>
        )}

        {phase === 'win' && (
          <div style={S.overlay}>
            <div style={S.box}>
              <div style={S.oEmoji}>{isNewBest ? '🏆' : '🎉'}</div>
              <div style={S.oTitle}>{isNewBest ? '신기록!' : '완성!'}</div>
              <div style={S.bigScore}>{fmtTime(elapsed)}</div>
              <div style={S.moveInfo}>{moves}번 이동</div>
              <div style={S.bestScore}>최고 {fmtTime(best)}</div>
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
  moveInfo:  { color: '#aaa', fontSize: 'clamp(13px, 2.5vw, 15px)' },
  newBest:   { color: '#FFD700', fontSize: 'clamp(14px, 3vw, 18px)', fontWeight: 'bold' },
  btnGroup:  { display: 'flex', flexDirection: 'column', gap: 8, width: '100%' },
  btnPrimary: { background: 'linear-gradient(135deg, #FFD700, #FFA500)', color: '#1a1a2e', border: 'none', borderRadius: 14, padding: 'clamp(10px, 2vw, 14px) clamp(20px, 4vw, 36px)', fontSize: 'clamp(15px, 3vw, 18px)', fontWeight: 'bold', cursor: 'pointer', boxShadow: '0 4px 20px rgba(255,165,0,0.4)' },
  btnBack2:   { background: 'transparent', color: '#aaa', border: '2px solid #444', borderRadius: 14, padding: 'clamp(8px, 1.5vw, 10px) clamp(16px, 3vw, 24px)', fontSize: 'clamp(13px, 2.5vw, 15px)', fontWeight: 'bold', cursor: 'pointer' },
}
