import { useEffect, useState } from 'react'
import { soundEngine } from '../../audio/SoundEngine'
import { sendLobbySync, sendStartRace, useMultiplayer } from '../../network/useMultiplayer'
import { intents, useGameStore } from '../../store/useGameStore'

const LAP_OPTIONS = [1, 3, 5, 8]
const AI_OPTIONS = [0, 1, 3]
const DIFF_OPTIONS = [
  { value: 0.92, label: 'Casual' },
  { value: 1, label: 'Competitive' },
  { value: 1.07, label: 'Pro' },
]

function Pill({ active, disabled, onClick, children }) {
  return (
    <button
      type="button"
      disabled={disabled}
      onClick={onClick}
      className={`rounded-lg border px-2 py-2 text-xs font-bold ${
        active
          ? 'border-[#00f0ff] bg-[rgba(0,240,255,0.18)] text-white shadow-[0_0_10px_rgba(0,240,255,0.25)]'
          : 'border-white/15 bg-white/[0.06] text-slate-300'
      } disabled:cursor-not-allowed disabled:opacity-50`}
    >
      {children}
    </button>
  )
}

export function LobbyModal() {
  const phase = useGameStore((s) => s.phase)
  const laps = useGameStore((s) => s.laps)
  const aiCount = useGameStore((s) => s.aiCount)
  const aiDifficulty = useGameStore((s) => s.aiDifficulty)
  const netRole = useGameStore((s) => s.netRole)
  const netConnected = useGameStore((s) => s.netConnected)
  const roomCode = useGameStore((s) => s.roomCode)
  const netStatus = useGameStore((s) => s.netStatus)
  const finishHeadline = useGameStore((s) => s.finishHeadline)
  const finishDetail = useGameStore((s) => s.finishDetail)
  const [joinCode, setJoinCode] = useState('')
  const { hostRoom, joinRoom } = useMultiplayer()

  useEffect(() => {
    if (netRole === 'host' && roomCode) setJoinCode(roomCode)
  }, [netRole, roomCode])

  if (phase !== 'lobby' && phase !== 'finished') return null

  const locked = netRole === 'client' && netConnected
  const headline = phase === 'finished' ? finishHeadline : 'DESK RACER — LAN & SOLO'
  const detail = phase === 'finished'
    ? finishDetail
    : 'Race solo against fast AI or connect 2 devices over Wi-Fi'

  const chooseLaps = (value) => {
    if (locked) return
    useGameStore.getState().setLaps(value)
    sendLobbySync()
  }
  const chooseAi = (value) => {
    if (locked) return
    useGameStore.getState().setAiCount(value)
    sendLobbySync()
  }
  const chooseDiff = (value) => {
    if (locked) return
    useGameStore.getState().setAiDifficulty(value)
    sendLobbySync()
  }

  const start = () => {
    soundEngine.init()
    if (netRole === 'host' && netConnected) sendStartRace()
    intents.start = true
  }

  return (
    <div className="absolute inset-0 z-30 flex items-center justify-center bg-[rgba(8,10,15,0.78)] p-3.5 backdrop-blur-[10px]">
      <div className="max-h-[92vh] w-full max-w-[470px] overflow-y-auto rounded-[18px] border border-white/15 bg-gradient-to-br from-[#19202c] to-[#0f131a] p-[clamp(16px,3vw,26px)] text-white shadow-[0_20px_55px_rgba(0,0,0,0.8)]">
        <h2 className="m-0 text-[25px] font-black italic text-[#ff9d2e]">{headline}</h2>
        <p className="mb-4 mt-1 text-[13px] text-slate-400">{detail}</p>

        <span className="mb-1.5 mt-3 block text-[11px] font-extrabold uppercase tracking-[1px] text-slate-300">Lap Count</span>
        <div className="grid grid-cols-4 gap-1.5">
          {LAP_OPTIONS.map((value) => (
            <Pill key={value} active={laps === value} disabled={locked} onClick={() => chooseLaps(value)}>
              {value} {value === 1 ? 'Lap' : 'Laps'}
            </Pill>
          ))}
        </div>

        <span className="mb-1.5 mt-3 block text-[11px] font-extrabold uppercase tracking-[1px] text-slate-300">AI Bots</span>
        <div className="grid grid-cols-3 gap-1.5">
          {AI_OPTIONS.map((value) => (
            <Pill key={value} active={aiCount === value} disabled={locked} onClick={() => chooseAi(value)}>
              {value} {value === 1 ? 'Bot' : 'Bots'}
            </Pill>
          ))}
        </div>

        <span className="mb-1.5 mt-3 block text-[11px] font-extrabold uppercase tracking-[1px] text-slate-300">Bot Difficulty</span>
        <div className="grid grid-cols-3 gap-1.5">
          {DIFF_OPTIONS.map((option) => (
            <Pill
              key={option.label}
              active={Math.abs(aiDifficulty - option.value) < 0.001}
              disabled={locked}
              onClick={() => chooseDiff(option.value)}
            >
              {option.label}
            </Pill>
          ))}
        </div>

        <div className="mt-3 rounded-xl border border-[rgba(0,240,255,0.25)] bg-black/35 p-3">
          <span className="block text-[11px] font-extrabold uppercase tracking-[1px] text-[#00f0ff]">
            Wi-Fi / LAN P2P Multiplayer (WebRTC)
          </span>
          <div className="mt-2 flex items-center gap-2">
            <button type="button" className="flex-1 rounded-lg border border-white/15 bg-white/[0.06] px-2 py-2 text-xs font-bold" onClick={hostRoom}>
              Host LAN Room
            </button>
            <input
              value={joinCode}
              onChange={(event) => setJoinCode(event.target.value.slice(0, 4))}
              maxLength={4}
              placeholder="CODE"
              className="w-24 rounded-lg border border-white/15 bg-white/10 px-2 py-2 text-center text-[15px] font-extrabold uppercase tracking-[3px] text-white outline-none"
            />
            <button
              type="button"
              className="rounded-lg border border-white/15 bg-white/[0.06] px-3 py-2 text-xs font-bold"
              onClick={() => joinRoom(joinCode)}
            >
              Join
            </button>
          </div>
          <div className="mt-2 text-xs font-bold text-sky-400">{netStatus}</div>
        </div>

        <button
          type="button"
          disabled={locked}
          onClick={start}
          className="mt-4 w-full rounded-[10px] bg-gradient-to-r from-[#ff8a00] to-[#ffbc3b] px-3 py-3 text-[15px] font-black uppercase tracking-[1px] text-[#111] disabled:cursor-not-allowed disabled:opacity-50"
        >
          {locked ? 'WAITING FOR HOST...' : phase === 'finished' ? 'RACE AGAIN' : 'START RACE'}
        </button>
      </div>
    </div>
  )
}
