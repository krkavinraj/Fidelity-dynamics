import { useEffect, useRef, useState } from 'react';
import { FilesetResolver, HandLandmarker, DrawingUtils } from '@mediapipe/tasks-vision';
import * as THREE from 'three';
import clsx from 'clsx';

export const HandTrack = ({ onPose, externalStream, isMirrored = true, isRotated = false }) => {
  const videoRef = useRef(null);
  const canvasRef = useRef(null);
  const [status, setStatus] = useState("Initializing Vision...");

  const processHand = (landmarks) => {
    // Use MORE landmarks for better accuracy
    const wrist = new THREE.Vector3(landmarks[0].x, landmarks[0].y, landmarks[0].z);
    const middleMCP = new THREE.Vector3(landmarks[9].x, landmarks[9].y, landmarks[9].z);
    const middleTip = new THREE.Vector3(landmarks[12].x, landmarks[12].y, landmarks[12].z);
    const indexMCP = new THREE.Vector3(landmarks[5].x, landmarks[5].y, landmarks[5].z);
    const indexTip = new THREE.Vector3(landmarks[8].x, landmarks[8].y, landmarks[8].z);
    const thumbTip = new THREE.Vector3(landmarks[4].x, landmarks[4].y, landmarks[4].z);
    const pinkyMCP = new THREE.Vector3(landmarks[17].x, landmarks[17].y, landmarks[17].z);

    // Calculate palm center using multiple points for stability
    const palmCenter = new THREE.Vector3()
      .add(wrist)
      .add(indexMCP)
      .add(middleMCP)
      .add(pinkyMCP)
      .divideScalar(4);

    // More accurate forward vector using palm center to middle finger
    const forward = new THREE.Vector3().subVectors(middleTip, palmCenter).normalize();
    const vIndex = new THREE.Vector3().subVectors(indexMCP, palmCenter).normalize();
    const right = new THREE.Vector3().crossVectors(forward, vIndex).normalize();
    const up = new THREE.Vector3().crossVectors(right, forward).normalize();

    const m = new THREE.Matrix4();
    m.makeBasis(right, up, forward.negate());
    if (isRotated) { const rot = new THREE.Matrix4().makeRotationX(-Math.PI / 2); m.multiply(rot); }
    const q = new THREE.Quaternion().setFromRotationMatrix(m);

    // Enhanced pinch detection using 3D distance
    const pinchDist3D = Math.sqrt(
      Math.pow(thumbTip.x - indexTip.x, 2) +
      Math.pow(thumbTip.y - indexTip.y, 2) +
      Math.pow(thumbTip.z - indexTip.z, 2)
    );

    // More sensitive pinch threshold
    const gripperValue = pinchDist3D < 0.04 ? 1.0 : 0.0;

    // Use palm center for position (more stable than wrist alone)
    let x, y, z;
    if (isRotated) {
        // Top-Down Desk Mode
        x = (0.5 - palmCenter.y) * 2.0;
        y = (palmCenter.x - 0.5) * (isMirrored ? -2.5 : 2.5);
        z = Math.abs(palmCenter.z) * 4.0 + 0.05;
    } else {
        // Selfie Mode - using palm center for stability
        x = (palmCenter.y - 0.5) * 0.8 + 0.5;
        y = (palmCenter.x - 0.5) * -1.8;
        z = (palmCenter.y - 0.5) * -1.2 + 0.3;
    }

    return {
      pos: [x, y, z],
      orn: [q.x, q.y, q.z, q.w],
      gripper: gripperValue,
      confidence: 1.0 // Can be extended with landmark confidence
    };
  };

  useEffect(() => {
    let landmarker = null;
    let animationId = null;
    let localStream = null;

    // Temporal smoothing buffer for more stable tracking
    const smoothingBuffer = { left: [], right: [] };
    const SMOOTHING_FRAMES = 3;

    const smoothPosition = (hand, newPos) => {
      const buffer = smoothingBuffer[hand];
      buffer.push(newPos);
      if (buffer.length > SMOOTHING_FRAMES) buffer.shift();

      // Average position over last N frames
      const avg = [0, 0, 0];
      buffer.forEach(pos => {
        avg[0] += pos[0];
        avg[1] += pos[1];
        avg[2] += pos[2];
      });
      return avg.map(v => v / buffer.length);
    };

    const setup = async () => {
      try {
        const vision = await FilesetResolver.forVisionTasks("https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.0/wasm");
        landmarker = await HandLandmarker.createFromOptions(vision, {
          baseOptions: {
            modelAssetPath: "https://storage.googleapis.com/mediapipe-models/hand_landmarker/hand_landmarker/float16/1/hand_landmarker.task",
            delegate: "GPU"
          },
          runningMode: "VIDEO",
          numHands: 2,
          minHandDetectionConfidence: 0.5,  // Lower threshold for better detection
          minHandPresenceConfidence: 0.5,
          minTrackingConfidence: 0.5
        });
        
        let stream = externalStream;
        if (!stream) {
            localStream = await navigator.mediaDevices.getUserMedia({ video: { width: 640, height: 480 } });
            stream = localStream;
        }
        
        if (videoRef.current) {
            videoRef.current.srcObject = stream;
            videoRef.current.onloadeddata = () => { setStatus("Active"); predict(); };
        }
      } catch (err) { setStatus("Camera Error"); }
    };

    const predict = () => {
      if (!landmarker || !videoRef.current || !canvasRef.current) return;
      const video = videoRef.current;
      const canvas = canvasRef.current;
      const ctx = canvas.getContext("2d");
      
      if (canvas.width !== video.videoWidth) { canvas.width = video.videoWidth; canvas.height = video.videoHeight; }

      const results = landmarker.detectForVideo(video, performance.now());
      ctx.clearRect(0, 0, canvas.width, canvas.height);
      
      if (results.landmarks) {
        const payload = { left: null, right: null };
        const drawing = new DrawingUtils(ctx);

        results.landmarks.forEach((landmarks, i) => {
            const handedness = results.handedness[i][0].displayName;

            // Draw landmarks with different colors for each hand
            const color = handedness === "Right" ? "#00FF00" : "#00BFFF";
            drawing.drawConnectors(landmarks, HandLandmarker.HAND_CONNECTIONS, { color, lineWidth: 4 });
            drawing.drawLandmarks(landmarks, { color, lineWidth: 2, radius: 3 });

            const data = processHand(landmarks);

            // Apply temporal smoothing for stability
            const hand = handedness === "Right" ? "right" : "left";
            data.pos = smoothPosition(hand, data.pos);

            if (handedness === "Right") payload.right = data;
            else payload.left = data;
        });

        if (results.landmarks.length > 0) onPose(payload);
      }
      animationId = requestAnimationFrame(predict);
    };

    setup();
    return () => { cancelAnimationFrame(animationId); if (landmarker) landmarker.close(); if (localStream) localStream.getTracks().forEach(t => t.stop()); };
  }, [externalStream, isMirrored, isRotated]); 

  const transformClass = clsx("absolute inset-0 w-full h-full object-cover transition-transform duration-500", isMirrored && !isRotated && "scale-x-[-1]", !isMirrored && isRotated && "rotate-180", isMirrored && isRotated && "scale-x-[-1] rotate-180");

  return (
    <div className="relative w-full h-full bg-black">
        <video ref={videoRef} className={transformClass} style={{ opacity: 0.6 }} autoPlay playsInline muted />
        <canvas ref={canvasRef} className={transformClass} />
        <div className="absolute bottom-1 right-2 text-[8px] text-zinc-500 font-mono uppercase tracking-widest">{status}</div>
    </div>
  );
};