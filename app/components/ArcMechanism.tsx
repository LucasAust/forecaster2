'use client';

import { useRef, useMemo } from 'react';
import { useFrame, useThree } from '@react-three/fiber';
import { Float, Text } from '@react-three/drei';
import * as THREE from 'three';

export default function ArcMechanism() {
  const groupRef = useRef<THREE.Group>(null!);
  const { viewport } = useThree();
  
  // Responsive positioning: Shift right on desktop, center on mobile
  const isMobile = viewport.width < 7; 
  const positionX = isMobile ? 0 : 3.5;

  useFrame((state) => {
    const t = state.clock.getElapsedTime();
    if (groupRef.current) {
        groupRef.current.rotation.y = t * 0.05;
        groupRef.current.rotation.x = Math.sin(t * 0.1) * 0.1;
    }
  });

  // Generate a Fibonacci Sphere of points (perfect distribution)
  const [points, connections] = useMemo(() => {
    const count = 150; // Number of nodes
    const radius = 3.5;
    const pts: THREE.Vector3[] = [];
    const phi = Math.PI * (3 - Math.sqrt(5)); // Golden angle

    for (let i = 0; i < count; i++) {
        const y = 1 - (i / (count - 1)) * 2; // y goes from 1 to -1
        const r = Math.sqrt(1 - y * y); // radius at y
        const theta = phi * i; // golden angle increment

        const x = Math.cos(theta) * r;
        const z = Math.sin(theta) * r;

        pts.push(new THREE.Vector3(x * radius, y * radius, z * radius));
    }

    // Create connections (lines) between close neighbors
    const lines: THREE.Vector3[] = [];
    pts.forEach((p1, i) => {
        // Connect to nearest 3 neighbors
        // Simple distance check (O(N^2) but N is small so it's fine)
        const neighbors = pts
            .map((p2, j) => ({ idx: j, dist: p1.distanceTo(p2) }))
            .filter(n => n.idx !== i)
            .sort((a, b) => a.dist - b.dist)
            .slice(0, 3); // Top 3 closest

        neighbors.forEach(n => {
            if (n.dist < 2.0) { // Max connection distance
                lines.push(p1);
                lines.push(pts[n.idx]);
            }
        });
    });

    return [pts, lines];
  }, []);

  // Convert to Float32Array for BufferGeometry
  const lineGeometry = useMemo(() => {
     const geo = new THREE.BufferGeometry().setFromPoints(connections);
     return geo;
  }, [connections]);

  const dotTexture = useMemo(() => {
      if (typeof document === 'undefined') return null;
      return getDotTexture();
  }, []);

  return (
    <group ref={groupRef} dispose={null} position={[positionX, 0, 0]}>
      <Float speed={2} rotationIntensity={0.2} floatIntensity={0.1} floatingRange={[-0.1, 0.1]}>
        
        {/* === CENTRAL BRAIN / CORE === */}
        {/* A subtle inner sphere to give it mass */}
        <mesh renderOrder={1}>
            <sphereGeometry args={[3.2, 32, 32]} />
            <meshStandardMaterial 
                color="#eff6ff" // Very light blue
                emissive="#2563eb" // Stronger Pulse
                emissiveIntensity={0.2}
                transparent
                opacity={0.15}
                side={THREE.DoubleSide}
                depthWrite={false}
            />
        </mesh>
        
        {/* === OCCLUDER SPHERE === */}
        <mesh renderOrder={0}>
             <sphereGeometry args={[3.15, 32, 32]} />
             <meshBasicMaterial 
                colorWrite={false} 
                depthWrite={true} 
             />
        </mesh>

        {/* === NODES === */}
        <points>
            <bufferGeometry setFromPoints={points} />
            <pointsMaterial 
                color="#1d4ed8" // Darker Blue for contrast against white
                size={0.18} 
                transparent 
                opacity={1.0} // Fully opaque
                map={dotTexture} 
                sizeAttenuation 
                alphaTest={0.5}
            />
        </points>

        {/* === SYNAPSES (CONNECTIONS) === */}
        <lineSegments geometry={lineGeometry}>
            <lineBasicMaterial 
                color="#3b82f6" // Primary Blue
                transparent 
                opacity={0.35} // Much clearer
                depthWrite={false} 
            />
        </lineSegments>

        {/* === ORBITING TEXT === */}
        {/* Revolving text elements - Multiple orbits for density */}
        <OrbitingText radius={3.6} speed={0.5} offset={0} tilt={[0, 0, Math.PI / 8]} text="ARC PREDICT" />
        <OrbitingText radius={3.6} speed={0.4} offset={2.5} tilt={[Math.PI / 6, 0, -Math.PI / 6]} text="ARC PREDICT" reverse />
        <OrbitingText radius={3.6} speed={0.6} offset={4} tilt={[0, Math.PI/4, 0]} text="ARC PREDICT" />
        
        <OrbitingText radius={3.6} speed={0.3} offset={1} tilt={[Math.PI / 4, 0, Math.PI / 4]} text="ARC PREDICT" />
        <OrbitingText radius={3.6} speed={0.7} offset={5} tilt={[0, 0, -Math.PI / 4]} text="ARC PREDICT" reverse />
        <OrbitingText radius={3.6} speed={0.4} offset={3.5} tilt={[Math.PI / 3, Math.PI / 6, 0]} text="ARC PREDICT" />
        <OrbitingText radius={3.6} speed={0.2} offset={0.5} tilt={[-Math.PI / 6, 0, Math.PI / 3]} text="ARC PREDICT" reverse />
        <OrbitingText radius={3.6} speed={0.55} offset={2} tilt={[0, -Math.PI / 4, Math.PI / 6]} text="ARC PREDICT" />
        <OrbitingText radius={3.6} speed={0.25} offset={4.5} tilt={[Math.PI / 2, 0, 0]} text="ARC PREDICT" />

      </Float>
    </group>
  );
}

