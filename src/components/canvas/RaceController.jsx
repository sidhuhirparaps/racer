import { useLayoutEffect } from 'react'
import { useFrame, useThree } from '@react-three/fiber'
import * as THREE from 'three'
import { soundEngine } from '../../audio/SoundEngine'
import { sendTelemetry, netBridge } from '../../network/useMultiplayer'
import {
  BASE_MAX_SPEED,
  CAM_MODES,
  PALETTE,
  handles,
  inputState,
  intents,
  remoteTarget,
  sim,
  telemetry,
  useGameStore,
} from '../../store/useGameStore'
import {
  CURB_INSET,
  TRACK_LENGTH,
  TRACK_WIDTH,
  WALL_INSET,
  closestSampleIndex,
  miniPts,
  poseTangent,
  slopeFromTangentY,
  trackSamples,
  writePose,
} from '../../utils/trackSpline'
import { sparkHex, updateKart } from './KartModel'

const UP = new THREE.Vector3(0, 1, 0)
const pull = new THREE.Vector2()
const camDesired = new THREE.Vector3()
const lookTarget = new THREE.Vector3()
const remoteVec = new THREE.Vector3()
const skidWorld = new THREE.Vector3()
const skidDummy = new THREE.Object3D()
const skidColor = new THREE.Color()

const HALF = TRACK_WIDTH * 0.5
const CURB_START = HALF - CURB_INSET
const WALL_LIMIT = HALF - WALL_INSET
const REAR_LATERAL = [ -1.2, 1.2 ]

function frameAlpha(perFrameAt60, dt) {
  return 1 - Math.pow(1 - perFrameAt60, dt * 60)
}

function fmtTime(sec) {
  const minutes = Math.floor(sec / 60)
  const seconds = (sec % 60).toFixed(1).padStart(4, '0')
  return `${String(minutes).padStart(2, '0')}:${seconds}`
}

function resetPlayer() {
  const player = handles.player
  if (!player?.root) return
  const role = useGameStore.getState().netRole
  const sample = trackSamples[0]
  const lane = role === 'client' ? 2.4 : -2.4
  player.root.position.copy(sample.pt).addScaledVector(sample.binormal, lane)
  telemetry.heading = Math.atan2(sample.tangent.x, sample.tangent.z)
  sim.camHeading = telemetry.heading
  sim.camPitch = 0
  telemetry.speed = 0
  telemetry.slip = 0
  telemetry.driftDir = 0
  telemetry.driftCharge = 0
  telemetry.boostTimer = 0
  telemetry.lastU = 0
  telemetry.u = sample.u
  sim.hint = 0
  player.root.rotation.y = telemetry.heading
  if (player.visual) {
    player.visual.rotation.x = 0
    player.visual.rotation.z = 0
  }
  sim.snapCam = true
}

function placeBots() {
  const aiCount = useGameStore.getState().aiCount
  for (let i = 0; i < PALETTE.bots.length; i++) {
    const bot = handles.bots[i]
    if (!bot?.root) continue
    const def = PALETTE.bots[i]
    if (!bot.sim) {
      bot.sim = {
        u: 0.008 + i * 0.008,
        lap: 1,
        speed: 0,
        laneOffset: def.lane,
        targetLane: def.lane,
        laneTimer: 2 + i,
        skill: def.skill,
      }
    }
    const active = i < aiCount
    bot.root.visible = active
    bot.sim.u = 0.008 + i * 0.008
    bot.sim.lap = 1
    bot.sim.speed = 0
    bot.sim.laneOffset = def.lane
    bot.sim.targetLane = def.lane
    bot.sim.laneTimer = 2 + i
    const yaw = writePose(bot.sim.u, bot.sim.laneOffset, bot.root.position)
    bot.root.rotation.y = yaw
    if (bot.visual) {
      bot.visual.rotation.x = slopeFromTangentY(poseTangent.y)
      bot.visual.rotation.z = 0
    }
  }
}

