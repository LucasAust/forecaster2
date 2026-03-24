'use client';

import { Canvas } from '@react-three/fiber';
import { Suspense } from 'react';
import ArcMechanism from './ArcMechanism';
import StudioLighting from './StudioLighting';

export default function Scene() {
  return (
    <div className="w-full h-full absolute inset-0">
      <Canvas
        camera={{ position: [0, 0, 12], fov: 35 }} // Standard cinematic wide
        gl={{ 
            antialias: true, 
            alpha: true,
            powerPreference: "high-performance",
            toneMapping: 3 // THREE.ACESFilmicToneMapping
        }}
        dpr={[1, 1.5]} // Optimization
      >
        <Suspense fallback={null}>
          <ArcMechanism />
          <StudioLighting />
        </Suspense>
      </Canvas>
    </div>
  );
}
