import os
import cv2
import numpy as np
import yt_dlp
import torch
import copy
import glob
import shutil
import pandas as pd
import uuid
from ultralytics import YOLOWorld
from transformers import pipeline
from PIL import Image

# --- IMPORTS ---
from .validation.engine import ValidationPipeline
from .sensors import SyntheticIMU 

class GroundedState:
    def __init__(self, frame_idx, timestamp, frame_filename=""):
        self.frame_idx = frame_idx
        self.timestamp = timestamp
        self.observation = f"frame_{frame_idx:05d}" 
        # NEW: Link to physical file (relative path for frontend/export)
        self.frame_path_rel = frame_filename 
        self.state = {
            "camera_pose": np.eye(4).tolist(),
            "objects_poses": [],
            "human_joints": None,
            "active_object_id": -1,
            "hand_object_rel": None,
            "contacts": 0
        }
        self.kinematics = {
            "hand_velocity": [0.0, 0.0, 0.0],
            "hand_acceleration": [0.0, 0.0, 0.0],
            "object_velocity": [0.0, 0.0, 0.0]
        }
        self.sensors = {
            "accel": [0.0, 0.0, 0.0],
            "gyro": [0.0, 0.0, 0.0]
        }
        self.action_world = [0.0, 0.0, 0.0]
        self.next_state = None 

