import { useState } from 'react'
import GameSelect from './components/GameSelect'
import JumpGame from './components/JumpGame'
import SnakeGame from './components/SnakeGame'
import SpaceGame from './components/SpaceGame'
import MatchGame from './components/MatchGame'
import PlatformGame from './components/PlatformGame'
import FishingGame from './components/FishingGame'
import WaveGame from './components/WaveGame'

export default function App() {
  const [gameId, setGameId] = useState(null)

  if (!gameId) {
    return <GameSelect onSelect={setGameId} />
  }

  if (gameId === 'snake') {
    return <SnakeGame onBack={() => setGameId(null)} />
  }

  if (gameId === 'space') {
    return <SpaceGame onBack={() => setGameId(null)} />
  }

  if (gameId === 'match') {
    return <MatchGame onBack={() => setGameId(null)} />
  }

  if (gameId === 'platform') {
    return <PlatformGame onBack={() => setGameId(null)} />
  }

  if (gameId === 'fishing') {
    return <FishingGame onBack={() => setGameId(null)} />
  }

  if (gameId === 'wave') {
    return <WaveGame onBack={() => setGameId(null)} />
  }

  return <JumpGame onBack={() => setGameId(null)} />
}
