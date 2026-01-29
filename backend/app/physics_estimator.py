from ultralytics import YOLOWorld
import numpy as np
import cv2

class PhysicsEstimator:
    def __init__(self):
        print("Loading Physics Engine (YOLO-World)...")
        # YOLO-World is highly efficient and detects open-vocabulary objects
        self.model = YOLOWorld('yolov8s-world.pt') 
        
        # Define common tabletop objects to look for
        self.classes = [
            "cup", "mug", "bottle", "soda can", "box", "cube", 
            "apple", "banana", "orange", "fruit", 
            "bowl", "plate", "spoon", "knife", "fork",
            "screwdriver", "pliers", "hammer", "tool",
            "toy block", "lego", "pen", "notebook"
        ]
        self.model.set_classes(self.classes)
        print("Physics Engine Ready.")

        # Heuristic Knowledge Base
        self.phys_db = {
            "default": {"mass": 0.1, "friction": 0.8},
            "box": {"mass": 0.2, "friction": 1.0},
            "cube": {"mass": 0.1, "friction": 0.9},
            "cup": {"mass": 0.3, "friction": 0.8},
            "mug": {"mass": 0.35, "friction": 0.8},
            "bottle": {"mass": 0.5, "friction": 0.6},
            "can": {"mass": 0.33, "friction": 0.6},
            "apple": {"mass": 0.15, "friction": 0.5},
            "banana": {"mass": 0.12, "friction": 0.6},
            "tool": {"mass": 0.4, "friction": 0.7},
            "hammer": {"mass": 0.6, "friction": 0.7},
            "toy": {"mass": 0.05, "friction": 0.5},
        }

    def estimate_properties(self, label):
        label = label.lower()
        for key in self.phys_db:
            if key in label: return self.phys_db[key]
        return self.phys_db["default"]

    def scan_image(self, image_array):
        """
        Runs YOLO-World on the image.
        """
        # Run inference
        results = self.model.predict(image_array, verbose=False)
        
        detected_objects = []
        h, w = image_array.shape[:2]

        if results and len(results) > 0:
            result = results[0]
            for box in result.boxes:
                # Get class
                cls_id = int(box.cls[0])
                label = self.classes[cls_id] if cls_id < len(self.classes) else "object"
                
                # Bounding Box (x1, y1, x2, y2)
                x1, y1, x2, y2 = box.xyxy[0].tolist()
                
                # Calculate normalized center (0-1)
                cx = ((x1 + x2) / 2) / w
                cy = ((y1 + y2) / 2) / h
                
                # Estimate Physics
                props = self.estimate_properties(label)
                
                detected_objects.append({
                    "label": label,
                    "center": [float(cx), float(cy)],
                    "mass": props["mass"],
                    "friction": props["friction"]
                })
            
        return detected_objects