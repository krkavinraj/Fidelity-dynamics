import { useRef, useEffect, useState, useMemo } from 'react';
import { useFrame } from '@react-three/fiber';
import { TransformControls } from '@react-three/drei';
import URDFLoader from 'urdf-loader';
import * as THREE from 'three';

// Franka Panda DH Parameters (simplified for IK)
const FRANKA_DH = {
  d: [0.333, 0, 0.316, 0, 0.384, 0, 0],
  a: [0, 0, 0, 0.0825, -0.0825, 0, 0.088],
  alpha: [0, -Math.PI/2, Math.PI/2, Math.PI/2, -Math.PI/2, Math.PI/2, Math.PI/2]
};

// Joint limits for Franka Panda
const JOINT_LIMITS = [
  [-2.8973, 2.8973],
  [-1.7628, 1.7628],
  [-2.8973, 2.8973],
  [-3.0718, -0.0698],
  [-2.8973, 2.8973],
  [-0.0175, 3.7525],
  [-2.8973, 2.8973]
];

// Clamp value to joint limits
const clampJoint = (angle, idx) => {
  return Math.max(JOINT_LIMITS[idx][0], Math.min(JOINT_LIMITS[idx][1], angle));
};

// Linear interpolation
const lerp = (a, b, t) => a + (b - a) * t;

// Forward Kinematics - compute end-effector position from joint angles
const forwardKinematics = (jointAngles) => {
  let T = new THREE.Matrix4();
  T.identity();

  for (let i = 0; i < 7; i++) {
    const theta = jointAngles[i];
    const d = FRANKA_DH.d[i];
    const a = FRANKA_DH.a[i];
    const alpha = FRANKA_DH.alpha[i];

    // DH transformation matrix
    const ct = Math.cos(theta);
    const st = Math.sin(theta);
    const ca = Math.cos(alpha);
    const sa = Math.sin(alpha);

    const Ti = new THREE.Matrix4();
    Ti.set(
      ct, -st * ca, st * sa, a * ct,
      st, ct * ca, -ct * sa, a * st,
      0, sa, ca, d,
      0, 0, 0, 1
    );

    T.multiply(Ti);
  }

  // Add end-effector offset (flange to gripper)
  const eeOffset = new THREE.Matrix4();
  eeOffset.makeTranslation(0, 0, 0.107);
  T.multiply(eeOffset);

  const position = new THREE.Vector3();
  position.setFromMatrixPosition(T);

  return position;
};

// Jacobian-based Inverse Kinematics (Damped Least Squares with better convergence)
const solveIK = (targetPos, currentAngles, iterations = 20) => {
  const newAngles = [...currentAngles];
  const lambda = 0.5; // Damping factor for stability
  const maxStep = 0.15; // Maximum step size per iteration

  for (let iter = 0; iter < iterations; iter++) {
    const currentPos = forwardKinematics(newAngles);
    const error = new THREE.Vector3().subVectors(targetPos, currentPos);
    const errorMag = error.length();

    // Early exit if close enough
    if (errorMag < 0.002) break;

    // Numerical Jacobian approximation
    const jacobian = [];
    const delta = 0.0001;

    for (let j = 0; j < 7; j++) {
      const tempAngles = [...newAngles];
      tempAngles[j] += delta;
      const newPos = forwardKinematics(tempAngles);
      const dPos = new THREE.Vector3().subVectors(newPos, currentPos).divideScalar(delta);
      jacobian.push(dPos);
    }

    // Compute Jacobian transpose for gradient
    // Use damped least squares: dq = J^T * (J*J^T + lambda^2*I)^-1 * e
    // Simplified to gradient descent with adaptive step size
    const adaptiveStep = Math.min(maxStep, 0.5 * errorMag);

    for (let j = 0; j < 7; j++) {
      const gradient = jacobian[j].dot(error);
      // Apply damped update with joint-specific weighting
      const weight = j < 3 ? 1.0 : 0.8; // Lower weight for wrist joints
      const update = gradient * adaptiveStep * weight / (1.0 + lambda * lambda);
      newAngles[j] += update;
      newAngles[j] = clampJoint(newAngles[j], j);
    }
  }

  return newAngles;
};

/**
 * Franka Emika Panda Robot with Hand Tracking Teleop
 * NOW SUPPORTING: "Ghost" (Target) vs "Real" (Server Physics) visualization
 */
