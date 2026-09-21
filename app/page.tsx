// app/page.tsx
"use client";
import { useEffect, useRef, useState } from "react";
import { HandLandmarker, FilesetResolver } from "@mediapipe/tasks-vision";
import { isHandClosed } from "../utils/gesture";
import { Peer, DataConnection } from "peerjs";

export default function UniversalGestureDrop() {
  const [isMounted, setIsMounted] = useState(false);
  const [mode, setMode] = useState<"menu" | "host" | "join">("menu");
  
  const [myPeerId, setMyPeerId] = useState<string>("");
  const [remoteIdInput, setRemoteIdInput] = useState<string>("");
  const [conn, setConn] = useState<DataConnection | null>(null);
  
  // Status
  const [localStatus, setLocalStatus] = useState<string>("Disconnected");
  const [peerStatus, setPeerStatus] = useState<string>("Idle");

  // Interaction
  const [handState, setHandState] = useState("Open 🖐️");
  const [file, setFile] = useState<File | null>(null);
  const [peerFistReady, setPeerFistReady] = useState(false);
  
  // Refs
  const fileRef = useRef<File | null>(null);
  const handRef = useRef<string>("Open 🖐️");
  const lastSentStatus = useRef<string>("");
  const videoRef = useRef<HTMLVideoElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [landmarker, setLandmarker] = useState<HandLandmarker | null>(null);
  const peerInstance = useRef<Peer | null>(null);

  useEffect(() => { fileRef.current = file; }, [file]);
  useEffect(() => { handRef.current = handState; }, [handState]);
  useEffect(() => { setIsMounted(true); }, []);

  // 1. Initialize MediaPipe Vision (Cross-platform client-side WASM)
  useEffect(() => {
    if (!isMounted) return;
    const initMediaPipe = async () => {
      try {
        const vision = await FilesetResolver.forVisionTasks(
          "https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@latest/wasm"
        );
        const handLandmarker = await HandLandmarker.createFromOptions(vision, {
          baseOptions: {
            modelAssetPath: `https://storage.googleapis.com/mediapipe-models/hand_landmarker/hand_landmarker/float16/1/hand_landmarker.task`,
            delegate: "GPU",
          },
          runningMode: "VIDEO",
          numHands: 1,
        });
        setLandmarker(handLandmarker);
      } catch (err) {
        console.error("Failed to load MediaPipe WASM", err);
      }
    };
    initMediaPipe();
  }, [isMounted]);

  // 2. Handle Webcam (iOS Safari requires playsInline, muted, autoPlay)
  useEffect(() => {
    if (!landmarker || mode === "menu") return;

    navigator.mediaDevices.getUserMedia({ 
      video: { width: { ideal: 640 }, height: { ideal: 480 }, facingMode: "user" } 
    }).then((stream) => {
      if (videoRef.current) {
        videoRef.current.srcObject = stream;
        videoRef.current.play().catch(() => {});
        videoRef.current.addEventListener("loadeddata", predictWebcam);
      }
    }).catch((err) => {
      console.error("Camera access denied or unsupported on this device/browser.", err);
      setLocalStatus("Camera error / permission denied");
    });

    let lastVideoTime = -1;
    let consecutiveOpenFrames = 0;
    let consecutiveClosedFrames = 0;
    const FRAME_THRESHOLD = 5; // Slightly faster toggle for mobile UX

    const predictWebcam = async () => {
      if (videoRef.current && videoRef.current.currentTime !== lastVideoTime) {
        lastVideoTime = videoRef.current.currentTime;
        const results = landmarker.detectForVideo(videoRef.current, performance.now());

        if (results.landmarks.length > 0) {
          const closed = isHandClosed(results.landmarks[0]);
          if (closed) {
            consecutiveClosedFrames++;
            consecutiveOpenFrames = 0;
            if (consecutiveClosedFrames >= FRAME_THRESHOLD) setHandState("Grabbed! ✊");
          } else {
            consecutiveOpenFrames++;
            consecutiveClosedFrames = 0;
            if (consecutiveOpenFrames >= FRAME_THRESHOLD) setHandState("Open 🖐️");
          }
        }
      }
      requestAnimationFrame(predictWebcam);
    };
  }, [landmarker, mode]);

  // Unified Connection Setup
  const setupConnection = (connection: DataConnection) => {
    setConn(connection);
    setLocalStatus("Connected Peer-to-Peer 🚀");
    
    connection.on("data", (data: any) => {
      if (data === "DROP_REQUEST") {
        if (fileRef.current && handRef.current.includes("Grabbed")) {
          setLocalStatus(`Sending ${fileRef.current.name}...`);
          connection.send({
            type: "FILE",
            file: fileRef.current,
            name: fileRef.current.name,
            mimeType: fileRef.current.type,
          });
          
          fileRef.current = null; 
          setFile(null);
          if (fileInputRef.current) fileInputRef.current.value = "";
          setTimeout(() => setLocalStatus("Connected Peer-to-Peer 🚀"), 2000);
        }
      } else if (data.type === "STATUS") {
        setPeerStatus(data.message);
      } else if (data.type === "FILE") {
        const blob = new Blob([data.file], { type: data.mimeType || "application/octet-stream" });
        const url = URL.createObjectURL(blob);
        const a = document.createElement("a");
        a.href = url;
        a.download = data.name;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);
        
        setLocalStatus("File Received & Downloaded! 🎉");
        setTimeout(() => setLocalStatus("Connected Peer-to-Peer 🚀"), 3000);
      }
    });

    connection.on("close", () => {
      setLocalStatus("Peer Disconnected");
      setConn(null);
    });
  };

  // Start Hosting
  const startHosting = () => {
    setMode("host");
    const peer = new Peer();
    peerInstance.current = peer;

    peer.on("open", (id) => {
      setMyPeerId(id);
      setLocalStatus("Waiting for peer to join room...");
    });

    peer.on("connection", setupConnection);
    peer.on("error", (err) => {
      console.error(err);
      setLocalStatus("Peer connection error");
    });
  };

  // Join Room
  const joinRoom = () => {
    if (!remoteIdInput.trim()) return;
    setMode("join");
    const peer = new Peer();
    peerInstance.current = peer;

    peer.on("open", () => {
      setLocalStatus("Connecting to room...");
      const connection = peer.connect(remoteIdInput.trim());
      connection.on("open", () => setupConnection(connection));
      connection.on("error", () => setLocalStatus("Failed to connect to ID"));
    });
  };

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      if (peerInstance.current) peerInstance.current.destroy();
    };
  }, []);

  // Bidirectional Gesture Logic
  useEffect(() => {
    if (!conn) return;

    if (file && handState.includes("Grabbed")) {
      if (lastSentStatus.current !== "GRABBED") {
        conn.send({ type: "STATUS", message: "Peer is holding a file!" });
        lastSentStatus.current = "GRABBED";
      }
    } else {
      if (lastSentStatus.current !== "IDLE") {
        conn.send({ type: "STATUS", message: "Idle" });
        lastSentStatus.current = "IDLE";
      }
    }

    if (peerStatus.includes("holding a file")) {
      if (handState.includes("Grabbed")) {
        setPeerFistReady(true);
      } else if (handState.includes("Open") && peerFistReady) {
        conn.send("DROP_REQUEST");
        setPeerFistReady(false);
        setLocalStatus("Pulling file...");
      }
    }
  }, [handState, conn, file, peerStatus, peerFistReady]);

  if (!isMounted) return <div className="min-h-screen bg-slate-950" />;

  // 1. Landing / Mode Selection
  if (mode === "menu") {
    return (
      <div className="flex flex-col items-center justify-center min-h-screen bg-slate-950 text-white p-4 gap-6">
        <h1 className="text-3xl md:text-4xl font-extrabold tracking-tight text-center">
          HarmonyDrop <span className="text-indigo-400">P2P</span>
        </h1>
        <p className="text-slate-400 text-center max-w-sm text-sm">
          Universal cross-device air-transfer via hand gestures. Works across Mac, Windows, iOS, and Android.
        </p>
        <div className="flex flex-col sm:flex-row gap-4 w-full max-w-xs">
          <button 
            onClick={startHosting}
            className="flex-1 py-4 bg-indigo-600 hover:bg-indigo-500 rounded-2xl font-bold transition shadow-lg shadow-indigo-600/30 text-center"
          >
            Host Room
          </button>
        </div>
        <div className="w-full max-w-xs flex gap-2 mt-4 pt-4 border-t border-slate-800">
          <input 
            type="text" 
            placeholder="Enter Room/Peer ID" 
            value={remoteIdInput}
            onChange={(e) => setRemoteIdInput(e.target.value)}
            className="flex-1 bg-slate-900 border border-slate-700 rounded-xl px-4 py-3 text-sm outline-none focus:border-indigo-500"
          />
          <button 
            onClick={joinRoom}
            className="px-5 bg-emerald-600 hover:bg-emerald-500 rounded-xl font-bold text-sm transition"
          >
            Join
          </button>
        </div>
      </div>
    );
  }

  // 2. Active Session View (Responsive Mobile/Desktop Grid)
  return (
    <div className="flex flex-col items-center justify-start min-h-screen bg-slate-950 text-white p-4 md:p-8 gap-6 overflow-y-auto">
      <div className="w-full max-w-2xl bg-slate-900/90 backdrop-blur border border-slate-800 rounded-3xl p-6 shadow-2xl flex flex-col gap-4">
        <div className="flex justify-between items-center">
          <h2 className="text-lg font-bold flex items-center gap-2">
            <span className="w-3 h-3 rounded-full bg-emerald-500 animate-pulse" />
            Session Active ({mode.toUpperCase()})
          </h2>
          <button 
            onClick={() => window.location.reload()}
            className="text-xs text-slate-400 hover:text-white bg-slate-800 px-3 py-1.5 rounded-lg transition"
          >
            Exit / Reset
          </button>
        </div>

        {mode === "host" && (
          <div className="bg-slate-950 p-3 rounded-xl border border-slate-800 flex items-center justify-between text-xs font-mono">
            <span className="text-slate-400">Room ID:</span>
            <span className="text-indigo-400 select-all font-bold">{myPeerId || "Generating..."}</span>
          </div>
        )}

        <input 
          type="file" 
          ref={fileInputRef}
          onChange={(e) => setFile(e.target.files?.[0] || null)} 
          className="w-full text-xs text-slate-400 file:mr-4 file:py-2.5 file:px-4 file:rounded-xl file:border-0 file:font-semibold file:bg-indigo-600 file:text-white hover:file:bg-indigo-500 cursor-pointer"
        />
        
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 text-xs font-mono border-t border-slate-800 pt-3">
          <div className="bg-slate-950/50 p-2.5 rounded-lg text-amber-400 truncate">Status: {localStatus}</div>
          <div className="bg-slate-950/50 p-2.5 rounded-lg text-slate-400 truncate">Peer: {peerStatus}</div>
        </div>
      </div>

      {/* Visualizer & Tracking */}
      <div className="flex flex-col items-center gap-4 w-full max-w-2xl">
        <h1 className="text-2xl md:text-3xl font-black">
          State: <span className={handState.includes("Grabbed") ? "text-emerald-400" : "text-indigo-400"}>{handState}</span>
        </h1>
        
        <div className="relative w-full aspect-[4/3] max-w-[480px] rounded-3xl overflow-hidden border-4 border-slate-800 shadow-2xl bg-black">
          <video 
            ref={videoRef} 
            autoPlay 
            playsInline 
            muted 
            className="w-full h-full object-cover"
            style={{ transform: "scaleX(-1)" }}
          />
        </div>
      </div>
    </div>
  );
}
