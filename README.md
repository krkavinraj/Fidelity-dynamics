# Fidelity Platform - 3D Scene Builder with Franka Robot

<img width="1457" height="716" alt="Screenshot 2026-01-10 at 7 16 23 PM" src="https://github.com/user-attachments/assets/93bc9023-e903-40dd-bee6-b0ae3abfb3f8" />

<img width="296" height="459" alt="Screenshot 2026-01-10 at 7 23 25 PM" src="https://github.com/user-attachments/assets/997356ae-474a-4f35-9b01-2c7ef0133a6b" />

## New Feature: Franka Emika Panda 7-DOF Robot

Interactive robotic arm with full kinematic control, integrated into Scene Builder workflow.

**Features:**
- Real Franka FR3 meshes with URDF kinematics
- Joint control: Press `1-7` to select joints, `↑↓` arrows to rotate, `R` to reset
- Transform control: Press `T` to toggle, `G` to move, `E` to rotate, `S` to scale
- Automatically appears in Scene Builder after freezing video frame

## Requirements

### Backend Dependencies
- Python 3.8+
- PyTorch (for ML models)
- PyBullet (for physics simulation)
- FastAPI & Uvicorn (web server)
- OpenCV, NumPy, SciPy (computer vision)
- yt-dlp (YouTube video download)
- Ultralytics YOLO (object detection)
- Trimesh (3D mesh processing)

### Frontend Dependencies
- Node.js 16+
- React 18+ & Vite
- Three.js & React Three Fiber (3D rendering)
- **urdf-loader 0.12.6** (Franka robot URDF loader) - **Required for robot**
- @react-three/drei (3D helpers including TransformControls)
- Framer Motion (animations)

## Setup Instructions

### Backend Setup
```bash
# 1. Go into the backend folder
cd backend

# 2. Create a virtual environment
python -m venv venv

# 3. Activate the environment
# For Mac / Linux:
source venv/bin/activate
# For Windows:
.\venv\Scripts\activate

# 4. Install the required libraries
pip install -r requirements.txt
```

### Frontend Setup
```bash
# 1. Go into the frontend folder
cd frontend

# 2. Install all dependencies (includes urdf-loader for Franka robot)
npm install

# Note: The Franka robot meshes (~30MB) are included in frontend/public/franka_meshes/
```

### Running the Application
```bash
# Terminal 1 - Backend
cd backend
source venv/bin/activate  # (Or .\venv\Scripts\activate on Windows)
python run.py

# Terminal 2 - Frontend
cd frontend
npm run dev
```

Open http://localhost:5173/ and click "Scene Builder" to start!

## Recent Enhancements

### High-Quality 3D Reconstruction
- **Depth Anything V2 Large**: Best-in-class monocular depth estimation
- **Normal Map Generation**: Enhanced lighting and surface detail
- **512x288 Geometry**: 4x higher resolution mesh for smoother displacement
- **Edge-Preserving Smoothing**: Better object boundaries and surface quality

### Hand Tracking Teleoperation
- **Real-time IK Solver**: Jacobian-based inverse kinematics for smooth motion
- **Intuitive Hand Mapping**: Natural hand movement to robot workspace
- **Gripper Control**: Pinch gesture or press `G` to control gripper
- **Visual Feedback**: Workspace visualization and target indicators

> **Note**: The first time you freeze a video frame after starting the backend, normal maps may not be available (console warning). They will be generated automatically on subsequent frames.

## How to Use Franka Robot

1. Go to Scene Builder
2. Paste YouTube URL or upload MP4
3. Click "FREEZE" at desired frame
4. Robot appears automatically
5. Use keyboard controls to manipulate the robot

**Keyboard Shortcuts:**

*Joint Control:*
- `1-7`: Select joint (1=base, 7=wrist)
- `↑↓`: Rotate selected joint (fast)
- `←→`: Rotate selected joint (fine control)
- `R`: Reset all joints to home position
- `H`: Move to home pose
- `G`: Toggle gripper open/close

*Robot Transform:*
- `T`: Toggle transform controls
- `Shift+G`: Move robot position
- `E`: Rotate robot orientation
- `S`: Scale robot

*Hand Tracking Teleop:*
- Click "START HAND TRACKING" button in Scene Builder
- Move your hand to control robot arm
- Pinch fingers to close gripper
