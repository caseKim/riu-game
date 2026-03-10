# 리우의 게임방

리우와 함께 만드는 미니게임 모음입니다.

## 게임 목록

| 게임 | 설명 |
|------|------|
| 🏃 점프 게임 | 장애물을 피해 달리기, 과일 먹기 |
| 🐍 뱀 게임 | AI 뱀을 잡아먹고 성장하기 |
| 🚀 우주 슈팅 | 웨이브·보스를 물리치는 슈팅 |
| 💎 보석 맞추기 | 3개 이상 같은 보석 맞추기 |
| 🐸 플랫폼 점프 | 발판을 밟고 높이 올라가기 (Doodle Jump 스타일) |

## 개발

```bash
npm install
npm run dev      # http://localhost:5173
npm run build
npm run lint
```

## 새 게임 추가하기

1. `src/components/GameSelect.jsx` — `GAMES` 배열에 항목 추가 (`available: true`)
2. `src/components/YourGame.jsx` — `{ onBack }` prop을 받는 컴포넌트 작성
3. `src/App.jsx` — import 후 `if (gameId === 'your-id')` 분기 추가

## 기술 스택

- React + Vite
- 전체 인라인 스타일 (CSS 모듈·Tailwind 없음)
- 라우터 없음 — `App.jsx`의 `gameId` state로 화면 전환
- 게임 루프: `requestAnimationFrame` + `stateRef` (리렌더링 최소화)
- 최고점수: `localStorage` 저장
