const GAMES = [
  {
    id: 'jump',
    emoji: '🏃',
    name: '점프 게임',
    desc: '장애물을 피해 달려요!',
    available: true,
  },
  {
    id: 'snake',
    emoji: '🐍',
    name: '뱀 게임',
    desc: '더 작은 뱀을 잡아먹어요!',
    available: true,
  },
  {
    id: 'space',
    emoji: '🚀',
    name: '우주 슈팅',
    desc: '외계인을 물리쳐요!',
    available: true,
  },
  {
    id: 'match',
    emoji: '💎',
    name: '보석 맞추기',
    desc: '보석 3개를 맞춰요!',
    available: true,
  },
  {
    id: 'platform',
    emoji: '🐸',
    name: '플랫폼 점프',
    desc: '발판을 밟고 높이 올라가요!',
    available: true,
  },
  {
    id: 'fishing',
    emoji: '🎣',
    name: '낚시 게임',
    desc: '물고기를 낚아보세요!',
    available: true,
  },
  {
    id: 'wave',
    emoji: '🌊',
    name: '파도 피하기',
    desc: '파도 사이를 헤쳐나가요!',
    available: true,
  },
  {
    id: 'mole',
    emoji: '🐭',
    name: '두더지 잡기',
    desc: '두더지를 빠르게 탭해요!',
    available: true,
  },
  {
    id: 'maze',
    emoji: '🌀',
    name: '미로 탈출',
    desc: '출구를 찾아 탈출해요!',
    available: true,
  },
  {
    id: 'triple',
    emoji: '🃏',
    name: '세 장 모으기',
    desc: '같은 카드 3장을 모아요!',
    available: true,
  },
  {
    id: 'catch',
    emoji: '🧺',
    name: '낙하물 받기',
    desc: '바구니로 과일을 받아요!',
    available: true,
  },
  {
    id: 'memory',
    emoji: '🧠',
    name: '기억력 게임',
    desc: '순서를 기억하고 따라해요!',
    available: true,
  },
  {
    id: 'drawing',
    emoji: '🎨',
    name: '그림 그리기',
    desc: '멋진 그림을 그려요!',
    available: false,
  },
]

export default function GameSelect({ onSelect }) {
  return (
    <div style={s.wrapper}>
      <h1 style={s.title}>🎮 리우의 게임방</h1>
      <p style={s.subtitle}>어떤 게임을 할까요?</p>

      <div style={s.grid}>
        {GAMES.map((game) => (
          <button
            key={game.id}
            style={{
              ...s.card,
              ...(game.available ? s.cardAvailable : s.cardLocked),
            }}
            onClick={() => game.available && onSelect(game.id)}
            disabled={!game.available}
          >
            {!game.available && <div style={s.lockBadge}>🔒 준비 중</div>}
            <span style={{ ...s.cardEmoji, opacity: game.available ? 1 : 0.4 }}>
              {game.emoji}
            </span>
            <span style={{ ...s.cardName, color: game.available ? '#FFD700' : '#555' }}>
              {game.name}
            </span>
            <span style={{ ...s.cardDesc, color: game.available ? '#aaa' : '#444' }}>
              {game.desc}
            </span>
          </button>
        ))}
      </div>
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
    padding: 'clamp(16px, 5vw, 32px)',
    boxSizing: 'border-box',
  },
  title: {
    fontSize: 'clamp(28px, 8vw, 48px)',
    color: '#FFD700',
    margin: '0 0 8px',
    textShadow: '0 2px 18px rgba(255,215,0,0.45)',
    textAlign: 'center',
  },
  subtitle: {
    fontSize: 'clamp(14px, 3.5vw, 18px)',
    color: '#aaa',
    margin: '0 0 32px',
  },
  grid: {
    display: 'grid',
    gridTemplateColumns: 'repeat(3, minmax(0, 1fr))',
    gap: 'clamp(8px, 2vw, 14px)',
    width: '100%',
    maxWidth: 600,
  },
  card: {
    position: 'relative',
    padding: 'clamp(14px, 3.5vw, 24px) clamp(8px, 2vw, 14px)',
    background: '#1e1e2e',
    border: '2px solid #333',
    borderRadius: 18,
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    gap: 8,
    transition: 'all 0.15s',
    cursor: 'pointer',
  },
  cardAvailable: {
    border: '2px solid #444',
    cursor: 'pointer',
  },
  cardLocked: {
    cursor: 'default',
    opacity: 0.7,
  },
  lockBadge: {
    position: 'absolute',
    top: 10,
    right: 10,
    fontSize: 'clamp(9px, 2vw, 11px)',
    color: '#666',
    background: '#111',
    border: '1px solid #333',
    borderRadius: 20,
    padding: '2px 8px',
    fontWeight: 'bold',
  },
  cardEmoji: {
    fontSize: 'clamp(30px, 7vw, 44px)',
    lineHeight: 1,
  },
  cardName: {
    fontSize: 'clamp(15px, 3.5vw, 20px)',
    fontWeight: 'bold',
  },
  cardDesc: {
    fontSize: 'clamp(11px, 2.5vw, 14px)',
    textAlign: 'center',
  },
}
