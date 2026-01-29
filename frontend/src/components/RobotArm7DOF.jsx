import { useRef, useEffect, useState, useMemo } from 'react';
import { useFrame } from '@react-three/fiber';
import * as THREE from 'three';

/**
 * 7-DOF Robot Arm Component (Franka Panda-inspired)
 * Keyboard Controls:
 * - 1-7: Select joint (displayed on screen)
 * - Arrow Up/Down: Rotate selected joint
 * - R: Reset all joints to home position
 */
export default function RobotArm7DOF({
  position = [0, 0, 0],
  showLabels = true,
  onStateChange = null
}) {
  // Joint angles (in radians)
  const [jointAngles, setJointAngles] = useState([0, 0, 0, 0, 0, 0, 0]);
  const [selectedJoint, setSelectedJoint] = useState(0);

  // Notify parent of state changes
  useEffect(() => {
    if (onStateChange) {
      onStateChange({ jointAngles, selectedJoint });
    }
  }, [jointAngles, selectedJoint, onStateChange]);

  // Joint refs for rotation
  const joint1Ref = useRef();
  const joint2Ref = useRef();
  const joint3Ref = useRef();
  const joint4Ref = useRef();
  const joint5Ref = useRef();
  const joint6Ref = useRef();
  const joint7Ref = useRef();

  const jointRefs = [joint1Ref, joint2Ref, joint3Ref, joint4Ref, joint5Ref, joint6Ref, joint7Ref];

  // Robot dimensions (inspired by Franka Panda)
  const linkLength = 0.15;
  const linkRadius = 0.02;
  const jointRadius = 0.03;

  // Keyboard control
  useEffect(() => {
    const handleKeyDown = (e) => {
      const key = e.key;
      console.log('Robot Arm - Key pressed:', key); // Debug log

      // Select joint (1-7)
      if (key >= '1' && key <= '7') {
        const joint = parseInt(key) - 1;
        console.log('Selecting joint:', joint);
        setSelectedJoint(joint);
        return;
      }

      // Rotate joint
      if (key === 'ArrowUp' || key === 'ArrowDown') {
        e.preventDefault();
        const delta = key === 'ArrowUp' ? 0.1 : -0.1; // Increased for visibility
        console.log('Rotating joint', selectedJoint, 'by', delta);

        setJointAngles(prev => {
          const newAngles = [...prev];
          newAngles[selectedJoint] = prev[selectedJoint] + delta;

          // Apply joint limits (approximate Franka Panda limits)
          const limits = [
            [-2.8973, 2.8973],   // Joint 1
            [-1.7628, 1.7628],   // Joint 2
            [-2.8973, 2.8973],   // Joint 3
            [-3.0718, -0.0698],  // Joint 4
            [-2.8973, 2.8973],   // Joint 5
            [-0.0175, 3.7525],   // Joint 6
            [-2.8973, 2.8973]    // Joint 7
          ];

          newAngles[selectedJoint] = Math.max(
            limits[selectedJoint][0],
            Math.min(limits[selectedJoint][1], newAngles[selectedJoint])
          );

          console.log('New angle for joint', selectedJoint, ':', newAngles[selectedJoint]);
          return newAngles;
        });
      }

      // Reset to home position
      if (key === 'r' || key === 'R') {
        console.log('Resetting all joints');
        setJointAngles([0, 0, 0, 0, 0, 0, 0]);
        setSelectedJoint(0);
      }
    };

    console.log('Robot Arm - Keyboard listener attached');
    window.addEventListener('keydown', handleKeyDown);
    return () => {
      console.log('Robot Arm - Keyboard listener removed');
      window.removeEventListener('keydown', handleKeyDown);
    };
  }, [selectedJoint]);

  // Update joint rotations
  useFrame(() => {
    if (joint1Ref.current) {
      joint1Ref.current.rotation.y = jointAngles[0];
    }
    if (joint2Ref.current) {
      joint2Ref.current.rotation.z = jointAngles[1];
    }
    if (joint3Ref.current) {
      joint3Ref.current.rotation.y = jointAngles[2];
    }
    if (joint4Ref.current) {
      joint4Ref.current.rotation.z = jointAngles[3];
    }
    if (joint5Ref.current) {
      joint5Ref.current.rotation.y = jointAngles[4];
    }
    if (joint6Ref.current) {
      joint6Ref.current.rotation.z = jointAngles[5];
    }
    if (joint7Ref.current) {
      joint7Ref.current.rotation.y = jointAngles[6];
    }
  });

  // Materials (memoized to avoid recreation)
  const jointMaterial = useMemo(() => new THREE.MeshStandardMaterial({
    color: '#e0e0e0',
    metalness: 0.7,
    roughness: 0.3
  }), []);

  const linkMaterial = useMemo(() => new THREE.MeshStandardMaterial({
    color: '#f5f5f5',
    metalness: 0.5,
    roughness: 0.4
  }), []);

  const selectedMaterial = useMemo(() => new THREE.MeshStandardMaterial({
    color: '#10b981',
    metalness: 0.7,
    roughness: 0.3,
    emissive: '#10b981',
    emissiveIntensity: 0.3
  }), []);

  return (
    <group position={position}>
      {/* Base */}
      <mesh position={[0, 0.05, 0]}>
        <cylinderGeometry args={[0.08, 0.08, 0.1, 32]} />
        <meshStandardMaterial color="#2c3e50" metalness={0.8} roughness={0.2} />
      </mesh>

      {/* Joint 1 - Base rotation (Y-axis) */}
      <group ref={joint1Ref} position={[0, 0.1, 0]}>
        <mesh>
          <sphereGeometry args={[selectedJoint === 0 ? jointRadius * 1.2 : jointRadius, 32, 32]} />
          <primitive object={selectedJoint === 0 ? selectedMaterial : jointMaterial} />
        </mesh>

        {/* Link 1 */}
        <mesh position={[0, linkLength / 2, 0]}>
          <cylinderGeometry args={[linkRadius, linkRadius, linkLength, 16]} />
          <primitive object={linkMaterial} />
        </mesh>

        {/* Joint 2 - Shoulder (Z-axis) */}
        <group ref={joint2Ref} position={[0, linkLength, 0]}>
          <mesh>
            <sphereGeometry args={[selectedJoint === 1 ? jointRadius * 1.2 : jointRadius, 32, 32]} />
            <primitive object={selectedJoint === 1 ? selectedMaterial : jointMaterial} />
          </mesh>

          {/* Link 2 */}
          <mesh position={[0, linkLength / 2, 0]}>
            <cylinderGeometry args={[linkRadius, linkRadius, linkLength, 16]} />
            <primitive object={linkMaterial} />
          </mesh>

          {/* Joint 3 - Elbow (Y-axis) */}
          <group ref={joint3Ref} position={[0, linkLength, 0]}>
            <mesh>
              <sphereGeometry args={[selectedJoint === 2 ? jointRadius * 1.2 : jointRadius, 32, 32]} />
              <primitive object={selectedJoint === 2 ? selectedMaterial : jointMaterial} />
            </mesh>

            {/* Link 3 */}
            <mesh position={[0, linkLength / 2, 0]}>
              <cylinderGeometry args={[linkRadius, linkRadius, linkLength, 16]} />
              <primitive object={linkMaterial} />
            </mesh>

            {/* Joint 4 - Wrist 1 (Z-axis) */}
            <group ref={joint4Ref} position={[0, linkLength, 0]}>
              <mesh>
                <sphereGeometry args={[selectedJoint === 3 ? jointRadius * 1.2 : jointRadius, 32, 32]} />
                <primitive object={selectedJoint === 3 ? selectedMaterial : jointMaterial} />
              </mesh>

              {/* Link 4 */}
              <mesh position={[0, linkLength / 2, 0]}>
                <cylinderGeometry args={[linkRadius * 0.8, linkRadius * 0.8, linkLength, 16]} />
                <primitive object={linkMaterial} />
              </mesh>

              {/* Joint 5 - Wrist 2 (Y-axis) */}
              <group ref={joint5Ref} position={[0, linkLength, 0]}>
                <mesh>
                  <sphereGeometry args={[selectedJoint === 4 ? jointRadius * 1.2 : jointRadius, 32, 32]} />
                  <primitive object={selectedJoint === 4 ? selectedMaterial : jointMaterial} />
                </mesh>

                {/* Link 5 */}
                <mesh position={[0, linkLength / 2, 0]}>
                  <cylinderGeometry args={[linkRadius * 0.8, linkRadius * 0.8, linkLength, 16]} />
                  <primitive object={linkMaterial} />
                </mesh>

                {/* Joint 6 - Wrist 3 (Z-axis) */}
                <group ref={joint6Ref} position={[0, linkLength, 0]}>
                  <mesh>
                    <sphereGeometry args={[selectedJoint === 5 ? jointRadius * 1.2 : jointRadius, 32, 32]} />
                    <primitive object={selectedJoint === 5 ? selectedMaterial : jointMaterial} />
                  </mesh>

                  {/* Link 6 */}
                  <mesh position={[0, linkLength / 2 * 0.6, 0]}>
                    <cylinderGeometry args={[linkRadius * 0.6, linkRadius * 0.6, linkLength * 0.6, 16]} />
                    <primitive object={linkMaterial} />
                  </mesh>

                  {/* Joint 7 - End effector rotation (Y-axis) */}
                  <group ref={joint7Ref} position={[0, linkLength * 0.6, 0]}>
                    <mesh>
                      <sphereGeometry args={[selectedJoint === 6 ? jointRadius * 1.2 : jointRadius, 32, 32]} />
                      <primitive object={selectedJoint === 6 ? selectedMaterial : jointMaterial} />
                    </mesh>

                    {/* End effector / Gripper placeholder */}
                    <group position={[0, 0.05, 0]}>
                      <mesh position={[-0.02, 0, 0]}>
                        <boxGeometry args={[0.01, 0.06, 0.02]} />
                        <meshStandardMaterial color="#34495e" />
                      </mesh>
                      <mesh position={[0.02, 0, 0]}>
                        <boxGeometry args={[0.01, 0.06, 0.02]} />
                        <meshStandardMaterial color="#34495e" />
                      </mesh>
                    </group>
                  </group>
                </group>
              </group>
            </group>
          </group>
        </group>
      </group>

      {/* Control info overlay component (will be rendered separately) */}
      {showLabels && (
        <RobotControlInfo
          selectedJoint={selectedJoint}
          jointAngles={jointAngles}
        />
      )}
    </group>
  );
}

