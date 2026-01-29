
import { Canvas, useLoader } from '@react-three/fiber';
import { 
    OrbitControls, PerspectiveCamera, Environment, Grid, Html, RoundedBox, useTexture
} from '@react-three/drei';
import { EffectComposer, Bloom, ToneMapping, Vignette } from '@react-three/postprocessing';
import { ToneMappingMode } from 'postprocessing';
import * as THREE from 'three';
import { Suspense, useMemo, useEffect, useState } from 'react';
import FrankaRobot from './FrankaRobot';

// --- 0. HELPERS ---
const LoadingFallback = () => (
    <Html center>
        <div className="flex flex-col items-center pointer-events-none select-none">
            <div className="w-12 h-12 border-4 border-emerald-500 border-t-transparent rounded-full animate-spin mb-2 shadow-[0_0_15px_rgba(16,185,129,0.4)]"></div>
            <div className="text-emerald-500 font-mono text-xs tracking-widest bg-black/80 px-3 py-1 rounded border border-emerald-500/20 backdrop-blur-md">LOADING TEXTURES...</div>
        </div>
    </Html>
);

// --- 1. PROCEDURAL LAB ---
const ProceduralLabEnv = () => (
    <group position={[0, -0.65, 0]}>
        <mesh position={[0.5, 0.325, 0]} receiveShadow castShadow>
            <boxGeometry args={[1.0, 0.65, 1.5]} />
            <meshStandardMaterial color="#151515" roughness={0.2} metalness={0.8} />
        </mesh>
        <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, 0, 0]}>
            <planeGeometry args={[20, 20]} />
            <meshStandardMaterial color="#050505" roughness={0.5} metalness={0.5} />
        </mesh>
    </group>
);

// --- 2. ROBOT ARM VISUAL (Fallback) ---
const RobotArm = ({ position, rotation, isOpen, color }) => {
    if(!position || !rotation) return null;
    return (
        <group position={position} quaternion={new THREE.Quaternion(...rotation)}>
             <group rotation={[0, 0, 0]}>
                 <mesh castShadow receiveShadow position={[0, 0, -0.05]} rotation={[1.57, 0, 0]}>
                    <cylinderGeometry args={[0.04, 0.04, 0.15]} />
                    <meshStandardMaterial color="#111" roughness={0.2} metalness={0.9} />
                 </mesh>
                 <mesh position={[0, 0, -0.02]} rotation={[1.57, 0, 0]}>
                    <torusGeometry args={[0.042, 0.005, 16, 32]} />
                    <meshBasicMaterial color={color} toneMapped={false} />
                 </mesh>
            </group>
        </group>
    );
};

// --- 3. DYNAMIC OBJECTS ---
const SimObject = ({ data }) => (
    <mesh position={data.pos} quaternion={new THREE.Quaternion(...data.orn)} castShadow receiveShadow>
        <RoundedBox args={[0.06, 0.06, 0.06]} radius={0.01} smoothness={4}>
            <meshStandardMaterial 
                color={data.name.includes('goal') ? "#06b6d4" : "#f97316"} 
                emissive={data.name.includes('goal') ? "#06b6d4" : "#000"} 
                emissiveIntensity={data.name.includes('goal') ? 2 : 0} 
                toneMapped={false} 
                transparent={data.name.includes('goal')} 
                opacity={data.name.includes('goal') ? 0.4 : 1.0} 
            />
        </RoundedBox>
    </mesh>
);

// --- 4. WEBCAM PLANE ---
const WebcamPlane = ({ stream, isMirrored }) => {
    const texture = useMemo(() => {
        if (!stream) return null;
        const video = document.createElement('video');
        video.srcObject = stream;
        video.playsInline = true;
        video.play().catch(e => console.error(e));
        const tex = new THREE.VideoTexture(video);
        tex.colorSpace = THREE.SRGBColorSpace;
        return tex;
    }, [stream]);

    if (!texture) return null;
    return (
        <mesh position={[0, 0, -5]} scale={[isMirrored ? 8.8 : -8.8, 5, 1]}>
            <planeGeometry />
            <meshBasicMaterial map={texture} toneMapped={false} />
        </mesh>
    );
};

// --- 5. RECONSTRUCTED SCENE (The Fix) ---
const MovableReconstructedScene = ({ texVersion, isPlacementMode, onSceneClick }) => {
    
    // THIS IS THE FIX: Explicitly configuring the TextureLoader
    // We force crossOrigin = "anonymous" so port 5173 can use images from port 8001
    const [colorMap, depthMap] = useLoader(THREE.TextureLoader, [
        `http://localhost:8001/static/scene_texture.jpg?t=${texVersion}`,
        `http://localhost:8001/static/scene_depth.png?t=${texVersion}`
    ], (loader) => {
        loader.setCrossOrigin('anonymous');
    });

    // Configure textures once loaded
    useEffect(() => {
        if (colorMap) colorMap.colorSpace = THREE.SRGBColorSpace;
    }, [colorMap]);

    return (
        <group position={[0, -0.5, 0]}> 
            <mesh 
                rotation={[-Math.PI / 2, 0, Math.PI]} 
                receiveShadow castShadow
                onClick={(e) => {
                    e.stopPropagation();
                    if (isPlacementMode && onSceneClick) onSceneClick(e.point);
                }}
                onPointerOver={() => { if(isPlacementMode) document.body.style.cursor = 'crosshair'; }}
                onPointerOut={() => { document.body.style.cursor = 'default'; }}
            >
                {/* High poly count for displacement */}
                <planeGeometry args={[4.0, 2.25, 256, 144]} />
                
                {/* Using MeshBasicMaterial first to ensure visibility (ignores lights) */}
                {/* Once you confirm it works, you can switch back to MeshStandardMaterial */}
                <meshStandardMaterial 
                    map={colorMap} 
                    displacementMap={depthMap} 
                    displacementScale={0.4} 
                    displacementBias={-0.1} 
                    side={THREE.DoubleSide}
                    roughness={0.8}
                    metalness={0.1}
                />
            </mesh>
            {/* Solid Backing */}
            <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, -0.1, 0]} receiveShadow>
                <planeGeometry args={[10, 10]} />
                <meshStandardMaterial color="#111111" />
            </mesh>
        </group>
    );
};

