import React, { Suspense } from 'react';
import { Canvas } from '@react-three/fiber';
import { AdaptiveDpr, AdaptiveEvents } from '@react-three/drei';
import TrackAndDesk from './TrackAndDesk';
import RaceController from './RaceController';

const isMobile =
  typeof window !== 'undefined' &&
  (/Android|iPhone|iPad|iPod/i.test(navigator.userAgent) ||
    (navigator.maxTouchPoints > 1 && window.innerWidth < 1024));

export default function GameCanvas({ sendTelemetry }) {
  return (
    <Canvas
      shadows={!isMobile}
      dpr={isMobile ? [0.85, 1.25] : [1, 2]}
      camera={{ fov: 60, near: 0.1, far: 750, position: [0, 3.5, -50] }}
      gl={{
        antialias: !isMobile,
        powerPreference: 'high-performance',
        stencil: false,
        depth: true,
      }}
      style={{ position: 'absolute', inset: 0 }}
    >
      <color attach="background" args={['#1e1817']} />
      <fogExp2 attach="fog" args={['#1e1817', 0.002]} />

      <ambientLight color="#ffece0" intensity={isMobile ? 0.95 : 0.72} />
      <directionalLight
        color="#fff4e2"
        intensity={1.35}
        position={[-65, 120, -40]}
        castShadow={!isMobile}
        shadow-mapSize={[1024, 1024]}
        shadow-camera-near={10}
        shadow-camera-far={340}
        shadow-camera-left={-140}
        shadow-camera-right={140}
        shadow-camera-top={140}
        shadow-camera-bottom={-140}
      />
      <pointLight color="#00e5ff" intensity={4.5} distance={120} position={[42, 10, 38]} />

      <Suspense fallback={null}>
        <TrackAndDesk />
        <RaceController sendTelemetry={sendTelemetry} />
      </Suspense>

      <AdaptiveDpr pixelated />
      <AdaptiveEvents />
    </Canvas>
  );
}