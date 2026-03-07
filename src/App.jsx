import { useState } from 'react'
import GameSelect from './components/GameSelect'
import JumpCharacterSelect from './components/JumpCharacterSelect'
import JumpGame from './components/JumpGame'
import SnakeGame from './components/SnakeGame'
import SpaceGame from './components/SpaceGame'

export default function App() {
  const [gameId, setGameId] = useState(null)
  const [selection, setSelection] = useState(null)

  if (!gameId) {
    return <GameSelect onSelect={setGameId} />
  }

  if (gameId === 'snake') {
    return <SnakeGame onBack={() => setGameId(null)} />
  }

  if (gameId === 'space') {
    return <SpaceGame onBack={() => setGameId(null)} />
  }

  if (!selection) {
    return <JumpCharacterSelect onSelect={setSelection} onBack={() => setGameId(null)} />
  }

  return (
    <JumpGame
      character={selection.character}
      difficulty={selection.difficulty}
      onBack={() => setSelection(null)}
    />
  )
}
