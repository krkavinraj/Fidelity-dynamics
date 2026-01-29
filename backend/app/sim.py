try:
    import pybullet as p
    import pybullet_data
    PYBULLET_AVAILABLE = True
    PYBULLET_IMPORT_ERROR = None
except Exception as exc:
    p = None
    pybullet_data = None
    PYBULLET_AVAILABLE = False
    PYBULLET_IMPORT_ERROR = exc
import os
import random
import numpy as np
from .robot import RobotController

class SimManager:
    def __init__(self):
        if not PYBULLET_AVAILABLE:
            raise RuntimeError(f"pybullet not available: {PYBULLET_IMPORT_ERROR}")
        self.client = p.connect(p.DIRECT)
        p.setAdditionalSearchPath(pybullet_data.getDataPath())
        self.robot_right = None
        self.robot_left = None
        self.objects = {}
        self.next_obj_id = 0
        self.light_pos = [2, 5, 5]
        self.current_env_type = "default"

    def spawn_robot_at(self, pos):
        """Dynamic Spawn from Frontend"""
        if self.robot_right: p.removeBody(self.robot_right.id)
        self.robot_right = RobotController(self.client, base_pos=pos)
        self.robot_right.reset()

    def load_env(self, config={}):
        p.resetSimulation()
        p.setGravity(0, 0, -9.8)
        self.current_env_type = "builder"
        
        # Scene Collision Plane
        mesh_path = os.path.abspath(os.path.join(os.path.dirname(__file__), "static/meshes/scene_background.obj"))
        if os.path.exists(mesh_path):
            try:
                col = p.createCollisionShape(p.GEOM_MESH, fileName=mesh_path, meshScale=[1,1,1])
                orn = p.getQuaternionFromEuler([1.57, 0, 0])
                p.createMultiBody(0, col, -1, [0, 0, -0.5], orn)
            except: p.loadURDF("plane.urdf")
        else: p.loadURDF("plane.urdf")
        
        self.spawn_robot_at([0, 0, 0])
        self.objects = {}

    def load_prebuilt_env(self, env_type):
        p.resetSimulation()
        p.setGravity(0, 0, -9.8)
        self.current_env_type = env_type
        p.loadURDF("plane.urdf", [0, 0, -0.65])
        p.loadURDF("table/table.urdf", [0.5, 0, -0.63], useFixedBase=True)
        self.robot_right = RobotController(self.client, base_pos=[0, -0.25, 0]); self.robot_right.reset()
        self.robot_left = RobotController(self.client, base_pos=[0, 0.25, 0]); self.robot_left.reset()
        self.objects = {}
        self.next_obj_id = 0
        if env_type == "kitchen": self._spawn_primitive(p.GEOM_CYLINDER, [0.45, 0.1, 0.05], [0.03, 0.06], color=[0.8, 0.2, 0.2, 1]); self._spawn_primitive(p.GEOM_SPHERE, [0.55, -0.1, 0.05], [0.05], color=[0.2, 0.2, 0.8, 1])
        elif env_type == "warehouse": self._spawn_primitive(p.GEOM_BOX, [0.5, 0, 0.05], [0.04, 0.04, 0.04], color=[0.6, 0.4, 0.2, 1]); self._spawn_primitive(p.GEOM_BOX, [0.5, 0.15, 0.05], [0.03, 0.05, 0.03], color=[0.5, 0.3, 0.1, 1])
        elif env_type == "medical": self._spawn_primitive(p.GEOM_CYLINDER, [0.5, 0, 0.02], [0.01, 0.08], color=[0.8, 0.8, 0.8, 1]); self._spawn_primitive(p.GEOM_BOX, [0.45, -0.1, 0.02], [0.02, 0.05, 0.01], color=[0.9, 0.9, 0.9, 1])

    def _spawn_primitive(self, type, pos, dims, color=[1,1,1,1]):
        if type == p.GEOM_BOX: col = p.createCollisionShape(p.GEOM_BOX, halfExtents=dims); vis = p.createVisualShape(p.GEOM_BOX, halfExtents=dims, rgbaColor=color)
        elif type == p.GEOM_CYLINDER: col = p.createCollisionShape(p.GEOM_CYLINDER, radius=dims[0], height=dims[1]); vis = p.createVisualShape(p.GEOM_CYLINDER, radius=dims[0], length=dims[1], rgbaColor=color)
        elif type == p.GEOM_SPHERE: col = p.createCollisionShape(p.GEOM_SPHERE, radius=dims[0]); vis = p.createVisualShape(p.GEOM_SPHERE, radius=dims[0], rgbaColor=color)
        uid = p.createMultiBody(0.2, col, vis, pos); p.changeDynamics(uid, -1, lateralFriction=1.5, rollingFriction=0.05)
        name = f"obj_{self.next_obj_id}"; self.objects[name] = uid; self.next_obj_id += 1

    def spawn_custom_mesh(self, mesh_filename, pos, is_ghost=False, mass=0.2, collision_filename=None):
        vis_path = os.path.abspath(os.path.join(os.path.dirname(__file__), f"static/meshes/{mesh_filename}"))
        col_path = vis_path
        if collision_filename:
            col_path = os.path.abspath(os.path.join(os.path.dirname(__file__), f"static/meshes/{collision_filename}"))

        col = p.createCollisionShape(p.GEOM_MESH, fileName=col_path)
        vis = p.createVisualShape(p.GEOM_MESH, fileName=vis_path, rgbaColor=[0,1,1,0.5] if is_ghost else [1,0.5,0,1])
        real_mass = 0 if is_ghost else mass
        uid = p.createMultiBody(real_mass, col, vis, pos)
        if not is_ghost: p.changeDynamics(uid, -1, lateralFriction=1.5, spinningFriction=0.1, rollingFriction=0.05, frictionAnchor=1)
        name = f"obj_{self.next_obj_id}"; self.objects[name] = uid; self.next_obj_id += 1

    # --- RESTORED: DOMAIN RANDOMIZATION ---
    def randomize_domain(self):
        # 1. Randomize Lighting
        self.light_pos = [random.uniform(-5, 5), random.uniform(-5, 5), random.uniform(2, 8)]
        
        # 2. Randomize Objects
        for name, uid in self.objects.items():
            if "goal" in name: continue 
            
            # Jitter Position slightly
            curr_pos, _ = p.getBasePositionAndOrientation(uid)
            new_pos = [
                curr_pos[0] + random.uniform(-0.05, 0.05), 
                curr_pos[1] + random.uniform(-0.05, 0.05), 
                curr_pos[2]
            ]
            
            # Random Rotation
            new_orn = p.getQuaternionFromEuler([0, 0, random.uniform(-3.14, 3.14)])
            
            p.resetBasePositionAndOrientation(uid, new_pos, new_orn)
            
            # Random Physics Properties
            p.changeDynamics(uid, -1, 
                lateralFriction=random.uniform(0.8, 2.0), 
                mass=random.uniform(0.1, 0.5)
            )
            
            # Random Color (Visual Augmentation)
            p.changeVisualShape(uid, -1, rgbaColor=[random.random(), random.random(), random.random(), 1])

    def step(self, action, axis_locks=[False, False, False], speed=1.0):
        states = {}
        if action.get('right') and self.robot_right: self.robot_right.apply_action(action['right'], self.robot_right.get_state()['ee_pos'], speed, axis_locks); states['right'] = self.robot_right.get_state()
        if action.get('left') and self.robot_left: self.robot_left.apply_action(action['left'], self.robot_left.get_state()['ee_pos'], speed, axis_locks); states['left'] = self.robot_left.get_state()
        p.stepSimulation()
        scene_objs = []
        for name, uid in self.objects.items(): pos, orn = p.getBasePositionAndOrientation(uid); scene_objs.append({"name": name, "pos": pos, "orn": orn})
        contacts = False
        if self.robot_right:
            for obj_uid in self.objects.values():
                if len(p.getContactPoints(self.robot_right.id, obj_uid)) > 0: contacts = True
        return {"robots": states, "objects": scene_objs, "contacts": contacts}
    
    def get_all_camera_images(self):
        w, h = 256, 256
        view_main = p.computeViewMatrix([0.5, 0, 0.8], [0.5, 0, 0], [1, 0, 0]); proj = p.computeProjectionMatrixFOV(60, 1.0, 0.1, 10.0)
        _, _, rgb_main, _, _ = p.getCameraImage(w, h, view_main, proj, renderer=p.ER_TINY_RENDERER, lightDirection=self.light_pos)
        view_side = p.computeViewMatrix([0.8, -0.5, 0.5], [0.5, 0, 0.1], [0, 0, 1])
        _, _, rgb_side, _, _ = p.getCameraImage(w, h, view_side, proj, renderer=p.ER_TINY_RENDERER, lightDirection=self.light_pos)
        rgb_wrist = np.zeros((h, w, 3), dtype=np.uint8)
        if self.robot_right: rgb_wrist = self.robot_right.get_wrist_camera_image()
        return {"main": rgb_main[:,:,:3], "side": rgb_side[:,:,:3], "wrist": rgb_wrist}