// Control information component (renders in HTML overlay)
function RobotControlInfo({ selectedJoint, jointAngles }) {
  useEffect(() => {
    // This will be handled by a separate UI component
  }, [selectedJoint, jointAngles]);

  return null;
}

// Export additional component for UI overlay
export function RobotControls({ selectedJoint, jointAngles }) {
  return (
    <div className="absolute top-6 left-6 z-40 bg-black/80 backdrop-blur-md p-4 rounded-xl border border-zinc-700 font-mono text-xs">
      <div className="text-emerald-400 font-bold mb-3 uppercase tracking-wider">
        7-DOF Robot Arm Controls
      </div>

      <div className="space-y-1 text-zinc-300 mb-3">
        <div>Press <kbd className="px-2 py-0.5 bg-zinc-700 rounded text-emerald-400">1-7</kbd> to select joint</div>
        <div>Press <kbd className="px-2 py-0.5 bg-zinc-700 rounded text-emerald-400">↑↓</kbd> to rotate</div>
        <div>Press <kbd className="px-2 py-0.5 bg-zinc-700 rounded text-emerald-400">R</kbd> to reset</div>
      </div>

      <div className="border-t border-zinc-700 pt-3 space-y-1">
        {jointAngles.map((angle, idx) => (
          <div
            key={idx}
            className={`flex justify-between items-center px-2 py-1 rounded ${
              idx === selectedJoint ? 'bg-emerald-500/20 text-emerald-400' : 'text-zinc-500'
            }`}
          >
            <span>Joint {idx + 1}:</span>
            <span>{(angle * 180 / Math.PI).toFixed(1)}°</span>
          </div>
        ))}
      </div>
    </div>
  );
}
