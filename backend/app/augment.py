import h5py
import numpy as np
import os
import albumentations as A
import cv2

class AugmentationEngine:
    def __init__(self):
        # Path relative to backend root
        self.data_dir = os.path.abspath("data/datasets")

    def get_latest_file(self):
        if not os.path.exists(self.data_dir): return None
        files = [os.path.join(self.data_dir, f) for f in os.listdir(self.data_dir) if f.endswith(".hdf5") and "_aug_" not in f]
        if not files: return None
        return max(files, key=os.path.getctime)

    def augment_file(self, filename, config):
        if not filename or not os.path.exists(filename): 
            return {"status": "error", "message": "File not found"}

        transforms = []
        suffix_parts = []

        if 'noise' in config:
            # FIX: Correct class name is GaussNoise, NOT GaussianNoise
            transforms.append(A.GaussNoise(var_limit=(10.0, 50.0), p=1.0))
            suffix_parts.append("noise")
        
        if 'blur' in config:
            transforms.append(A.MotionBlur(blur_limit=7, p=1.0))
            suffix_parts.append("blur")
            
        if 'dark' in config:
            transforms.append(A.RandomBrightnessContrast(brightness_limit=(-0.5, -0.2), contrast_limit=0.2, p=1.0))
            suffix_parts.append("dark")

        if 'dropout' in config:
            # FIX: Updated API for newer Albumentations versions
            transforms.append(A.CoarseDropout(
                num_holes_range=(4, 8), 
                hole_height_range=(16, 32), 
                hole_width_range=(16, 32), 
                p=1.0
            ))
            suffix_parts.append("drop")

        if not transforms:
            return {"status": "error", "message": "No augmentations selected"}

        pipeline = A.Compose(transforms)
        
        base_name = os.path.basename(filename).replace(".hdf5", "")
        suffix = "_".join(suffix_parts)
        new_path = os.path.join(self.data_dir, f"{base_name}_aug_{suffix}.hdf5")

        print(f"Augmenting {filename} -> {new_path}...")

        try:
            with h5py.File(filename, 'r') as f_src, h5py.File(new_path, 'w') as f_dst:
                # Copy Core Data
                for key in ["action", "metadata"]:
                    if key in f_src: f_src.copy(key, f_dst)
                
                # Copy Robot State
                obs_grp = f_dst.create_group("observations")
                if "observations/qpos" in f_src: f_src.copy("observations/qpos", obs_grp)
                if "observations/ee_pose" in f_src: f_src.copy("observations/ee_pose", obs_grp)
                
                # Process Images
                if "observations/images" in f_src:
                    img_grp_src = f_src["observations/images"]
                    img_grp_dst = f_dst["observations"].create_group("images")

                    for cam_name in ["main", "side", "wrist"]:
                        if cam_name in img_grp_src:
                            original_imgs = np.array(img_grp_src[cam_name])
                            aug_imgs = []
                            
                            for img in original_imgs:
                                # Ensure RGB uint8
                                if img.dtype != np.uint8: img = img.astype(np.uint8)
                                augmented = pipeline(image=img)["image"]
                                aug_imgs.append(augmented)
                            
                            img_grp_dst.create_dataset(cam_name, data=np.array(aug_imgs), compression="gzip")

            return {"status": "ok", "new_file": os.path.basename(new_path)}
            
        except Exception as e:
            print(f"Augmentation Failed: {e}")
            return {"status": "error", "message": str(e)}