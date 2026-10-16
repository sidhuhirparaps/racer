import { useLayoutEffect, useMemo, useRef } from 'react'
import * as THREE from 'three'
import { Instance, Instances } from '@react-three/drei'
import { handles } from '../../store/useGameStore'
import {
  DESK_TOP,
  curbGeometry,
  deckGeometry,
  leftRailPoints,
  rightRailPoints,
  roadGeometry,
  trackCurve,
  pierLayouts,
  railPostLayouts,
  TRACK_WIDTH,
} from '../../utils/trackSpline'

const KEYS = []
for (let row = 0; row < 6; row++) {
  for (let col = 0; col < 16; col++) {
    KEYS.push([-18 + row * 7.1, 1.72, -42 + col * 5.6])
  }
}

const TRUSS = []
for (let i = 0; i < 8; i++) {
  TRUSS.push({
    position: [-6.2 + i * 1.75, 7.55, 0],
    rotation: [0, 0, i % 2 === 0 ? 0.72 : -0.72],
    scale: [0.12, 1.55, 0.14],
  })
}
for (let i = 0; i < 4; i++) {
  TRUSS.push({
    position: [-TRACK_WIDTH / 2 - 0.6, 1.4 + i * 1.7, 0],
    rotation: [0.7, 0, 0],
    scale: [0.12, 1.35, 0.12],
  })
  TRUSS.push({
    position: [TRACK_WIDTH / 2 + 0.6, 1.4 + i * 1.7, 0],
    rotation: [-0.7, 0, 0],
    scale: [0.12, 1.35, 0.12],
  })
}

function createTrackTexture() {
  const canvas = document.createElement('canvas')
  canvas.width = 512
  canvas.height = 512
  const ctx = canvas.getContext('2d')
  ctx.fillStyle = '#292a2e'
  ctx.fillRect(0, 0, 512, 512)
  ctx.fillStyle = '#ececec'
  ctx.fillRect(46, 0, 10, 512)
  ctx.fillRect(456, 0, 10, 512)
  const texture = new THREE.CanvasTexture(canvas)
  texture.wrapS = THREE.RepeatWrapping
  texture.wrapT = THREE.RepeatWrapping
  texture.repeat.set(1, 145)
  texture.anisotropy = 8
  texture.colorSpace = THREE.SRGBColorSpace
  return texture
}

function createCheckerTexture() {
  const canvas = document.createElement('canvas')
  canvas.width = 256
  canvas.height = 256
  const ctx = canvas.getContext('2d')
  ctx.fillStyle = '#f2f2f2'
  ctx.fillRect(0, 0, 256, 256)
  ctx.fillStyle = '#171717'
  ctx.fillRect(0, 0, 128, 128)
  ctx.fillRect(128, 128, 128, 128)
  const texture = new THREE.CanvasTexture(canvas)
  texture.wrapS = THREE.RepeatWrapping
  texture.wrapT = THREE.RepeatWrapping
  texture.repeat.set(6, 1.5)
  texture.colorSpace = THREE.SRGBColorSpace
  return texture
}

