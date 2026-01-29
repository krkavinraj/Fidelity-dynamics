import os
import json
import numpy as np
import h5py
import shutil
from datetime import datetime

class DataExporter:
    def __init__(self):
        # Path setup relative to this file
        self.base_dir = os.path.abspath(os.path.join(os.path.dirname(__file__), "..", "..", "data", "exports"))
        os.makedirs(self.base_dir, exist_ok=True)

    def _zip_folder(self, folder_path):
        """Helper to create a zip archive of a directory."""
        # shutil.make_archive expects the base name (without extension) and the format
        archive_name = shutil.make_archive(folder_path, 'zip', folder_path)
        return archive_name

    def _resolve_abs_path(self, rel_path):
        """Converts frontend relative path (/static/...) to backend absolute path"""
        if not rel_path: return None
        if rel_path.startswith("/static/"):
            # Remove /static/ and join with backend/app/static
            clean_rel = rel_path.replace("/static/", "")
            return os.path.abspath(os.path.join(os.path.dirname(__file__), "static", clean_rel))
        return rel_path

    def to_lerobot(self, timeline, dataset_name, source_video_path=None):
        """
        Exports data to LeRobot format + Source Video + Extracted Frames in a ZIP file.
        """
        if not timeline:
            return {"status": "error", "message": "Timeline is empty"}

        timestamp = datetime.now().strftime("%Y%m%d_%H%M%S")
        clean_name = "".join(x for x in dataset_name if x.isalnum() or x in "_-")
        folder_name = f"{clean_name}_lerobot_{timestamp}"
        folder_path = os.path.join(self.base_dir, folder_name)
        
        # Subdirectories
        frames_out_dir = os.path.join(folder_path, "images")
        os.makedirs(folder_path, exist_ok=True)
        os.makedirs(frames_out_dir, exist_ok=True)
        
        obs_state = []
        actions = []
        
        print(f"📦 Exporting {len(timeline)} frames to LeRobot format...")

        for i, frame in enumerate(timeline):
            # 1. State Vector (Joints + Gripper)
            current_vec = [0.0] * 8 
            if "robot_state" in frame and "qpos" in frame["robot_state"]:
                qpos = frame["robot_state"]["qpos"]
                gripper = frame["robot_state"].get("gripper_width", 0.04)
                current_vec = qpos + [gripper]
            
            obs_state.append(current_vec)
            
            # 2. Action Vector (Next State)
            if i < len(timeline) - 1:
                next_frame = timeline[i+1]
                next_vec = [0.0] * 8
                if "robot_state" in next_frame and "qpos" in next_frame["robot_state"]:
                    n_qpos = next_frame["robot_state"]["qpos"]
                    n_grip = next_frame["robot_state"].get("gripper_width", 0.04)
                    next_vec = n_qpos + [n_grip]
                actions.append(next_vec)
            else:
                actions.append(current_vec)

            # 3. Copy Frame Image
            # Check observation structure from EnrichmentPipeline
            img_path = None
            if "observation" in frame:
                if isinstance(frame["observation"], dict):
                    img_path = frame["observation"].get("image_path")
                elif isinstance(frame["observation"], str):
                    img_path = frame["observation"] # Legacy string format
            
            if img_path:
                abs_src = self._resolve_abs_path(img_path)
                if abs_src and os.path.exists(abs_src):
                    # Save as frame_00000.jpg
                    dst_filename = f"frame_{i:06d}.jpg"
                    shutil.copy2(abs_src, os.path.join(frames_out_dir, dst_filename))

        # 4. Create HDF5
        h5_path = os.path.join(folder_path, "episode_0.hdf5")
        try:
            with h5py.File(h5_path, "w") as f:
                f.create_dataset("observation.state", data=np.array(obs_state, dtype=np.float32))
                f.create_dataset("action", data=np.array(actions, dtype=np.float32))
                f.attrs["fps"] = 30
                f.attrs["total_frames"] = len(timeline)
                f.attrs["robot_type"] = "franka_emika_panda"
                f.attrs["format"] = "lerobot"
        except Exception as e:
            return {"status": "error", "message": f"HDF5 Write Failed: {str(e)}"}

        # 5. Copy Source Video
        if source_video_path and os.path.exists(source_video_path):
            try:
                shutil.copy2(source_video_path, os.path.join(folder_path, "source_video.mp4"))
            except Exception as e:
                print(f"Warning: Could not copy video: {e}")

        # 6. Zip It
        try:
            zip_path = self._zip_folder(folder_path)
            return {
                "status": "success", 
                "zip_path": zip_path, 
                "folder": folder_path
            }
        except Exception as e:
            return {"status": "error", "message": f"Zipping Failed: {str(e)}"}

    def to_rlds(self, timeline, dataset_name, source_video_path=None):
        """
        Exports to RLDS/OpenX style structure (compatible with TFDS).
        """
        if not timeline:
            return {"status": "error", "message": "Timeline is empty"}

        timestamp = datetime.now().strftime("%Y%m%d_%H%M%S")
        clean_name = "".join(x for x in dataset_name if x.isalnum() or x in "_-")
        folder_name = f"{clean_name}_rlds_{timestamp}"
        folder_path = os.path.join(self.base_dir, folder_name)
        
        # RLDS often keeps images in a specific folder structure or tfrecord
        # For raw export, we'll use a folder structure
        images_dir = os.path.join(folder_path, "images")
        os.makedirs(folder_path, exist_ok=True)
        os.makedirs(images_dir, exist_ok=True)

        # 1. RLDS Metadata (dataset_info.json)
        info = {
            "name": clean_name,
            "version": "1.0.0",
            "description": "Generated via Fidelity Data Factory with Kinematic Retargeting",
            "features": {
                "steps": {
                    "observation": {
                        "image": {"shape": [256, 256, 3], "dtype": "uint8"},
                        "state": {"shape": [8], "dtype": "float32", "names": ["j1","j2","j3","j4","j5","j6","j7","gripper"]}
                    },
                    "action": {"shape": [8], "dtype": "float32"},
                    "is_terminal": {"dtype": "bool"}
                }
            }
        }
        
        with open(os.path.join(folder_path, "dataset_info.json"), "w") as f:
            json.dump(info, f, indent=2)

        # 2. Data Container (raw_data.hdf5)
        h5_path = os.path.join(folder_path, "raw_data.hdf5")
        
        try:
            with h5py.File(h5_path, "w") as f:
                obs_grp = f.create_group("observations")
                act_grp = f.create_group("actions")
                
                states = []
                acts = []
                
                for i, frame in enumerate(timeline):
                    curr = [0.0]*8
                    if "robot_state" in frame and "qpos" in frame["robot_state"]:
                        qpos = frame["robot_state"]["qpos"]
                        grip = frame["robot_state"].get("gripper_width", 0.0)
                        curr = qpos + [grip]
                    states.append(curr)
                        
                    nxt = [0.0]*8
                    if i < len(timeline)-1:
                        next_f = timeline[i+1]
                        if "robot_state" in next_f and "qpos" in next_f["robot_state"]:
                            nxt = next_f["robot_state"]["qpos"] + [next_f["robot_state"].get("gripper_width", 0.0)]
                        else:
                            nxt = curr
                    else:
                        nxt = curr
                    acts.append(nxt)

                    # Copy Frames
                    img_path = None
                    if "observation" in frame:
                        if isinstance(frame["observation"], dict):
                            img_path = frame["observation"].get("image_path")
                        elif isinstance(frame["observation"], str):
                            img_path = frame["observation"]
                    
                    if img_path:
                        abs_src = self._resolve_abs_path(img_path)
                        if abs_src and os.path.exists(abs_src):
                            # RLDS usually expects just the file, we name it sequentially
                            shutil.copy2(abs_src, os.path.join(images_dir, f"{i}.jpg"))

                obs_grp.create_dataset("state", data=np.array(states, dtype=np.float32))
                act_grp.create_dataset("joint_command", data=np.array(acts, dtype=np.float32))
                f.attrs["ready_for_tfds"] = True

        except Exception as e:
            return {"status": "error", "message": str(e)}

        # 3. Copy Source Video
        if source_video_path and os.path.exists(source_video_path):
            try:
                shutil.copy2(source_video_path, os.path.join(folder_path, "source_video.mp4"))
            except Exception as e:
                print(f"Warning: Could not copy video: {e}")

        # 4. Zip
        try:
            zip_path = self._zip_folder(folder_path)
            return {
                "status": "success",
                "zip_path": zip_path,
                "folder": folder_path
            }
        except Exception as e:
            return {"status": "error", "message": f"Zipping Failed: {str(e)}"}

    def export_frames_only(self, timeline, dataset_name):
        """
        Exports only the frames from timeline as a ZIP file.
        For egocentric enrichment frame downloads.
        """
        if not timeline:
            return {"status": "error", "message": "Timeline is empty"}

        timestamp = datetime.now().strftime("%Y%m%d_%H%M%S")
        clean_name = "".join(x for x in dataset_name if x.isalnum() or x in "_-")
        folder_name = f"{clean_name}_frames_{timestamp}"
        folder_path = os.path.join(self.base_dir, folder_name)

        frames_out_dir = os.path.join(folder_path, "frames")
        os.makedirs(folder_path, exist_ok=True)
        os.makedirs(frames_out_dir, exist_ok=True)

        print(f"📦 Exporting {len(timeline)} frames...")

        for i, frame in enumerate(timeline):
            # Copy frame image
            img_path = None
            if "observation" in frame:
                if isinstance(frame["observation"], dict):
                    img_path = frame["observation"].get("image_path")
                elif isinstance(frame["observation"], str):
                    img_path = frame["observation"]

            if img_path:
                abs_src = self._resolve_abs_path(img_path)
                if abs_src and os.path.exists(abs_src):
                    dst_filename = f"frame_{i:06d}.jpg"
                    shutil.copy2(abs_src, os.path.join(frames_out_dir, dst_filename))

        # Create metadata file
        metadata = {
            "dataset_name": dataset_name,
            "total_frames": len(timeline),
            "export_timestamp": timestamp,
            "format": "frames_only"
        }

        with open(os.path.join(folder_path, "metadata.json"), "w") as f:
            json.dump(metadata, f, indent=2)

        # Zip it
        try:
            zip_path = self._zip_folder(folder_path)
            return {
                "status": "success",
                "zip_path": zip_path,
                "folder": folder_path
            }
        except Exception as e:
            return {"status": "error", "message": f"Zipping Failed: {str(e)}"}

    def export_factory_sku(self, timeline, dataset_name, source_video_path=None):
        """
        Exports Factory SKU data with multi-view frames, IMU sensor data, and camera positions.
        Includes:
        - Multi-view frames (main, side, wrist cameras)
        - IMU sensor data (accelerometer, gyroscope)
        - Camera position metadata
        - Robot state data
        - Detected objects
        """
        if not timeline:
            return {"status": "error", "message": "Timeline is empty"}

        timestamp = datetime.now().strftime("%Y%m%d_%H%M%S")
        clean_name = "".join(x for x in dataset_name if x.isalnum() or x in "_-")
        folder_name = f"{clean_name}_factory_sku_{timestamp}"
        folder_path = os.path.join(self.base_dir, folder_name)

        # Create subdirectories for each camera view
        main_cam_dir = os.path.join(folder_path, "cameras", "main")
        side_cam_dir = os.path.join(folder_path, "cameras", "side")
        wrist_cam_dir = os.path.join(folder_path, "cameras", "wrist")

        os.makedirs(main_cam_dir, exist_ok=True)
        os.makedirs(side_cam_dir, exist_ok=True)
        os.makedirs(wrist_cam_dir, exist_ok=True)

        print(f"📦 Exporting Factory SKU with {len(timeline)} frames...")

        # Prepare sensor data arrays
        imu_data = {
            "timestamps": [],
            "accelerometer": [],  # m/s²
            "gyroscope": []  # rad/s
        }

        camera_positions = {
            "main": [],
            "side": [],
            "wrist": []
        }

        robot_states = []
        detected_objects_timeline = []

        for i, frame in enumerate(timeline):
            # 1. Copy multi-view camera frames
            observations = frame.get("observations", {})

            # Main camera
            if "main_camera" in observations:
                main_path = self._resolve_abs_path(observations["main_camera"])
                if main_path and os.path.exists(main_path):
                    dst_filename = f"frame_{i:06d}.jpg"
                    shutil.copy2(main_path, os.path.join(main_cam_dir, dst_filename))

            # Side camera (synthetic)
            if "side_camera" in observations:
                side_path = self._resolve_abs_path(observations["side_camera"])
                if side_path and os.path.exists(side_path):
                    dst_filename = f"frame_{i:06d}.jpg"
                    shutil.copy2(side_path, os.path.join(side_cam_dir, dst_filename))

            # Wrist camera (synthetic)
            if "wrist_camera" in observations:
                wrist_path = self._resolve_abs_path(observations["wrist_camera"])
                if wrist_path and os.path.exists(wrist_path):
                    dst_filename = f"frame_{i:06d}.jpg"
                    shutil.copy2(wrist_path, os.path.join(wrist_cam_dir, dst_filename))

            # 2. Extract IMU sensor data
            sensors = frame.get("sensors", {})
            imu_data["timestamps"].append(frame.get("timestamp", i * 0.033))
            imu_data["accelerometer"].append(sensors.get("accel", [0.0, 0.0, 0.0]))
            imu_data["gyroscope"].append(sensors.get("gyro", [0.0, 0.0, 0.0]))

            # 3. Camera positions (from state data if available)
            state = frame.get("state", {})
            # Main camera is typically at the human/robot head position
            camera_positions["main"].append({
                "frame_idx": i,
                "position": state.get("camera_position", [0.0, 0.0, 0.0]),
                "orientation": state.get("camera_orientation", [0.0, 0.0, 0.0, 1.0])  # quaternion
            })

            # Side camera is a synthetic view (offset from main)
            camera_positions["side"].append({
                "frame_idx": i,
                "position": [0.5, 0.0, 0.3],  # Synthetic side view offset
                "orientation": [0.0, 0.0, 0.0, 1.0],
                "note": "Synthetic perspective warp view"
            })

            # Wrist camera follows hand position
            camera_positions["wrist"].append({
                "frame_idx": i,
                "position": state.get("hand_position", [0.0, 0.0, 0.0]),
                "orientation": state.get("hand_orientation", [0.0, 0.0, 0.0, 1.0]),
                "note": "Eye-in-hand view following detected hand"
            })

            # 4. Robot state
            robot_state = frame.get("robot_state", {})
            robot_states.append({
                "frame_idx": i,
                "qpos": robot_state.get("qpos", [0.0] * 7),
                "gripper_width": robot_state.get("gripper_width", 0.0),
                "gripper_state": robot_state.get("gripper", 0)
            })

            # 5. Detected objects
            detected_objects_timeline.append({
                "frame_idx": i,
                "objects": frame.get("detected_objects", [])
            })

        # Save IMU data as CSV
        import csv
        imu_csv_path = os.path.join(folder_path, "imu_data.csv")
        with open(imu_csv_path, 'w', newline='') as csvfile:
            writer = csv.writer(csvfile)
            writer.writerow(['timestamp', 'accel_x', 'accel_y', 'accel_z', 'gyro_x', 'gyro_y', 'gyro_z'])
            for i in range(len(imu_data["timestamps"])):
                accel = imu_data["accelerometer"][i]
                gyro = imu_data["gyroscope"][i]
                writer.writerow([
                    imu_data["timestamps"][i],
                    accel[0], accel[1], accel[2],
                    gyro[0], gyro[1], gyro[2]
                ])

        # Save camera positions as JSON
        camera_json_path = os.path.join(folder_path, "camera_positions.json")
        with open(camera_json_path, 'w') as f:
            json.dump(camera_positions, f, indent=2)

        # Save robot states as JSON
        robot_json_path = os.path.join(folder_path, "robot_states.json")
        with open(robot_json_path, 'w') as f:
            json.dump(robot_states, f, indent=2)

        # Save detected objects as JSON
        objects_json_path = os.path.join(folder_path, "detected_objects.json")
        with open(objects_json_path, 'w') as f:
            json.dump(detected_objects_timeline, f, indent=2)

        # Create comprehensive metadata
        metadata = {
            "dataset_name": dataset_name,
            "format": "factory_sku",
            "export_timestamp": timestamp,
            "total_frames": len(timeline),
            "cameras": {
                "main": {
                    "description": "Main RGB camera view",
                    "resolution": "384xN",
                    "frame_count": len(os.listdir(main_cam_dir))
                },
                "side": {
                    "description": "Synthetic side perspective view",
                    "resolution": "384xN",
                    "frame_count": len(os.listdir(side_cam_dir)),
                    "note": "Generated via perspective transformation"
                },
                "wrist": {
                    "description": "Eye-in-hand wrist camera view",
                    "resolution": "128x128",
                    "frame_count": len(os.listdir(wrist_cam_dir)),
                    "note": "Digital zoom on detected hand"
                }
            },
            "sensors": {
                "imu": {
                    "file": "imu_data.csv",
                    "accelerometer_unit": "m/s²",
                    "gyroscope_unit": "rad/s",
                    "sample_rate": "30 Hz",
                    "note": "Synthetic IMU data derived from visual tracking"
                }
            },
            "files": {
                "imu_data": "imu_data.csv",
                "camera_positions": "camera_positions.json",
                "robot_states": "robot_states.json",
                "detected_objects": "detected_objects.json"
            }
        }

        with open(os.path.join(folder_path, "README.json"), "w") as f:
            json.dump(metadata, f, indent=2)

        # Copy source video if provided
        if source_video_path and os.path.exists(source_video_path):
            try:
                shutil.copy2(source_video_path, os.path.join(folder_path, "source_video.mp4"))
            except Exception as e:
                print(f"Warning: Could not copy video: {e}")

        # Zip everything
        try:
            zip_path = self._zip_folder(folder_path)
            return {
                "status": "success",
                "zip_path": zip_path,
                "folder": folder_path,
                "metadata": metadata
            }
        except Exception as e:
            return {"status": "error", "message": f"Zipping Failed: {str(e)}"}