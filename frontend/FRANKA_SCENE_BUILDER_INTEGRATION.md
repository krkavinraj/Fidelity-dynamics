# ✅ Franka 7-DOF Robot - Scene Builder Integration

## What's New

The **Franka Emika Panda 7-DOF robot** is now fully integrated into the **Scene Builder** workflow! When you paste a YouTube link and convert it to a 3D scene, the robot automatically appears and is ready to use with all the same features as the standalone mode.

## How It Works

### Automatic Integration Flow

1. **Paste YouTube URL** in Scene Builder
2. **Video uploads and processes** (buildStep 1)
3. **Click "FREEZE"** to capture frame (buildStep 2)
   - **Robot appears automatically** after freeze
4. **Scene converts to 3D mesh** with depth
   - **Robot is positioned in the scene**
5. **Add objects with "Pick Object" / "Set Goal"** (buildStep 3)
6. **Click "Start Teleop"** (buildStep 4)
   - **Robot is fully controllable** with all features

## Features Available in Scene Builder

### ✅ All 7-DOF Robot Features Work

**Joint Control** (Same as standalone)
- Press **1-7** to select joint
- Press **↑↓** arrows to rotate selected joint
- Press **R** to reset all joints to home position
- Green highlighting shows selected joint

**Transform Controls** (Same as standalone)
- Press **T** to toggle transform mode
- Press **G** to move robot position
- Press **E** to rotate robot orientation
- Press **S** to scale robot (if needed)
- Drag colored gizmos with mouse

**Camera Control** (Integrated)
- Mouse drag to orbit camera
- Scroll to zoom
- OrbitControls auto-disable when using transform

**Scene Interaction**
- Robot appears in your 3D reconstructed scene
- Position robot anywhere in the environment
- Robot interacts with 3D depth mesh
- Robot visible alongside spawned objects

## Usage Guide

### Quick Start

**Server**: http://localhost:5173/

1. Go to main menu
2. Click **"Scene Builder"**
3. Paste YouTube URL or upload MP4
4. Watch video, click **"FREEZE"** at desired frame
5. **Robot appears automatically!**
6. Use robot controls (see below)

### Robot Controls in Scene Builder

**Control Panel** (Top Left)
```
JOINT CONTROL
- Press 1-7 to select joint
- Press ↑↓ to rotate
- Press R to reset

ROBOT TRANSFORM
- Press T to toggle transform
- Press G to move position
- Press E to rotate orientation
- Press S to scale size
```

**Joint Angles Display**
- Shows all 7 joint angles in degrees
- Highlights selected joint in green
- Updates in real-time

### Example Workflow

**Position Robot in Scene:**
1. After freeze, robot appears at origin
2. Press **T** to enable transform
3. Press **G** to move robot
4. Drag green arrow (Y-axis) to lift robot
5. Drag red/blue arrows to position horizontally
6. Press **T** again to lock position

**Pose Robot Arm:**
1. Press **1** to select base joint
2. Use **↑↓** to rotate base
3. Press **2** for shoulder, rotate with **↑↓**
4. Continue through joints **3-7**
5. Create desired arm pose

**Add Objects:**
1. Select "Pick Object" or "Set Goal"
2. Click on 3D scene to place objects
3. Objects appear in scene with robot
4. Robot and objects visible together

**Start Teleop:**
1. Click "Start Teleop" button
2. Full teleoperation mode active
3. Robot remains controllable
4. Data collection ready

## UI Components

### Franka Controls Panel
**Location**: Top-left corner
**Always visible**: When in builder mode (buildStep >= 2)
**Contents**:
- Title: "Franka Emika Panda FR3"
- Joint control instructions
- Transform control instructions
- Live joint angle readout

### Main Scene
**Location**: Center canvas
**Contents**:
- 3D reconstructed mesh from video
- Grid and lighting
- Franka robot (when buildStep >= 2)
- Spawned objects (cubes, goals)
- Camera controls

### Bottom Controls
**Location**: Bottom center
**Conditional display**: Based on buildStep
- buildStep 1: Video playback controls
- buildStep 2: Embodiment selection
- buildStep 3: Object spawning tools
- buildStep 4: Teleop controls

## Technical Details

### Integration Points

**Scene.jsx**
```jsx
showFrankaRobot={appMode === 'builder' && buildStep >= 2}
```
- Robot appears when frozen scene is ready
- Automatically hidden in sandbox/AR mode
- Uses Suspense for mesh loading

**App.jsx**
```jsx
{appMode === 'builder' && buildStep >= 2 && (
  <FrankaControls selectedJoint={frankaSelectedJoint} jointAngles={frankaJointAngles} />
)}
```
- Control panel shows with robot
- State tracked in App component
- Independent of other robot states

### Conditional Rendering

**Simple Robot Arm** (Original)
```jsx
{!showFrankaRobot && (embodiment === 'right' || embodiment === 'dual') && (
  <RobotArm position={simState?.robots?.right?.ee_pos} ... />
)}
```
- Only shows when Franka robot is NOT active
- Used for real-time physics simulation
- Shows end-effector tracking

