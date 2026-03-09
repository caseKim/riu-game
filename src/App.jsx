import { useState } from 'react'
import GameSelect from './components/GameSelect'
import JumpGame from './components/JumpGame'
import SnakeGame from './components/SnakeGame'
import SpaceGame from './components/SpaceGame'
import MatchGame from './components/MatchGame'
import PlatformGame from './components/PlatformGame'

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

  return <JumpGame onBack={() => setGameId(null)} />
}
