# 7-DOF Robot Arm - Usage Guide

## Overview
A fully interactive 7-degree-of-freedom robot arm (inspired by Franka Emika Panda) with keyboard controls, integrated into your Fidelity Platform.

## Features
- ✅ 7 controllable joints with realistic kinematics
- ✅ Keyboard controls for joint manipulation
- ✅ Real-time visual feedback
- ✅ Joint limits based on Franka Panda specifications
- ✅ Interactive 3D camera controls
- ✅ Clean, modern UI with control panel

## How to Access

1. Start the development server:
   ```bash
   cd frontend
   npm run dev
   ```

2. Open your browser and navigate to the local server (usually `http://localhost:5173`)

3. On the main menu, click the **"7-DOF Robot Arm"** card (purple)

## Keyboard Controls

### Joint Selection
- Press `1` - `7` to select different joints (Joint 1 through Joint 7)
- The selected joint will be highlighted in **green** both in the 3D view and control panel

### Joint Movement
- `↑` (Arrow Up) - Rotate selected joint counterclockwise
- `↓` (Arrow Down) - Rotate selected joint clockwise
- Each press rotates the joint by ~2.86 degrees

### Reset
- `R` - Reset all joints to home position (0 degrees)

### Camera Controls
- **Left Click + Drag** - Rotate camera view
- **Right Click + Drag** - Pan camera
- **Scroll Wheel** - Zoom in/out

## Joint Configuration

| Joint # | Axis | Function | Range (degrees) |
|---------|------|----------|-----------------|
| 1 | Y | Base rotation | -166° to 166° |
| 2 | Z | Shoulder | -101° to 101° |
| 3 | Y | Elbow | -166° to 166° |
| 4 | Z | Wrist 1 | -176° to -4° |
| 5 | Y | Wrist 2 | -166° to 166° |
| 6 | Z | Wrist 3 | -1° to 215° |
| 7 | Y | End effector | -166° to 166° |

## Components Structure

```
src/
├── components/
│   ├── RobotArm7DOF.jsx      # Main robot arm component with 3D model
│   ├── RobotArmDemo.jsx      # Demo scene with camera and lighting
│   └── RobotControls.jsx     # UI control panel (exported from RobotArm7DOF)
└── App.jsx                    # Main app with menu integration
```

## Customization

### Changing Robot Appearance

Edit `RobotArm7DOF.jsx`:

```jsx
const jointMaterial = new THREE.MeshStandardMaterial({
  color: '#e0e0e0',      // Change joint color
  metalness: 0.7,        // Adjust metallic look
  roughness: 0.3         // Adjust surface roughness
});
```

### Adjusting Movement Speed

In `RobotArm7DOF.jsx`, line ~67:
```jsx
const delta = key === 'ArrowUp' ? 0.05 : -0.05;  // Increase for faster movement
```

### Modifying Joint Limits

Edit the `limits` array in `RobotArm7DOF.jsx` (around line 70):
```jsx
const limits = [
  [-2.8973, 2.8973],   // Joint 1 - adjust these values
  [-1.7628, 1.7628],   // Joint 2
  // ... etc
];
```

## Technical Details

### Dependencies Installed
- `urdf-loader` - For future URDF model loading support
- `@react-three/fiber` - React renderer for Three.js (already installed)
- `@react-three/drei` - Useful helpers for R3F (already installed)
- `three` - 3D graphics library (already installed)

### Architecture
- Built with React Three Fiber for optimal performance
- Uses hierarchical joint structure (each joint is a child of the previous)
- Forward kinematics calculated automatically through Three.js scene graph
- State management via React hooks

## Future Enhancements

Potential additions you could implement:

1. **Inverse Kinematics** - Click a point in 3D space and calculate joint angles
2. **Animation Playback** - Record and replay joint movements
3. **Real Robot Integration** - Send joint commands to actual Franka Panda
4. **URDF Loading** - Load different robot models from URDF files
5. **Gripper Control** - Animated gripper with open/close functionality
6. **Collision Detection** - Prevent self-collisions

## Troubleshooting

### Robot not appearing
- Check browser console for errors
- Ensure all dependencies are installed: `npm install`

### Controls not working
- Make sure the Robot Arm Demo page is focused (click on it)
- Check that keyboard shortcuts aren't being captured by browser

### Performance issues
- Reduce the number of segments in geometries (edit geometry args in RobotArm7DOF.jsx)
- Disable shadows in RobotArmDemo.jsx

## Support

For issues or questions:
1. Check the browser console for error messages
2. Verify all dependencies are installed
3. Ensure you're using a modern browser (Chrome, Firefox, Safari, Edge)

---

**Built with React Three Fiber** 🎨
**Inspired by Franka Emika Panda** 🤖
