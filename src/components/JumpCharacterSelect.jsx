import { useState } from 'react'

const CHARACTERS = {
  animals: [
    { id: 'rabbit',  emoji: '🐰', name: '토끼' },
    { id: 'cat',     emoji: '🐱', name: '고양이' },
    { id: 'fox',     emoji: '🦊', name: '여우' },
    { id: 'panda',   emoji: '🐼', name: '판다' },
    { id: 'tiger',   emoji: '🐯', name: '호랑이' },
    { id: 'frog',    emoji: '🐸', name: '개구리' },
    { id: 'bear',    emoji: '🐻', name: '곰' },
    { id: 'dog',     emoji: '🐶', name: '강아지' },
  ],
  heroes: [
    { id: 'superhero', emoji: '🦸', name: '슈퍼히어로' },
    { id: 'wizard',    emoji: '🧙', name: '마법사' },
    { id: 'ninja',     emoji: '🥷', name: '닌자' },
    { id: 'prince',    emoji: '🤴', name: '왕자' },
    { id: 'princess',  emoji: '👸', name: '공주' },
    { id: 'unicorn',   emoji: '🦄', name: '유니콘' },
    { id: 'dragon',    emoji: '🐉', name: '드래곤' },
    { id: 'robot',     emoji: '🤖', name: '로봇' },
  ],
}

const DIFFICULTIES = [
  { id: 'easy',   label: '쉬움',   emoji: '🌱', desc: '천천히 시작해요',   color: '#4CAF50', glow: 'rgba(76,175,80,0.35)' },
  { id: 'normal', label: '보통',   emoji: '⚡', desc: '적당히 도전해요',   color: '#FFD700', glow: 'rgba(255,215,0,0.35)' },
  { id: 'hard',   label: '어려움', emoji: '🔥', desc: '최고를 노려봐요!', color: '#F44336', glow: 'rgba(244,67,54,0.35)' },
]

function getBest(diffId) {
  return Number(localStorage.getItem(`best_${diffId}`) || 0)
}

export default function CharacterSelect({ onSelect, onBack }) {
  const [tab, setTab] = useState('animals')
  const [character, setCharacter] = useState(CHARACTERS.animals[0])
  const [difficulty, setDifficulty] = useState(DIFFICULTIES[1])
  const [bests, setBests] = useState(() => ({
    easy:   getBest('easy'),
    normal: getBest('normal'),
    hard:   getBest('hard'),
  }))

  return (
    <div style={s.wrapper}>
      {onBack && (
        <div style={s.topBar}>
          <button style={s.backBtn} onClick={onBack}>← 게임 선택</button>
        </div>
      )}
      <h1 style={s.title}>🏃 점프 게임!</h1>

      {/* 캐릭터 선택 */}
      <p style={s.sectionLabel}>캐릭터를 골라봐요!</p>
      <div style={s.tabs}>
        <button
          style={{ ...s.tab, ...(tab === 'animals' ? s.tabActive : {}) }}
          onClick={() => setTab('animals')}
        >
          🐾 동물
        </button>
        <button
          style={{ ...s.tab, ...(tab === 'heroes' ? s.tabActive : {}) }}
          onClick={() => setTab('heroes')}
        >
          ⚔️ 영웅
        </button>
      </div>

      <div style={s.grid}>
        {CHARACTERS[tab].map((char) => {
          const isSelected = character.id === char.id
          return (
            <button
              key={char.id}
              style={{ ...s.card, ...(isSelected ? s.cardSelected : {}) }}
              onClick={() => setCharacter(char)}
            >
              <span style={s.cardEmoji}>{char.emoji}</span>
              <span style={s.cardName}>{char.name}</span>
              {isSelected && <span style={s.check}>✓</span>}
            </button>
          )
        })}
      </div>

      {/* 난이도 선택 */}
      <p style={s.sectionLabel}>난이도를 골라봐요!</p>
      <div style={s.diffRow}>
        {DIFFICULTIES.map((d) => {
          const isSelected = difficulty.id === d.id
          return (
            <button
              key={d.id}
              style={{
                ...s.diffCard,
                ...(isSelected ? {
                  border: `2px solid ${d.color}`,
                  background: '#1e1e2e',
                  boxShadow: `0 0 16px ${d.glow}`,
                  transform: 'scale(1.06)',
                } : {}),
              }}
              onClick={() => setDifficulty(d)}
            >
              <span style={s.diffEmoji}>{d.emoji}</span>
              <span style={{ ...s.diffLabel, color: isSelected ? d.color : '#ccc' }}>{d.label}</span>
              <span style={s.diffDesc}>{d.desc}</span>
              <span style={{ ...s.diffBest, color: bests[d.id] > 0 ? d.color : '#555' }}>
                🏆 {bests[d.id] > 0 ? bests[d.id] : '-'}
              </span>
              {isSelected && <span style={{ ...s.check, color: d.color }}>✓</span>}
            </button>
          )
        })}
      </div>

      {/* 미리보기 */}
      <div style={{ ...s.preview, borderColor: difficulty.color }}>
        <span style={s.previewEmoji}>{character.emoji}</span>
        <div>
          <div style={{ ...s.previewName, color: difficulty.color }}>{character.name}</div>
          <div style={s.previewDiff}>{difficulty.emoji} {difficulty.label} 모드</div>
        </div>
      </div>

      <button style={s.startBtn} onClick={() => {
        // 게임에서 돌아올 때 최신 기록 반영
        setBests({ easy: getBest('easy'), normal: getBest('normal'), hard: getBest('hard') })
        onSelect({ character, difficulty })
      }}>
        게임 시작! 🚀
      </button>
    </div>
  )
}

