import { Canvas } from '@react-three/fiber';
import { OrbitControls, Grid, Environment } from '@react-three/drei';
import { useState, Suspense } from 'react';
import FrankaRobot, { FrankaControls } from './FrankaRobot';

// Loading placeholder while meshes load
function LoadingBox() {
  return (
    <mesh position={[0, 0.5, 0]}>
      <boxGeometry args={[0.2, 0.2, 0.2]} />
      <meshStandardMaterial color="#10b981" wireframe />
    </mesh>
  );
}

/**
 * Standalone demo component for the 7-DOF Robot Arm
 * This can be used as a separate page or integrated into your existing app
 */
export default function RobotArmDemo() {
  const [jointAngles, setJointAngles] = useState([0, 0, 0, 0, 0, 0, 0]);
  const [selectedJoint, setSelectedJoint] = useState(0);

  return (
    <div className="w-full h-screen bg-gradient-to-br from-zinc-900 via-black to-zinc-900 relative">
      {/* Title */}
      <div className="absolute top-6 left-1/2 -translate-x-1/2 z-50 text-center">
        <h1 className="text-4xl font-bold text-white mb-2">
          Franka Emika Panda FR3
        </h1>
        <p className="text-zinc-400 text-sm">
          7-DOF Robot Arm with Real Meshes
        </p>
      </div>

      {/* Control Panel */}
      <FrankaControls selectedJoint={selectedJoint} jointAngles={jointAngles} />

      {/* 3D Canvas */}
      <Canvas
        camera={{ position: [1.5, 1, 1.5], fov: 50 }}
        shadows
      >
        {/* Lighting */}
        <ambientLight intensity={0.4} />
        <directionalLight
          position={[5, 5, 5]}
          intensity={1}
          castShadow
          shadow-mapSize={[2048, 2048]}
        />
        <pointLight position={[-5, 5, -5]} intensity={0.5} />

        {/* Environment */}
        <Environment preset="studio" />

        {/* Grid */}
        <Grid
          args={[10, 10]}
          cellSize={0.2}
          cellThickness={0.5}
          cellColor="#6b7280"
          sectionSize={1}
          sectionThickness={1}
          sectionColor="#9ca3af"
          fadeDistance={25}
          fadeStrength={1}
          followCamera={false}
          infiniteGrid={false}
        />

        {/* Robot Arm with Loading Fallback */}
        <Suspense fallback={<LoadingBox />}>
          <FrankaRobot
            position={[0, 0, 0]}
            onStateChange={({ jointAngles: angles, selectedJoint: joint }) => {
              setJointAngles(angles);
              setSelectedJoint(joint);
            }}
          />
        </Suspense>

        {/* Camera Controls - will auto-disable when transform controls are active */}
        <OrbitControls
          enableDamping
          dampingFactor={0.05}
          minDistance={0.5}
          maxDistance={5}
          target={[0, 0.5, 0]}
          makeDefault
        />
      </Canvas>

      {/* Instructions Panel */}
      <div className="absolute bottom-6 left-1/2 -translate-x-1/2 z-40 bg-black/80 backdrop-blur-md px-6 py-3 rounded-xl border border-zinc-700">
        <div className="flex items-center gap-4 text-sm text-zinc-300">
          <span className="text-emerald-400 font-bold">Joint:</span>
          <span>
            <kbd className="px-2 py-1 bg-zinc-700 rounded text-xs">1-7</kbd> Select
          </span>
          <span>
            <kbd className="px-2 py-1 bg-zinc-700 rounded text-xs">↑↓</kbd> Rotate
          </span>
          <span className="text-zinc-500">|</span>
          <span className="text-cyan-400 font-bold">Transform:</span>
          <span>
            <kbd className="px-2 py-1 bg-zinc-700 rounded text-xs">T</kbd> Toggle
          </span>
          <span>
            <kbd className="px-2 py-1 bg-zinc-700 rounded text-xs">G</kbd> Move
          </span>
          <span>
            <kbd className="px-2 py-1 bg-zinc-700 rounded text-xs">E</kbd> Rotate
          </span>
          <span className="text-zinc-500">|</span>
          <span className="text-zinc-500">Mouse: Orbit</span>
        </div>
      </div>

      {/* Info */}
      <div className="absolute bottom-6 right-6 z-40 bg-black/80 backdrop-blur-md p-4 rounded-xl border border-zinc-700 text-xs text-zinc-400 max-w-xs">
        <div className="font-bold text-emerald-400 mb-2">Franka Emika Panda FR3</div>
        <p>
          Authentic 7-DOF collaborative robot arm with real Franka meshes.
          Features torque sensors in all joints, allowing for safe human-robot
          collaboration and precise force control.
        </p>
      </div>
    </div>
  );
}
