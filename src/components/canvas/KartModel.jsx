import { useEffect, useLayoutEffect, useMemo, useRef } from 'react'
import * as THREE from 'three'
import { handles } from '../../store/useGameStore'

/**
 * One side-profile shell, extruded across the axle and beveled so the highlight
 * is a real edge. +X in the profile is the nose and becomes +Z on the kart.
 * Width matches the original desk kart (~2.05) so the chase camera still reads a slab, not a toy.
 */
function createShellGeometry() {
  const shape = new THREE.Shape()
  shape.moveTo(-1.58, 0.18)
  shape.lineTo(1.4, 0.16)
  shape.quadraticCurveTo(1.78, 0.2, 1.64, 0.34)
  shape.lineTo(0.72, 0.46)
  shape.lineTo(-0.25, 0.5)
  shape.lineTo(-1.2, 0.46)
  shape.lineTo(-1.58, 0.24)
  shape.closePath()

  const geo = new THREE.ExtrudeGeometry(shape, {
    depth: 1.92,
    bevelEnabled: true,
    bevelThickness: 0.04,
    bevelSize: 0.055,
    bevelSegments: 2,
    curveSegments: 8,
  })
  geo.translate(0, 0, -0.96)
  geo.rotateY(-Math.PI / 2)
  geo.computeVertexNormals()
  return geo
}

/** Thin arch over the tire. Major radius clears a 0.44 wheel; the tube is the lip, not a drum. */
function createFenderGeometry() {
  const geo = new THREE.TorusGeometry(0.52, 0.055, 8, 16, Math.PI)
  geo.rotateY(Math.PI / 2)
  geo.computeVertexNormals()
  return geo
}

const shellGeo = createShellGeometry()
const fenderGeo = createFenderGeometry()
const sidepodGeo = new THREE.BoxGeometry(0.42, 0.24, 1.35)
const engineGeo = new THREE.BoxGeometry(0.92, 0.42, 0.72)
const noseGeo = new THREE.BoxGeometry(1.55, 0.12, 0.42)
const trimGeo = new THREE.BoxGeometry(0.95, 0.16, 0.85)
const seatGeo = new THREE.BoxGeometry(0.78, 0.22, 0.7)
const engineLipGeo = new THREE.BoxGeometry(1.15, 0.1, 0.55)
const pipeGeo = new THREE.CylinderGeometry(0.1, 0.12, 0.85, 12)
const flameGeos = [
  new THREE.ConeGeometry(0.12, 0.42, 8),
  new THREE.ConeGeometry(0.16, 0.62, 8),
  new THREE.ConeGeometry(0.2, 0.86, 8),
]
const wingGeo = new THREE.BoxGeometry(2.28, 0.1, 0.52)
const endplateGeo = new THREE.BoxGeometry(0.08, 0.48, 0.46)
const strutGeo = new THREE.BoxGeometry(0.08, 0.52, 0.1)
const wheelGeo = new THREE.CylinderGeometry(0.44, 0.44, 0.5, 18)
wheelGeo.rotateZ(Math.PI / 2)
const sidewallGeo = new THREE.CylinderGeometry(0.3, 0.3, 0.58, 16)
sidewallGeo.rotateZ(Math.PI / 2)
const hubGeo = new THREE.CylinderGeometry(0.14, 0.14, 0.64, 12)
hubGeo.rotateZ(Math.PI / 2)
const helmetGeo = new THREE.SphereGeometry(0.46, 20, 16)
const visorGeo = new THREE.SphereGeometry(0.26, 16, 12)
const shadowGeo = new THREE.PlaneGeometry(3.2, 4.6)

let contactTexture = null
function getContactTexture() {
  if (contactTexture) return contactTexture
  const canvas = document.createElement('canvas')
  canvas.width = 128
  canvas.height = 128
  const ctx = canvas.getContext('2d')
  const gradient = ctx.createRadialGradient(64, 64, 8, 64, 64, 62)
  gradient.addColorStop(0, 'rgba(0,0,0,0.82)')
  gradient.addColorStop(0.62, 'rgba(0,0,0,0.38)')
  gradient.addColorStop(1, 'rgba(0,0,0,0)')
  ctx.fillStyle = gradient
  ctx.fillRect(0, 0, 128, 128)
  contactTexture = new THREE.CanvasTexture(canvas)
  return contactTexture
}

