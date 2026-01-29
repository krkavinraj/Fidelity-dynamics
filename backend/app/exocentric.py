import cv2
import numpy as np
from ultralytics import YOLO
import json
import os
import uuid

class ExocentricExtractor:
    def __init__(self):
        # 1. Pose Model (YOLOv8-Pose) - Automatic download if missing
        print("Loading YOLOv8-Pose...")
        self.pose_model = YOLO("yolov8n-pose.pt")
        # 2. Object Model
        self.obj_model = YOLO("yolov8n.pt")
        
        # Camera Intrinsics Heuristic (Assumed for webcam/phone footage)
        self.focal_length = 1000.0
        
        # Path Setup
        self.base_dir = os.path.dirname(os.path.abspath(__file__)) # backend/app
        self.static_dir = os.path.join(self.base_dir, "static")
        self.download_dir = os.path.join(self.static_dir, "downloads")
        os.makedirs(self.download_dir, exist_ok=True)

    def estimate_depth(self, bbox_height, frame_height):
        # Simple pinhole model: Depth is inversely proportional to height
        if bbox_height == 0: return 5.0
        # Assume average human height ~1.7m
        return (self.focal_length * 1.7) / bbox_height

    def pixel_to_3d(self, u, v, depth, width, height):
        # Inverse projection
        x = (u - width / 2) * depth / self.focal_length
        y = (v - height / 2) * depth / self.focal_length
        # Convert to standard 3D coordinates (Y-up, -Z forward)
        return [float(x), float(depth), float(-y)] 

    def _make_serializable(self, obj):
        """Recursively convert numpy types to native python types."""
        if isinstance(obj, (np.integer, int)):
            return int(obj)
        elif isinstance(obj, (np.floating, float)):
            return float(obj)
        elif isinstance(obj, (np.ndarray, list, tuple)):
            return [self._make_serializable(x) for x in obj]
        elif isinstance(obj, dict):
            return {k: self._make_serializable(v) for k, v in obj.items()}
        elif hasattr(obj, 'tolist'):
            return self._make_serializable(obj.tolist())
        return obj

    def process_video(self, video_path):
        if not os.path.exists(video_path):
            raise FileNotFoundError(f"Video file not found: {video_path}")

        cap = cv2.VideoCapture(video_path)
        fps = cap.get(cv2.CAP_PROP_FPS) or 30
        width = int(cap.get(cv2.CAP_PROP_FRAME_WIDTH))
        height = int(cap.get(cv2.CAP_PROP_FRAME_HEIGHT))
        total_frames = int(cap.get(cv2.CAP_PROP_FRAME_COUNT))
        
        # Output structure
        output_data = {
            "metadata": {
                "source": os.path.basename(video_path),
                "resolution": [width, height],
                "fps": float(fps),
                "total_frames": int(total_frames)
            },
            "timeline": []
        }

        frame_idx = 0
        
        print(f"Starting Exocentric Inference on {video_path} ({width}x{height})")

        while cap.isOpened():
            ret, frame = cap.read()
            if not ret:
                break
                
            frame_data = {
                "frame": int(frame_idx),
                "timestamp": float(frame_idx / fps),
                "agents": [],
                "objects": [],
                "interactions": []
            }

            # --- A. DETECT & LIFT HUMANS (YOLO-POSE) ---
            pose_results = self.pose_model(frame, verbose=False)
            
            for r in pose_results:
                if r.keypoints is not None and r.boxes is not None:
                    kpts = r.keypoints.xy.cpu().numpy() # (N, 17, 2)
                    boxes = r.boxes.xyxy.cpu().numpy()
                    
                    for i, box in enumerate(boxes):
                        x1, y1, x2, y2 = box[:4]
                        bbox_h = y2 - y1
                        depth = self.estimate_depth(bbox_h, height)
                        
                        skeleton_3d = []
                        skeleton_2d = []
                        person_kpts = kpts[i]
                        
                        for kidx, (kx, ky) in enumerate(person_kpts):
                            # Store 2D for video overlay
                            skeleton_2d.append([float(kx), float(ky)])

                            # Lift to 3D (Simple heuristic)
                            if kx == 0 and ky == 0: 
                                skeleton_3d.append([0.0, 0.0, 0.0])
                            else:
                                p3d = self.pixel_to_3d(kx, ky, depth, width, height)
                                skeleton_3d.append(p3d)
                        
                        frame_data["agents"].append({
                            "id": f"agent_{i}",
                            "skeleton": skeleton_3d,
                            "skeleton_2d": skeleton_2d,
                            "bbox_2d": [float(x) for x in box[:4]]
                        })

            # --- B. DETECT OBJECTS (YOLO) ---
            # Classes: 39=bottle, 41=cup, 64=mouse, 67=cell phone
            obj_results = self.obj_model(frame, classes=[39, 41, 64, 67], verbose=False)
            
            for r in obj_results:
                boxes = r.boxes
                for box in boxes:
                    b = box.xyxy[0].cpu().numpy()
                    cls_id = int(box.cls[0])
                    label = self.obj_model.names[cls_id]
                    
                    frame_data["objects"].append({
                        "class": label,
                        "pos_3d": [0,0,0], # Placeholder for object 3D
                        "bbox_2d": [float(x) for x in b[:4]]
                    })
            
            # --- C. SIMPLE INTERACTION CHECK ---
            # If agent hand is close to object bbox
            for agent in frame_data["agents"]:
                # Approx wrist indices for COCO are 9 (L) and 10 (R)
                wrists = [agent["skeleton_2d"][9], agent["skeleton_2d"][10]]
                for obj in frame_data["objects"]:
                    bx = obj["bbox_2d"]
                    for w in wrists:
                        if w[0] > bx[0] and w[0] < bx[2] and w[1] > bx[1] and w[1] < bx[3]:
                            frame_data["interactions"].append({
                                "agent": agent["id"],
                                "object": obj["class"],
                                "type": "touching"
                            })

            output_data["timeline"].append(frame_data)
            frame_idx += 1
            if frame_idx % 30 == 0: print(f"Processed {frame_idx}/{total_frames}")

        cap.release()
        
        # --- RETURN DATA DIRECTLY ---
        print("Finalizing Serialization...")
        try:
            clean_output = self._make_serializable(output_data)
            
            # Also save to disk for cache/download
            filename = f"scene_3d_{str(uuid.uuid4())[:8]}.json"
            out_path = os.path.join(self.download_dir, filename)
            with open(out_path, 'w') as f:
                json.dump(clean_output, f)
            
            print(f"Data ready. Agents detected: {len(output_data['timeline'][-1]['agents']) if output_data['timeline'] else 0}")
            
            # CRITICAL: Return the FULL DATA object, not just a message
            return clean_output

        except Exception as e:
            print(f"Serialization Error: {e}")
            raise e