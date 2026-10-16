import { useEffect, useRef } from 'react'
import { soundEngine } from '../../audio/SoundEngine'
import { inputState, useGameStore } from '../../store/useGameStore'

function Pedal({ bind, label, className }) {
  const ref = useRef(null)

  useEffect(() => {
    const el = ref.current
    if (!el) return undefined

    const down = (event) => {
      event.preventDefault()
      soundEngine.init()
      el.setPointerCapture(event.pointerId)
      inputState[bind] = true
      el.dataset.pressed = '1'
    }
    const up = (event) => {
      if (event?.pointerId != null && el.hasPointerCapture?.(event.pointerId)) {
        el.releasePointerCapture(event.pointerId)
      }
      inputState[bind] = false
      el.dataset.pressed = '0'
    }

    el.addEventListener('pointerdown', down)
    el.addEventListener('pointerup', up)
    el.addEventListener('pointercancel', up)
    return () => {
      el.removeEventListener('pointerdown', down)
      el.removeEventListener('pointerup', up)
      el.removeEventListener('pointercancel', up)
      inputState[bind] = false
    }
  }, [bind])

  return (
    <div
      ref={ref}
      className={`flex items-center justify-center rounded-2xl border-2 border-white/30 bg-[rgba(15,20,28,0.85)] font-black text-white shadow-[0_6px_16px_rgba(0,0,0,0.5)] touch-none data-[pressed=1]:scale-95 data-[pressed=1]:border-[#ff9d2e] data-[pressed=1]:bg-[rgba(255,157,46,0.65)] ${className}`}
    >
      {label}
    </div>
  )
}

export function TouchControls() {
  const touchUI = useGameStore((s) => s.touchUI)
  if (!touchUI) return null

  return (
    <div className="absolute inset-0 z-20">
      <div className="pointer-events-auto absolute bottom-[clamp(16px,4vw,34px)] left-[clamp(16px,4vw,36px)] flex gap-3">
        <Pedal bind="kLeft" label="◀" className="h-[82px] w-[82px] bg-white/10 text-[26px]" />
        <Pedal bind="kRight" label="▶" className="h-[82px] w-[82px] bg-white/10 text-[26px]" />
      </div>
      <div className="pointer-events-auto absolute bottom-[clamp(16px,4vw,34px)] right-[clamp(16px,4vw,36px)] flex items-end gap-2.5">
        <Pedal bind="brake" label="BRAKE" className="h-[72px] w-[72px] text-[13px]" />
        <Pedal bind="drift" label="DRIFT" className="h-[72px] w-[72px] text-[13px]" />
        <Pedal bind="gas" label="GAS" className="h-[92px] w-[86px] border-[#00f0ff] bg-[rgba(0,240,255,0.22)] text-[13px]" />
      </div>
    </div>
  )
}
