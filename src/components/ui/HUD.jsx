import { useEffect, useRef } from 'react'
import { Camera, RotateCcw, Settings2, Smartphone, Volume2, VolumeX } from 'lucide-react'
import { soundEngine } from '../../audio/SoundEngine'
import {
  CAM_NAMES,
  handles,
  intents,
  useGameStore,
} from '../../store/useGameStore'

function ordinal(rank) {
  const suffix = ['st', 'nd', 'rd', 'th']
  return `${rank}${suffix[rank - 1] || 'th'}`
}

export function HUD() {
  const speedRef = useRef(null)
  const driftRef = useRef(null)
  const timeRef = useRef(null)
  const bannerRef = useRef(null)
  const mapRef = useRef(null)

  const phase = useGameStore((s) => s.phase)
  const currentLap = useGameStore((s) => s.currentLap)
  const laps = useGameStore((s) => s.laps)
  const playerRank = useGameStore((s) => s.playerRank)
  const totalRacers = useGameStore((s) => s.totalRacers)
  const camIndex = useGameStore((s) => s.camIndex)
  const soundEnabled = useGameStore((s) => s.soundEnabled)
  const touchUI = useGameStore((s) => s.touchUI)

  useEffect(() => {
    handles.speedEl = speedRef.current
    handles.driftEl = driftRef.current
    handles.timeEl = timeRef.current
    handles.bannerEl = bannerRef.current
    handles.minimap = mapRef.current
  }, [])

  const cycleCam = () => {
    const next = (useGameStore.getState().camIndex + 1) % CAM_NAMES.length
    useGameStore.getState().setCamIndex(next)
  }

  const toggleSound = () => {
    soundEngine.init()
    const on = soundEngine.toggleMute()
    useGameStore.getState().setSoundEnabled(on)
  }

  return (
    <div className="pointer-events-none absolute inset-0 z-10">
      <div className="absolute left-[clamp(14px,3vw,38px)] right-[clamp(14px,3vw,38px)] top-[clamp(10px,2vw,22px)] flex items-center justify-between gap-2">
        <div className="text-[clamp(20px,3.6vw,34px)] font-black italic tracking-[2px] text-[#ff9d2e] [text-shadow:0_0_14px_rgba(255,140,0,0.75),2px_2px_0_#000]">
          DESK RACER
        </div>
        <div className="pointer-events-auto flex flex-wrap justify-end gap-2">
          <button type="button" className="hud-btn" onClick={toggleSound}>
            {soundEnabled ? <Volume2 size={14} /> : <VolumeX size={14} />}
            SOUND: {soundEnabled ? 'ON' : 'OFF'}
          </button>
          <button type="button" className="hud-btn" onClick={cycleCam}>
            <Camera size={14} />
            CAM: {CAM_NAMES[camIndex]}
          </button>
          <button
            type="button"
            className="hud-btn"
            onClick={() => useGameStore.getState().setTouchUI(!touchUI)}
          >
            <Smartphone size={14} />
            TOUCH UI
          </button>
          <button type="button" className="hud-btn" onClick={() => { intents.reset = true }}>
            <RotateCcw size={14} />
            RESET (R)
          </button>
          <button
            type="button"
            className="hud-btn"
            onClick={() => useGameStore.getState().setPhase('lobby')}
          >
            <Settings2 size={14} />
            LOBBY
          </button>
        </div>
      </div>

      <div className="absolute right-[clamp(14px,3vw,38px)] top-[clamp(54px,7.5vw,76px)] min-w-[155px] rounded-xl border border-white/15 bg-[rgba(14,18,26,0.84)] px-4 py-2.5 text-right text-white backdrop-blur-md">
        <div ref={speedRef} className="text-[clamp(26px,4vw,36px)] font-black italic leading-none text-[#00f0ff]">
          0
        </div>
        <div className="text-[11px] tracking-[1px] text-slate-400">KM/H</div>
        <div className="my-1.5 h-1.5 overflow-hidden rounded bg-white/10">
          <div ref={driftRef} className="h-full w-0 bg-[#00f0ff]" />
        </div>
        <div className="mt-1 flex justify-between text-[13px] font-bold">
          <span className="text-slate-400">LAP</span>
          <span>{currentLap} / {laps}</span>
        </div>
        <div className="mt-1 flex justify-between text-[13px] font-bold">
          <span className="text-slate-400">POS</span>
          <span>{ordinal(playerRank)} / {totalRacers}</span>
        </div>
        <div className="mt-1 flex justify-between text-[13px] font-bold">
          <span className="text-slate-400">TIME</span>
          <span ref={timeRef}>00:00.0</span>
        </div>
      </div>

      <div
        className={`absolute drop-shadow-[0_4px_10px_rgba(0,0,0,0.85)] ${
          touchUI
            ? 'left-3.5 top-14 h-[85px] w-[125px]'
            : 'bottom-[clamp(14px,3vw,26px)] left-[clamp(14px,3vw,36px)] h-[clamp(100px,16vw,145px)] w-[clamp(145px,23vw,215px)]'
        }`}
      >
        <canvas ref={mapRef} id="minimap" width={220} height={150} className="h-full w-full" />
      </div>

      <div
        ref={bannerRef}
        className="absolute left-1/2 top-[36%] -translate-x-1/2 -translate-y-1/2 text-[clamp(42px,8vw,82px)] font-black italic text-white opacity-0 [text-shadow:0_0_24px_rgba(0,240,255,0.85),0_4px_0_#000]"
      >
        3
      </div>

      {phase !== 'lobby' && !touchUI && (
        <div className="absolute bottom-3.5 right-8 rounded-lg border border-white/15 bg-[rgba(14,18,26,0.84)] px-3 py-1.5 text-xs text-white/70">
          <b>WASD / Arrows</b> Drive · <b>Hold SPACE + Turn</b> Drift Boost · <b>C</b> Camera · <b>R</b> Reset
        </div>
      )}
    </div>
  )
}
