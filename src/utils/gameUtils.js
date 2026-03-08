/**
 * gameUtils.js — 게임 공통 유틸리티
 *
 * 사용법:
 *   import { getBest, saveBest, getSavedDiff, drawEmoji, COLORS, STYLES } from '../utils/gameUtils'
 */

// ── localStorage 헬퍼 ────────────────────────────────────────────────

/**
 * 베스트 스코어 불러오기
 * @param {string} gameId  - 게임 식별자 (예: 'jump', 'snake')
 * @param {string} diffId  - 난이도 id (예: 'easy', 'normal', 'hard')
 */
export function getBest(gameId, diffId) {
  return Number(localStorage.getItem(`${gameId}_best_${diffId}`) || 0)
}

/**
 * 베스트 스코어 저장. 기존 값보다 클 때만 저장.
 * @returns {boolean} 갱신됐으면 true
 */
export function saveBest(gameId, diffId, score) {
  const key = `${gameId}_best_${diffId}`
  const prev = Number(localStorage.getItem(key) || 0)
  if (score > prev) {
    localStorage.setItem(key, score)
    return true
  }
  return false
}

/**
 * 저장된 난이도 불러오기
 * @param {string} gameId      - 게임 식별자
 * @param {Array}  difficulties - DIFFICULTIES 배열
 * @param {string} fallback    - 없을 때 기본 id (기본: 'normal')
 */
export function getSavedDiff(gameId, difficulties, fallback = 'normal') {
  const id = localStorage.getItem(`${gameId}_diff`)
  return difficulties.find(d => d.id === id) ?? difficulties.find(d => d.id === fallback) ?? difficulties[1]
}

/** 난이도 저장 */
export function saveDiff(gameId, diffId) {
  localStorage.setItem(`${gameId}_diff`, diffId)
}

// ── 캔버스 헬퍼 ─────────────────────────────────────────────────────

/**
 * 이모지를 지정 위치에 그리기
 * @param {CanvasRenderingContext2D} ctx
 * @param {string} emoji
 * @param {number} x, y        - 중심 기준
 * @param {number} size        - 폰트 크기(px)
 * @param {object} [glow]      - { color, blur } 선택적 글로우
 */
export function drawEmoji(ctx, emoji, x, y, size, glow = null) {
  ctx.save()
  if (glow) {
    ctx.shadowColor = glow.color
    ctx.shadowBlur = glow.blur ?? 12
  }
  ctx.font = `${size}px serif`
  ctx.textAlign = 'center'
  ctx.textBaseline = 'middle'
  ctx.fillText(emoji, x, y)
  ctx.restore()
}

/**
 * 텍스트 그리기 (자주 쓰는 설정 한 번에)
 */
export function drawText(ctx, text, x, y, { size = 18, color = '#fff', align = 'center', bold = false, glow = null } = {}) {
  ctx.save()
  if (glow) { ctx.shadowColor = glow.color; ctx.shadowBlur = glow.blur ?? 10 }
  ctx.fillStyle = color
  ctx.font = `${bold ? 'bold ' : ''}${size}px sans-serif`
  ctx.textAlign = align
  ctx.textBaseline = 'middle'
  ctx.fillText(text, x, y)
  ctx.restore()
}

/**
 * 둥근 사각형 채우기 (ctx.roundRect 미지원 환경 대비)
 */
