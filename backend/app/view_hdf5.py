import h5py
import matplotlib.pyplot as plt
import numpy as np
import os

# Directory where data is saved
DATA_DIR = "data/datasets"

def view_latest_trajectory():
    # 1. Find latest file
    files = [f for f in os.listdir(DATA_DIR) if f.endswith('.hdf5')]
    if not files:
        print("No datasets found!")
        return
    
    latest_file = max([os.path.join(DATA_DIR, f) for f in files], key=os.path.getctime)
    print(f"Opening: {latest_file}")

    with h5py.File(latest_file, 'r') as f:
        # 2. Print Metadata
        print("\n--- METADATA ---")
        for k, v in f['metadata'].attrs.items():
            print(f"{k}: {v}")

        # 3. Load Data
        qpos = f['observations/qpos'][:]
        actions = f['action'][:]
        
        # Load Images (Take the middle frame of the episode)
        mid_idx = len(qpos) // 2
        img_main = f['observations/images/main'][mid_idx]
        img_side = f['observations/images/side'][mid_idx]
        img_wrist = f['observations/images/wrist'][mid_idx]

        # 4. Visualization
        fig, axs = plt.subplots(2, 3, figsize=(15, 8))
        fig.suptitle(f"Episode Viewer: {os.path.basename(latest_file)}")

        # Row 1: Camera Views
        axs[0, 0].imshow(img_main)
        axs[0, 0].set_title("Main Cam (Overhead)")
        axs[0, 0].axis('off')

        axs[0, 1].imshow(img_side)
        axs[0, 1].set_title("Side Cam")
        axs[0, 1].axis('off')

        axs[0, 2].imshow(img_wrist)
        axs[0, 2].set_title("Wrist Cam")
        axs[0, 2].axis('off')

        # Row 2: Data Plots
        # Joint Positions
        axs[1, 0].plot(qpos)
        axs[1, 0].set_title("Robot Joint Positions")
        axs[1, 0].set_xlabel("Time Step")
        axs[1, 0].grid(True)

        # Actions (XYZ)
        axs[1, 1].plot(actions[:, :3]) # Plot only X,Y,Z
        axs[1, 1].set_title("Human Hand Inputs (XYZ)")
        axs[1, 1].set_xlabel("Time Step")
        axs[1, 1].grid(True)

        # Gripper
        axs[1, 2].plot(actions[:, -1], color='red')
        axs[1, 2].set_title("Gripper State (1=Closed)")
        axs[1, 2].set_xlabel("Time Step")
        axs[1, 2].grid(True)

        plt.tight_layout()
        plt.show()

if __name__ == "__main__":
    # Install matplotlib if you haven't: pip install matplotlib
    view_latest_trajectory()