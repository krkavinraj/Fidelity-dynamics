try:
    import pybullet as p
    PYBULLET_AVAILABLE = True
    PYBULLET_IMPORT_ERROR = None
except Exception as exc:
    p = None
    PYBULLET_AVAILABLE = False
    PYBULLET_IMPORT_ERROR = exc
import numpy as np

class RobotController:
    def __init__(self, client, base_pos=[0, 0, 0]):
        if not PYBULLET_AVAILABLE:
            raise RuntimeError(f"pybullet not available: {PYBULLET_IMPORT_ERROR}")
        self.client = client
        self.id = p.loadURDF("franka_panda/panda.urdf", base_pos, useFixedBase=True)
        self.ee_idx = 11
        self.finger_idxs = [9, 10]
        self.joints = [i for i in range(p.getNumJoints(self.id)) if p.getJointInfo(self.id, i)[2] != p.JOINT_FIXED]
        
        for finger in self.finger_idxs:
            p.changeDynamics(self.id, finger, lateralFriction=2.0, spinningFriction=0.1, frictionAnchor=True)

    def reset(self):
        rest_poses = [0, -0.215, 0, -2.57, 0, 2.356, 2.356, 0.04, 0.04]
        for i, j_idx in enumerate(self.joints):
            if i < len(rest_poses):
                p.resetJointState(self.id, j_idx, rest_poses[i])

    def apply_action(self, action, current_ee_pos, speed=1.0, axis_locks=[False, False, False]):
        if not action: return
        target_pos = list(action['pos'])
        if axis_locks[0]: target_pos[0] = current_ee_pos[0]
        if axis_locks[1]: target_pos[1] = current_ee_pos[1]
        if axis_locks[2]: target_pos[2] = current_ee_pos[2]
        
        target_pos[2] = max(0.02, target_pos[2]) 

        joint_poses = p.calculateInverseKinematics(
            self.id, self.ee_idx, target_pos, action['orn'],
            lowerLimits=[-2.9]*7 + [0,0], upperLimits=[2.9]*7 + [0.04,0.04],
            jointRanges=[5.8]*7 + [0.04,0.04],
            restPoses=[0, -0.215, 0, -2.57, 0, 2.356, 2.356, 0.04, 0.04],
            maxNumIterations=20 
        )

        max_vel = 3.0 * speed 
        force = 200 * speed

        for i in range(7): 
            p.setJointMotorControl2(
                self.id, self.joints[i], p.POSITION_CONTROL, joint_poses[i], 
                force=force, maxVelocity=max_vel,
                positionGain=0.03, velocityGain=1.0 
            )

        width = 0.04 * (1.0 - action['gripper'])
        for finger in self.finger_idxs:
            p.setJointMotorControl2(self.id, finger, p.POSITION_CONTROL, width, force=100)

    def get_state(self):
        joint_states = [p.getJointState(self.id, i)[0] for i in self.joints]
        ee_state = p.getLinkState(self.id, self.ee_idx)
        f1 = p.getJointState(self.id, self.finger_idxs[0])[0]
        f2 = p.getJointState(self.id, self.finger_idxs[1])[0]
        return {"joints": joint_states, "ee_pos": ee_state[0], "ee_orn": ee_state[1], "gripper_width": f1+f2}
    
    def get_wrist_camera_image(self, width=128, height=128):
        ee_state = p.getLinkState(self.id, self.ee_idx)
        pos, orn = ee_state[0], ee_state[1]
        rot_mat = np.array(p.getMatrixFromQuaternion(orn)).reshape(3,3)
        cam_pos = np.array(pos) + rot_mat.dot([0.05, 0, 0])
        target = cam_pos + rot_mat.dot([0.1, 0, 0])
        up_vector = rot_mat.dot([0, 0, 1])
        view_matrix = p.computeViewMatrix(cam_pos, target, up_vector)
        proj_matrix = p.computeProjectionMatrixFOV(60, 1.0, 0.1, 10.0)
        _, _, rgb, _, _ = p.getCameraImage(width, height, view_matrix, proj_matrix, renderer=p.ER_TINY_RENDERER)
        return rgb[:,:,:3]