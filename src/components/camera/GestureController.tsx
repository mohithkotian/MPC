import React, { useEffect, useRef, useState, useCallback } from 'react';
import { useStore } from '../../store/useStore';
import { HandLandmarker, FilesetResolver } from '@mediapipe/tasks-vision';
import { Camera } from 'lucide-react';

const PINCH_THRESHOLD = 40;
const RELEASE_THRESHOLD = 60;
const HAND_CONNECTIONS: [number, number][] = [
  [0, 1], [1, 2], [2, 3], [3, 4],
  [0, 5], [5, 6], [6, 7], [7, 8],
  [0, 9], [9, 10], [10, 11], [11, 12],
  [0, 13], [13, 14], [14, 15], [15, 16],
  [0, 17], [17, 18], [18, 19], [19, 20],
  [5, 9], [9, 13], [13, 17],
];

export const GestureController: React.FC = () => {
  const {
    isCameraActive,
    setCameraPermissionState,
    toggleCamera,
    gestureTargetPad,
    setGestureTargetPad,
    cameraPermissionState,
    triggerPad,
  } = useStore();

  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const handLandmarkerRef = useRef<HandLandmarker | null>(null);
  const lastVideoTimeRef = useRef(-1);
  const requestRef = useRef<number>();
  const isPinchingRef = useRef(false);
  const [pulsePoint, setPulsePoint] = useState<{ x: number; y: number } | null>(null);
  const pulseTimeoutRef = useRef<ReturnType<typeof setTimeout>>();
  const streamRef = useRef<MediaStream | null>(null);

  const [handLandmarkerReady, setHandLandmarkerReady] = useState(false);

  useEffect(() => {
    const initMediaPipe = async () => {
      try {
        const vision = await FilesetResolver.forVisionTasks(
          'https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.3/wasm'
        );
        const landmarker = await HandLandmarker.createFromOptions(vision, {
          baseOptions: {
            modelAssetPath:
              'https://storage.googleapis.com/mediapipe-models/hand_landmarker/hand_landmarker/float16/1/hand_landmarker.task',
            delegate: 'GPU',
          },
          runningMode: 'VIDEO',
          numHands: 1,
        });
        handLandmarkerRef.current = landmarker;
        setHandLandmarkerReady(true);
      } catch (err) {
        console.error('Failed to initialize MediaPipe:', err);
      }
    };
    initMediaPipe();
  }, []);

  const stopCamera = useCallback(() => {
    if (streamRef.current) {
      streamRef.current.getTracks().forEach((t) => t.stop());
      streamRef.current = null;
    }
    if (videoRef.current) {
      videoRef.current.srcObject = null;
    }
    if (canvasRef.current) {
      const ctx = canvasRef.current.getContext('2d');
      ctx?.clearRect(0, 0, canvasRef.current.width, canvasRef.current.height);
    }
    if (requestRef.current) {
      cancelAnimationFrame(requestRef.current);
      requestRef.current = undefined;
    }
    lastVideoTimeRef.current = -1;
    isPinchingRef.current = false;
    setPulsePoint(null);
  }, []);

  useEffect(() => {
    if (!isCameraActive) {
      stopCamera();
      return;
    }

    let cancelled = false;

    const startCamera = async () => {
      try {
        setCameraPermissionState('prompt');
        const stream = await navigator.mediaDevices.getUserMedia({
          video: { width: 640, height: 480 },
        });
        if (cancelled) {
          stream.getTracks().forEach((t) => t.stop());
          return;
        }
        streamRef.current = stream;
        setCameraPermissionState('granted');

        if (videoRef.current) {
          videoRef.current.srcObject = stream;
          videoRef.current.play();
        }
      } catch {
        setCameraPermissionState('denied');
      }
    };

    startCamera();

    return () => {
      cancelled = true;
      stopCamera();
    };
  }, [isCameraActive, stopCamera, setCameraPermissionState, toggleCamera]);

  useEffect(() => {
    if (!isCameraActive || !handLandmarkerReady || !handLandmarkerRef.current) return;

    const processFrame = () => {
      const video = videoRef.current;
      const canvas = canvasRef.current;
      if (!video || !canvas || video.videoWidth === 0) {
        requestRef.current = requestAnimationFrame(processFrame);
        return;
      }

      if (canvas.width !== video.videoWidth || canvas.height !== video.videoHeight) {
        canvas.width = video.videoWidth;
        canvas.height = video.videoHeight;
      }

      const ctx = canvas.getContext('2d');
      if (!ctx) return;

      if (video.currentTime !== lastVideoTimeRef.current) {
        lastVideoTimeRef.current = video.currentTime;
        const results = handLandmarkerRef.current!.detectForVideo(video, performance.now());

        ctx.clearRect(0, 0, canvas.width, canvas.height);

        if (results.landmarks && results.landmarks.length > 0) {
          const landmarks = results.landmarks[0];

          // Draw hand skeleton
          ctx.strokeStyle = 'rgba(255, 120, 0, 0.6)';
          ctx.lineWidth = 2;
          for (const [start, end] of HAND_CONNECTIONS) {
            const s = landmarks[start];
            const e = landmarks[end];
            ctx.beginPath();
            ctx.moveTo(s.x * canvas.width, s.y * canvas.height);
            ctx.lineTo(e.x * canvas.width, e.y * canvas.height);
            ctx.stroke();
          }

          // Draw landmark dots
          for (const lm of landmarks) {
            const x = lm.x * canvas.width;
            const y = lm.y * canvas.height;
            ctx.beginPath();
            ctx.arc(x, y, 3, 0, 2 * Math.PI);
            ctx.fillStyle = 'rgba(255, 80, 0, 0.9)';
            ctx.fill();
            ctx.strokeStyle = 'rgba(255, 200, 100, 0.5)';
            ctx.lineWidth = 1;
            ctx.stroke();
          }

          // Pinch detection
          const thumbTip = landmarks[4];
          const indexTip = landmarks[8];

          const pxThumb = { x: thumbTip.x * canvas.width, y: thumbTip.y * canvas.height };
          const pxIndex = { x: indexTip.x * canvas.width, y: indexTip.y * canvas.height };
          const distance = Math.hypot(pxThumb.x - pxIndex.x, pxThumb.y - pxIndex.y);

          const midX = (pxThumb.x + pxIndex.x) / 2;
          const midY = (pxThumb.y + pxIndex.y) / 2;

          if (distance < PINCH_THRESHOLD && !isPinchingRef.current) {
            isPinchingRef.current = true;
            useStore.getState().triggerPad(
              useStore.getState().gestureTargetPad
            );
            setPulsePoint({ x: midX, y: midY });
            if (pulseTimeoutRef.current) clearTimeout(pulseTimeoutRef.current);
            pulseTimeoutRef.current = setTimeout(() => setPulsePoint(null), 400);
          } else if (distance > RELEASE_THRESHOLD) {
            isPinchingRef.current = false;
          }

          // Draw pinch midpoint indicator
          if (isPinchingRef.current) {
            ctx.beginPath();
            ctx.arc(midX, midY, 14, 0, 2 * Math.PI);
            ctx.fillStyle = 'rgba(255, 40, 40, 0.8)';
            ctx.fill();
            ctx.lineWidth = 2;
            ctx.strokeStyle = '#ff0000';
            ctx.stroke();
          }
        }
      }

      requestRef.current = requestAnimationFrame(processFrame);
    };

    requestRef.current = requestAnimationFrame(processFrame);

    return () => {
      if (requestRef.current) cancelAnimationFrame(requestRef.current);
    };
  }, [isCameraActive, handLandmarkerReady]);

  if (!isCameraActive) return null;

  return (
    <div className="fixed bottom-6 right-6 z-50 animate-slide-in">
      <div className="relative w-48 h-32 bg-[#0c0d12] border-2 border-orange-500/40 rounded-xl overflow-hidden shadow-[0_0_20px_rgba(255,102,0,0.25)] flex flex-col items-center justify-center p-3 font-hardware">
        <div className="w-8 h-8 rounded-full bg-orange-600/20 border border-orange-500/60 flex items-center justify-center mb-2 shadow-[0_0_12px_rgba(255,102,0,0.3)]">
          <Camera className="w-4 h-4 text-orange-400 animate-pulse" />
        </div>
        <div className="text-orange-400 text-[10px] font-black tracking-wider uppercase text-center drop-shadow">
          UNDER CONSTRUCTION
        </div>
        <button
          onClick={toggleCamera}
          className="mt-3 px-3 py-1 bg-gradient-to-b from-[#262830] to-[#17181f] hover:bg-orange-600 hover:text-white border border-gray-700 hover:border-orange-400 text-[9px] font-extrabold text-gray-300 rounded shadow-beveled-btn transition-all"
        >
          DISMISS [M]
        </button>
      </div>
    </div>
  );
};