export default function FrankaRobot({
  position = [0, 0, 0],
  onStateChange = null,
  teleopEnabled = false,
  teleopTarget = null, // { pos: [x, y, z], gripper: 0|1 }
  onJointAnglesChange = null,
  serverJointAngles = null // NEW: Received from backend physics engine
}) {
  // Local state for GHOST robot (Immediate visual feedback)
  const [ghostJointAngles, setGhostJointAngles] = useState([0, 0, 0, -Math.PI/2, 0, Math.PI/2, 0]);
  const [selectedJoint, setSelectedJoint] = useState(0);
  const [robotModel, setRobotModel] = useState(null); // The loaded GLTF/URDF
  
  const [transformMode, setTransformMode] = useState('translate');
  const [showTransformControls, setShowTransformControls] = useState(false);
  const [gripperOpen, setGripperOpen] = useState(true);
  
  const robotRef = useRef();
  const ghostRobotRef = useRef();
  
  const targetAnglesRef = useRef([0, 0, 0, -Math.PI/2, 0, Math.PI/2, 0]);
  const smoothingFactor = 0.35;

  // Load robot with URDF
  useEffect(() => {
    const manager = new THREE.LoadingManager();
    const loader = new URDFLoader(manager);

    loader.packages = {
      'franka_description': '/franka_meshes'
    };

    const urdfContent = `<?xml version="1.0"?>
<robot name="franka_panda">
  <link name="world"/>

  <link name="panda_link0">
    <visual>
      <origin xyz="0 0 0" rpy="0 0 0"/>
      <geometry>
        <mesh filename="package://franka_description/robot_arms/fr3/visual/link0.dae"/>
      </geometry>
    </visual>
  </link>

  <joint name="panda_joint1" type="revolute">
    <parent link="panda_link0"/>
    <child link="panda_link1"/>
    <origin xyz="0 0 0.333" rpy="0 0 0"/>
    <axis xyz="0 0 1"/>
    <limit lower="-2.8973" upper="2.8973" effort="87" velocity="2.1750"/>
  </joint>

  <link name="panda_link1">
    <visual>
      <origin xyz="0 0 0" rpy="0 0 0"/>
      <geometry>
        <mesh filename="package://franka_description/robot_arms/fr3/visual/link1.dae"/>
      </geometry>
    </visual>
  </link>

  <joint name="panda_joint2" type="revolute">
    <parent link="panda_link1"/>
    <child link="panda_link2"/>
    <origin xyz="0 0 0" rpy="${-Math.PI/2} 0 0"/>
    <axis xyz="0 0 1"/>
    <limit lower="-1.7628" upper="1.7628" effort="87" velocity="2.1750"/>
  </joint>

  <link name="panda_link2">
    <visual>
      <origin xyz="0 0 0" rpy="0 0 0"/>
      <geometry>
        <mesh filename="package://franka_description/robot_arms/fr3/visual/link2.dae"/>
      </geometry>
    </visual>
  </link>

  <joint name="panda_joint3" type="revolute">
    <parent link="panda_link2"/>
    <child link="panda_link3"/>
    <origin xyz="0 -0.316 0" rpy="${Math.PI/2} 0 0"/>
    <axis xyz="0 0 1"/>
    <limit lower="-2.8973" upper="2.8973" effort="87" velocity="2.1750"/>
  </joint>

  <link name="panda_link3">
    <visual>
      <origin xyz="0 0 0" rpy="0 0 0"/>
      <geometry>
        <mesh filename="package://franka_description/robot_arms/fr3/visual/link3.dae"/>
      </geometry>
    </visual>
  </link>

  <joint name="panda_joint4" type="revolute">
    <parent link="panda_link3"/>
    <child link="panda_link4"/>
    <origin xyz="0.0825 0 0" rpy="${Math.PI/2} 0 0"/>
    <axis xyz="0 0 1"/>
    <limit lower="-3.0718" upper="-0.0698" effort="87" velocity="2.1750"/>
  </joint>

  <link name="panda_link4">
    <visual>
      <origin xyz="0 0 0" rpy="0 0 0"/>
      <geometry>
        <mesh filename="package://franka_description/robot_arms/fr3/visual/link4.dae"/>
      </geometry>
    </visual>
  </link>

  <joint name="panda_joint5" type="revolute">
    <parent link="panda_link4"/>
    <child link="panda_link5"/>
    <origin xyz="-0.0825 0.384 0" rpy="${-Math.PI/2} 0 0"/>
    <axis xyz="0 0 1"/>
    <limit lower="-2.8973" upper="2.8973" effort="12" velocity="2.6100"/>
  </joint>

  <link name="panda_link5">
    <visual>
      <origin xyz="0 0 0" rpy="0 0 0"/>
      <geometry>
        <mesh filename="package://franka_description/robot_arms/fr3/visual/link5.dae"/>
      </geometry>
    </visual>
  </link>

  <joint name="panda_joint6" type="revolute">
    <parent link="panda_link5"/>
    <child link="panda_link6"/>
    <origin xyz="0 0 0" rpy="${Math.PI/2} 0 0"/>
    <axis xyz="0 0 1"/>
    <limit lower="-0.0175" upper="3.7525" effort="12" velocity="2.6100"/>
  </joint>

  <link name="panda_link6">
    <visual>
      <origin xyz="0 0 0" rpy="0 0 0"/>
      <geometry>
        <mesh filename="package://franka_description/robot_arms/fr3/visual/link6.dae"/>
      </geometry>
    </visual>
  </link>

  <joint name="panda_joint7" type="revolute">
    <parent link="panda_link6"/>
    <child link="panda_link7"/>
    <origin xyz="0.088 0 0" rpy="${Math.PI/2} 0 0"/>
    <axis xyz="0 0 1"/>
    <limit lower="-2.8973" upper="2.8973" effort="12" velocity="2.6100"/>
  </joint>

  <link name="panda_link7">
    <visual>
      <origin xyz="0 0 0" rpy="0 0 ${Math.PI/4}"/>
      <geometry>
        <mesh filename="package://franka_description/robot_arms/fr3/visual/link7.dae"/>
      </geometry>
    </visual>
  </link>
</robot>`;

    const blob = new Blob([urdfContent], { type: 'text/xml' });
    const url = URL.createObjectURL(blob);

    loader.load(url, (loadedRobot) => {
      // Configure REAL robot materials (Solid)
      loadedRobot.traverse(child => {
          if(child.isMesh) {
              child.castShadow = true;
              child.receiveShadow = true;
          }
      });
      setRobotModel(loadedRobot);
      URL.revokeObjectURL(url);
    });
  }, []);

  // --- GHOST ROBOT LOGIC (Client-Side IK) ---
  useEffect(() => {
    if (teleopEnabled && teleopTarget && teleopTarget.pos) {
      const targetPos = new THREE.Vector3(...teleopTarget.pos);
      // Solve IK for the Ghost
      const newAngles = solveIK(targetPos, ghostJointAngles, 20);
      targetAnglesRef.current = newAngles;
      
      if (teleopTarget.gripper !== undefined) {
        setGripperOpen(teleopTarget.gripper < 0.5);
      }
    }
  }, [teleopTarget, teleopEnabled, ghostJointAngles]);

  // Animation Loop: Smooth Ghost & Update Real
  useFrame(() => {
    // 1. Smooth Ghost Movement
    if (teleopEnabled) {
      const smoothed = ghostJointAngles.map((a, i) => lerp(a, targetAnglesRef.current[i], smoothingFactor));
      setGhostJointAngles(smoothed);
    }
    
    // 2. Drive Real Robot (from Server State) OR Ghost Robot (from Local State)
    if (robotModel && robotRef.current) {
        // If we have server state, that takes precedence for the "solid" robot
        const anglesToUse = serverJointAngles || ghostJointAngles;
        
        // Map angles to joints
        const jointNames = ['panda_joint1', 'panda_joint2', 'panda_joint3', 'panda_joint4', 'panda_joint5', 'panda_joint6', 'panda_joint7'];
        anglesToUse.forEach((angle, idx) => {
            const name = jointNames[idx];
            if (robotModel.joints[name]) robotModel.setJointValue(name, angle);
        });
    }
  });

  // Render
  if (!robotModel) return null;
  
  // Clone for Ghost if needed
  // Note: Deep cloning complex URDFs in ThreeJS can be expensive/buggy.
  // Strategy: We only render ONE visual robot. 
  // If Teleop is ON -> Render Ghost (Transparent) at ghostAngles AND Real (Solid) at serverAngles?
  // For simplicity/performance on 8GB RAM:
  // - We will just render the REAL robot driven by Server.
  // - We render a simple "Target Marker" sphere for the Ghost hand.
  
  return (
    <>
      <group ref={robotRef} position={position} rotation={[Math.PI / 2, 0, 0]}>
        <primitive object={robotModel} />
      </group>

      {/* Gripper Placeholder (Simple Box) attached to end effector is handled inside URDF logic usually, 
          but here we use manual attachment in previous code. We keep it simple. */}
          
      {/* Ghost Target Marker */}
      {teleopEnabled && teleopTarget && teleopTarget.pos && (
        <mesh position={teleopTarget.pos}>
          <sphereGeometry args={[0.05, 16, 16]} />
          <meshBasicMaterial color="#06b6d4" transparent opacity={0.4} wireframe />
        </mesh>
      )}

      {showTransformControls && !teleopEnabled && (
        <TransformControls
          object={robotRef.current}
          mode={transformMode}
          size={0.75}
        />
      )}
    </>
  );
}

