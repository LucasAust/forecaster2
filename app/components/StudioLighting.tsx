'use client';

import { Environment, Lightformer } from '@react-three/drei';

export default function StudioLighting() {
  return (
    <Environment resolution={1024}>
        <group rotation={[-Math.PI / 4, -0.3, 0]}>
            {/* Main "Key" Strip Light - The sharp white line often seen in Apple renders */}
            <Lightformer 
                intensity={4} 
                rotation-x={Math.PI / 2} 
                position={[0, 5, -9]} 
                scale={[10, 10, 1]} 
            />
            
            {/* Side "Rim" Lights - Provides the edge definition on the glass */}
            <Lightformer 
                intensity={2} 
                rotation-y={Math.PI / 2} 
                position={[-5, 1, -1]} 
                scale={[20, 2, 1]} 
            />
            
            <Lightformer 
                intensity={2} 
                rotation-y={Math.PI / 2} 
                position={[-5, -1, -1]} 
                scale={[20, 2, 1]} 
            />
            
            {/* Soft Fill Light - Prevents shadows from being too harsh */}
            <Lightformer 
                intensity={0.5} 
                rotation-y={-Math.PI / 2} 
                position={[10, 1, 0]} 
                scale={[20, 10, 1]} 
                color="#f8fafc" // Cooler white
            />

            {/* Blue Bounce Light - Adds that "Tech" gradient from the bottom */}
            <Lightformer 
                intensity={8} // Much stronger for metal reflections
                rotation-x={-Math.PI / 2} 
                position={[0, -5, 0]} 
                scale={[10, 10, 1]} 
                color="#3b82f6"
            />
        </group>
    </Environment>
  );
}
