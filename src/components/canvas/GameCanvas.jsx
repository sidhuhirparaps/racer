import { useLayoutEffect, useMemo, useRef } from 'react'
import { Canvas } from '@react-three/fiber'
import { AdaptiveEvents } from '@react-three/drei'
import * as THREE from 'three'
import { useGameStore, localPalette, remotePalette, PALETTE, handles } from '../../store/useGameStore'
import { TrackAndDesk } from './TrackAndDesk'
import { KartModel } from './KartModel'
import { RaceController } from './RaceController'

const SKID_COUNT = 48
const skidGeo = new THREE.PlaneGeometry(0.4, 0.82)
skidGeo.rotateX(-Math.PI / 2)
const skidMat = new THREE.MeshBasicMaterial({
  transparent: true,
  depthWrite: false,
  toneMapped: false,
  polygonOffset: true,
  polygonOffsetFactor: -4,
  polygonOffsetUnits: -4,
})
const skidDummy = new THREE.Object3D()
const hiddenColor = new THREE.Color(0x000000)

function isMobileGpu() {
  return /Android|iPhone|iPad|iPod/i.test(navigator.userAgent)
    || (navigator.maxTouchPoints > 1 && window.innerWidth < 1024)
}

function SkidMarks() {
  const ref = useRef(null)
  useLayoutEffect(() => {
    const mesh = ref.current
    if (!mesh) return
    for (let i = 0; i < SKID_COUNT; i++) {
      skidDummy.position.set(0, -80, 0)
      skidDummy.scale.set(0.001, 0.001, 0.001)
      skidDummy.updateMatrix()
      mesh.setMatrixAt(i, skidDummy.matrix)
      mesh.setColorAt(i, hiddenColor)
    }
    mesh.instanceMatrix.needsUpdate = true
    if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true
    handles.skid = mesh
  }, [])
  return <instancedMesh ref={ref} args={[skidGeo, skidMat, SKID_COUNT]} frustumCulled={false} />
}

function KeyLight({ mobile }) {
  const light = useRef(null)
  const target = useRef(null)
  useLayoutEffect(() => {
    const sun = light.current
    handles.keyLight = sun
    if (sun && target.current) sun.target = target.current
    if (!sun) return undefined
    const size = mobile ? 512 : 1024
    sun.shadow.mapSize.set(size, size)
    sun.shadow.bias = -0.00028
    sun.shadow.normalBias = 0.02
    const cam = sun.shadow.camera
    const span = 62
    cam.left = -span
    cam.right = span
    cam.top = span
    cam.bottom = -span
    cam.near = 12
    cam.far = 210
    cam.updateProjectionMatrix()
    return undefined
  }, [mobile])

  return (
    <>
      <directionalLight ref={light} color="#fff4e2" intensity={1.45} position={[-48, 96, -30]} castShadow />
      <object3D ref={target} />
    </>
  )
}

function SceneContents() {
  const mobile = useMemo(() => isMobileGpu(), [])
  const netRole = useGameStore((s) => s.netRole)
  const aiCount = useGameStore((s) => s.aiCount)
  const netConnected = useGameStore((s) => s.netConnected)
  const local = localPalette(netRole)
  const remote = remotePalette(netRole)

  return (
    <>
      <color attach="background" args={['#1e1817']} />
      {/*
        Exposure stays at 1.0 ACES, the same default the original HTML renderer uses.
        Key: warm sun, azimuth from behind-left, elevation high. Offset (-48, 96, -30)
        follows the kart so the chase view always has a lit top and a readable flank.
        Shadow frustum is ±62 around the kart: wide enough for the visible road,
        tighter than the full 800-unit desk.
        Keyboard plate is the visible emitter. Its point light owns the spill.
        Gantry bulbs plus one point light own the start lights.
      */}
      <ambientLight color="#ffece0" intensity={0.64} />
      <KeyLight mobile={mobile} />
      <directionalLight color="#c5d0dc" intensity={0.22} position={[36, 40, 28]} />

      <TrackAndDesk />
      <KartModel slot="player" body={local.body} trim={local.trim} />
      <KartModel slot="remote" body={remote.body} trim={remote.trim} visible={netConnected} />
      {PALETTE.bots.map((bot, index) => (
        <KartModel
          key={bot.body}
          slot={`bot${index}`}
          body={bot.body}
          trim={bot.trim}
          visible={index < aiCount}
        />
      ))}
      <SkidMarks />
      <RaceController />
    </>
  )
}

export function GameCanvas() {
  const mobile = useMemo(() => isMobileGpu(), [])

  return (
    <Canvas
      className="absolute inset-0 h-full w-full"
      dpr={[1, mobile ? 1.25 : 2]}
      shadows="soft"
      camera={{ fov: 60, near: 0.1, far: 750, position: [8, 7, -28] }}
      gl={{
        antialias: !mobile,
        powerPreference: 'high-performance',
        alpha: false,
      }}
      onCreated={({ gl, scene }) => {
        gl.toneMapping = THREE.ACESFilmicToneMapping
        gl.toneMappingExposure = 1
        gl.outputColorSpace = THREE.SRGBColorSpace
        scene.fog = new THREE.FogExp2(0x1e1817, 0.002)
      }}
    >
      <AdaptiveEvents />
      <SceneContents />
    </Canvas>
  )
}