const s = {
  wrapper: {
    minHeight: '100vh',
    background: '#0f0f1e',
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    justifyContent: 'center',
    fontFamily: '"Segoe UI", sans-serif',
    padding: 'clamp(12px, 4vw, 24px)',
    boxSizing: 'border-box',
    width: '100%',
    gap: 0,
  },
  title: {
    fontSize: 'clamp(26px, 7vw, 44px)',
    color: '#FFD700',
    margin: '0 0 16px',
    textShadow: '0 2px 14px rgba(255,215,0,0.4)',
  },
  sectionLabel: {
    fontSize: 'clamp(14px, 3.5vw, 18px)',
    color: '#aaa',
    margin: '0 0 10px',
  },
  tabs: {
    display: 'flex',
    gap: 12,
    marginBottom: 14,
  },
  tab: {
    padding: 'clamp(6px, 1.5vw, 8px) clamp(14px, 4vw, 24px)',
    fontSize: 'clamp(13px, 3vw, 16px)',
    fontWeight: 'bold',
    borderRadius: 30,
    border: '2px solid #444',
    background: 'transparent',
    color: '#aaa',
    cursor: 'pointer',
  },
  tabActive: {
    background: '#FFD700',
    borderColor: '#FFD700',
    color: '#222',
  },
  grid: {
    display: 'grid',
    gridTemplateColumns: 'repeat(4, minmax(0, 1fr))',
    gap: 'clamp(6px, 2vw, 12px)',
    marginBottom: 20,
    width: '100%',
    maxWidth: 520,
  },
  card: {
    position: 'relative',
    padding: 'clamp(8px, 2vw, 14px) 4px clamp(6px, 1.5vw, 10px)',
    background: '#1e1e2e',
    border: '2px solid #333',
    borderRadius: 14,
    cursor: 'pointer',
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    gap: 4,
    transition: 'all 0.15s',
  },
  cardSelected: {
    border: '2px solid #FFD700',
    background: '#2a2a1a',
    transform: 'scale(1.07)',
    boxShadow: '0 0 16px rgba(255,215,0,0.35)',
  },
  cardEmoji: { fontSize: 'clamp(24px, 6vw, 40px)', lineHeight: 1 },
  cardName: { fontSize: 'clamp(10px, 2.2vw, 13px)', color: '#ccc', fontWeight: 'bold' },
  check: {
    position: 'absolute',
    top: 4,
    right: 6,
    fontSize: 11,
    color: '#FFD700',
    fontWeight: 'bold',
  },
  diffRow: {
    display: 'flex',
    flexWrap: 'wrap',
    justifyContent: 'center',
    gap: 'clamp(8px, 2.5vw, 14px)',
    marginBottom: 18,
    width: '100%',
    maxWidth: 520,
  },
  diffCard: {
    position: 'relative',
    flex: '1 1 clamp(90px, 25vw, 140px)',
    maxWidth: 160,
    padding: 'clamp(10px, 2vw, 14px) clamp(8px, 2vw, 12px)',
    background: '#1e1e2e',
    border: '2px solid #333',
    borderRadius: 14,
    cursor: 'pointer',
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    gap: 4,
    transition: 'all 0.15s',
  },
  diffEmoji: { fontSize: 'clamp(22px, 5vw, 32px)' },
  diffLabel: { fontSize: 'clamp(13px, 3vw, 17px)', fontWeight: 'bold', color: '#ccc' },
  diffDesc: { fontSize: 'clamp(10px, 2vw, 12px)', color: '#777', textAlign: 'center' },
  diffBest: { fontSize: 'clamp(11px, 2.2vw, 13px)', fontWeight: 'bold', marginTop: 2 },
  preview: {
    display: 'flex',
    alignItems: 'center',
    gap: 14,
    background: '#1e1e2e',
    border: '2px solid #FFD700',
    borderRadius: 16,
    padding: 'clamp(10px, 2vw, 12px) clamp(16px, 4vw, 28px)',
    marginBottom: 18,
    transition: 'border-color 0.2s',
    maxWidth: 520,
    width: '100%',
    boxSizing: 'border-box',
  },
  previewEmoji: { fontSize: 'clamp(32px, 8vw, 48px)' },
  previewName: { fontSize: 'clamp(15px, 4vw, 20px)', fontWeight: 'bold', color: '#FFD700' },
  previewDiff: { fontSize: 'clamp(12px, 2.5vw, 14px)', color: '#aaa', marginTop: 2 },
  topBar: {
    width: '100%',
    maxWidth: 520,
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
  startBtn: {
    padding: 'clamp(12px, 3vw, 16px) clamp(28px, 8vw, 48px)',
    fontSize: 'clamp(18px, 4.5vw, 24px)',
    fontWeight: 'bold',
    borderRadius: 14,
    border: 'none',
    background: 'linear-gradient(135deg, #FFD700, #FFA500)',
    color: '#222',
    cursor: 'pointer',
    boxShadow: '0 4px 20px rgba(255,165,0,0.4)',
    width: '100%',
    maxWidth: 320,
  },
}