function makeHelmetTexture(stripeHex) {
  const canvas = document.createElement('canvas')
  canvas.width = 256
  canvas.height = 256
  const ctx = canvas.getContext('2d')
  ctx.fillStyle = '#f4f4f4'
  ctx.fillRect(0, 0, 256, 256)
  ctx.fillStyle = stripeHex
  ctx.fillRect(108, 0, 40, 256)
  ctx.fillStyle = '#1a1c20'
  ctx.fillRect(0, 168, 256, 18)
  const texture = new THREE.CanvasTexture(canvas)
  texture.colorSpace = THREE.SRGBColorSpace
  return texture
}

const SPARK_BLUE = 0x00f0ff
const SPARK_ORANGE = 0xff9d2e
const SPARK_PURPLE = 0xd946ef
const SPARK_BOOST = 0x00ffcc

export function sparkHex(charge, boosting) {
  if (boosting) return SPARK_BOOST
  if (charge > 1.4) return SPARK_PURPLE
  if (charge > 0.55) return SPARK_ORANGE
  return SPARK_BLUE
}

function bindSlot(slot, handle) {
  if (slot === 'player') handles.player = handle
  else if (slot === 'remote') handles.remote = handle
  else if (slot.startsWith('bot')) handles.bots[Number(slot.slice(3))] = handle
}

/**
 * Articulated kart. Geometries are shared. Per-kart materials are allocated
 * once. The race loop mutates pivots, wheel spin, pitch and flame uniforms.
 */