function beginCountdown() {
  soundEngine.init()
  soundEngine.resetGear()
  telemetry.lap = 1
  telemetry.lastU = 0
  telemetry.progress = 1
  sim.raceTime = 0
  sim.countdown = 3.5
  sim.lastBeepSec = 4
  sim.gantryGo = false
  sim.lastKmh = -1
  sim.lastTenth = -1
  resetPlayer()
  placeBots()
  useGameStore.setState({
    phase: 'countdown',
    currentLap: 1,
    playerRank: 1,
    finishHeadline: 'DESK RACER — LAN & SOLO',
    finishDetail: 'Race solo against fast AI or connect 2 devices over Wi-Fi',
  })
  const banner = handles.bannerEl
  if (banner) {
    banner.style.opacity = '1'
    banner.style.color = '#ffffff'
    banner.textContent = '3'
  }
}

function paintGantry(countdown, go) {
  const mats = handles.gantry
  if (!mats?.length) return
  if (go) {
    for (let i = 0; i < mats.length; i++) {
      if (mats[i].userData.hex !== 0x00ff66) {
        mats[i].userData.hex = 0x00ff66
        mats[i].color.setHex(0x00ff66)
      }
    }
    if (handles.gantryLight) {
      handles.gantryLight.color.setHex(0x00ff88)
      handles.gantryLight.intensity = 14
    }
    return
  }
  const lit = Math.min(5, Math.floor((3.5 - countdown) * 1.6))
  for (let i = 0; i < mats.length; i++) {
    const hex = i < lit ? 0xff1e1e : 0x250000
    if (mats[i].userData.hex !== hex) {
      mats[i].userData.hex = hex
      mats[i].color.setHex(hex)
    }
  }
  if (handles.gantryLight) {
    handles.gantryLight.color.setHex(0xff3b3b)
    handles.gantryLight.intensity = lit * 3
  }
}

function dropSkid(root, yaw, colorHex) {
  const mesh = handles.skid
  if (!mesh || !root) return
  for (let side = 0; side < 2; side++) {
    const lateral = REAR_LATERAL[side]
    const sin = Math.sin(yaw)
    const cos = Math.cos(yaw)
    skidWorld.set(
      root.position.x + lateral * cos + -1.12 * sin,
      root.position.y + 0.04,
      root.position.z + -lateral * sin + -1.12 * cos,
    )
    skidDummy.position.copy(skidWorld)
    skidDummy.rotation.set(0, yaw, 0)
    skidDummy.scale.set(1, 1, 1)
    skidDummy.updateMatrix()
    const index = sim.skidCursor % 48
    sim.skidCursor += 1
    mesh.setMatrixAt(index, skidDummy.matrix)
    skidColor.setHex(colorHex)
    mesh.setColorAt(index, skidColor)
  }
  mesh.instanceMatrix.needsUpdate = true
  if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true
}

let mapCtx = null

function drawMinimap() {
  const canvas = handles.minimap
  const player = handles.player
  if (!canvas || !player?.root) return
  if (!mapCtx || mapCtx.canvas !== canvas) mapCtx = canvas.getContext('2d')
  const ctx = mapCtx
  const width = canvas.width
  const height = canvas.height
  ctx.clearRect(0, 0, width, height)
  ctx.beginPath()
  for (let i = 0; i < miniPts.length; i++) {
    const p = miniPts[i].pt
    const px = 44 + (p.x + 20) * 1.12
    const pz = 78 - p.z * 0.46
    if (i === 0) ctx.moveTo(px, pz)
    else ctx.lineTo(px, pz)
  }
  ctx.closePath()
  ctx.strokeStyle = '#101216'
  ctx.lineWidth = 9
  ctx.lineJoin = 'round'
  ctx.stroke()
  ctx.strokeStyle = '#e8f0f8'
  ctx.lineWidth = 4.5
  ctx.stroke()

  const state = useGameStore.getState()
  for (let i = 0; i < handles.bots.length; i++) {
    const bot = handles.bots[i]
    if (!bot?.root?.visible) continue
    ctx.fillStyle = PALETTE.bots[i].body
    ctx.beginPath()
    ctx.arc(44 + (bot.root.position.x + 20) * 1.12, 78 - bot.root.position.z * 0.46, 3.8, 0, Math.PI * 2)
    ctx.fill()
  }

  if (state.netConnected && handles.remote?.root) {
    ctx.fillStyle = state.netRole === 'client' ? '#e6241b' : '#00e5ff'
    ctx.beginPath()
    ctx.arc(44 + (handles.remote.root.position.x + 20) * 1.12, 78 - handles.remote.root.position.z * 0.46, 5, 0, Math.PI * 2)
    ctx.fill()
  }

  ctx.fillStyle = state.netRole === 'client' ? '#00e5ff' : '#e6241b'
  ctx.beginPath()
  ctx.arc(44 + (player.root.position.x + 20) * 1.12, 78 - player.root.position.z * 0.46, 5.6, 0, Math.PI * 2)
  ctx.fill()
}