// Controls panel component (Unchanged logic, just keeping it in file)
export function FrankaControls({
  selectedJoint,
  jointAngles,
  sceneTransformEnabled,
  sceneTransformMode,
  onSceneTransformToggle,
  onSceneTransformModeChange,
  teleopEnabled,
  onTeleopToggle,
  gripperOpen
}) {
  return (
    <div className="absolute top-6 left-6 z-40 bg-black/90 backdrop-blur-md p-4 rounded-xl border border-zinc-700 font-mono text-xs w-72 shadow-2xl">
      <div className="text-emerald-400 font-bold mb-4 uppercase tracking-wider text-sm">
        Franka Robot Controls
      </div>

      <div className="space-y-2 text-zinc-300 mb-4 pb-4 border-b border-zinc-700">
        <div className="flex items-center justify-between">
          <span className="text-cyan-400 font-bold text-[11px]">HAND TELEOP</span>
          <span className={`text-[9px] px-2 py-0.5 rounded ${teleopEnabled ? 'bg-cyan-500/20 text-cyan-400' : 'bg-zinc-800 text-zinc-500'}`}>
            {teleopEnabled ? 'ACTIVE' : 'OFF'}
          </span>
        </div>
        <button
          onClick={onTeleopToggle}
          className={`w-full px-3 py-2.5 rounded-lg text-[11px] font-bold transition-all ${
            teleopEnabled
              ? 'bg-cyan-500 text-black shadow-lg shadow-cyan-500/30'
              : 'bg-zinc-800 text-zinc-300 hover:bg-zinc-700 border border-zinc-600'
          }`}
        >
          {teleopEnabled ? '■ STOP TELEOP' : '▶ START HAND TRACKING'}
        </button>
      </div>

      <div className="space-y-2 text-zinc-300 mb-4 pb-4 border-b border-zinc-700">
        <div className="flex items-center justify-between">
          <span className="text-purple-400 font-bold text-[11px]">GRIPPER</span>
          <kbd className="text-[9px] px-1.5 py-0.5 bg-zinc-800 rounded text-zinc-400">G</kbd>
        </div>
        <div className={`px-3 py-2 rounded-lg text-center text-[11px] font-bold flex items-center justify-center gap-2 ${
          gripperOpen
            ? 'bg-green-500/20 text-green-400 border border-green-500/30'
            : 'bg-red-500/20 text-red-400 border border-red-500/30'
        }`}>
          <span className={`w-2 h-2 rounded-full ${gripperOpen ? 'bg-green-400' : 'bg-red-400'}`}></span>
          {gripperOpen ? 'OPEN' : 'CLOSED'}
        </div>
      </div>
      
      {/* Physics State Info */}
      <div className="space-y-1">
        <div className="flex items-center justify-between mb-2">
            <span className="text-zinc-500 font-bold text-[11px]">PHYSICS STATE</span>
        </div>
        <div className="grid grid-cols-7 gap-1">
          {jointAngles.map((angle, idx) => (
            <div key={idx} className="bg-zinc-800 text-zinc-500 text-center py-1 rounded text-[9px]">
                {(angle * 180 / Math.PI).toFixed(0)}°
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}