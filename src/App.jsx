import { useState, useEffect, useCallback } from 'react'
import { initVersionCheck, checkVersion } from './useVersionCheck'
import { COLORS } from './utils/gameUtils'
import GameSelect from './components/GameSelect'
import JumpGame from './components/JumpGame'
import SnakeGame from './components/SnakeGame'
import SpaceGame from './components/SpaceGame'
import MatchGame from './components/MatchGame'
import PlatformGame from './components/PlatformGame'
import FishingGame from './components/FishingGame'
import WaveGame from './components/WaveGame'
import WhackGame from './components/WhackGame'
import MazeGame from './components/MazeGame'

export default function App() {
  const [gameId, setGameId] = useState(null)
  const [hasUpdate, setHasUpdate] = useState(false)

  useEffect(() => {
    initVersionCheck(() => setHasUpdate(true))
    checkVersion()
  }, [])

  const updateBanner = hasUpdate ? (
    <div
      onClick={() => location.reload()}
      style={{
        position: 'fixed', top: 0, left: 0, right: 0, zIndex: 9999,
        background: COLORS.gold, color: COLORS.bg,
        textAlign: 'center', padding: '10px',
        fontWeight: 'bold', fontSize: '15px', cursor: 'pointer',
      }}
    >
      🆕 새 버전이 있어요! 탭해서 업데이트
    </div>
  ) : null

  const back = useCallback(() => { checkVersion(); setGameId(null) }, [])
  const select = useCallback((id) => { checkVersion(); setGameId(id) }, [])
  const gameProps = { onBack: back, onStart: checkVersion }
  let screen
  if (!gameId)              screen = <GameSelect onSelect={select} />
  else if (gameId === 'snake')    screen = <SnakeGame {...gameProps} />
  else if (gameId === 'space')    screen = <SpaceGame {...gameProps} />
  else if (gameId === 'match')    screen = <MatchGame {...gameProps} />
  else if (gameId === 'platform') screen = <PlatformGame {...gameProps} />
  else if (gameId === 'fishing')  screen = <FishingGame {...gameProps} />
  else if (gameId === 'wave')     screen = <WaveGame {...gameProps} />
  else if (gameId === 'mole')     screen = <WhackGame {...gameProps} />
  else if (gameId === 'maze')     screen = <MazeGame {...gameProps} />
  else                            screen = <JumpGame {...gameProps} />

  return <>{updateBanner}{screen}</>
}
