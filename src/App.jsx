import { useEffect } from 'react'
import { GameCanvas } from './components/canvas/GameCanvas'
import { HUD } from './components/ui/HUD'
import { LobbyModal } from './components/ui/LobbyModal'
import { TouchControls } from './components/ui/TouchControls'
import { soundEngine } from './audio/SoundEngine'
import { CAM_NAMES, inputState, intents, useGameStore } from './store/useGameStore'
import './components/ui/hud.css'

export default function App() {
  useEffect(() => {
    const touch = 'ontouchstart' in window || navigator.maxTouchPoints > 0
    if (touch) useGameStore.getState().setTouchUI(true)

    const down = (event) => {
      soundEngine.init()
      if (event.code === 'Space') event.preventDefault()
      if (event.code === 'KeyW' || event.code === 'ArrowUp') inputState.gas = true
      if (event.code === 'KeyS' || event.code === 'ArrowDown') inputState.brake = true
      if (event.code === 'KeyA' || event.code === 'ArrowLeft') inputState.kLeft = true
      if (event.code === 'KeyD' || event.code === 'ArrowRight') inputState.kRight = true
      if (event.code === 'Space') inputState.drift = true
      if (event.code === 'KeyR') intents.reset = true
      if (event.code === 'KeyC') {
        const next = (useGameStore.getState().camIndex + 1) % CAM_NAMES.length
        useGameStore.getState().setCamIndex(next)
      }
    }
    const up = (event) => {
      if (event.code === 'KeyW' || event.code === 'ArrowUp') inputState.gas = false
      if (event.code === 'KeyS' || event.code === 'ArrowDown') inputState.brake = false
      if (event.code === 'KeyA' || event.code === 'ArrowLeft') inputState.kLeft = false
      if (event.code === 'KeyD' || event.code === 'ArrowRight') inputState.kRight = false
      if (event.code === 'Space') inputState.drift = false
    }
    window.addEventListener('keydown', down)
    window.addEventListener('keyup', up)
    return () => {
      window.removeEventListener('keydown', down)
      window.removeEventListener('keyup', up)
    }
  }, [])

  return (
    <div className="fixed inset-0 overflow-hidden bg-[#141110] text-white">
      <GameCanvas />
      <HUD />
      <TouchControls />
      <LobbyModal />
    </div>
  )
}
