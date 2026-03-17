import { useState, useRef, useCallback, useEffect } from 'react'
import { getBest, saveBest, getSavedDiff, saveDiff, COLORS } from '../utils/gameUtils'

const GAME_ID = 'memory'

const DIFFS = [
  { id: 'easy',   label: '쉬움',   emoji: '🟢', color: '#4CAF50', speed: 900 },
  { id: 'normal', label: '보통',   emoji: '🟡', color: '#FFC107', speed: 650 },
  { id: 'hard',   label: '어려움', emoji: '🔴', color: '#F44336', speed: 450 },
]

const BTNS = [
  { id: 0, dark: '#5a1212', lit: '#ff4444', glow: '#ff4444', emoji: '🔴', label: '빨강' },
  { id: 1, dark: '#12235a', lit: '#4499ff', glow: '#4499ff', emoji: '🔵', label: '파랑' },
  { id: 2, dark: '#124a22', lit: '#33dd66', glow: '#33dd66', emoji: '🟢', label: '초록' },
  { id: 3, dark: '#4a3a12', lit: '#ffcc22', glow: '#ffcc22', emoji: '🟡', label: '노랑' },
]

const W = 480

export default function MemoryGame({ onBack, onStart }) {
  const [phase, setPhase] = useState('idle') // idle | showing | input | gameover
  const [score, setScore] = useState(0)
  const [best, setBest] = useState(0)
  const [diff, setDiff] = useState(() => getSavedDiff(GAME_ID, DIFFS) ?? DIFFS[1])
  const [litBtn, setLitBtn] = useState(-1)
  const [wrongFlash, setWrongFlash] = useState(false)
  const [inputPos, setInputPos] = useState(0)

  const seqRef = useRef([])
  const inputIdxRef = useRef(0)
  const phaseRef = useRef('idle')
  const timeoutsRef = useRef([])

  useEffect(() => {
    setBest(getBest(GAME_ID, diff.id) ?? 0)
  }, [diff])

  useEffect(() => () => { timeoutsRef.current.forEach(clearTimeout) }, [])

  const addTimeout = (fn, delay) => {
    const id = setTimeout(fn, delay)
    timeoutsRef.current.push(id)
  }
  const clearTimeouts = () => {
    timeoutsRef.current.forEach(clearTimeout)
    timeoutsRef.current = []
  }

  const showSequence = useCallback((seq, speed, onDone) => {
    setPhase('showing')
    phaseRef.current = 'showing'
    setLitBtn(-1)
    setInputPos(0)

    let t = 400
    const onTime = Math.round(speed * 0.55)
    seq.forEach(btnId => {
      addTimeout(() => setLitBtn(btnId), t)
      addTimeout(() => setLitBtn(-1), t + onTime)
      t += speed
    })
    addTimeout(() => {
      setLitBtn(-1)
      onDone()
    }, t + 300)
  }, [])

  const startRound = useCallback((seq, speed) => {
    inputIdxRef.current = 0
    setInputPos(0)
    setScore(seq.length)
    showSequence(seq, speed, () => {
      setPhase('input')
      phaseRef.current = 'input'
    })
  }, [showSequence])

  const startGame = useCallback(() => {
    onStart?.()
    clearTimeouts()
    setWrongFlash(false)
    const firstSeq = [Math.floor(Math.random() * 4)]
    seqRef.current = firstSeq
    startRound(firstSeq, diff.speed)
  }, [diff, startRound, onStart])

  const handleBtnClick = useCallback((btnId) => {
    if (phaseRef.current !== 'input') return

    const expected = seqRef.current[inputIdxRef.current]

    if (btnId !== expected) {
      setWrongFlash(true)
      setLitBtn(btnId)
      const finalScore = seqRef.current.length - 1
      setScore(finalScore)
      setPhase('gameover')
      phaseRef.current = 'gameover'
      const isNew = saveBest(GAME_ID, diff.id, finalScore)
      if (isNew) setBest(finalScore)
      addTimeout(() => { setLitBtn(-1); setWrongFlash(false) }, 600)
      return
    }

    setLitBtn(btnId)
    addTimeout(() => setLitBtn(-1), 180)

    const nextIdx = inputIdxRef.current + 1
    inputIdxRef.current = nextIdx
    setInputPos(nextIdx)

    if (nextIdx >= seqRef.current.length) {
      phaseRef.current = 'showing'
      setPhase('showing')
      const newSeq = [...seqRef.current, Math.floor(Math.random() * 4)]
      seqRef.current = newSeq
      addTimeout(() => startRound(newSeq, diff.speed), 700)
    }
  }, [diff, startRound])

  const changeDiff = (d) => { setDiff(d); saveDiff(GAME_ID, d.id) }

  const isNewBest = score > 0 && score >= best && phase === 'gameover'
  const canClick = phase === 'input'

  const diffPicker = (
    <div>
      <div style={S.label}>난이도</div>
      <div style={S.diffRow}>
        {DIFFS.map(d => (
          <button key={d.id} onClick={() => changeDiff(d)} style={{
            ...S.diffBtn,
            borderColor: diff.id === d.id ? d.color : '#444',
            color:       diff.id === d.id ? d.color : '#888',
            background:  diff.id === d.id ? `${d.color}22` : 'transparent',
          }}>
            {d.emoji} {d.label}
          </button>
        ))}
      </div>
    </div>
  )

  const statusText = {
    showing: '잘 봐요! 👀',
    input:   `따라해봐요! 👆  ${inputPos + 1} / ${seqRef.current.length}`,
    gameover: '',
  }[phase] ?? ''

  return (
    <div style={S.wrapper}>
      <div style={S.topBar}>
        <button style={S.backBtn} onClick={onBack}>← 나가기</button>
      </div>
      <h1 style={S.title}>🧠 기억력 게임</h1>
      <p style={S.subtitle}>{diff.emoji} {diff.label}{phase !== 'idle' ? ` · 라운드 ${score}` : ''}</p>

      <div style={S.gameArea}>
        {/* Grid wrapper — gold border like canvas */}
        <div style={{
          ...S.gridWrapper,
          borderColor: wrongFlash ? '#ff4444' : '#FFD700',
        }}>
          {/* Progress dots */}
          <div style={S.dotsRow}>
            {phase !== 'idle' && seqRef.current.map((btnId, i) => (
              <div key={i} style={{
                width: 10, height: 10, borderRadius: '50%',
                background: i < inputPos
                  ? BTNS[btnId].lit
                  : phase === 'input' && i === inputPos
                    ? '#fff'
                    : '#333',
                transition: 'background 0.2s',
              }} />
            ))}
          </div>

          {/* Status text */}
          <div style={S.statusText}>{statusText}</div>

          {/* 2×2 Button Grid */}
          <div style={S.grid}>
            {BTNS.map(btn => {
              const isLit = litBtn === btn.id
              return (
                <button
                  key={btn.id}
                  onPointerDown={() => handleBtnClick(btn.id)}
                  style={{
                    borderRadius: 20,
                    border: 'none',
                    background: isLit ? btn.lit : btn.dark,
                    boxShadow: isLit ? `0 0 48px 12px ${btn.glow}88` : 'inset 0 4px 12px #0006',
                    fontSize: 'clamp(40px, 10vw, 56px)',
                    cursor: canClick ? 'pointer' : 'default',
                    transition: 'background 0.08s, box-shadow 0.08s, transform 0.08s',
                    aspectRatio: '1',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    userSelect: 'none',
                    WebkitUserSelect: 'none',
                    transform: isLit ? 'scale(1.07)' : 'scale(1)',
                  }}
                >
                  {btn.emoji}
                </button>
              )
            })}
          </div>
        </div>

        {/* Score card */}
        <div style={S.scoreCard}>
          <div style={S.scoreRow}>
            <div style={S.scoreItem}>
              <span style={S.scoreLabel}>라운드</span>
              <span style={S.scoreVal}>{phase !== 'idle' ? score : '-'}</span>
            </div>
            <div style={S.scoreDivider} />
            <div style={S.scoreItem}>
              <span style={S.scoreLabel}>🏆 최고</span>
              <span style={S.scoreBest}>{best}</span>
            </div>
          </div>
        </div>

        {/* Idle overlay */}
        {phase === 'idle' && (
          <div style={S.overlay}>
            <div style={S.box}>
              <div style={S.oTitle}>🧠 기억력 게임</div>
              <div style={S.desc}>
                <p>버튼이 켜지는 순서를 기억하세요!</p>
                <p>순서대로 탭하면 패턴이 길어져요 🔴🔵🟢🟡</p>
              </div>
              {diffPicker}
              <div style={S.bestLine}>🏆 최고 {best}라운드</div>
              <div style={S.btnGroup}>
                <button style={S.btnPrimary} onClick={startGame}>시작하기</button>
                <button style={S.btnBack2} onClick={onBack}>← 게임 선택</button>
              </div>
            </div>
          </div>
        )}

        {/* Gameover overlay */}
        {phase === 'gameover' && (
          <div style={S.overlay}>
            <div style={S.box}>
              <div style={S.oEmoji}>{isNewBest ? '🏆' : '😵'}</div>
              <div style={S.oTitle}>{isNewBest ? '신기록!' : '게임 오버!'}</div>
              <div style={S.bigScore}>{score}라운드</div>
              <div style={S.bestScore}>최고 {best}라운드</div>
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

const S = {
  wrapper: {
    minHeight: '100dvh',
    background: COLORS.bg,
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    justifyContent: 'center',
    padding: 'clamp(8px, 2vw, 16px)',
    boxSizing: 'border-box',
    fontFamily: 'sans-serif',
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
  gridWrapper: {
    background: COLORS.bg,
    border: '4px solid #FFD700',
    borderRadius: '12px 12px 0 0',
    padding: 'clamp(12px, 3vw, 20px)',
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    gap: 10,
    touchAction: 'none',
    userSelect: 'none',
    transition: 'border-color 0.15s',
  },
  dotsRow: {
    display: 'flex',
    gap: 6,
    flexWrap: 'wrap',
    justifyContent: 'center',
    minHeight: 16,
    width: '100%',
  },
  statusText: {
    color: '#aaa',
    fontSize: 'clamp(13px, 2.5vw, 15px)',
    minHeight: 22,
    textAlign: 'center',
  },
  grid: {
    display: 'grid',
    gridTemplateColumns: '1fr 1fr',
    gap: 'clamp(10px, 3vw, 16px)',
    width: '100%',
    aspectRatio: '1',
  },
  scoreCard: {
    background: '#1e1e2e',
    border: '1px solid #333',
    borderTop: 'none',
    borderRadius: '0 0 12px 12px',
    padding: '10px 16px',
    marginBottom: 8,
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
