import * as THREE from 'three';

export const TRACK_WIDTH = 15.0;
export const TRACK_SEGMENTS = 650;
export const TOTAL_TRACK_LENGTH = 585;

export const trackPoints = [
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
];

export const trackCurve = new THREE.CatmullRomCurve3(trackPoints, true, 'catmullrom', 0.5);

const upVec = new THREE.Vector3(0, 1, 0);
export const trackSamples = [];

for (let i = 0; i < TRACK_SEGMENTS; i++) {
  const u = i / TRACK_SEGMENTS;
  const pt = trackCurve.getPointAt(u);
  const tangent = trackCurve.getTangentAt(u).normalize();
  const binormal = new THREE.Vector3().crossVectors(tangent, upVec).normalize();
  const nextTan = trackCurve.getTangentAt((u + 0.015) % 1).normalize();
  const curvature = tangent.distanceTo(nextTan);

  trackSamples.push({ index: i, u, pt, tangent, binormal, curvature });
}

// Fast O(1) windowed search around lastIndex (falls back to full scan only on reset)
export function findClosestTrackSample(x, z, lastIndex = -1) {
  let bestIdx = 0;
  let minDistSq = Infinity;

  if (lastIndex >= 0) {
    const windowSize = 30;
    for (let offset = -windowSize; offset <= windowSize; offset++) {
      const idx = (lastIndex + offset + TRACK_SEGMENTS) % TRACK_SEGMENTS;
      const s = trackSamples[idx];
      const dx = x - s.pt.x;
      const dz = z - s.pt.z;
      const dSq = dx * dx + dz * dz;
      if (dSq < minDistSq) {
        minDistSq = dSq;
        bestIdx = idx;
      }
    }
    return { sample: trackSamples[bestIdx], distSq: minDistSq, index: bestIdx };
  }

  for (let i = 0; i < TRACK_SEGMENTS; i++) {
    const s = trackSamples[i];
    const dx = x - s.pt.x;
    const dz = z - s.pt.z;
    const dSq = dx * dx + dz * dz;
    if (dSq < minDistSq) {
      minDistSq = dSq;
      bestIdx = i;
    }
  }
  return { sample: trackSamples[bestIdx], distSq: minDistSq, index: bestIdx };
}