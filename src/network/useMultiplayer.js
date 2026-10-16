import { useCallback, useEffect, useRef } from 'react'
import Peer from 'peerjs'
import { intents, remoteTarget, useGameStore } from '../store/useGameStore'
import { trackSamples } from '../utils/trackSpline'
import { soundEngine } from '../audio/SoundEngine'

export const netBridge = {
  conn: null,
  lastSend: 0,
  role: 'solo',
  connected: false,
}

function rememberRemoteGrid(role) {
  const sample = trackSamples[0]
  const lane = role === 'host' ? 2.4 : -2.4
  remoteTarget.x = sample.pt.x + sample.binormal.x * lane
  remoteTarget.y = sample.pt.y
  remoteTarget.z = sample.pt.z + sample.binormal.z * lane
  remoteTarget.heading = Math.atan2(sample.tangent.x, sample.tangent.z)
  remoteTarget.slip = 0
  remoteTarget.speed = 0
  remoteTarget.lap = 1
  remoteTarget.u = 0
  remoteTarget.boost = 0
}

function bindConnection(conn) {
  netBridge.conn = conn
  conn.on('open', () => {
    netBridge.connected = true
    rememberRemoteGrid(netBridge.role)
    const state = useGameStore.getState()
    if (netBridge.role === 'host') {
      useGameStore.setState({
        netConnected: true,
        netStatus: `Player 2 Connected! (Room: ${state.roomCode}) — Click Start Race`,
      })
      conn.send({
        type: 'lobby_sync',
        laps: state.laps,
        aiCount: state.aiCount,
        aiDifficulty: state.aiDifficulty,
      })
    } else {
      useGameStore.setState({
        netConnected: true,
        netStatus: `Connected to Host (${state.roomCode})! Waiting for Host to start...`,
      })
    }
  })

  conn.on('data', (msg) => {
    if (!msg || typeof msg !== 'object') return
    if (msg.type === 'lobby_sync' || msg.type === 'start_race') {
      useGameStore.setState({
        laps: msg.laps,
        aiCount: msg.aiCount,
        aiDifficulty: msg.aiDifficulty,
      })
      if (msg.type === 'start_race') intents.start = true
    } else if (msg.type === 'telemetry' && msg.data) {
      remoteTarget.x = msg.data.x
      remoteTarget.y = msg.data.y
      remoteTarget.z = msg.data.z
      remoteTarget.heading = msg.data.heading
      remoteTarget.slip = msg.data.slip
      remoteTarget.speed = msg.data.speed
      remoteTarget.lap = msg.data.lap
      remoteTarget.u = msg.data.u
      remoteTarget.boost = msg.data.boost
    }
  })

  conn.on('close', () => {
    netBridge.connected = false
    netBridge.conn = null
    netBridge.role = 'solo'
    useGameStore.setState({
      netConnected: false,
      netRole: 'solo',
      netStatus: 'Peer disconnected. Back to Solo mode.',
    })
  })
}

export function sendLobbySync() {
  const conn = netBridge.conn
  if (!conn || netBridge.role !== 'host' || !netBridge.connected) return
  const state = useGameStore.getState()
  conn.send({
    type: 'lobby_sync',
    laps: state.laps,
    aiCount: state.aiCount,
    aiDifficulty: state.aiDifficulty,
  })
}

export function sendStartRace() {
  const conn = netBridge.conn
  if (!conn || netBridge.role !== 'host' || !netBridge.connected) return
  const state = useGameStore.getState()
  conn.send({
    type: 'start_race',
    laps: state.laps,
    aiCount: state.aiCount,
    aiDifficulty: state.aiDifficulty,
  })
}

export function sendTelemetry(data) {
  const conn = netBridge.conn
  if (!conn || !netBridge.connected) return
  const now = performance.now()
  if (now - netBridge.lastSend < 33) return
  netBridge.lastSend = now
  conn.send({ type: 'telemetry', data })
}

export function useMultiplayer() {
  const peerRef = useRef(null)

  const destroyPeer = useCallback(() => {
    if (peerRef.current) {
      peerRef.current.destroy()
      peerRef.current = null
    }
    netBridge.conn = null
    netBridge.connected = false
  }, [])

  useEffect(() => () => destroyPeer(), [destroyPeer])

  const hostRoom = useCallback(() => {
    soundEngine.init()
    const code = String(Math.floor(1000 + Math.random() * 9000))
    destroyPeer()
    netBridge.role = 'host'
    useGameStore.setState({
      netRole: 'host',
      roomCode: code,
      netConnected: false,
      netStatus: `Creating Room ${code}...`,
    })
    const peer = new Peer(`deskracer-p2p-${code}`)
    peerRef.current = peer
    peer.on('open', () => {
      useGameStore.setState({
        netStatus: `Hosting Room [${code}] — Enter this code on Device 2`,
      })
    })
    peer.on('connection', (conn) => {
      bindConnection(conn)
    })
    peer.on('error', (err) => {
      useGameStore.setState({ netStatus: `Network info: ${err.type || 'unavailable'}` })
    })
  }, [destroyPeer])

  const joinRoom = useCallback((rawCode) => {
    soundEngine.init()
    const code = String(rawCode || '').trim().toUpperCase()
    if (code.length < 4) {
      useGameStore.setState({ netStatus: 'Enter the 4-digit code shown on the Host device.' })
      return
    }
    destroyPeer()
    netBridge.role = 'client'
    useGameStore.setState({
      netRole: 'client',
      roomCode: code,
      netConnected: false,
      netStatus: `Connecting to Room ${code}...`,
    })
    const peer = new Peer()
    peerRef.current = peer
    peer.on('open', () => {
      const conn = peer.connect(`deskracer-p2p-${code}`, { reliable: false })
      bindConnection(conn)
    })
    peer.on('error', () => {
      netBridge.role = 'solo'
      useGameStore.setState({
        netRole: 'solo',
        netStatus: `Could not find Room ${code}. Check code & try again.`,
      })
    })
  }, [destroyPeer])

  return { hostRoom, joinRoom }
}
