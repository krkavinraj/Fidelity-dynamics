import pybullet as p
import pybullet_data
import numpy as np
from scipy.ndimage import gaussian_filter1d

class KinematicSolver:
    def __init__(self):
        self.client = p.connect(p.DIRECT)
        p.setAdditionalSearchPath(pybullet_data.getDataPath())
        
        # We load a generic Franka for single arm
        # For dual, we essentially simulate two arms (or load specific ALOHA URDF)
        self.robot = p.loadURDF("franka_panda/panda.urdf", basePosition=[0,0,0], useFixedBase=True)
        self.robot_left = None # Lazy load if needed
        self.ee_idx = 11

    def _setup_bimanual(self):
        """Spawns a second robot for the left hand if not already there"""
        if self.robot_left is None:
            # Spawn left arm offset by -0.5m (simulating a dual-arm setup like ALOHA)
            self.robot_left = p.loadURDF("franka_panda/panda.urdf", basePosition=[0, -0.5, 0], useFixedBase=True)

    def solve_ik(self, robot_id, target_pos):
        """Helper to solve for a specific body"""
        target_orn = p.getQuaternionFromEuler([3.14, 0, 0])
        joint_poses = p.calculateInverseKinematics(
            robot_id, self.ee_idx, target_pos, target_orn,
            maxNumIterations=50, residualThreshold=0.005
        )
        return list(joint_poses[:7]) # Return first 7 joints

    def solve_sequence(self, timeline, config):
        scale = config.get('scale', 1.0)
        off_x = config.get('x', 0.5)
        off_y = config.get('y', 0.0)
        off_z = config.get('z', 0.3)
        sigma = config.get('smoothing_sigma', 0.0) # QA Parameter
        
        mode = config.get('mode', 'single') # 'single' or 'bimanual'
        
        if mode == 'bimanual':
            self._setup_bimanual()

        raw_joint_trajectory = []
        
        print(f"🧮 Solving {mode.upper()} Kinematics for {len(timeline)} frames...")

        # 1. SOLVE INVERSE KINEMATICS (Frame by Frame)
        for frame in timeline:
            state = frame.get('state', {})
            
            # --- EXTRACT HANDS ---
            # Ideally, enrichment.py should provide 'left_hand' and 'right_hand' keys.
            # If standard 'human_joints' is used, we assume it's the RIGHT hand.
            right_hand = state.get('right_hand') or state.get('human_joints')
            left_hand = state.get('left_hand') # Only present if Vision pipeline supports it
            
            frame_result = []

            # 1. SOLVE RIGHT ARM (Always exists)
            if right_hand:
                tx = (right_hand[0] * scale) + off_x
                ty = (right_hand[1] * scale) + off_y
                tz = (right_hand[2] * scale) + off_z
                right_joints = self.solve_ik(self.robot, [tx, ty, tz])
                frame_result.extend(right_joints)
                
                # Gripper
                frame_result.append(0.0 if state.get('contacts') else 0.04)
            else:
                frame_result.extend([0.0] * 8) # Pad empty

            # 2. SOLVE LEFT ARM (If Bimanual)
            if mode == 'bimanual':
                if left_hand:
                    # Mirror offset for left hand usually
                    tx_l = (left_hand[0] * scale) + off_x
                    ty_l = (left_hand[1] * scale) - off_y # Invert Y offset
                    tz_l = (left_hand[2] * scale) + off_z
                    
                    left_joints = self.solve_ik(self.robot_left, [tx_l, ty_l, tz_l])
                    frame_result.extend(left_joints)
                    frame_result.append(0.0) # Left gripper placeholder
                else:
                    frame_result.extend([0.0] * 8) # Pad empty

            raw_joint_trajectory.append(frame_result)

        # 2. APPLY GAUSSIAN SMOOTHING (QA LAYER)
        final_trajectory = raw_joint_trajectory

        if sigma > 0.0 and len(raw_joint_trajectory) > 5:
            print(f"🌊 QA Layer: Applying Gaussian Smoothing (Sigma={sigma})...")
            
            # Convert to numpy for vector operations
            data_np = np.array(raw_joint_trajectory)
            
            # Apply filter to each column (joint) independently over Time (axis 0)
            smoothed_np = gaussian_filter1d(data_np, sigma, axis=0)
            
            # CRITICAL: Gripper state (last index) shouldn't be smoothed continuously.
            # It acts as a binary switch (Open/Close). Smoothing makes it float weirdly.
            # We revert gripper columns to raw data.
            
            # Right Gripper index is 7 (0-7 are joints, 7 is grip)
            if data_np.shape[1] >= 8:
                smoothed_np[:, 7] = data_np[:, 7] 
            
            if mode == 'bimanual' and data_np.shape[1] >= 16:
                # Left Gripper index is 15 (8-14 are joints, 15 is grip)
                smoothed_np[:, 15] = data_np[:, 15]

            final_trajectory = smoothed_np.tolist()

        # Cleanup specific to this request
        if self.robot_left: 
            p.removeBody(self.robot_left)
            self.robot_left = None

        return final_trajectory