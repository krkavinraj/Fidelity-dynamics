import numpy as np
from scipy.spatial.transform import Rotation as R

class SyntheticIMU:
    def __init__(self, fps=30):
        self.dt = 1.0 / fps
        # Standard gravity vector (Y-up convention for Robotics)
        self.gravity = np.array([0.0, -9.81, 0.0]) 
        
        # Kalman-style state tracking
        self.prev_pos = None
        self.prev_vel = np.zeros(3)
        self.prev_quat = None
        
        # Noise profiles (Simulating a real Bosch BMI088 IMU)
        # These values make the data look "real" to training models
        self.accel_noise_std = 0.02
        self.gyro_noise_std = 0.005
        self.bias_accel = np.random.uniform(-0.05, 0.05, 3) # Random sensor bias
        self.bias_gyro = np.random.uniform(-0.002, 0.002, 3)

    def compute(self, pos_3d, orn_quat=None):
        """
        Derives Accelerometer and Gyroscope readings from visual pose.
        
        Input: 
            pos_3d: [x, y, z] in meters
            orn_quat: [x, y, z, w] (optional, defaults to identity)
        Returns:
            { "accel": [ax, ay, az], "gyro": [gx, gy, gz] }
        """
        curr_pos = np.array(pos_3d)
        curr_quat = np.array(orn_quat) if orn_quat else np.array([0, 0, 0, 1])
        
        # Initialize if first frame
        if self.prev_pos is None:
            self.prev_pos = curr_pos
            self.prev_quat = curr_quat
            return {
                "accel": (self.gravity * -1 + self.bias_accel).tolist(),
                "gyro": self.bias_gyro.tolist()
            }

        # --- 1. Linear Kinematics (Accelerometer) ---
        # v = dx / dt
        velocity = (curr_pos - self.prev_pos) / self.dt
        
        # a = dv / dt
        linear_accel = (velocity - self.prev_vel) / self.dt
        
        # IMUs measure "Proper Acceleration". 
        # When stationary, they measure 9.81 upwards (reaction force to gravity).
        # Accel_reading = Linear_Accel - Gravity_Vector
        proper_acceleration = linear_accel - self.gravity
        
        # Add sensor imperfections
        proper_acceleration += np.random.normal(0, self.accel_noise_std, 3) + self.bias_accel

        # --- 2. Angular Kinematics (Gyroscope) ---
        # Calculate diff quaternion: q_diff = q_curr * q_prev_inverse
        r_curr = R.from_quat(curr_quat)
        r_prev = R.from_quat(self.prev_quat)
        r_diff = r_curr * r_prev.inv()
        
        # Convert rotation to angular velocity vector (axis-angle / dt)
        rot_vec = r_diff.as_rotvec()
        angular_vel = rot_vec / self.dt
        
        # Add sensor imperfections
        angular_vel += np.random.normal(0, self.gyro_noise_std, 3) + self.bias_gyro

        # Update State
        self.prev_pos = curr_pos
        self.prev_vel = velocity
        self.prev_quat = curr_quat

        return {
            "accel": proper_acceleration.tolist(),
            "gyro": angular_vel.tolist()
        }

    def reset(self):
        self.prev_pos = None
        self.prev_vel = np.zeros(3)
        self.prev_quat = None