**Franka 7-DOF Robot** (New)
```jsx
{showFrankaRobot && (
  <Suspense fallback={null}>
    <FrankaRobot position={[0, 0, 0]} />
  </Suspense>
)}
```
- Shows in Scene Builder after freeze
- Full kinematic chain with URDF
- Interactive transform controls

### State Management

**Robot State in App.jsx**
```javascript
const [frankaJointAngles, setFrankaJointAngles] = useState([0, 0, 0, -Math.PI/2, 0, Math.PI/2, 0]);
const [frankaSelectedJoint, setFrankaSelectedJoint] = useState(0);
```

**Transform State in FrankaRobot.jsx**
```javascript
const [transformMode, setTransformMode] = useState('translate');
const [showTransformControls, setShowTransformControls] = useState(false);
```

## Keyboard Shortcuts Summary

| Key | Action | Mode |
|-----|--------|------|
| **1-7** | Select joint | Joint Control |
| **↑↓** | Rotate joint | Joint Control |
| **R** | Reset joints | Joint Control |
| **T** | Toggle transform | Transform |
| **G** | Move position | Transform |
| **E** | Rotate orientation | Transform |
| **S** | Scale size | Transform |
| **Mouse Drag** | Orbit camera / Transform | Camera / Transform |
| **Scroll** | Zoom | Camera |

## Workflow Examples

### Example 1: YouTube Video with Robot

**Goal**: Import video, add robot, pose it

**Steps**:
1. Main menu → Scene Builder
2. Paste: `https://youtube.com/watch?v=...`
3. Click arrow to download
4. Video plays → Click "FREEZE" when ready
5. **Robot appears automatically**
6. Press **T**, then **G** to position robot
7. Press **1-7** and **↑↓** to pose arm
8. Click "Pick Object" → Click scene to add objects
9. Click "Start Teleop" when ready

### Example 2: Upload MP4 with Robot

**Goal**: Use local video file

**Steps**:
1. Main menu → Scene Builder
2. Click "UPLOAD .MP4"
3. Select video file
4. Video plays → Click "FREEZE"
5. **Robot appears automatically**
6. Use transform controls to position
7. Use joint controls to pose
8. Add objects and start teleop

### Example 3: Quick Robot Pose

**Goal**: Just pose the robot quickly

**Steps**:
1. Upload any video
2. Freeze immediately
3. **Robot appears**
4. Press **R** to reset joints
5. Press **1**, use **↑↓** to rotate base
6. Press **2**, use **↑↓** for shoulder
7. Continue through joints
8. Press **T** + **G** to reposition if needed

## Benefits

### ✅ Seamless Integration
- Robot appears automatically when ready
- No manual activation needed
- Works with existing Scene Builder workflow

### ✅ Full Feature Parity
- All standalone features available
- Same keyboard controls
- Same transform capabilities
- Same visual feedback

### ✅ Scene Awareness
- Robot positioned in 3D scene
- Interacts with depth mesh
- Visible with spawned objects
- Proper lighting and shadows

### ✅ Non-Intrusive
- Doesn't affect sandbox mode
- Doesn't affect simple robot arm
- Conditionally rendered only when needed
- Clean separation of concerns

## Troubleshooting

### Robot Doesn't Appear
**Check**:
- Are you in Scene Builder mode? (not sandbox)
- Did you click "FREEZE"? (buildStep >= 2)
- Look at top-left for control panel
- Check browser console for errors

### Controls Not Working
**Check**:
- Click on page to give focus
- Not in video playback step
- Keyboard listener attached (console logs)
- No modal overlays blocking input

### Robot Appears Flat/Wrong
**Already fixed** - Robot stands upright with 90° X rotation

### Transform Gizmo Not Visible
**Solution**: Press **T** to toggle transform controls

### Joint Doesn't Move
**Check**:
- Correct joint selected (1-7)
- Within joint limits
- Not at limit boundaries
- Press **R** to reset if stuck

## Performance Notes

### Optimizations
- Lazy loading with Suspense
- URDF meshes cached by browser
- Transform controls only when visible
- No performance impact when disabled

### Best Practices
- Let meshes load fully before interacting
- Use transform controls for major positioning
- Use joint controls for fine arm poses
- Disable transform (Press T) when not needed

## Status

✅ **Fully Integrated**
✅ **All Features Working**
✅ **Scene Builder Compatible**
✅ **Transform Controls Active**
✅ **Joint Controls Active**
✅ **UI Panel Visible**
✅ **Auto-appears After Freeze**

**Server**: Running at http://localhost:5173/
**Ready**: Yes - Open Scene Builder and paste a YouTube link!

---

**Integration Complete!** 🎉

The Franka 7-DOF robot now automatically appears in Scene Builder after you freeze a video frame. All controls work exactly like the standalone mode - just press T to transform, 1-7 to select joints, and arrows to move!