// --- MAIN SCENE COMPONENT ---
export const Scene = ({
    simState, webcamStream, isFrozen, texVersion, isMirrored, envType, showFrankaRobot,
    isPlacementMode, onRobotMove, robotBasePos,
    teleopEnabled, teleopTarget, onFrankaStateChange, frankaJointAngles
}) => {
    const isAR = !!webcamStream;
    
    return (
        <Canvas 
            shadows 
            dpr={[1, 1.5]} 
            gl={{ antialias: false, toneMapping: THREE.NoToneMapping }} 
            className="bg-[#050505]"
            camera={{ position: [0, 1.5, 2.5], fov: 50 }}
        >
            {isAR ? (
                <PerspectiveCamera makeDefault position={[0, 0, 0]} fov={60} />
            ) : (
                <OrbitControls 
                    makeDefault 
                    target={[0, 0, 0]} 
                    minDistance={0.5} 
                    maxDistance={15} 
                    enableDamping={true}
                />
            )}

            <Environment preset="city" background={false} blur={0.8} />
            <ambientLight intensity={2.0} /> 
            <spotLight position={[2, 5, 2]} intensity={60} castShadow shadow-bias={-0.0001} />
            <pointLight position={[-2, 2, -2]} intensity={20} color="#4f46e5" />

            <Suspense fallback={<LoadingFallback />}>
                
                {/* 1. AR Background */}
                {isAR && <WebcamPlane stream={webcamStream} isMirrored={isMirrored} />}
                
                {/* 2. Grid Floor (Always visible when not AR) */}
                {!isAR && (
                    <group position={[0, -0.01, 0]}>
                        <Grid args={[20, 20]} cellSize={0.5} cellThickness={0.5} cellColor="#1a1a2e" sectionSize={2} sectionThickness={1} sectionColor="#10b981" fadeDistance={30} infiniteGrid={true} />
                        <mesh rotation={[-Math.PI / 2, 0, 0]} receiveShadow>
                            <planeGeometry args={[50, 50]} />
                            <meshStandardMaterial color="#0a0a0f" transparent opacity={0.8} side={THREE.DoubleSide} />
                        </mesh>
                    </group>
                )}

                {/* 3. Sim Env */}
                {!isAR && !isFrozen && envType && (
                    <group rotation={[-Math.PI / 2, 0, 0]}><ProceduralLabEnv /></group>
                )}
                
                {/* 4. RECONSTRUCTED SCENE (The Fix Applied Here) */}
                {!isAR && isFrozen && (
                    <MovableReconstructedScene 
                        texVersion={texVersion} 
                        isPlacementMode={isPlacementMode}
                        onSceneClick={(point) => onRobotMove && onRobotMove([point.x, point.y, point.z])}
                    />
                )}

                {/* 5. Robots & Objects */}
                <group>
                    {simState?.objects?.map(o => <SimObject key={o.name} data={o} />)}

                    {simState?.robots?.right && !showFrankaRobot && (
                        <RobotArm 
                            position={simState.robots.right.ee_pos} 
                            rotation={simState.robots.right.ee_orn} 
                            isOpen={simState.robots.right.gripper_width > 0.02} 
                            color="#10b981" 
                        />
                    )}

                    {showFrankaRobot && (
                        <>
                            {isPlacementMode ? (
                                <group position={robotBasePos || [0,0,0]}>
                                    <group opacity={0.5} transparent><FrankaRobot position={[0, 0, 0]} /></group>
                                    <mesh rotation={[-Math.PI/2, 0, 0]}><ringGeometry args={[0.2, 0.25, 32]} /><meshBasicMaterial color="#10b981" opacity={0.8} transparent side={THREE.DoubleSide}/></mesh>
                                    <arrowHelper args={[new THREE.Vector3(0,0,1), new THREE.Vector3(0,0,0), 0.5, 0x10b981]} />
                                </group>
                            ) : (
                                <FrankaRobot 
                                    position={robotBasePos || [0,0,0]} 
                                    teleopEnabled={teleopEnabled} 
                                    teleopTarget={teleopTarget} 
                                    onStateChange={onFrankaStateChange}
                                    jointAngles={frankaJointAngles} 
                                />
                            )}
                        </>
                    )}
                </group>
            </Suspense>

            {!isAR && !isPlacementMode && (
                <EffectComposer disableNormalPass>
                    <Bloom luminanceThreshold={1} intensity={1.2} radius={0.5} />
                    <ToneMapping mode={ToneMappingMode.ACES_FILMIC} />
                    <Vignette eskil={false} offset={0.1} darkness={0.7} />
                </EffectComposer>
            )}
        </Canvas>
    );
};