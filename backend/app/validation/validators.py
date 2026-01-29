import numpy as np
from .interface import BaseValidator, ValidationResult

class HandStabilityValidator(BaseValidator):
    name = "Hand Stability & Presence"

    def validate(self, timeline: list) -> ValidationResult:
        issues = []
        gaps = 0
        total_frames = len(timeline)
        
        if total_frames == 0:
            return ValidationResult(False, 0.0, ["Empty Timeline"])

        # 1. Check for Gaps (Presence)
        for frame in timeline:
            if not frame.get('state', {}).get('human_joints'):
                gaps += 1
        
        gap_ratio = gaps / total_frames
        suggested_fix = None
        
        if gap_ratio > 0.1:
            issues.append(f"Tracking Gaps Detected ({int(gap_ratio*100)}%)")
            suggested_fix = "Linear Interpolation"

        if gap_ratio > 0.6:
             issues.append("Critical Signal Loss")
             return ValidationResult(False, 0.3, issues, suggested_fix)

        # 2. Check for Jitter
        valid_joints = [np.array(f['state']['human_joints']) for f in timeline if f.get('state', {}).get('human_joints')]
        jitter_detected = False
        if len(valid_joints) > 2:
            velocities = [np.linalg.norm(valid_joints[i] - valid_joints[i-1]) for i in range(1, len(valid_joints))]
            if len(velocities) > 0:
                velocity_var = np.var(velocities)
                if velocity_var > 0.05:
                    issues.append("High Frequency Jitter / Instability")
                    jitter_detected = True
                    suggested_fix = "Exponential Smoothing"

        score = 1.0 - (gap_ratio * 0.8)
        if jitter_detected: score -= 0.1
        score = max(0.0, score)
        
        passed = score > 0.5
        return ValidationResult(passed, score, issues, suggested_fix)

class CommercialViabilityValidator(BaseValidator):
    name = "Commercial Viability (Physics Check)"
    
    def validate(self, timeline: list) -> ValidationResult:
        issues = []
        score = 1.0
        
        positions = []
        for frame in timeline:
            if frame.get('state', {}).get('human_joints'):
                positions.append(np.array(frame['state']['human_joints']))
        
        if len(positions) < 10:
            return ValidationResult(False, 0.0, ["Data too short for commercial use"], None)
            
        # 1. Check for "Zombie Hand" (No movement)
        deltas = [np.linalg.norm(positions[i] - positions[i-1]) for i in range(1, len(positions))]
        total_dist = sum(deltas)
        
        if total_dist < 0.05: # Less than 5cm movement in whole video
            issues.append("Static Trajectory (No Movement Detected)")
            score -= 0.5
            
        # 2. Check for "Teleportation" (Tracking Glitches)
        max_jump = max(deltas) if deltas else 0
        if max_jump > 0.5: # 50cm jump in one frame (impossible)
            issues.append(f"Teleportation Detected ({max_jump:.2f}m jump)")
            score -= 0.3
            
        passed = score > 0.6
        return ValidationResult(passed, score, issues, "Linear Interpolation" if not passed else None)

class SensorSyncValidator(BaseValidator):
    name = "Sensor Synchronization (Rich)"
    
    def validate(self, timeline: list) -> ValidationResult:
        issues = []
        score = 1.0
        
        # Extract Magnitudes
        vis_vel = []
        imu_acc = []
        
        has_sensors = False
        
        for frame in timeline:
            v = frame.get('kinematics', {}).get('hand_velocity', [0,0,0])
            a = frame.get('sensors', {}).get('accel', [0,0,0])
            
            if a[0] != 0 or a[1] != 0 or a[2] != 0:
                has_sensors = True

            vis_vel.append(np.linalg.norm(v))
            imu_acc.append(np.linalg.norm(a))
            
        if not has_sensors:
            return ValidationResult(True, 1.0, ["Skipped: No Real Sensor Data"], None)

        if len(vis_vel) < 10: 
            return ValidationResult(False, 0.0, ["Insufficient Data"], None)

        # Normalize
        vis_vel = np.array(vis_vel)
        imu_acc = np.array(imu_acc)
        
        if vis_vel.std() == 0 or imu_acc.std() == 0:
             return ValidationResult(True, 0.5, ["Flatline Data Detected"], None)

        vis_norm = (vis_vel - vis_vel.mean()) / (vis_vel.std() + 1e-6)
        imu_norm = (imu_acc - imu_acc.mean()) / (imu_acc.std() + 1e-6)
        
        # Correlation Check
        correlation = np.corrcoef(vis_norm, imu_norm)[0, 1]
        if np.isnan(correlation): correlation = 0.0

        if correlation < 0.3:
            issues.append(f"Low Sensor-Vision Correlation ({correlation:.2f})")
            issues.append("Possible Temporal Misalignment")
            score = 0.4
        elif correlation < 0.6:
            issues.append("Moderate Drift Detected")
            score = 0.7
            
        return ValidationResult(score > 0.5, score, issues, "Manual Offset Adjustment")