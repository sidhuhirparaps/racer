import { create } from 'zustand';

// 60FPS Mutable Objects (Read/Written directly in useFrame — NEVER triggers React re-renders)
export const controls = {
  gas: false,
  brake: false,
  drift: false,
  left: false,
  right: false,
};

export const telemetry = {
  speed: 0,
  driftCharge: 0,
  boostTimer: 0,
  u: 0,
  lap: 1,
  rank: 1,
  totalRacers: 4,
  raceTime: 0,
  countdown: 3.5,
  playerPos: { x: 0, y: 0, z: -42 },
  remotePos: { x: 0, y: 0, z: -42, heading: 0, slip: 0, speed: 0, lap: 1, u: 0, boost: 0, active: false },
  aiPositions: [
    { x: 0, z: 0, u: 0.008, lap: 1, active: true },
    { x: 0, z: 0, u: 0.016, lap: 1, active: true },
    { x: 0, z: 0, u: 0.024, lap: 1, active: true },
  ],
};

export const useGameStore = create((set) => ({
  phase: 'lobby', // 'lobby' | 'countdown' | 'racing' | 'finished'
  laps: 3,
  aiCount: 3,
  aiDifficulty: 1.0,
  camIndex: 0,
  soundEnabled: true,
  touchUI: typeof window !== 'undefined' && ('ontouchstart' in window || navigator.maxTouchPoints > 0),

  // Multiplayer Lobby State
  netRole: 'solo', // 'solo' | 'host' | 'client'
  roomCode: '',
  peerConnected: false,
  resetTrigger: 0,

  setPhase: (phase) => set({ phase }),
  setLaps: (laps) => set({ laps }),
  setAiCount: (aiCount) => set({ aiCount }),
  setAiDifficulty: (aiDifficulty) => set({ aiDifficulty }),
  cycleCamera: () => set((s) => ({ camIndex: (s.camIndex + 1) % 4 })),
  toggleSound: () => set((s) => ({ soundEnabled: !s.soundEnabled })),
  toggleTouchUI: () => set((s) => ({ touchUI: !s.touchUI })),
  triggerReset: () => set((s) => ({ resetTrigger: s.resetTrigger + 1 })),
  setNetState: (patch) => set((s) => ({ ...s, ...patch })),
}));