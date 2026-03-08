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
import { getBest, saveBest, getSavedDiff, saveDiff, drawEmoji, STYLES } from '../utils/gameUtils'

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

  // UI 전용 state (phase, score, best만)
  const [phase, setPhase] = useState('idle')   // 'idle' | 'playing' | 'gameover'
  const [score, setScore] = useState(0)
  const [best, setBest] = useState(() => getBest(GAME_ID, difficulty.id))

  // Refs
  const canvasRef = useRef(null)
  const wrapRef = useRef(null)
  const animRef = useRef(null)
  const stateRef = useRef(null)
  const gameOverAtRef = useRef(0)   // 재시작 쿨다운용

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
        const now = Date.now()
        gameOverAtRef.current = now
        const finalScore = s.score
        if (saveBest(GAME_ID, difficulty.id, finalScore)) {
          setBest(finalScore)
        }
        setPhase('gameover')
        return
      }

      setScore(s.score)
      draw(ctx, s)
    }

    animRef.current = requestAnimationFrame(loop)
    return () => {
      alive = false
      cancelAnimationFrame(animRef.current)
    }
  }, [phase, difficulty])

  // ── 재시작 ────────────────────────────────────────────────────────
  function startGame() {
    if (Date.now() - gameOverAtRef.current < 800) return  // 쿨다운
    stateRef.current = makeInitialState(diff)
    setScore(0)
    setBest(getBest(difficulty.id))
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
        if (phase === 'idle' || phase === 'gameover') startGame()
        else handleAction()  // TODO: 플레이 중 액션 (점프 등)
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
      e.preventDefault()
      if (phase === 'idle' || phase === 'gameover') startGame()
      else handleAction()  // TODO: 플레이 중 액션
    }
    el.addEventListener('touchstart', onTouch, { passive: false })
    el.addEventListener('click', onTouch)
    return () => {
      el.removeEventListener('touchstart', onTouch)
      el.removeEventListener('click', onTouch)
    }
  }, [phase]) // eslint-disable-line react-hooks/exhaustive-deps

  // ── 렌더 ─────────────────────────────────────────────────────────
  return (
    <div style={S.root}>
      {/* 헤더 */}
      <div style={S.header}>
        <button style={S.backBtn} onClick={onBack}>← 뒤로</button>
        <span style={S.title}>🎮 게임 이름</span>{/* TODO: 게임 이름 */}
        <span style={S.bestText}>최고: {best}</span>
      </div>

      {/* 난이도 선택 */}
      <div style={S.diffRow}>
        {DIFFICULTIES.map(d => (
          <button
            key={d.id}
            style={{ ...S.diffBtn, ...(difficulty.id === d.id ? { borderColor: d.color, color: d.color } : {}) }}
            onClick={() => changeDiff(d)}
          >
            {d.emoji} {d.label}
          </button>
        ))}
      </div>

      {/* 캔버스 영역 */}
      <div ref={wrapRef} style={S.wrap}>
        <canvas ref={canvasRef} width={W} height={H} style={S.canvas} />

        {/* 시작 오버레이 */}
        {phase === 'idle' && (
          <div style={S.overlay}>
            <div style={S.overlayTitle}>🎮 게임 이름</div>{/* TODO */}
            <div style={S.overlayHint}>탭 / 스페이스로 시작</div>
          </div>
        )}

        {/* 게임오버 오버레이 */}
        {phase === 'gameover' && (
          <div style={S.overlay}>
            <div style={S.overlayTitle}>💀 게임 오버</div>
            <div style={S.overlayScore}>점수: {score}</div>
            <div style={S.overlayHint}>탭 / 스페이스로 재시작</div>
          </div>
        )}

        {/* 인게임 HUD */}
        {phase === 'playing' && (
          <div style={S.hud}>
            <span>점수: {score}</span>
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
  // 배경 지우기
  ctx.fillStyle = '#0f0f1e'
  ctx.fillRect(0, 0, W, H)

  // TODO: 오브젝트 그리기
  drawEmoji(ctx, '🎮', s.player.x, s.player.y, 40)
}

// ── 스타일 (공통은 STYLES에서, 게임 고유 스타일만 여기에) ────────────
const S = {
  ...STYLES,
  bestText: { fontSize: 14, color: '#888' },
}
