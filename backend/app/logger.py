import h5py
import os
import time
import numpy as np

class DataLogger:
    def __init__(self):
        self.recording = False
        self.file_path = None
        self.buffer = {}

    def start(self, task_name="default"):
        self.recording = True
        timestamp = int(time.time())
        os.makedirs("data/datasets", exist_ok=True)
        self.file_path = f"data/datasets/{task_name}_{timestamp}.hdf5"
        
        # Reset Buffer
        self.buffer = {
            "qpos": [], "qvel": [], "ee_pose": [], "action": [],
            "img_main": [], "img_side": [], "img_wrist": []
        }
        print(f"Dataset started: {self.file_path}")

    def log_step(self, robot_state, action, images):
        if not self.recording: return

        # Log Robot Physics
        self.buffer["qpos"].append(robot_state["joints"])
        self.buffer["ee_pose"].append(robot_state["ee_pos"] + robot_state["ee_orn"])
        self.buffer["action"].append(action['pos'] + action['orn'] + [action['gripper']])
        
        # Log Multi-View Images
        # We store them as they come (uint8) to save space
        if images:
            self.buffer["img_main"].append(images["main"])
            self.buffer["img_side"].append(images["side"])
            self.buffer["img_wrist"].append(images["wrist"])

    def stop(self, success=False):
        if not self.recording: return
        self.recording = False
        
        print(f"Saving {len(self.buffer['qpos'])} frames to HDF5...")
        
        with h5py.File(self.file_path, 'w') as f:
            f.attrs["success"] = success
            
            # Observations Group
            obs = f.create_group("observations")
            obs.create_dataset("qpos", data=np.array(self.buffer["qpos"]))
            obs.create_dataset("ee_pose", data=np.array(self.buffer["ee_pose"]))
            
            # Images Group (Use GZIP to keep file size manageable)
            imgs = obs.create_group("images")
            imgs.create_dataset("main", data=np.array(self.buffer["img_main"]), compression="gzip")
            imgs.create_dataset("side", data=np.array(self.buffer["img_side"]), compression="gzip")
            imgs.create_dataset("wrist", data=np.array(self.buffer["img_wrist"]), compression="gzip")
            
            # Actions
            f.create_dataset("action", data=np.array(self.buffer["action"]))
            
        print("Save Complete.")
        return self.file_path