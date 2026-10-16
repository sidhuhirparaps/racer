import { create } from 'zustand'

export const CAM_NAMES = ['ARCADE', 'LOW CLOSE', 'HELI FAR', 'HOOD CAM']

export const CAM_MODES = [
  { dist: 8.2, height: 3.55, lookDist: 11.5, lookY: 0.85, stiff: 10.0, side: 1.15 },
  { dist: 5.2, height: 1.95, lookDist: 14.0, lookY: 0.95, stiff: 14.0, side: 0.55 },
  { dist: 11.8, height: 5.0, lookDist: 9.0, lookY: 1.4, stiff: 8.0, side: 0 },
  { dist: -0.4, height: 1.38, lookDist: 20.0, lookY: 1.1, stiff: 28.0, side: 0 },
]

export const PALETTE = {
  host: { body: '#e6241b', trim: '#f5d020' },
  client: { body: '#00e5ff', trim: '#ffffff' },
  bots: [
    { body: '#2ecc71', trim: '#f1c40f', lane: -3.1, skill: 0.99 },
    { body: '#9b59b6', trim: '#00f0ff', lane: 3.1, skill: 0.96 },
    { body: '#ff7f50', trim: '#ffffff', lane: -1.5, skill: 0.93 },
  ],
}

export const BASE_MAX_SPEED = 48

/**
 * Discrete UI state only. 60fps telemetry lives in the plain objects below
 * and is mutated in place so the frame loop never schedules a React render.
 */
export const useGameStore = create((set) => ({
  phase: 'lobby',
  laps: 3,
  aiCount: 3,
  aiDifficulty: 1,
  camIndex: 0,
  soundEnabled: true,
  touchUI: false,
  currentLap: 1,
  playerRank: 1,
  totalRacers: 1,
  netRole: 'solo',
  netConnected: false,
  roomCode: '',
  netStatus: 'Mode: Solo / Local Race',
  finishHeadline: 'DESK RACER — LAN & SOLO',
  finishDetail: 'Race solo against fast AI or connect 2 devices over Wi-Fi',
  setLaps: (laps) => set({ laps }),
  setAiCount: (aiCount) => set({ aiCount }),
  setAiDifficulty: (aiDifficulty) => set({ aiDifficulty }),
  setCamIndex: (camIndex) => set({ camIndex }),
  setSoundEnabled: (soundEnabled) => set({ soundEnabled }),
  setTouchUI: (touchUI) => set({ touchUI }),
  setPhase: (phase) => set({ phase }),
}))

/** One-frame commands. The race loop consumes them without a render. */
export const intents = {
  start: false,
  reset: false,
}

/**
 * Authoritative driving state. Mutated inside useFrame.
 * Deliberate mutation: allocating a new telemetry object at 60fps would hitch.
 */
export const telemetry = {
  speed: 0,
  heading: 0,
  slip: 0,
  driftDir: 0,
  driftCharge: 0,
  boostTimer: 0,
  lap: 1,
  lastU: 0,
  progress: 1,
  onCurb: false,
  u: 0,
  steer: 0,
}

/** Clock, camera spring and search hints. Not React state. */
export const sim = {
  countdown: 3.5,
  lastBeepSec: 4,
  raceTime: 0,
  camHeading: 0,
  camPitch: 0,
  hint: 0,
  remoteHint: 0,
  skidCursor: 0,
  skidAccum: 0,
  snapCam: true,
  lastKmh: -1,
  lastTenth: -1,
  lastDriftWidth: -1,
  lastSpark: 0,
  gantryGo: false,
}

export const remoteTarget = {
  x: 0,
  y: 0,
  z: -4,
  heading: 0,
  slip: 0,
  speed: 0,
  lap: 1,
  u: 0,
  boost: 0,
}

export const inputState = {
  gas: false,
  brake: false,
  drift: false,
  kLeft: false,
  kRight: false,
}

/** Scene object handles filled by layout effects. Never stored in React state. */
export const handles = {
  player: null,
  remote: null,
  bots: [null, null, null],
  gantry: [],
  gantryLight: null,
  keyLight: null,
  skid: null,
  minimap: null,
  speedEl: null,
  driftEl: null,
  timeEl: null,
  bannerEl: null,
  camera: null,
}

export function localPalette(role) {
  return role === 'client' ? PALETTE.client : PALETTE.host
}

export function remotePalette(role) {
  return role === 'client' ? PALETTE.host : PALETTE.client
}
