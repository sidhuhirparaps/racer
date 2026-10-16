import * as THREE from 'three'

/** Closed desk-circuit control points from the original Desk Racer. */
const TRACK_POINTS = [
  new THREE.Vector3(0, 0, -42),
  new THREE.Vector3(0, 0, 0),
  new THREE.Vector3(0, 0, 78),
  new THREE.Vector3(28, 10, 128),
  new THREE.Vector3(88, 14, 118),
  new THREE.Vector3(104, 4, 45),
  new THREE.Vector3(64, 0, -10),
  new THREE.Vector3(106, 6, -68),
  new THREE.Vector3(55, 0, -112),
  new THREE.Vector3(0, 0, -90),
]

export const TRACK_SEGMENTS = 650
export const TRACK_WIDTH = 15
export const CURB_INSET = 2.3
export const WALL_INSET = 0.95
export const DESK_TOP = -4.8
export const DECK_THICKNESS = 0.42

export const trackCurve = new THREE.CatmullRomCurve3(TRACK_POINTS, true, 'catmullrom', 0.5)

const UP = new THREE.Vector3(0, 1, 0)
const scratchA = new THREE.Vector3()
const scratchB = new THREE.Vector3()

function buildSamples() {
  const samples = []
  for (let i = 0; i < TRACK_SEGMENTS; i++) {
    const u = i / TRACK_SEGMENTS
    const pt = trackCurve.getPointAt(u)
    const tangent = trackCurve.getTangentAt(u).normalize()
    const nextTan = trackCurve.getTangentAt((u + 0.015) % 1).normalize()
    const curvature = tangent.distanceTo(nextTan)
    const binormal = new THREE.Vector3().crossVectors(tangent, UP)
    if (binormal.lengthSq() < 1e-8) binormal.set(1, 0, 0)
    else binormal.normalize()
    samples.push({ u, pt, tangent, binormal, curvature })
  }
  return samples
}

export const trackSamples = buildSamples()

let arcLength = 0
for (let i = 0; i < trackSamples.length; i++) {
  const j = (i + 1) % trackSamples.length
  arcLength += trackSamples[i].pt.distanceTo(trackSamples[j].pt)
}
export const TRACK_LENGTH = arcLength

export const miniPts = []
for (let i = 0; i < trackSamples.length; i += 5) miniPts.push(trackSamples[i])

function edgePoint(sample, distance, target) {
  return target.copy(sample.pt).addScaledVector(sample.binormal, distance)
}

function pushXYZ(list, v) {
  list.push(v.x, v.y, v.z)
}

export function createRoadGeometry() {
  const positions = []
  const uvs = []
  const indices = []
  const half = TRACK_WIDTH * 0.5

  for (let i = 0; i <= TRACK_SEGMENTS; i++) {
    const sample = trackSamples[i % TRACK_SEGMENTS]
    edgePoint(sample, -half, scratchA)
    edgePoint(sample, half, scratchB)
    pushXYZ(positions, scratchA)
    pushXYZ(positions, scratchB)
    const v = i / TRACK_SEGMENTS
    uvs.push(0, v, 1, v)
    if (i < TRACK_SEGMENTS) {
      const a = i * 2
      const b = a + 1
      const c = a + 2
      const d = a + 3
      indices.push(a, b, c, b, d, c)
    }
  }

  const geo = new THREE.BufferGeometry()
  geo.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3))
  geo.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2))
  geo.setIndex(indices)
  geo.computeVertexNormals()
  flipIfDownward(geo)
  return geo
}

