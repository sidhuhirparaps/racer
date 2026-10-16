import React, { useRef, useEffect } from 'react';
import { useFrame, useThree } from '@react-three/fiber';
import * as THREE from 'three';
import { useGameStore, controls, telemetry } from '../../store/useGameStore';
import {
  trackCurve,
  trackSamples,
  findClosestTrackSample,
  TRACK_WIDTH,
  TRACK_SEGMENTS,
  TOTAL_TRACK_LENGTH,
} from '../../utils/trackSpline';
import KartModel from './KartModel';
import { sfx } from '../../audio/SoundEngine';

// Pre-allocated scratch vectors (Zero Garbage Collection in 60fps loop)
const _camDesired = new THREE.Vector3();
const _camLook = new THREE.Vector3();
const _remoteVec = new THREE.Vector3();
const _up = new THREE.Vector3(0, 1, 0);
const _binormal = new THREE.Vector3();

const BASE_MAX_SPEED = 48.0;

const AI_CONFIGS = [
  { bodyColor: '#2ecc71', trimColor: '#f1c40f', lane: -3.2, skill: 0.99 },
  { bodyColor: '#9b59b6', trimColor: '#00f0ff', lane: 3.2, skill: 0.96 },
  { bodyColor: '#ff7f50', trimColor: '#ffffff', lane: -1.5, skill: 0.93 },
];