export function fillRoundRect(ctx, x, y, w, h, r, color) {
  ctx.save()
  ctx.fillStyle = color
  ctx.beginPath()
  if (ctx.roundRect) {
    ctx.roundRect(x, y, w, h, r)
  } else {
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
  ctx.fill()
  ctx.restore()
}

/**
 * 원 채우기 단축
 */
export function fillCircle(ctx, x, y, r, color) {
  ctx.save()
  ctx.fillStyle = color
  ctx.beginPath()
  ctx.arc(x, y, r, 0, Math.PI * 2)
  ctx.fill()
  ctx.restore()
}

// ── 수학/물리 헬퍼 ──────────────────────────────────────────────────

/** 두 점 사이 거리 */
export function dist(x1, y1, x2, y2) {
  const dx = x1 - x2, dy = y1 - y2
  return Math.sqrt(dx * dx + dy * dy)
}

/** min~max 사이 랜덤 정수 */
export function randInt(min, max) {
  return Math.floor(Math.random() * (max - min + 1)) + min
}

/** 값을 [min, max] 범위로 클램프 */
export function clamp(v, min, max) {
  return v < min ? min : v > max ? max : v
}

/** AABB 충돌 (rect: { x, y, w, h }) */
export function hitRect(a, b) {
  return a.x < b.x + b.w && a.x + a.w > b.x && a.y < b.y + b.h && a.y + a.h > b.y
}

/** 원형 충돌 */
export function hitCircle(x1, y1, r1, x2, y2, r2) {
  return dist(x1, y1, x2, y2) < r1 + r2
}

// ── 디자인 토큰 ──────────────────────────────────────────────────────

export const COLORS = {
  bg:     '#0f0f1e',   // 전체 배경
  card:   '#1e1e2e',   // 카드/패널 배경
  border: '#333333',   // 테두리
  gold:   '#FFD700',   // 강조 (점수, 타이틀)
  muted:  '#888888',   // 보조 텍스트
}

// ── 공통 스타일 프리셋 ───────────────────────────────────────────────

export const STYLES = {
  /** 게임 루트 컨테이너 */
  root: {
    minHeight: '100dvh',
    background: COLORS.bg,
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    padding: '12px 8px',
    color: '#fff',
    fontFamily: 'sans-serif',
  },
  /** 상단 헤더 행 */
  header: {
    width: '100%',
    maxWidth: 820,
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 8,
  },
  /** 뒤로가기 버튼 */
  backBtn: {
    background: 'none',
    border: `1px solid ${COLORS.border}`,
    color: COLORS.muted,
    borderRadius: 8,
    padding: '6px 14px',
    cursor: 'pointer',
    fontSize: 14,
  },
  /** 게임 타이틀 */
  title: {
    fontSize: 'clamp(16px, 4vw, 22px)',
    fontWeight: 'bold',
    color: COLORS.gold,
    textShadow: `0 0 10px ${COLORS.gold}`,
  },
  /** 난이도 버튼 행 */
  diffRow: {
    display: 'flex',
    gap: 8,
    marginBottom: 8,
  },
  /** 난이도 버튼 기본 (선택 시 borderColor/color 오버라이드) */
  diffBtn: {
    background: COLORS.card,
    border: `2px solid ${COLORS.border}`,
    color: COLORS.muted,
    borderRadius: 10,
    padding: '6px 14px',
    cursor: 'pointer',
    fontSize: 14,
    transition: 'border-color 0.2s, color 0.2s',
  },
  /** 캔버스 래퍼 */
  wrap: {
    position: 'relative',
    width: '100%',
    maxWidth: 820,
    cursor: 'pointer',
  },
  /** 캔버스 */
  canvas: {
    width: '100%',
    height: 'auto',
    display: 'block',
    borderRadius: 12,
    border: `2px solid ${COLORS.border}`,
  },
  /** 반투명 오버레이 (idle/gameover) */
  overlay: {
    position: 'absolute',
    inset: 0,
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    justifyContent: 'center',
    background: 'rgba(0,0,0,0.65)',
    borderRadius: 12,
    gap: 12,
  },
  overlayTitle: { fontSize: 'clamp(24px, 6vw, 40px)', fontWeight: 'bold' },
  overlayScore: { fontSize: 'clamp(18px, 4vw, 28px)', color: COLORS.gold },
  overlayHint:  { fontSize: 14, color: COLORS.muted },
  /** 인게임 HUD */
  hud: {
    position: 'absolute',
    top: 12,
    right: 16,
    fontSize: 18,
    fontWeight: 'bold',
    color: '#fff',
    textShadow: '0 1px 4px #000',
  },
}