/** Raised red/white curb with an outer skirt so the lip has thickness. */
export function createCurbGeometry() {
  const positions = []
  const colors = []
  const indices = []
  const half = TRACK_WIDTH * 0.5
  const inner = half - CURB_INSET
  const outer = half + 0.08
  const lift = 0.22
  const red = new THREE.Color('#e62e25')
  const white = new THREE.Color('#f4f4f4')
  const n = trackSamples.length

  function addSide(sign) {
    const base = positions.length / 3
    for (let i = 0; i < n; i++) {
      const sample = trackSamples[i]
      const stripe = Math.floor(i / 8) % 2 === 0 ? red : white
      edgePoint(sample, sign * inner, scratchA)
      scratchA.y += lift
      edgePoint(sample, sign * outer, scratchB)
      const topY = scratchB.y + lift
      const bottomY = scratchB.y
      positions.push(scratchA.x, scratchA.y, scratchA.z)
      positions.push(scratchB.x, topY, scratchB.z)
      positions.push(scratchB.x, bottomY, scratchB.z)
      for (let k = 0; k < 3; k++) colors.push(stripe.r, stripe.g, stripe.b)
    }
    for (let i = 0; i < n; i++) {
      const next = (i + 1) % n
      const a0 = base + i * 3
      const b0 = base + next * 3
      indices.push(a0, a0 + 1, b0, a0 + 1, b0 + 1, b0)
      indices.push(a0 + 1, a0 + 2, b0 + 1, a0 + 2, b0 + 2, b0 + 1)
    }
  }

  addSide(-1)
  addSide(1)

  const geo = new THREE.BufferGeometry()
  geo.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3))
  geo.setAttribute('color', new THREE.Float32BufferAttribute(colors, 3))
  geo.setIndex(indices)
  geo.computeVertexNormals()
  return geo
}

/** Deck belly and side walls so the elevated circuit is a slab, not a paper sheet. */
export function createDeckGeometry() {
  const positions = []
  const indices = []
  const half = TRACK_WIDTH * 0.5
  const n = trackSamples.length

  for (let i = 0; i <= n; i++) {
    const sample = trackSamples[i % n]
    edgePoint(sample, -half, scratchA)
    edgePoint(sample, half, scratchB)
    positions.push(scratchA.x, scratchA.y, scratchA.z)
    positions.push(scratchA.x, scratchA.y - DECK_THICKNESS, scratchA.z)
    positions.push(scratchB.x, scratchB.y, scratchB.z)
    positions.push(scratchB.x, scratchB.y - DECK_THICKNESS, scratchB.z)
  }

  for (let i = 0; i < n; i++) {
    const a = i * 4
    const b = a + 4
    indices.push(a, a + 1, b, a + 1, b + 1, b)
    indices.push(a + 2, b + 2, a + 3, a + 3, b + 2, b + 3)
    indices.push(a + 1, a + 3, b + 1, a + 3, b + 3, b + 1)
  }

  const geo = new THREE.BufferGeometry()
  geo.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3))
  geo.setIndex(indices)
  geo.computeVertexNormals()
  return geo
}

export function createRailPoints(side) {
  const half = TRACK_WIDTH * 0.5
  const points = []
  for (let i = 0; i < trackSamples.length; i += 2) {
    const sample = trackSamples[i]
    edgePoint(sample, side * (half + 0.05), scratchA)
    points.push(new THREE.Vector3(scratchA.x, scratchA.y + 0.62, scratchA.z))
  }
  return points
}

function keyboardLocal(x, z) {
  const dx = x - 38
  const dz = z - 38
  const theta = -0.15
  const cos = Math.cos(theta)
  const sin = Math.sin(theta)
  const lx = dx * cos - dz * sin
  const lz = dx * sin + dz * cos
  return Math.abs(lx) < 25 && Math.abs(lz) < 50
}

export const pierLayouts = []
for (let i = 0; i < trackSamples.length; i += 22) {
  const sample = trackSamples[i]
  const half = TRACK_WIDTH * 0.5 - 1.35
  for (const sign of [-1, 1]) {
    edgePoint(sample, sign * half, scratchA)
    if (keyboardLocal(scratchA.x, scratchA.z)) continue
    const top = scratchA.y - 0.12
    const height = top - DESK_TOP
    if (height < 1) continue
    pierLayouts.push({
      position: [scratchA.x, DESK_TOP + height * 0.5, scratchA.z],
      scale: [0.55, height, 0.55],
    })
  }
}