export default function RaceController({ sendTelemetry }) {
  const { camera } = useThree();

  const phase = useGameStore((s) => s.phase);
  const laps = useGameStore((s) => s.laps);
  const aiCount = useGameStore((s) => s.aiCount);
  const aiDifficulty = useGameStore((s) => s.aiDifficulty);
  const camIndex = useGameStore((s) => s.camIndex);
  const netRole = useGameStore((s) => s.netRole);
  const peerConnected = useGameStore((s) => s.peerConnected);
  const resetTrigger = useGameStore((s) => s.resetTrigger);
  const setPhase = useGameStore((s) => s.setPhase);

  const playerRef = useRef();
  const remoteRef = useRef();
  const aiRefs = [useRef(), useRef(), useRef()];

  // Internal 60fps physics state (never triggers React renders)
  const phys = useRef({
    speed: 0,
    heading: 0,
    steerAngle: 0,
    slipAngle: 0,
    driftDir: 0,
    driftCharge: 0,
    boostTimer: 0,
    lap: 1,
    lastU: 0,
    lastSampleIdx: 0,
    camHeading: 0,
    camPitch: 0,
    lastBeepSec: 4,
    lastNetSend: 0,
    aiState: AI_CONFIGS.map((cfg, i) => ({
      u: 0.008 + i * 0.008,
      lap: 1,
      speed: 0,
      laneOffset: cfg.lane,
      targetLane: cfg.lane,
      laneTimer: 2 + i,
      skill: cfg.skill,
    })),
  });

  // Keyboard Listeners
  useEffect(() => {
    const onKeyDown = (e) => {
      if (sfx?.init) sfx.init();
      if (e.code === 'KeyW' || e.code === 'ArrowUp') controls.gas = true;
      if (e.code === 'KeyS' || e.code === 'ArrowDown') controls.brake = true;
      if (e.code === 'KeyA' || e.code === 'ArrowLeft') controls.left = true;
      if (e.code === 'KeyD' || e.code === 'ArrowRight') controls.right = true;
      if (e.code === 'Space') controls.drift = true;
      if (e.code === 'KeyC') useGameStore.getState().cycleCamera();
      if (e.code === 'KeyR') useGameStore.getState().triggerReset();
    };
    const onKeyUp = (e) => {
      if (e.code === 'KeyW' || e.code === 'ArrowUp') controls.gas = false;
      if (e.code === 'KeyS' || e.code === 'ArrowDown') controls.brake = false;
      if (e.code === 'KeyA' || e.code === 'ArrowLeft') controls.left = false;
      if (e.code === 'KeyD' || e.code === 'ArrowRight') controls.right = false;
      if (e.code === 'Space') controls.drift = false;
    };
    window.addEventListener('keydown', onKeyDown);
    window.addEventListener('keyup', onKeyUp);
    return () => {
      window.removeEventListener('keydown', onKeyDown);
      window.removeEventListener('keyup', onKeyUp);
    };
  }, []);

  // Reset Kart & Grid Positions on Race Start or 'R' key
  const resetKartPositions = (fullRaceReset = false) => {
    const p = phys.current;
    const startSample = trackSamples[0];
    const gridOffset = netRole === 'client' ? 2.4 : -2.4;

    if (playerRef.current) {
      playerRef.current.position
        .copy(startSample.pt)
        .addScaledVector(startSample.binormal, gridOffset);
    }

    p.heading = Math.atan2(startSample.tangent.x, startSample.tangent.z);
    p.camHeading = p.heading;
    p.speed = 0;
    p.steerAngle = 0;
    p.slipAngle = 0;
    p.driftDir = 0;
    p.driftCharge = 0;
    p.boostTimer = 0;
    p.lastSampleIdx = 0;

    if (fullRaceReset) {
      p.lap = 1;
      p.lastU = 0;
      p.lastBeepSec = 4;
      telemetry.lap = 1;
      telemetry.raceTime = 0;
      telemetry.countdown = 3.5;

      p.aiState.forEach((bot, idx) => {
        bot.u = 0.008 + idx * 0.008;
        bot.lap = 1;
        bot.speed = 0;
        bot.laneOffset = AI_CONFIGS[idx].lane;
        const pt = trackCurve.getPointAt(bot.u);
        const tan = trackCurve.getTangentAt(bot.u).normalize();
        _binormal.crossVectors(tan, _up).normalize();
        if (aiRefs[idx].current) {
          aiRefs[idx].current.position.copy(pt).addScaledVector(_binormal, bot.laneOffset);
          aiRefs[idx].current.rotation.y = Math.atan2(tan.x, tan.z);
        }
      });
    }
  };

  useEffect(() => {
    if (phase === 'countdown') resetKartPositions(true);
  }, [phase]);

  useEffect(() => {
    if (resetTrigger > 0) resetKartPositions(false);
  }, [resetTrigger]);

  // Frame-rate independent exponential damping helper
  const damp = (current, target, lambda, dt) =>
    THREE.MathUtils.lerp(current, target, 1 - Math.exp(-lambda * dt));

  useFrame((_, rawDelta) => {
    const dt = Math.min(rawDelta, 0.05);
    const p = phys.current;
    const kRoot = playerRef.current;
    if (!kRoot) return;

    // 1. COUNTDOWN & RACE CLOCK
    if (phase === 'countdown') {
      telemetry.countdown -= dt;
      const sec = Math.ceil(telemetry.countdown);
      if (sec < p.lastBeepSec && sec >= 1) {
        p.lastBeepSec = sec;
        sfx?.playTone?.(440, 0.16, 'square', 0.12);
      }
      if (telemetry.countdown <= 0) {
        sfx?.playTone?.(880, 0.35, 'sawtooth', 0.15);
        setPhase('racing');
      }
    } else if (phase === 'racing') {
      telemetry.raceTime += dt;
    }

    // 2. SMOOTH ANALOG-LIKE STEERING & DRIFT PHYSICS
    const canDrive = phase === 'racing';
    const rawSteer = (controls.left ? 1 : 0) - (controls.right ? 1 : 0);
    // Smooth steering input so tapping keys doesn't jerk the car
    p.steerAngle = damp(p.steerAngle, rawSteer, 14, dt);

    if (p.boostTimer > 0) p.boostTimer = Math.max(0, p.boostTimer - dt);
    const maxSpd = p.boostTimer > 0 ? BASE_MAX_SPEED * 1.24 : BASE_MAX_SPEED;
    const accel = p.boostTimer > 0 ? 56 : 35;

    if (canDrive && controls.gas) {
      p.speed += accel * dt;
    } else if (canDrive && controls.brake) {
      p.speed -= 40 * dt;
    } else {
      p.speed = damp(p.speed, 0, 1.4, dt);
    }
    p.speed = THREE.MathUtils.clamp(p.speed, -16, maxSpd);

    // Slip-Angle Drifting
    const wantsDrift = canDrive && controls.drift && p.speed > 20;
    if (wantsDrift) {
      if (p.driftDir === 0 && Math.abs(p.steerAngle) > 0.12) {
        p.driftDir = Math.sign(p.steerAngle);
      }
      if (p.driftDir !== 0) {
        const driftTurn = 1.9 * p.driftDir + p.steerAngle * 0.95;
        p.heading += driftTurn * dt;
        const targetSlip = p.driftDir * 0.45 + p.steerAngle * 0.15;
        p.slipAngle = damp(p.slipAngle, targetSlip, 10, dt);
        p.driftCharge = Math.min(2.0, p.driftCharge + dt);
      } else if (Math.abs(p.speed) > 0.4) {
        p.heading += p.steerAngle * 2.15 * dt * Math.sign(p.speed);
      }
    } else {
      if (p.driftDir !== 0 && p.driftCharge >= 0.5) {
        p.boostTimer = p.driftCharge > 1.3 ? 1.15 : 0.65;
        p.speed = Math.min(BASE_MAX_SPEED * 1.24, p.speed + 14);
        sfx?.playBoost?.();
      }
      p.driftDir = 0;
      p.driftCharge = 0;
      p.slipAngle = damp(p.slipAngle, 0, 12, dt);

      if (Math.abs(p.speed) > 0.4) {
        const highSpeedStability = THREE.MathUtils.lerp(1.0, 0.7, Math.abs(p.speed) / BASE_MAX_SPEED);
        p.heading += p.steerAngle * 2.3 * highSpeedStability * dt * Math.sign(p.speed);
      }
    }

    // Advance Position along Velocity Vector
    kRoot.position.x += Math.sin(p.heading) * p.speed * dt;
    kRoot.position.z += Math.cos(p.heading) * p.speed * dt;

    // 3. FAST O(1) SPLINE TRACKING, CURB VIBRATION & SMOOTH WALL GLIDE
    const { sample: closest, distSq, index: foundIdx } = findClosestTrackSample(
      kRoot.position.x,
      kRoot.position.z,
      p.lastSampleIdx
    );
    p.lastSampleIdx = foundIdx;

    const distFromCenter = Math.sqrt(distSq);
    const curbZone = TRACK_WIDTH * 0.5 - 2.2;
    const wallLimit = TRACK_WIDTH * 0.5 - 0.95;
    const onCurb = distFromCenter > curbZone;

    const curbBuzz = onCurb && Math.abs(p.speed) > 8 ? Math.sin(performance.now() * 0.08) * 0.045 : 0;
    kRoot.position.y = damp(kRoot.position.y, closest.pt.y, 18, dt) + curbBuzz;

    if (distFromCenter > wallLimit) {
      const dx = (kRoot.position.x - closest.pt.x) / distFromCenter;
      const dz = (kRoot.position.z - closest.pt.z) / distFromCenter;
      kRoot.position.x = closest.pt.x + dx * wallLimit;
      kRoot.position.z = closest.pt.z + dz * wallLimit;

      const trackYaw = Math.atan2(closest.tangent.x, closest.tangent.z);
      const angleDiff = Math.atan2(Math.sin(trackYaw - p.heading), Math.cos(trackYaw - p.heading));
      p.heading += angleDiff * 0.35;
      p.speed *= 1 - 0.3 * dt;
    }

    // Visual Orientation & Pitch
    const slopePitch = -Math.asin(THREE.MathUtils.clamp(closest.tangent.y, -0.5, 0.5));
    kRoot.rotation.y = p.heading + p.slipAngle;
    kRoot.rotation.x = damp(kRoot.rotation.x, slopePitch, 12, dt);
    const targetRoll = (-p.steerAngle * 0.06 - p.slipAngle * 0.14) * (p.speed / BASE_MAX_SPEED);
    kRoot.rotation.z = damp(kRoot.rotation.z, targetRoll, 12, dt);

    // Update Sound Engine
    if (useGameStore.getState().soundEnabled) {
      sfx?.update?.(p.speed, BASE_MAX_SPEED, p.driftDir !== 0, onCurb, canDrive);
    }

    // 4. LAP COUNTER & FINISH CHECK
    if (p.lastU > 0.88 && closest.u < 0.12 && p.speed > 0) {
      p.lap += 1;
      telemetry.lap = p.lap;
      sfx?.playTone?.(660, 0.22, 'triangle', 0.14);
      if (p.lap > laps) {
        setPhase('finished');
      }
    }
    p.lastU = closest.u;
    const playerProgress = p.lap + closest.u;

    // 5. AI BOTS UPDATE
    let rank = 1;
    let totalRacers = 1;

    p.aiState.forEach((bot, idx) => {
      const active = idx < aiCount;
      telemetry.aiPositions[idx].active = active;
      const botMesh = aiRefs[idx].current;
      if (!active || !botMesh) return;
      totalRacers++;

      if (canDrive) {
        const sIdx = Math.floor(bot.u * TRACK_SEGMENTS) % TRACK_SEGMENTS;
        const s = trackSamples[sIdx];
        const cornerFactor = Math.max(0.76, 1.0 - s.curvature * 2.3);
        const gap = playerProgress - (bot.lap + bot.u);
        const rubber = THREE.MathUtils.clamp(1.0 + gap * 0.2, 0.92, 1.12);

        const targetSpd = BASE_MAX_SPEED * bot.skill * aiDifficulty * cornerFactor * rubber;
        bot.speed = damp(bot.speed, targetSpd, 3, dt);

        const prevU = bot.u;
        bot.u = (bot.u + (bot.speed * dt) / TOTAL_TRACK_LENGTH) % 1;
        if (prevU > 0.88 && bot.u < 0.12) bot.lap++;

        bot.laneTimer -= dt;
        if (bot.laneTimer <= 0) {
          bot.laneTimer = 2.5 + Math.random() * 2.5;
          bot.targetLane = (Math.random() - 0.5) * (TRACK_WIDTH - 4.5);
        }
        bot.laneOffset = damp(bot.laneOffset, bot.targetLane, 2, dt);

        const pt = trackCurve.getPointAt(bot.u);
        const tan = trackCurve.getTangentAt(bot.u).normalize();
        _binormal.crossVectors(tan, _up).normalize();

        botMesh.position.copy(pt).addScaledVector(_binormal, bot.laneOffset);
        botMesh.rotation.y = Math.atan2(tan.x, tan.z);

        telemetry.aiPositions[idx].x = botMesh.position.x;
        telemetry.aiPositions[idx].z = botMesh.position.z;
      }

      if (bot.lap + bot.u > playerProgress) rank++;
    });

    // 6. LAN P2P SYNC
    if (peerConnected && remoteRef.current) {
      totalRacers++;
      const now = performance.now();
      if (now - p.lastNetSend > 33 && sendTelemetry) {
        p.lastNetSend = now;
        sendTelemetry({
          x: kRoot.position.x,
          y: kRoot.position.y,
          z: kRoot.position.z,
          heading: p.heading,
          slip: p.slipAngle,
          speed: p.speed,
          lap: p.lap,
          u: closest.u,
          boost: p.boostTimer > 0 ? 1 : 0,
        });
      }
      const rt = telemetry.remotePos;
      _remoteVec.set(rt.x, rt.y, rt.z);
      remoteRef.current.position.lerp(_remoteVec, 1 - Math.exp(-15 * dt));
      remoteRef.current.rotation.y = rt.heading + rt.slip;
      if (rt.lap + rt.u > playerProgress) rank++;
    }

    // Write 60fps Telemetry for HUD & Minimap (Zero React state updates!)
    telemetry.speed = p.speed;
    telemetry.driftCharge = p.driftCharge;
    telemetry.boostTimer = p.boostTimer;
    telemetry.u = closest.u;
    telemetry.rank = rank;
    telemetry.totalRacers = totalRacers;
    telemetry.playerPos.x = kRoot.position.x;
    telemetry.playerPos.y = kRoot.position.y;
    telemetry.playerPos.z = kRoot.position.z;

    // 7. BUTTER-SMOOTH EXPONENTIAL SPRING CAMERA RIG
    const camPresets = [
      { dist: 7.4, height: 2.85, lookDist: 11.0, lookY: 1.15, stiff: 11.0 },
      { dist: 5.2, height: 1.95, lookDist: 14.0, lookY: 0.95, stiff: 15.0 },
      { dist: 11.8, height: 5.0, lookDist: 9.0, lookY: 1.4, stiff: 9.0 },
      { dist: -0.4, height: 1.38, lookDist: 20.0, lookY: 1.1, stiff: 30.0 },
    ];
    const cm = camPresets[camIndex] || camPresets[0];

    const angleDiff = Math.atan2(Math.sin(p.heading - p.camHeading), Math.cos(p.heading - p.camHeading));
    p.camHeading += angleDiff * (1 - Math.exp(-cm.stiff * dt));
    p.camPitch = damp(p.camPitch, slopePitch, 7, dt);

    const targetFov = p.boostTimer > 0 ? 68 : 60;
    if (Math.abs(camera.fov - targetFov) > 0.1) {
      camera.fov = damp(camera.fov, targetFov, 8, dt);
      camera.updateProjectionMatrix();
    }

    _camDesired.set(
      kRoot.position.x - Math.sin(p.camHeading) * cm.dist,
      kRoot.position.y + cm.height + Math.sin(p.camPitch) * 2.0,
      kRoot.position.z - Math.cos(p.camHeading) * cm.dist
    );
    camera.position.lerp(_camDesired, 1 - Math.exp(-cm.stiff * 1.6 * dt));

    _camLook.set(
      kRoot.position.x + Math.sin(p.camHeading + p.slipAngle * 0.35) * cm.lookDist,
      kRoot.position.y + cm.lookY - Math.sin(p.camPitch) * 3.0,
      kRoot.position.z + Math.cos(p.camHeading + p.slipAngle * 0.35) * cm.lookDist
    );
    camera.lookAt(_camLook);
  });

  // Consistent Colors: Host = Red (#e6241b), Client = Cyan (#00e5ff)
  const localBodyColor = netRole === 'client' ? '#00e5ff' : '#e6241b';
  const localTrimColor = netRole === 'client' ? '#ffffff' : '#f5d020';
  const remoteBodyColor = netRole === 'client' ? '#e6241b' : '#00e5ff';
  const remoteTrimColor = netRole === 'client' ? '#f5d020' : '#ffffff';

  return (
    <>
      {/* Local Player Kart */}
      <group ref={playerRef}>
        <KartModel
          bodyColor={localBodyColor}
          trimColor={localTrimColor}
          isPlayer
        />
      </group>

      {/* Remote LAN Player 2 Kart */}
      <group ref={remoteRef} visible={peerConnected}>
        <KartModel
          bodyColor={remoteBodyColor}
          trimColor={remoteTrimColor}
        />
      </group>

      {/* AI Opponent Karts */}
      {AI_CONFIGS.map((cfg, idx) => (
        <group key={idx} ref={aiRefs[idx]} visible={idx < aiCount}>
          <KartModel bodyColor={cfg.bodyColor} trimColor={cfg.trimColor} />
        </group>
      ))}
    </>
  );
}