class EnrichmentPipeline:
    def __init__(self):
        base_dir = os.path.dirname(os.path.abspath(__file__))
        self.download_dir = os.path.join(base_dir, "static", "downloads")
        # NEW: Dedicated folder for extracted frames
        self.frames_base_dir = os.path.join(base_dir, "static", "processed_frames")
        
        os.makedirs(self.download_dir, exist_ok=True)
        os.makedirs(self.frames_base_dir, exist_ok=True)
        
        self.job_status = {
            "state": "idle",
            "progress": 0,
            "total_frames": 0,
            "result": None,
            "summary": None,
            "error": None,
        }

        self.device = -1
        if torch.cuda.is_available(): self.device = 0
        elif torch.backends.mps.is_available(): self.device = "mps"
        print(f"🚀 Enrichment Hardware: {'GPU/MPS' if self.device != -1 else 'CPU'}")

        print("1. Loading YOLO-World...")
        self.vision_model = YOLOWorld('yolov8s-world.pt')
        self.default_vocab = ["human hand", "robot gripper", "fingers", "tool", "cup", "box", "electronics"]
        self.vision_model.set_classes(self.default_vocab)
        
        print("2. Loading Depth Model...")
        try:
            self.depth_model = pipeline(
                task="depth-estimation", 
                model="depth-anything/Depth-Anything-V2-Small-hf", 
                device=self.device
            )
        except:
            self.depth_model = None
            print("Warning: Depth Model failed to load.")

    def get_status(self):
        return self.job_status

    def get_result(self):
        return self.job_status.get("result")

    # --- INGESTION ---
    def ingest(self, source_type, url, token=None):
        target_file = "current_ego.mp4"
        final_path = os.path.join(self.download_dir, target_file)
        try:
            if source_type == "youtube":
                ydl_opts = {'format': '18/best', 'outtmpl': os.path.join(self.download_dir, "temp.%(ext)s"), 'quiet': True, 'overwrites': True}
                with yt_dlp.YoutubeDL(ydl_opts) as ydl: ydl.download([url])
                files = glob.glob(os.path.join(self.download_dir, "temp.*"))
                if files: shutil.move(files[0], final_path); return "/static/downloads/current_ego.mp4"
            return "/static/downloads/current_ego.mp4"
        except: return None

    # --- MAIN ROUTER ---
    def process_request(self, payload):
        """
        Routes the request to either Factory or Grounding pipelines.
        """
        task_type = payload.get('task_type', 'grounding')
        video_rel = payload.get('path')
        sensor_path = payload.get('sensor_path')
        mode = payload.get('mode', 'monocular') 
        prompts = payload.get('prompts')
        
        self.job_status = { "state": "processing", "progress": 0, "result": None, "error": None }
        
        try:
            # Create a unique session ID for this run to store frames
            session_id = str(uuid.uuid4())[:8]
            session_frame_dir = os.path.join(self.frames_base_dir, session_id)
            os.makedirs(session_frame_dir, exist_ok=True)

            if task_type == 'factory':
                result = self._run_factory_pipeline(video_rel, prompts, session_frame_dir, session_id)
            else:
                result = self._run_grounding_pipeline(video_rel, sensor_path, mode, prompts, session_frame_dir, session_id)
            
            self.job_status["result"] = result
            self.job_status["summary"] = result.get('summary_stats', {})
            self.job_status["state"] = "completed"
            self.job_status["progress"] = 100
            
        except Exception as e:
            print(f"Pipeline Error: {e}")
            self.job_status["state"] = "error"
            self.job_status["error"] = str(e)

    # =========================================================================
    # PIPELINE 1: FACTORY MODE (Synthetic SKU Generation)
    # =========================================================================
    def _run_factory_pipeline(self, video_rel_path, user_prompts, frame_dir, session_id):
        print("🏭 Starting Data Foundry Pipeline (SKU Generation)...")
        # 1. Setup Video
        clean_rel = video_rel_path.replace("/static/", "")
        full_path = os.path.join(os.path.dirname(os.path.abspath(__file__)), "static", clean_rel)
        if not os.path.exists(full_path): 
            full_path = os.path.join(self.download_dir, "current_ego.mp4")
            if not os.path.exists(full_path): raise Exception("Video not found")
        
        cap = cv2.VideoCapture(full_path)
        fps = cap.get(cv2.CAP_PROP_FPS) or 30
        total_frames = int(cap.get(cv2.CAP_PROP_FRAME_COUNT))
        if total_frames <= 0: total_frames = 3000
        
        TARGET_FRAMES = 100
        step_size = max(1, total_frames // TARGET_FRAMES)
        imu_gen = SyntheticIMU(fps=fps)
        timeline = []
        
        current_frame = 0
        frames_processed = 0
        
        while cap.isOpened() and frames_processed < TARGET_FRAMES:
            cap.set(cv2.CAP_PROP_POS_FRAMES, current_frame)
            ret, frame = cap.read()
            if not ret: break
            
            self.job_status["progress"] = int((frames_processed / TARGET_FRAMES) * 100)
            
            # Save Main Frame
            frame_filename = f"frame_{current_frame:06d}.jpg"
            frame_save_path = os.path.join(frame_dir, frame_filename)
            h, w = frame.shape[:2]
            scale = 384 / w
            frame_resized = cv2.resize(frame, (384, int(h * scale)))
            cv2.imwrite(frame_save_path, frame_resized)
            
            # Detect
            rgb = cv2.cvtColor(frame_resized, cv2.COLOR_BGR2RGB)
            results = self.vision_model.predict(rgb, verbose=False, conf=0.1)
            
            # Hallucinate IMU
            hand_pos = [0,0,0]
            if results:
                for box in results[0].boxes:
                    if int(box.cls[0]) == 0: # Hand
                        x1,y1,x2,y2 = map(int, box.xyxy[0])
                        cx, cy = (x1+x2)//2, (y1+y2)//2
                        hand_pos = [cx/384, cy/int(h*scale), 0.5]
                        break
            
            synth_sensors = imu_gen.compute(hand_pos)
            
            # Structure for Multi-View Frontend
            timeline.append({
                "timestamp": current_frame / fps,
                "frame_idx": current_frame,
                "observation": {
                    "image_path": f"/static/processed_frames/{session_id}/{frame_filename}"
                },
                "observations": {
                    "main": "rgb",
                    "side": "hallucinated",
                    "wrist": "hallucinated"
                },
                "sensors": synth_sensors,
                "robot_state": {}, # Placeholder for retargeting
                "labels": [results[0].names[int(b.cls[0])] for b in results[0].boxes] if results else []
            })
            
            current_frame += step_size
            frames_processed += 1
            
        cap.release()
        
        return {
            "type": "factory_sku",
            "timeline": timeline,
            "summary_stats": {
                "total_frames": len(timeline),
                "generated_views": 3 * len(timeline),
                "sensor_type": "FULLY_SYNTHETIC",
                "mode": "factory",
                "quality_score": 1.0
            },
            "quality_score": 1.0
        }

    # =========================================================================
    # PIPELINE 2: COMMERCIAL GROUNDING ENGINE
    # =========================================================================
    def _run_grounding_pipeline(self, video_rel_path, sensor_path, mode, user_prompts, frame_dir, session_id):
        print(f"🔬 Starting Grounding Pipeline ({mode.upper()})...")
        
        # 1. Setup Video
        clean_rel = video_rel_path.replace("/static/", "")
        full_path = os.path.join(os.path.dirname(os.path.abspath(__file__)), "static", clean_rel)
        if not os.path.exists(full_path): 
            full_path = os.path.join(self.download_dir, "current_ego.mp4")
            if not os.path.exists(full_path): raise Exception("Video not found")

        # Config
        if user_prompts:
            custom = [p.strip() for p in user_prompts.split(',') if p.strip()]
            self.vision_model.set_classes(["human hand"] + custom)
        else:
            self.vision_model.set_classes(self.default_vocab)
        
        cap = cv2.VideoCapture(full_path)
        fps = cap.get(cv2.CAP_PROP_FPS) or 30
        total_frames = int(cap.get(cv2.CAP_PROP_FRAME_COUNT))
        if total_frames <= 0: total_frames = 3000
        
        # 2. Setup Sensors
        real_sensor_data = None
        if mode == 'sensor_rich' and sensor_path and os.path.exists(sensor_path):
            try:
                df = pd.read_csv(sensor_path)
                cols = ['ax', 'ay', 'az', 'gx', 'gy', 'gz']
                for c in cols: 
                    if c in df.columns: df[c] = df[c].astype(float)
                real_sensor_data = df.to_dict('records')
            except Exception as e: print(f"Sensor load failed: {e}")
        
        imu_gen = SyntheticIMU(fps=fps)

        # 3. Processing Loop
        TARGET_FRAMES = 150 
        step_size = max(1, total_frames // TARGET_FRAMES)
        INF_W = 384
        
        raw_states = []
        prev_gray = None
        cam_pose_accum = np.eye(4)
        
        current_frame = 0
        frames_processed = 0
        
        while cap.isOpened() and frames_processed < TARGET_FRAMES:
            cap.set(cv2.CAP_PROP_POS_FRAMES, current_frame)
            ret, frame = cap.read()
            if not ret: break
            
            self.job_status["progress"] = int((frames_processed / TARGET_FRAMES) * 100)
            
            # --- SAVE FRAME FOR EXPORT ---
            frame_filename = f"frame_{current_frame:06d}.jpg"
            frame_save_path = os.path.join(frame_dir, frame_filename)
            
            h, w = frame.shape[:2]
            scale = INF_W / w
            inf_h = int(h * scale)
            frame_resized = cv2.resize(frame, (INF_W, inf_h))
            
            # Save extracted frame
            cv2.imwrite(frame_save_path, frame_resized)
            
            rgb = cv2.cvtColor(frame_resized, cv2.COLOR_BGR2RGB)
            gray = cv2.cvtColor(frame_resized, cv2.COLOR_BGR2GRAY)
            
            t = current_frame / fps
            g_t = GroundedState(current_frame, t, f"/static/processed_frames/{session_id}/{frame_filename}")

            # --- A. VISUAL ODOMETRY ---
            if prev_gray is not None:
                p0 = cv2.goodFeaturesToTrack(prev_gray, mask=None, maxCorners=40, qualityLevel=0.3, minDistance=7, blockSize=7)
                if p0 is not None:
                    p1, st, err = cv2.calcOpticalFlowPyrLK(prev_gray, gray, p0, None, winSize=(15,15), maxLevel=2)
                    if p1 is not None and len(p1) > 8:
                        E, mask = cv2.findEssentialMat(p1, p0, focal=1.0, pp=(0.0, 0.0), method=cv2.RANSAC, prob=0.99, threshold=1.0)
                        if E is not None and E.shape == (3,3):
                            _, R, t_vec, mask = cv2.recoverPose(E, p1, p0)
                            T_step = np.eye(4); T_step[:3, :3] = R; T_step[:3, 3] = t_vec.flatten() * 0.05
                            cam_pose_accum = cam_pose_accum @ T_step
            g_t.state["camera_pose"] = cam_pose_accum.tolist()
            prev_gray = gray

            # --- B. DEPTH ---
            depth_map = None
            if self.depth_model:
                try:
                    d_res = self.depth_model(Image.fromarray(rgb))
                    d_arr = np.array(d_res["depth"])
                    d_norm = (d_arr - d_arr.min()) / (d_arr.max() - d_arr.min() + 1e-6)
                    depth_map = np.interp(d_norm, (0, 1), (2.0, 0.1))
                except: pass

            # --- C. VISION & LIFTING ---
            results = self.vision_model.predict(rgb, verbose=False, conf=0.1)
            hand_pos_3d = None
            
            if results:
                for box in results[0].boxes:
                    label = results[0].names[int(box.cls[0])]
                    x1,y1,x2,y2 = map(int, box.xyxy[0])
                    cx, cy = (x1+x2)//2, (y1+y2)//2
                    
                    z = 0.5
                    if depth_map is not None:
                        cy_s = min(cy, inf_h-1); cx_s = min(cx, INF_W-1)
                        z = float(depth_map[cy_s, cx_s])
                    
                    fx = INF_W; wx = (cx-INF_W/2)*z/fx; wy = (cy-inf_h/2)*z/fx
                    pose = [wx, wy, z]
                    
                    if "hand" in label.lower(): hand_pos_3d = pose
                    else: g_t.state["objects_poses"].append({"label":label, "pos":pose})

            g_t.state["human_joints"] = hand_pos_3d

            # --- D. CONTACTS ---
            if hand_pos_3d and g_t.state["objects_poses"]:
                h_vec = np.array(hand_pos_3d)
                min_dist = 10.0
                closest_idx = -1
                for i, obj in enumerate(g_t.state["objects_poses"]):
                    dist = np.linalg.norm(h_vec - np.array(obj["pos"]))
                    if dist < min_dist: 
                        min_dist = dist
                        closest_idx = i
                g_t.state["active_object_id"] = closest_idx
                if min_dist < 0.15: g_t.state["contacts"] = 1

            # --- E. SENSORS (Merge Logic) ---
            if mode == 'sensor_rich' and real_sensor_data:
                # Find row with closest timestamp
                if 'timestamp' in real_sensor_data[0]:
                    closest_row = min(real_sensor_data, key=lambda x: abs(x.get('timestamp', 0) - t))
                else:
                    idx = int((current_frame / total_frames) * len(real_sensor_data))
                    closest_row = real_sensor_data[min(idx, len(real_sensor_data)-1)]

                g_t.sensors = {
                    "accel": [float(closest_row.get('ax',0)), float(closest_row.get('ay',0)), float(closest_row.get('az',0))],
                    "gyro": [float(closest_row.get('gx',0)), float(closest_row.get('gy',0)), float(closest_row.get('gz',0))]
                }
            else:
                # Monocular Hallucination
                if hand_pos_3d: g_t.sensors = imu_gen.compute(hand_pos_3d)
                else: g_t.sensors = imu_gen.compute([0,0,0] if not imu_gen.prev_pos is None else [0,0,0])

            raw_states.append(g_t)
            current_frame += step_size
            frames_processed += 1

        cap.release()
        
        # 4. Final Polish (ROBUST INTERPOLATION)
        filled_states = self._interpolate_hands(raw_states)
        
        final_timeline = []
        dt = step_size / fps
        for i in range(len(filled_states)):
            curr = filled_states[i]
            nxt = filled_states[i+1] if i < len(filled_states)-1 else curr
            
            if curr.state["human_joints"] and nxt.state["human_joints"]:
                v = (np.array(nxt.state["human_joints"]) - np.array(curr.state["human_joints"])) / dt
                curr.kinematics["hand_velocity"] = v.tolist()
                curr.action_world = (np.array(nxt.state["human_joints"]) - np.array(curr.state["human_joints"])).tolist()
            
            final_timeline.append({
                "timestamp": curr.timestamp,
                "observation": {
                    "image_path": curr.frame_path_rel # Export requires this
                },
                "state": curr.state,
                "sensors": curr.sensors,
                "kinematics": curr.kinematics,
                "action": {"world": curr.action_world},
                "robot_state": {}
            })

        print(f"🔍 Running {mode.upper()} QA...")
        validator = ValidationPipeline()
        validated = validator.process(final_timeline, mode=mode)
        
        return {
            "type": "grounded_trajectory",
            "timeline": validated['timeline'],
            "metadata": { 
                "mode": mode, 
                "fps": fps, 
                "session_id": session_id,
                "frames_dir": frame_dir, # Absolute path for Exporter
                "sensor_source": "REAL" if real_sensor_data else "SYNTHETIC",
                "quality_score": validated['quality_score']
            },
            "validation_log": validated['validation_log'],
            "quality_score": validated['quality_score'],
            "summary_stats": {
                "total_frames": len(validated['timeline']),
                "unique_objects": [], 
                "contact_frames": 0,
                "mode": mode,
                "quality_score": validated['quality_score']
            }
        }

    def _interpolate_hands(self, states):
        """
        Robustly fills gaps in hand tracking using Linear Interpolation.
        Handles edge cases where hand is missing at start/end.
        """
        filled = copy.deepcopy(states)
        valid_indices = [i for i, s in enumerate(filled) if s.state["human_joints"] is not None]
        
        if not valid_indices: return filled 

        for i in range(len(filled)):
            if filled[i].state["human_joints"] is None:
                # Find prev/next valid indices
                prev_idx = next((x for x in reversed(valid_indices) if x < i), None)
                next_idx = next((x for x in valid_indices if x > i), None)
                
                if prev_idx is not None and next_idx is not None:
                    p1 = np.array(filled[prev_idx].state["human_joints"])
                    p2 = np.array(filled[next_idx].state["human_joints"])
                    gap = next_idx - prev_idx
                    t = (i - prev_idx) / gap
                    filled[i].state["human_joints"] = (p1 + (p2 - p1) * t).tolist()
                    filled[i].state["contacts"] = filled[prev_idx].state["contacts"]
                elif prev_idx is not None:
                    # End padding
                    filled[i].state["human_joints"] = filled[prev_idx].state["human_joints"]
                    filled[i].state["contacts"] = filled[prev_idx].state["contacts"]
                elif next_idx is not None:
                    # Start padding
                    filled[i].state["human_joints"] = filled[next_idx].state["human_joints"]
                    filled[i].state["contacts"] = filled[next_idx].state["contacts"]
        return filled