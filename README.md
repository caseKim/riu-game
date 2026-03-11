# 리우 게임 🎮

초등학교 1학년 리우와 함께 만드는 미니게임 모음입니다.

## 게임 목록

| 게임 | 설명 |
|------|------|
| 🦘 점프 게임 | 장애물을 피해 달리는 러너 게임 |
| 🐍 뱀 게임 | 2400×2400 월드에서 AI 뱀들과 경쟁 |
| 🚀 우주 게임 | 웨이브 방식의 슈팅 게임 |
| 💎 매치 게임 | 제한 횟수 안에 보석을 맞추는 퍼즐 |
| 🐸 플랫폼 게임 | Doodle Jump 스타일의 점프 게임 |
| 🎣 낚시 게임 | 타이밍 맞춰 물고기를 낚는 게임 |
| 🌊 파도 피하기 | 밀려오는 파도를 피하는 게임 |
| 🦔 두더지 잡기 | 두더지가 나타나면 빠르게 잡는 게임 |

## 개발

```bash
npm run dev      # 개발 서버 (http://localhost:5173)
npm run build    # 프로덕션 빌드
npm run preview  # 빌드 결과 미리보기
npm run lint     # ESLint 검사
```

## 기술 스택

- React 19 + Vite
- 인라인 스타일 (CSS 없음)
- canvas API 기반 게임 루프
- localStorage 점수/설정 저장

## 새 게임 추가 방법

1. `src/components/GameTemplate.jsx` 복사 → `YourGame.jsx`
2. 6개 TODO 채우기 (GAME_ID, 캔버스 크기, 난이도, 업데이트/충돌/그리기 로직)
3. `GameSelect.jsx`의 `GAMES` 배열에 항목 추가 (`available: true`)
4. `App.jsx`에 import + `gameId === 'your-id'` 분기 추가
5. `startGame()` 안에 `onStart?.()` 호출 포함 (버전 체크 연동)