export function KartModel({ slot, body, trim, visible = true }) {
  const rootRef = useRef(null)
  const visualRef = useRef(null)
  const pivotL = useRef(null)
  const pivotR = useRef(null)
  const wheelRefs = useRef([])
  const flameRefs = useRef([])

  const materials = useMemo(() => {
    const bodyMat = new THREE.MeshPhysicalMaterial({
      color: body,
      roughness: 0.3,
      metalness: 0.16,
      clearcoat: 0.45,
      clearcoatRoughness: 0.28,
    })
    const trimMat = new THREE.MeshStandardMaterial({ color: trim, roughness: 0.36, metalness: 0.42 })
    const metalMat = new THREE.MeshStandardMaterial({ color: '#8d939c', roughness: 0.38, metalness: 0.42 })
    const rubberMat = new THREE.MeshStandardMaterial({ color: '#1a1a1a', roughness: 0.92, metalness: 0.02 })
    const sidewallMat = new THREE.MeshStandardMaterial({ color: '#3a3a3a', roughness: 0.7, metalness: 0.04 })
    const wingMat = new THREE.MeshStandardMaterial({ color: '#efefef', roughness: 0.4, metalness: 0.08 })
    const seatMat = new THREE.MeshStandardMaterial({ color: '#16181c', roughness: 0.8, metalness: 0.05 })
    const visorMat = new THREE.MeshPhysicalMaterial({
      color: '#0c1018',
      roughness: 0.08,
      metalness: 0.55,
      clearcoat: 1,
      clearcoatRoughness: 0.08,
    })
    const helmetMat = new THREE.MeshStandardMaterial({
      map: makeHelmetTexture(body),
      roughness: 0.22,
      metalness: 0.08,
    })
    const shadowMat = new THREE.MeshBasicMaterial({
      map: getContactTexture(),
      transparent: true,
      depthWrite: false,
      polygonOffset: true,
      polygonOffsetFactor: -1,
    })
    const flames = [1, 2, 3, 1, 2, 3].map((level) => {
      const mat = new THREE.MeshBasicMaterial({
        color: SPARK_BLUE,
        transparent: true,
        opacity: 0,
        depthWrite: false,
        toneMapped: false,
      })
      return { mat, level }
    })
    return { bodyMat, trimMat, metalMat, rubberMat, sidewallMat, wingMat, seatMat, visorMat, helmetMat, shadowMat, flames }
  }, [body])

  useEffect(() => {
    materials.bodyMat.color.set(body)
    materials.trimMat.color.set(trim)
    const next = makeHelmetTexture(body)
    const previous = materials.helmetMat.map
    materials.helmetMat.map = next
    materials.helmetMat.needsUpdate = true
    if (previous && previous !== next) previous.dispose()
  }, [body, trim, materials])

  useLayoutEffect(() => {
    const handle = {
      root: rootRef.current,
      visual: visualRef.current,
      pivots: [pivotL.current, pivotR.current],
      wheels: wheelRefs.current.filter(Boolean),
      flames: flameRefs.current.filter(Boolean),
      sim: null,
    }
    bindSlot(slot, handle)
    return () => bindSlot(slot, null)
  }, [slot])

  const setWheel = (index) => (node) => {
    wheelRefs.current[index] = node
  }
  const setFlame = (index) => (node) => {
    flameRefs.current[index] = node
  }

  let flameCursor = 0

  return (
    <group ref={rootRef} visible={visible} name={`kart-${slot}`}>
      <mesh geometry={shadowGeo} material={materials.shadowMat} rotation={[-Math.PI / 2, 0, 0]} position={[0, 0.025, 0]} />
      <group ref={visualRef}>
        <mesh name="chassis-shell" geometry={shellGeo} material={materials.bodyMat} castShadow receiveShadow />
        <mesh name="nose-bib" geometry={noseGeo} material={materials.bodyMat} position={[0, 0.22, 1.62]} castShadow />
        <mesh name="sidepod-l" geometry={sidepodGeo} material={materials.bodyMat} position={[-0.92, 0.36, 0.02]} castShadow />
        <mesh name="sidepod-r" geometry={sidepodGeo} material={materials.bodyMat} position={[0.92, 0.36, 0.02]} castShadow />
        <mesh name="cockpit-trim" geometry={trimGeo} material={materials.trimMat} position={[0, 0.62, 0.05]} castShadow />
        <mesh name="seat" geometry={seatGeo} material={materials.seatMat} position={[0, 0.58, -0.02]} />
        <mesh name="engine-cover" geometry={engineGeo} material={materials.metalMat} position={[0, 0.68, -1.12]} castShadow />
        <mesh name="engine-lip" geometry={engineLipGeo} material={materials.metalMat} position={[0, 0.9, -1.18]} castShadow />
        <mesh name="helmet" geometry={helmetGeo} material={materials.helmetMat} position={[0, 1.02, 0.02]} rotation={[0, Math.PI / 2, 0]} castShadow />
        <mesh name="visor" geometry={visorGeo} material={materials.visorMat} position={[0, 1.0, 0.32]} scale={[1.4, 0.58, 0.36]} />
        <mesh name="rear-wing" geometry={wingGeo} material={materials.wingMat} position={[0, 1.06, -1.48]} castShadow />
        <mesh geometry={endplateGeo} material={materials.bodyMat} position={[-1.12, 1.02, -1.48]} castShadow />
        <mesh geometry={endplateGeo} material={materials.bodyMat} position={[1.12, 1.02, -1.48]} castShadow />
        <mesh geometry={strutGeo} material={materials.metalMat} position={[-0.36, 0.86, -1.28]} />
        <mesh geometry={strutGeo} material={materials.metalMat} position={[0.36, 0.86, -1.28]} />

        {[-0.24, 0.24].map((x) => (
          <mesh key={`pipe-${x}`} geometry={pipeGeo} material={materials.metalMat} position={[x, 0.52, -1.72]} rotation={[Math.PI / 2.5, 0, 0]} castShadow />
        ))}

        {[-0.24, 0.24].map((x) =>
          [0, 1, 2].map((level) => {
            const index = flameCursor++
            const z = -2.15 - level * 0.28
            return (
              <mesh
                key={`flame-${x}-${level}`}
                ref={setFlame(index)}
                geometry={flameGeos[level]}
                material={materials.flames[index].mat}
                position={[x, 0.38, z]}
                rotation={[-Math.PI / 2, 0, 0]}
              />
            )
          }),
        )}

        <group ref={pivotL} name="steer-pivot-l" position={[-1.32, 0.44, 1.12]}>
          <mesh geometry={fenderGeo} material={materials.bodyMat} castShadow />
          <mesh ref={setWheel(0)} geometry={wheelGeo} material={materials.rubberMat} castShadow>
            <mesh geometry={sidewallGeo} material={materials.sidewallMat} />
            <mesh geometry={hubGeo} material={materials.metalMat} />
          </mesh>
        </group>
        <group ref={pivotR} name="steer-pivot-r" position={[1.32, 0.44, 1.12]}>
          <mesh geometry={fenderGeo} material={materials.bodyMat} castShadow />
          <mesh ref={setWheel(1)} geometry={wheelGeo} material={materials.rubberMat} castShadow>
            <mesh geometry={sidewallGeo} material={materials.sidewallMat} />
            <mesh geometry={hubGeo} material={materials.metalMat} />
          </mesh>
        </group>
        <mesh geometry={fenderGeo} material={materials.bodyMat} position={[-1.36, 0.44, -1.12]} castShadow />
        <mesh geometry={fenderGeo} material={materials.bodyMat} position={[1.36, 0.44, -1.12]} castShadow />
        <mesh ref={setWheel(2)} geometry={wheelGeo} material={materials.rubberMat} position={[-1.36, 0.44, -1.12]} castShadow>
          <mesh geometry={sidewallGeo} material={materials.sidewallMat} />
          <mesh geometry={hubGeo} material={materials.metalMat} />
        </mesh>
        <mesh ref={setWheel(3)} geometry={wheelGeo} material={materials.rubberMat} position={[1.36, 0.44, -1.12]} castShadow>
          <mesh geometry={sidewallGeo} material={materials.sidewallMat} />
          <mesh geometry={hubGeo} material={materials.metalMat} />
        </mesh>
      </group>
    </group>
  )
}