// Simple texture generator for soft dots
function getDotTexture() {
    if (typeof document === 'undefined') return null;
    const canvas = document.createElement('canvas');
    canvas.width = 32;
    canvas.height = 32;
    const ctx = canvas.getContext('2d');
    if (ctx) {
        ctx.beginPath();
        ctx.arc(16, 16, 10, 0, 2 * Math.PI);
        ctx.fillStyle = '#ffffff';
        ctx.fill();
    }
    const texture = new THREE.CanvasTexture(canvas);
    return texture;
}

function OrbitingText({ radius, speed, offset, tilt = [0, 0, 0], reverse = false, text }: any) {
    const ref = useRef<THREE.Group>(null!);
    const chars = text.split('');
    // Calculate angular spacing based on radius to keep letter distance roughly constant
    // Assuming average char width + gap is around 0.3 units
    const angleStep = 0.3 / radius; 

    useFrame(({ clock }) => {
        if (!ref.current) return;
        const t = clock.getElapsedTime() * speed + offset;
        ref.current.rotation.y = t * (reverse ? -1 : 1);
    });

    return (
        <group rotation={tilt}>
            <group ref={ref}>
                {chars.map((char: string, i: number) => {
                    // Center the string around the lead point (angle 0)
                    const angle = (i - (chars.length - 1) / 2) * angleStep;
                    return (
                        <group key={i} rotation={[0, angle, 0]}>
                            <mesh position={[radius, 0, 0]}>
                                <Text
                                    fontSize={0.4}
                                    color="#2563eb"
                                    anchorX="center"
                                    anchorY="middle"
                                    font="/fonts/Orbitron.ttf"
                                    rotation={[0, Math.PI / 2, 0]}
                                >
                                    {char}
                                </Text>
                            </mesh>
                        </group>
                    );
                })}
            </group>
        </group>
    )
}