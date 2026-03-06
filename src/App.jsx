import { useState } from 'react'
import GameSelect from './components/GameSelect'
import CharacterSelect from './components/CharacterSelect'
import Game from './components/Game'
import SnakeGame from './components/SnakeGame'

export default function App() {
  const [gameId, setGameId] = useState(null)
  const [selection, setSelection] = useState(null)

  if (!gameId) {
    return <GameSelect onSelect={setGameId} />
  }

  if (gameId === 'snake') {
    return <SnakeGame onBack={() => setGameId(null)} />
  }

  if (!selection) {
    return <CharacterSelect onSelect={setSelection} onBack={() => setGameId(null)} />
  }

  return (
    <Game
      character={selection.character}
      difficulty={selection.difficulty}
      onBack={() => setSelection(null)}
    />
  )
}
