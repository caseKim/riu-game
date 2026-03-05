import { useState } from 'react'
import CharacterSelect from './components/CharacterSelect'
import Game from './components/Game'

export default function App() {
  const [selection, setSelection] = useState(null)

  if (!selection) {
    return <CharacterSelect onSelect={setSelection} />
  }

  return (
    <Game
      character={selection.character}
      difficulty={selection.difficulty}
      onBack={() => setSelection(null)}
    />
  )
}