const FLAME_Z = [1, 1.15, 1.35]

export function updateKart(handle, { speed, dt, steer, slopePitch, slip, driftCharge, boostTimer }) {
  if (!handle?.visual) return
  const visual = handle.visual
  const pitchAlpha = 1 - Math.pow(0.78, dt * 60)
  const rollAlpha = 1 - Math.pow(0.8, dt * 60)
  visual.rotation.x = THREE.MathUtils.lerp(visual.rotation.x, slopePitch, pitchAlpha)
  const roll = (-steer * 0.06 - slip * 0.14) * Math.min(1, Math.abs(speed) / 48)
  visual.rotation.z = THREE.MathUtils.lerp(visual.rotation.z, roll, rollAlpha)

  const steerAngle = steer * 0.42
  if (handle.pivots[0]) handle.pivots[0].rotation.y = steerAngle
  if (handle.pivots[1]) handle.pivots[1].rotation.y = steerAngle

  const wheels = handle.wheels
  for (let i = 0; i < wheels.length; i++) {
    if (wheels[i]) wheels[i].rotation.x += speed * dt * 1.5
  }

  const boosting = boostTimer > 0
  const color = sparkHex(driftCharge, boosting)
  const flames = handle.flames
  for (let i = 0; i < flames.length; i++) {
    const mesh = flames[i]
    if (!mesh) continue
    const level = (i % 3) + 1
    const lit = boosting || (level === 1 && driftCharge > 0.3) || (level === 2 && driftCharge > 0.55) || (level === 3 && driftCharge > 1.4)
    mesh.material.color.setHex(color)
    mesh.material.opacity = lit ? 0.9 : 0
    mesh.scale.y = lit ? FLAME_Z[level - 1] : 1
  }
}
