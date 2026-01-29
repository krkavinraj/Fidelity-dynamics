import os
import cv2
import numpy as np
import yt_dlp
import trimesh
import torch
import uuid
from PIL import Image
from transformers import pipeline
from ultralytics import YOLO, SAM
from simple_lama_inpainting import SimpleLama

class VisionPipeline:
    def __init__(self):
        base_dir = os.path.dirname(os.path.abspath(__file__))
        self.static_dir = os.path.join(base_dir, "static")
        self.mesh_dir = os.path.join(self.static_dir, "meshes")
        self.video_path = os.path.join(self.static_dir, "current_video.mp4")
        self.clean_frame_path = os.path.join(self.static_dir, "scene_texture.jpg")
        
        os.makedirs(self.static_dir, exist_ok=True)
        os.makedirs(self.mesh_dir, exist_ok=True)
        
        self.current_frame = None
        self.clean_frame = None
        
        # Lazy Load Models
        self.lama = None
        self.depth_model = None
        self.human_model = None
        self.sam_model = None

    def _get_lama(self):
        if not self.lama: self.lama = SimpleLama()
        return self.lama

    def _get_depth(self):
        if not self.depth_model:
            device = 0 if torch.cuda.is_available() else -1
            self.depth_model = pipeline(task="depth-estimation", model="depth-anything/Depth-Anything-V2-Small-hf", device=device)
        return self.depth_model

    def _get_human_seg(self):
        if not self.human_model: self.human_model = YOLO("yolov8n-seg.pt")
        return self.human_model

    def _get_sam(self):
        if not self.sam_model:
            try: self.sam_model = SAM('mobile_sam.pt')
            except: self.sam_model = SAM('sam_b.pt')
        return self.sam_model

    def download_youtube(self, url):
        # 1. Clean up previous video
        if os.path.exists(self.video_path):
            try: os.remove(self.video_path)
            except: pass
            
        # 2. Configure yt-dlp to use Android client (Bypasses SABR/Empty file error)
        ydl_opts = {
            'format': 'best[ext=mp4]/best',
            'outtmpl': self.video_path,
            'quiet': False, # Enabled logs for debugging
            'overwrites': True,
            'nocheckcertificate': True,
            'extractor_args': {
                'youtube': {
                    'player_client': ['android', 'ios'] # Spoof mobile client
                }
            }
        }
        
        try:
            print(f"Downloading YouTube video: {url}")
            with yt_dlp.YoutubeDL(ydl_opts) as ydl: 
                ydl.download([url])
            
            # 3. Verify file actually exists and has content
            if os.path.exists(self.video_path) and os.path.getsize(self.video_path) > 0:
                print("Download successful.")
                return "/static/current_video.mp4"
            else:
                print("Error: Downloaded file is empty or missing.")
                return None
                
        except Exception as e: 
            print(f"YouTube Download Failed: {e}")
            return None

    def capture_frame(self, time_sec):
        if not os.path.exists(self.video_path): return False
        cap = cv2.VideoCapture(self.video_path)
        cap.set(cv2.CAP_PROP_POS_FRAMES, int(time_sec * cap.get(cv2.CAP_PROP_FPS)))
        ret, frame = cap.read()
        cap.release()
        
        if ret:
            self.current_frame = frame
            self._process_scene()
            return True
        return False

    def _process_scene(self):
        """1. Remove Humans, 2. Flatten Table, 3. Generate Mesh"""
        print("Processing Scene...")
        
        # --- A. DETECT HUMANS ---
        results = self._get_human_seg()(self.current_frame, classes=[0], verbose=False)
        h, w = self.current_frame.shape[:2]
        mask = np.zeros((h, w), dtype=np.uint8)
        
        has_human = False
        if results and results[0].masks:
            has_human = True
            for seg in results[0].masks.data:
                m = cv2.resize(seg.cpu().numpy(), (w, h))
                mask = np.maximum(mask, (m * 255).astype(np.uint8))
            mask = cv2.dilate(mask, np.ones((20, 20), np.uint8), iterations=2)

        # --- B. INPAINT HUMANS ---
        if has_human:
            print("Erasing Humans...")
            img_pil = Image.fromarray(cv2.cvtColor(self.current_frame, cv2.COLOR_BGR2RGB))
            mask_pil = Image.fromarray(mask).convert('L')
            res_pil = self._get_lama()(img_pil, mask_pil)
            self.clean_frame = cv2.cvtColor(np.array(res_pil), cv2.COLOR_RGB2BGR)
        else:
            self.clean_frame = self.current_frame.copy()

        cv2.imwrite(self.clean_frame_path, self.clean_frame)

        # --- C. GENERATE FLATTENED MESH ---
        self.generate_background_mesh()

    def generate_background_mesh(self):
        """Generates a physics-friendly flat table mesh"""
        if self.clean_frame is None: return
        
        print("Generating 3D Geometry...")
        pil_img = Image.fromarray(cv2.cvtColor(self.clean_frame, cv2.COLOR_BGR2RGB))
        depth_map = self._get_depth()(pil_img)["depth"]
        depth_map.save(os.path.join(self.static_dir, "scene_depth.png"))

        # Downsample for speed
        w, h = 256, 144
        depth_resized = np.array(depth_map.resize((w, h))) / 255.0
        
        # --- TABLE FLATTENING ALGORITHM ---
        table_region = depth_resized[int(h*0.8):, :]
        floor_depth = np.median(table_region)
        
        flat_depth = np.copy(depth_resized)
        mask_table = np.abs(flat_depth - floor_depth) < 0.05
        
        flat_depth[flat_depth < floor_depth] = floor_depth 
        flat_depth[mask_table] = floor_depth

        # Create Grid
        x = np.linspace(-1.2, 1.2, w)
        y = np.linspace(-0.675, 0.675, h)
        xv, yv = np.meshgrid(x, y)
        
        z = (flat_depth - floor_depth) * 2.0 

        # Create Faces
        vertices = np.column_stack((xv.ravel(), yv.ravel(), z.ravel()))
        faces = []
        for i in range(h - 1):
            for j in range(w - 1):
                idx = i * w + j
                faces.append([idx, idx + w, idx + 1])
                faces.append([idx + 1, idx + w, idx + w + 1])

        # Export
        mesh = trimesh.Trimesh(vertices=vertices, faces=faces)
        uvs = np.column_stack(((vertices[:,0] + 1.2) / 2.4, (vertices[:,1] + 0.675) / 1.35))
        mesh.visual = trimesh.visual.TextureVisuals(uv=uvs)
        mesh.export(os.path.join(self.mesh_dir, "scene_background.obj"))

    def segment_object(self, u, v, type_mode):
        if self.clean_frame is None: return None
        
        h, w = self.clean_frame.shape[:2]
        results = self._get_sam()(self.clean_frame, points=[[int(u*w), int(v*h)]], labels=[1])
        if not results or not results[0].masks: return None
        
        mask = results[0].masks.xy[0]
        mask_binary = results[0].masks.data[0].cpu().numpy().astype(np.uint8) * 255
        
        # Create Mesh
        centroid = np.mean(mask, axis=0)
        poly = mask - centroid
        poly[:, 1] = -poly[:, 1]
        scale = 2.4 / w
        
        try:
            # Extrude 5cm
            mesh = trimesh.creation.extrude_polygon(trimesh.path.polygons.Polygon(poly * scale), height=0.05)
            fname = f"obj_{str(uuid.uuid4())[:8]}.obj"
            mesh.export(os.path.join(self.mesh_dir, fname))
            
            update_tex = False
            
            if type_mode == 'object':
                update_tex = True
                print("Lifting Object & Filling Hole...")
                
                kernel = np.ones((10, 10), np.uint8)
                dilated_mask = cv2.dilate(mask_binary, kernel, iterations=2)
                
                img_pil = Image.fromarray(cv2.cvtColor(self.clean_frame, cv2.COLOR_BGR2RGB))
                mask_pil = Image.fromarray(dilated_mask).convert('L')
                
                res_pil = self._get_lama()(img_pil, mask_pil)
                self.clean_frame = cv2.cvtColor(np.array(res_pil), cv2.COLOR_RGB2BGR)
                
                cv2.imwrite(self.clean_frame_path, self.clean_frame)
                self.generate_background_mesh() 
                
            return {
                "mesh_path": fname,
                "pos": [(u-0.5)*2.4, (v-0.5)*-1.35, 0.05],
                "is_ghost": (type_mode == 'goal'),
                "texture_update": update_tex
            }
        except Exception as e: 
            print(e)
            return None