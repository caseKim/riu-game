/**
 * GameTemplate.jsx — 새 게임 시작용 스켈레톤
 *
 * 사용법:
 *   1. 이 파일을 복사 → YourGame.jsx
 *   2. TODO 주석 찾아서 채우기
 *   3. GameSelect.jsx GAMES 배열에 항목 추가
 *   4. App.jsx에 import + 조건부 렌더링 추가
 */

import { useEffect, useRef, useState } from 'react'
import { getBest, saveBest, getSavedDiff, saveDiff, drawEmoji } from '../utils/gameUtils'

// ── 상수 ────────────────────────────────────────────────────────────
const W = 800          // TODO: 캔버스 가로
const H = 500          // TODO: 캔버스 세로
const GAME_ID = 'template'  // TODO: 게임 고유 ID (localStorage 키에 사용)

const DIFFICULTIES = [
  { id: 'easy',   label: '쉬움',   emoji: '🌱', color: '#4CAF50' },
  { id: 'normal', label: '보통',   emoji: '⚡', color: '#FFD700' },
  { id: 'hard',   label: '어려움', emoji: '🔥', color: '#F44336' },
]

// TODO: 난이도별 수치 조정
const DIFF_SETTINGS = {
  easy:   { speed: 3 },
  normal: { speed: 5 },
  hard:   { speed: 8 },
}

// ── 초기 게임 상태 ───────────────────────────────────────────────────
function makeInitialState(diff) {
  return {
    // TODO: 게임 오브젝트 추가
    player: { x: W / 2, y: H / 2 },
    score: 0,
    frame: 0,
    speed: diff.speed,
  }
}

// ── 메인 컴포넌트 ────────────────────────────────────────────────────
export default function GameTemplate({ onBack }) {
  const [difficulty, setDifficulty] = useState(() => getSavedDiff(GAME_ID, DIFFICULTIES))
  const diff = DIFF_SETTINGS[difficulty.id]

  // UI 전용 state
  const [phase, setPhase] = useState('idle')   // 'idle' | 'playing' | 'gameover'
  const [score, setScore] = useState(0)
  const [best, setBest]   = useState(() => getBest(GAME_ID, difficulty.id))

  // Refs
  const canvasRef     = useRef(null)
  const wrapRef       = useRef(null)
  const animRef       = useRef(null)
  const stateRef      = useRef(null)
  const gameOverAtRef = useRef(0)

  if (stateRef.current == null) stateRef.current = makeInitialState(diff)

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
      s.frame++

      // TODO: 게임 로직 업데이트
      update()

      // TODO: 충돌 판정
      const dead = checkCollision()
      if (dead) {
        gameOverAtRef.current = Date.now()
        if (saveBest(GAME_ID, difficulty.id, s.score)) setBest(s.score)
        setPhase('gameover')
        return
      }

      setScore(s.score)
      draw(ctx, s)
    }

    animRef.current = requestAnimationFrame(loop)
    return () => { alive = false; cancelAnimationFrame(animRef.current) }
  }, [phase, difficulty])

  // ── 재시작 ────────────────────────────────────────────────────────
  function startGame() {
    if (Date.now() - gameOverAtRef.current < 800) return
    stateRef.current = makeInitialState(diff)
    setScore(0)
    setBest(getBest(GAME_ID, difficulty.id))
    setPhase('playing')
  }

  // ── 난이도 변경 ───────────────────────────────────────────────────
  function changeDiff(d) {
    saveDiff(GAME_ID, d.id)
    setDifficulty(d)
    setBest(getBest(GAME_ID, d.id))
    stateRef.current = makeInitialState(DIFF_SETTINGS[d.id])
    setPhase('idle')
  }

  // ── 입력: 키보드 ──────────────────────────────────────────────────
  useEffect(() => {
    function onKey(e) {
      if (e.code === 'Space' || e.code === 'ArrowUp') {
        e.preventDefault()
        if (phase !== 'playing') { startGame(); return }
        handleAction()  // TODO: 플레이 중 액션 (점프 등)
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [phase]) // eslint-disable-line react-hooks/exhaustive-deps

  // ── 입력: 터치/클릭 ───────────────────────────────────────────────
  useEffect(() => {
    const el = wrapRef.current
    if (!el) return
    function onTouch(e) {
      if (e.target.closest('button')) return
      e.preventDefault()
      if (phase !== 'playing') { startGame(); return }
      handleAction()  // TODO: 플레이 중 액션
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
      <h1 style={S.title}>🎮 게임 이름</h1>{/* TODO: 게임 이름 */}
      <p style={S.subtitle}>{difficulty.emoji} {difficulty.label} · {score}점</p>

      <div ref={wrapRef} style={S.gameArea}>
        <canvas ref={canvasRef} width={W} height={H} style={S.canvas} />

        {/* 스코어카드 */}
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

        {/* 인게임 HUD */}
        {phase === 'playing' && (
          <div style={S.hudScore}>{score}점</div>
        )}

        {/* 시작 오버레이 */}
        {phase === 'idle' && (
          <div style={S.overlay}>
            <div style={S.box}>
              <div style={S.oTitle}>🎮 게임 이름</div>{/* TODO */}
              <div style={S.desc}>
                {/* TODO: 게임 설명 */}
                <p>게임 설명을 여기에 써주세요</p>
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

        {/* 게임오버 오버레이 */}
        {phase === 'gameover' && (
          <div style={S.overlay}>
            <div style={S.box}>
              <div style={S.oEmoji}>{isNewBest ? '🏆' : '😵'}</div>
              <div style={S.oTitle}>{isNewBest ? '신기록!' : '게임 오버!'}</div>
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

// ── 게임 로직 (컴포넌트 밖) ──────────────────────────────────────────

function handleAction() {
  // TODO: 점프, 발사 등 플레이어 액션
}

function update() {
  // TODO: 매 프레임 오브젝트 이동, 스폰, 점수 증가 등
}

function checkCollision() {
  // TODO: 충돌 감지. 죽으면 true 반환
  return false
}

function draw(ctx, s) {
  ctx.fillStyle = '#0f0f1e'
  ctx.fillRect(0, 0, W, H)
  // TODO: 오브젝트 그리기
  drawEmoji(ctx, '🎮', s.player.x, s.player.y, 40)
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