function updateHud(phase) {
  const speedEl = handles.speedEl
  const kmh = (Math.abs(telemetry.speed) * 3.1) | 0
  if (speedEl && kmh !== sim.lastKmh) {
    sim.lastKmh = kmh
    speedEl.textContent = String(kmh)
  }

  const driftEl = handles.driftEl
  if (driftEl) {
    const width = Math.min(100, (telemetry.driftCharge / 1.5) * 100)
    const spark = sparkHex(telemetry.driftCharge, telemetry.boostTimer > 0)
    if (Math.abs(width - sim.lastDriftWidth) > 0.4) {
      sim.lastDriftWidth = width
      driftEl.style.width = `${width}%`
    }
    if (spark !== sim.lastSpark) {
      sim.lastSpark = spark
      driftEl.style.background = `#${spark.toString(16).padStart(6, '0')}`
    }
  }

  const timeEl = handles.timeEl
  if (timeEl && phase === 'racing') {
    const tenth = (sim.raceTime * 10) | 0
    if (tenth !== sim.lastTenth) {
      sim.lastTenth = tenth
      timeEl.textContent = fmtTime(sim.raceTime)
    }
  }
}

export function RaceController() {
  const camera = useThree((s) => s.camera)

  useLayoutEffect(() => {
    handles.camera = camera
    resetPlayer()
    placeBots()
  }, [camera])

  useFrame((_, rawDt) => {
    if (intents.start && handles.player?.root) {
      intents.start = false
      beginCountdown()
    }
    if (intents.reset && handles.player?.root) {
      intents.reset = false
      resetPlayer()
    }

    const dt = Math.min(rawDt, 0.08)
    const nowMs = performance.now()
    let phase = useGameStore.getState().phase
    const player = handles.player
    if (!player?.root) return

    const banner = handles.bannerEl
    if (phase === 'countdown') {
      sim.countdown -= dt
      const sec = Math.ceil(sim.countdown)
      if (sec < sim.lastBeepSec && sec >= 1) {
        sim.lastBeepSec = sec
        soundEngine.playTone(440, 0.18, 'square', 0.12)
      }
      paintGantry(sim.countdown, false)
      if (sim.countdown > 0.35) {
        if (banner) {
          banner.textContent = String(Math.min(3, Math.max(1, sec)))
          banner.style.opacity = '1'
          banner.style.color = '#ffffff'
        }
      } else if (!sim.gantryGo) {
        sim.gantryGo = true
        if (banner) {
          banner.textContent = 'GO!'
          banner.style.color = '#00ffcc'
          banner.style.opacity = '1'
        }
        paintGantry(0, true)
        soundEngine.playTone(880, 0.38, 'sawtooth', 0.15)
        phase = 'racing'
        useGameStore.setState({ phase: 'racing' })
      }
    } else if (phase === 'racing') {
      sim.raceTime += dt
      if (banner && sim.raceTime > 0.85 && banner.style.opacity !== '0') banner.style.opacity = '0'
      if (handles.gantryLight && handles.gantryLight.intensity > 0.7) {
        handles.gantryLight.intensity = THREE.MathUtils.lerp(handles.gantryLight.intensity, 0.55, frameAlpha(0.04, dt))
      }
    }

    const canDrive = phase === 'racing'
    const steer = (inputState.kLeft ? 1 : 0) - (inputState.kRight ? 1 : 0)
    telemetry.steer = steer

    if (telemetry.boostTimer > 0) telemetry.boostTimer = Math.max(0, telemetry.boostTimer - dt)
    const activeMax = telemetry.boostTimer > 0 ? BASE_MAX_SPEED * 1.24 : BASE_MAX_SPEED
    const accel = telemetry.boostTimer > 0 ? 55 : 34

    if (canDrive && inputState.gas) telemetry.speed += accel * dt
    else if (canDrive && inputState.brake) telemetry.speed -= 38 * dt
    else telemetry.speed *= Math.pow(0.32, dt)
    telemetry.speed = THREE.MathUtils.clamp(telemetry.speed, -16, activeMax)

    const wantsDrift = canDrive && inputState.drift && telemetry.speed > 22
    if (wantsDrift) {
      if (telemetry.driftDir === 0 && Math.abs(steer) > 0.15) telemetry.driftDir = Math.sign(steer)
      if (telemetry.driftDir !== 0) {
        const driftTurn = 1.95 * telemetry.driftDir + steer * 0.95
        telemetry.heading += driftTurn * dt
        const targetSlip = telemetry.driftDir * 0.46 + steer * 0.14
        telemetry.slip = THREE.MathUtils.lerp(telemetry.slip, targetSlip, frameAlpha(0.15, dt))
        telemetry.driftCharge = Math.min(2.2, telemetry.driftCharge + dt)
      } else if (Math.abs(telemetry.speed) > 0.4) {
        telemetry.heading += steer * 2.15 * dt * Math.sign(telemetry.speed)
      }
    } else {
      if (telemetry.driftDir !== 0 && telemetry.driftCharge >= 0.55) {
        const boostStrength = telemetry.driftCharge > 1.4 ? 1.15 : 0.65
        telemetry.boostTimer = boostStrength
        telemetry.speed = Math.min(BASE_MAX_SPEED * 1.24, telemetry.speed + 14)
        soundEngine.playBoost()
      }
      telemetry.driftDir = 0
      telemetry.driftCharge = 0
      telemetry.slip = THREE.MathUtils.lerp(telemetry.slip, 0, frameAlpha(0.2, dt))
      if (Math.abs(telemetry.speed) > 0.4) {
        const speedFactor = THREE.MathUtils.lerp(1, 0.72, Math.abs(telemetry.speed) / BASE_MAX_SPEED)
        telemetry.heading += steer * 2.3 * speedFactor * dt * Math.sign(telemetry.speed)
      }
    }

    player.root.position.x += Math.sin(telemetry.heading) * telemetry.speed * dt
    player.root.position.z += Math.cos(telemetry.heading) * telemetry.speed * dt

    const hit = closestSampleIndex(player.root.position.x, player.root.position.z, sim.hint)
    sim.hint = hit.index
    const closest = trackSamples[hit.index]
    const distFromCenter = Math.sqrt(hit.distSq)
    const onCurb = distFromCenter > CURB_START
    telemetry.onCurb = onCurb
    telemetry.u = closest.u
    const curbBuzz = onCurb && Math.abs(telemetry.speed) > 8 ? Math.sin(nowMs * 0.085) * 0.055 : 0
    player.root.position.y = THREE.MathUtils.lerp(player.root.position.y, closest.pt.y, frameAlpha(0.4, dt)) + curbBuzz

    if (distFromCenter > WALL_LIMIT) {
      pull.set(player.root.position.x - closest.pt.x, player.root.position.z - closest.pt.z)
      if (pull.lengthSq() > 1e-8) pull.normalize()
      player.root.position.x = closest.pt.x + pull.x * WALL_LIMIT
      player.root.position.z = closest.pt.z + pull.y * WALL_LIMIT
      const trackYaw = Math.atan2(closest.tangent.x, closest.tangent.z)
      const angleDiff = Math.atan2(Math.sin(trackYaw - telemetry.heading), Math.cos(trackYaw - telemetry.heading))
      telemetry.heading += angleDiff * frameAlpha(0.35, dt)
      telemetry.speed *= 1 - 0.35 * dt
    }

    player.root.rotation.y = telemetry.heading + telemetry.slip
    const slopePitch = slopeFromTangentY(closest.tangent.y)
    updateKart(player, {
      speed: telemetry.speed,
      dt,
      steer,
      slopePitch,
      slip: telemetry.slip,
      driftCharge: telemetry.driftCharge,
      boostTimer: telemetry.boostTimer,
    })

    if (telemetry.driftDir !== 0 && telemetry.speed > 22) {
      sim.skidAccum += dt
      const spark = sparkHex(telemetry.driftCharge, telemetry.boostTimer > 0)
      while (sim.skidAccum > 0.045) {
        sim.skidAccum -= 0.045
        dropSkid(player.root, telemetry.heading + telemetry.slip, spark)
      }
    } else {
      sim.skidAccum = 0
    }

    soundEngine.update(telemetry.speed, BASE_MAX_SPEED, telemetry.driftDir !== 0, onCurb, canDrive)

    let finishedThisFrame = false
    if (canDrive && telemetry.lastU > 0.88 && closest.u < 0.12 && telemetry.speed > 0) {
      telemetry.lap += 1
      soundEngine.playTone(660, 0.25, 'triangle', 0.14)
      const laps = useGameStore.getState().laps
      if (telemetry.lap > laps) finishedThisFrame = true
      else useGameStore.setState({ currentLap: telemetry.lap })
    }
    telemetry.lastU = closest.u
    telemetry.progress = telemetry.lap + closest.u

    const settings = useGameStore.getState()
    let playerRank = 1
    let totalRacers = 1
    if (canDrive) {
      for (let i = 0; i < handles.bots.length; i++) {
        const bot = handles.bots[i]
        if (!bot?.root || !bot.sim || i >= settings.aiCount) continue
        totalRacers += 1
        const sampleIndex = Math.floor(bot.sim.u * trackSamples.length) % trackSamples.length
        const sample = trackSamples[sampleIndex]
        const cornerSlowdown = Math.max(0.76, 1 - sample.curvature * 2.4)
        const progressGap = telemetry.progress - (bot.sim.lap + bot.sim.u)
        const rubberBand = THREE.MathUtils.clamp(1 + progressGap * 0.22, 0.91, 1.12)
        const targetSpeed = BASE_MAX_SPEED * bot.sim.skill * settings.aiDifficulty * cornerSlowdown * rubberBand
        bot.sim.speed = THREE.MathUtils.lerp(bot.sim.speed, targetSpeed, dt * 2.5)
        const prevU = bot.sim.u
        bot.sim.u = (bot.sim.u + (bot.sim.speed * dt) / TRACK_LENGTH) % 1
        if (prevU > 0.88 && bot.sim.u < 0.12) bot.sim.lap += 1
        bot.sim.laneTimer -= dt
        if (bot.sim.laneTimer <= 0) {
          bot.sim.laneTimer = 2.5 + Math.random() * 3
          bot.sim.targetLane = (Math.random() - 0.5) * (TRACK_WIDTH - 4.5)
        }
        bot.sim.laneOffset = THREE.MathUtils.lerp(bot.sim.laneOffset, bot.sim.targetLane, dt * 1.8)
        const yaw = writePose(bot.sim.u, bot.sim.laneOffset, bot.root.position)
        bot.root.rotation.y = yaw
        updateKart(bot, {
          speed: bot.sim.speed,
          dt,
          steer: 0,
          slopePitch: slopeFromTangentY(poseTangent.y),
          slip: 0,
          driftCharge: 0,
          boostTimer: 0,
        })
        if (bot.sim.lap + bot.sim.u > telemetry.progress) playerRank += 1
      }
    } else {
      totalRacers += Math.min(settings.aiCount, handles.bots.length)
    }

    if (!netBridge.connected && handles.remote) handles.remote.seen = false
    if (netBridge.connected && handles.remote?.root) {
      totalRacers += 1
      sendTelemetry({
        x: player.root.position.x,
        y: player.root.position.y,
        z: player.root.position.z,
        heading: telemetry.heading,
        slip: telemetry.slip,
        speed: telemetry.speed,
        lap: telemetry.lap,
        u: closest.u,
        boost: telemetry.boostTimer > 0 ? 1 : 0,
      })
      remoteVec.set(remoteTarget.x, remoteTarget.y, remoteTarget.z)
      if (!handles.remote.seen) {
        handles.remote.root.position.copy(remoteVec)
        handles.remote.root.rotation.y = remoteTarget.heading + remoteTarget.slip
        handles.remote.seen = true
      } else {
        handles.remote.root.position.lerp(remoteVec, frameAlpha(0.3, dt))
      }
      const targetYaw = remoteTarget.heading + remoteTarget.slip
      const yawDelta = Math.atan2(
        Math.sin(targetYaw - handles.remote.root.rotation.y),
        Math.cos(targetYaw - handles.remote.root.rotation.y),
      )
      handles.remote.root.rotation.y += yawDelta * frameAlpha(0.45, dt)
      const remoteHit = closestSampleIndex(handles.remote.root.position.x, handles.remote.root.position.z, sim.remoteHint)
      sim.remoteHint = remoteHit.index
      updateKart(handles.remote, {
        speed: remoteTarget.speed,
        dt,
        steer: 0,
        slopePitch: slopeFromTangentY(trackSamples[remoteHit.index].tangent.y),
        slip: remoteTarget.slip,
        driftCharge: remoteTarget.boost ? 1.5 : 0,
        boostTimer: remoteTarget.boost ? 0.4 : 0,
      })
      if (remoteTarget.lap + remoteTarget.u > telemetry.progress) playerRank += 1
    }

    const store = useGameStore.getState()
    if (store.playerRank !== playerRank || store.totalRacers !== totalRacers) {
      useGameStore.setState({ playerRank, totalRacers })
    }

    if (finishedThisFrame) {
      phase = 'finished'
      const ord = ['st', 'nd', 'rd', 'th']
      const placed = `${playerRank}${ord[playerRank - 1] || 'th'} / ${totalRacers}`
      useGameStore.setState({
        phase: 'finished',
        currentLap: store.laps,
        playerRank,
        totalRacers,
        finishHeadline: 'FINISHED!',
        finishDetail: `Time: ${fmtTime(sim.raceTime)} • Placed ${placed}`,
      })
    }

    updateHud(phase)

    const cm = CAM_MODES[useGameStore.getState().camIndex] || CAM_MODES[0]
    const diffAngle = Math.atan2(
      Math.sin(telemetry.heading - sim.camHeading),
      Math.cos(telemetry.heading - sim.camHeading),
    )
    sim.camHeading += diffAngle * Math.min(1, dt * cm.stiff)
    sim.camPitch = THREE.MathUtils.lerp(sim.camPitch, slopePitch, Math.min(1, dt * 6))

    const targetFov = telemetry.boostTimer > 0 ? 70 : 60
    if (Math.abs(camera.fov - targetFov) > 0.1) {
      camera.fov = THREE.MathUtils.lerp(camera.fov, targetFov, Math.min(1, dt * 8))
      camera.updateProjectionMatrix()
    }

    const headSin = Math.sin(sim.camHeading)
    const headCos = Math.cos(sim.camHeading)
    const side = cm.side || 0
    camDesired.set(
      player.root.position.x - headSin * cm.dist + headCos * side,
      player.root.position.y + cm.height + Math.sin(sim.camPitch) * 1.4,
      player.root.position.z - headCos * cm.dist - headSin * side,
    )
    const sun = handles.keyLight
    if (sun) {
      sun.position.set(player.root.position.x - 48, player.root.position.y + 96, player.root.position.z - 30)
      sun.target.position.set(player.root.position.x, player.root.position.y + 0.6, player.root.position.z)
      sun.target.updateMatrixWorld()
    }
    if (sim.snapCam) {
      camera.position.copy(camDesired)
      sim.snapCam = false
    } else {
      camera.position.lerp(camDesired, Math.min(1, dt * cm.stiff * 1.4))
    }

    const lookYaw = sim.camHeading + telemetry.slip * 0.35
    lookTarget.set(
      player.root.position.x + Math.sin(lookYaw) * cm.lookDist,
      player.root.position.y + cm.lookY - Math.sin(sim.camPitch) * 3,
      player.root.position.z + Math.cos(lookYaw) * cm.lookDist,
    )
    camera.up.copy(UP)
    camera.lookAt(lookTarget)

    drawMinimap()
  })

  return null
}