export const railPostLayouts = []
for (let i = 0; i < trackSamples.length; i += 14) {
  const sample = trackSamples[i]
  const half = TRACK_WIDTH * 0.5 + 0.05
  for (const sign of [-1, 1]) {
    edgePoint(sample, sign * half, scratchA)
    railPostLayouts.push({
      position: [scratchA.x, scratchA.y + 0.31, scratchA.z],
      scale: [0.14, 0.62, 0.14],
    })
  }
}

export const roadGeometry = createRoadGeometry()
export const curbGeometry = createCurbGeometry()
export const deckGeometry = createDeckGeometry()
export const leftRailPoints = createRailPoints(-1)
export const rightRailPoints = createRailPoints(1)

function flipIfDownward(geo) {
  const normal = geo.getAttribute('normal')
  let sum = 0
  for (let i = 0; i < normal.count; i++) sum += normal.getY(i)
  if (sum >= 0) return
  const index = geo.getIndex()
  for (let i = 0; i < index.count; i += 3) {
    const a = index.getX(i)
    index.setX(i, index.getX(i + 1))
    index.setX(i + 1, a)
  }
  index.needsUpdate = true
  geo.computeVertexNormals()
}

const SEARCH_WINDOW = 28
const LOST_DIST_SQ = 420

/**
 * Index-local closest sample. The window follows the spline so a nearby
 * crossing cannot steal the car. A full scan runs only after a respawn.
 */
export function closestSampleIndex(x, z, hint) {
  const n = trackSamples.length
  let best = ((hint % n) + n) % n
  let bestD = Infinity
  for (let k = -SEARCH_WINDOW; k <= SEARCH_WINDOW; k++) {
    const i = (best + k + n) % n
    const s = trackSamples[i]
    const dx = x - s.pt.x
    const dz = z - s.pt.z
    const d = dx * dx + dz * dz
    if (d < bestD) {
      bestD = d
      best = i
    }
  }
  if (bestD > LOST_DIST_SQ) {
    for (let i = 0; i < n; i++) {
      const s = trackSamples[i]
      const dx = x - s.pt.x
      const dz = z - s.pt.z
      const d = dx * dx + dz * dz
      if (d < bestD) {
        bestD = d
        best = i
      }
    }
  }
  return { index: best, distSq: bestD }
}

/**
 * Writes an interpolated pose into outPos. Leaves module scratch vectors
 * `_poseTangent` and `_poseBinormal` filled for the caller. No allocations.
 */
export const poseTangent = new THREE.Vector3()
export const poseBinormal = new THREE.Vector3()
const poseA = new THREE.Vector3()

export function writePose(u, lane, outPos) {
  let wrapped = u % 1
  if (wrapped < 0) wrapped += 1
  const f = wrapped * TRACK_SEGMENTS
  const i = Math.floor(f) % TRACK_SEGMENTS
  const j = (i + 1) % TRACK_SEGMENTS
  const t = f - Math.floor(f)
  const a = trackSamples[i]
  const b = trackSamples[j]
  poseTangent.lerpVectors(a.tangent, b.tangent, t)
  if (poseTangent.lengthSq() < 1e-8) poseTangent.copy(a.tangent)
  else poseTangent.normalize()
  poseBinormal.crossVectors(poseTangent, UP)
  if (poseBinormal.lengthSq() < 1e-8) poseBinormal.set(1, 0, 0)
  else poseBinormal.normalize()
  outPos.lerpVectors(a.pt, b.pt, t).addScaledVector(poseBinormal, lane)
  poseA.copy(a.pt).lerp(b.pt, t)
  outPos.y = poseA.y
  return Math.atan2(poseTangent.x, poseTangent.z)
}

export function slopeFromTangentY(y) {
  return -Math.asin(THREE.MathUtils.clamp(y, -0.5, 0.5))
}