export function TrackAndDesk() {
  const gantryLight = useRef(null)

  const maps = useMemo(() => ({
    asphalt: createTrackTexture(),
    checker: createCheckerTexture(),
  }), [])

  const bulbMats = useMemo(
    () => Array.from({ length: 5 }, () => new THREE.MeshBasicMaterial({ color: '#250000' })),
    [],
  )

  const tubes = useMemo(() => {
    const railMat = new THREE.MeshStandardMaterial({ color: '#b7c0c8', metalness: 0.72, roughness: 0.28 })
    const leftCurve = new THREE.CatmullRomCurve3(leftRailPoints, true, 'catmullrom', 0.5)
    const rightCurve = new THREE.CatmullRomCurve3(rightRailPoints, true, 'catmullrom', 0.5)
    const neonPoints = [
      new THREE.Vector3(11, 4.5, -42),
      new THREE.Vector3(11, 4.5, 0),
      new THREE.Vector3(11, 4.5, 78),
      new THREE.Vector3(39, 14.5, 128),
      new THREE.Vector3(99, 18.5, 118),
      new THREE.Vector3(115, 8.5, 45),
      new THREE.Vector3(75, 4.5, -10),
      new THREE.Vector3(117, 10.5, -68),
      new THREE.Vector3(66, 4.5, -112),
      new THREE.Vector3(11, 4.5, -90),
    ]
    const neonCurve = new THREE.CatmullRomCurve3(neonPoints, true, 'catmullrom', 0.5)
    return {
      railMat,
      left: new THREE.TubeGeometry(leftCurve, 280, 0.16, 7, true),
      right: new THREE.TubeGeometry(rightCurve, 280, 0.16, 7, true),
      neon: new THREE.TubeGeometry(neonCurve, 180, 0.14, 6, true),
    }
  }, [])

  const gantryPose = useMemo(() => {
    const point = trackCurve.getPointAt(0.032)
    const tangent = trackCurve.getTangentAt(0.032).normalize()
    return {
      position: [point.x, point.y, point.z],
      rotation: [0, Math.atan2(tangent.x, tangent.z), 0],
    }
  }, [])

  useLayoutEffect(() => {
    handles.gantry = bulbMats
    handles.gantryLight = gantryLight.current
  }, [bulbMats])

  return (
    <group>
      <mesh geometry={roadGeometry} receiveShadow>
        <meshStandardMaterial map={maps.asphalt} roughness={0.75} metalness={0.02} />
      </mesh>
      <mesh geometry={curbGeometry} receiveShadow castShadow>
        <meshStandardMaterial vertexColors roughness={0.48} metalness={0.02} />
      </mesh>
      <mesh geometry={deckGeometry} receiveShadow>
        <meshStandardMaterial color="#1c1716" roughness={0.9} metalness={0.02} side={THREE.DoubleSide} />
      </mesh>
      <mesh geometry={tubes.left} material={tubes.railMat} castShadow />
      <mesh geometry={tubes.right} material={tubes.railMat} castShadow />
      <Instances limit={railPostLayouts.length} frames={4} castShadow>
        <boxGeometry args={[1, 1, 1]} />
        <meshStandardMaterial color="#9aa3ab" metalness={0.7} roughness={0.3} />
        {railPostLayouts.map((post, index) => (
          <Instance key={index} position={post.position} scale={post.scale} />
        ))}
      </Instances>
      <mesh geometry={tubes.neon}>
        <meshBasicMaterial color="#ff55cc" />
      </mesh>

      <mesh position={[0, DESK_TOP - 0.55, 0]} receiveShadow>
        <boxGeometry args={[520, 1.1, 520]} />
        <meshStandardMaterial color="#241e1d" roughness={0.85} />
      </mesh>

      <Instances limit={Math.max(pierLayouts.length, 1)} frames={4} castShadow receiveShadow>
        <boxGeometry args={[1, 1, 1]} />
        <meshStandardMaterial color="#5c6770" metalness={0.45} roughness={0.48} />
        {pierLayouts.map((pier, index) => (
          <Instance key={index} position={pier.position} scale={pier.scale} />
        ))}
      </Instances>

      <group position={gantryPose.position} rotation={gantryPose.rotation}>
        <mesh position={[0, 0.035, 0]} rotation={[-Math.PI / 2, 0, 0]}>
          <planeGeometry args={[TRACK_WIDTH - 1.6, 2.8]} />
          <meshStandardMaterial map={maps.checker} polygonOffset polygonOffsetFactor={-2} roughness={0.6} />
        </mesh>
        {[-TRACK_WIDTH / 2 - 0.6, TRACK_WIDTH / 2 + 0.6].map((x) => (
          <mesh key={x} position={[x, 4.2, 0]} castShadow>
            <boxGeometry args={[0.85, 8.4, 0.85]} />
            <meshStandardMaterial color="#d5dbe1" metalness={0.62} roughness={0.34} />
          </mesh>
        ))}
        <mesh position={[0, 8.15, 0]}>
          <boxGeometry args={[TRACK_WIDTH + 2.2, 0.55, 0.7]} />
          <meshStandardMaterial color="#d5dbe1" metalness={0.62} roughness={0.34} />
        </mesh>
        <mesh position={[0, 9.55, 0]}>
          <boxGeometry args={[TRACK_WIDTH + 0.2, 1.7, 0.22]} />
          <meshStandardMaterial map={maps.checker} roughness={0.55} />
        </mesh>
        <Instances limit={TRUSS.length} frames={4}>
          <boxGeometry args={[1, 1, 1]} />
          <meshStandardMaterial color="#c5ced6" metalness={0.7} roughness={0.32} />
          {TRUSS.map((bar, index) => (
            <Instance key={index} position={bar.position} rotation={bar.rotation} scale={bar.scale} />
          ))}
        </Instances>
        {bulbMats.map((mat, index) => (
          <group key={index} position={[(index - 2) * 1.65, 7.15, -0.15]}>
            <mesh>
              <boxGeometry args={[0.62, 0.95, 0.38]} />
              <meshStandardMaterial color="#22252a" roughness={0.6} metalness={0.2} />
            </mesh>
            <mesh material={mat} position={[0, 0, -0.2]} rotation={[0, Math.PI, 0]}>
              <circleGeometry args={[0.22, 16]} />
            </mesh>
          </group>
        ))}
        <pointLight
          ref={gantryLight}
          color="#ff3b3b"
          intensity={0}
          distance={26}
          decay={2}
          position={[0, 7.2, 0.8]}
        />
      </group>

      <group position={[38, DESK_TOP + 1.1, 38]} rotation={[0, -0.15, 0]}>
        <mesh>
          <boxGeometry args={[46, 2.2, 95]} />
          <meshStandardMaterial color="#12161c" roughness={0.42} metalness={0.18} />
        </mesh>
        <mesh position={[0, 1.12, 0]} rotation={[-Math.PI / 2, 0, 0]}>
          <planeGeometry args={[42, 90]} />
          <meshBasicMaterial color="#00e5ff" />
        </mesh>
        <pointLight color="#00e5ff" intensity={5.5} distance={140} decay={2} position={[0, 12, 0]} />
        <Instances limit={96} frames={4}>
          <boxGeometry args={[4.7, 1.05, 4.55]} />
          <meshStandardMaterial color="#161b22" roughness={0.32} metalness={0.08} emissive="#004466" emissiveIntensity={0.45} />
          {KEYS.map((key, index) => (
            <Instance key={index} position={key} />
          ))}
        </Instances>
      </group>
    </group>
  )
}
