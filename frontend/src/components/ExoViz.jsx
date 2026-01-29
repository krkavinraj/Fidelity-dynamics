import { useState, useRef, useEffect, useMemo } from 'react';
import { 
  Play, Pause, FileJson, Activity, Target, 
  Download, ArrowRight, User, Box, ScanLine, Eye, 
  Settings2, Terminal
} from 'lucide-react';
import clsx from 'clsx';

// COCO Skeleton Connections [start, end]
const SKELETON_LINKS = [
    [0, 1], [0, 2], [1, 3], [2, 4], // Face
    [5, 6], [5, 7], [7, 9], // Left Arm
    [6, 8], [8, 10], // Right Arm
    [5, 11], [6, 12], // Torso sides
    [11, 12], // Hips
    [11, 13], [13, 15], // Left Leg
    [12, 14], [14, 16]  // Right Leg
];

// Indices for Torso Polygon (L-Shoulder, R-Shoulder, R-Hip, L-Hip)
const TORSO_INDICES = [5, 6, 12, 11];

export const ExoViz = ({ data, videoSrc, onBack }) => {
    const [frameIdx, setFrameIdx] = useState(0);
    const [isPlaying, setIsPlaying] = useState(false);
    const [showLogs, setShowLogs] = useState(true);
    const [showOverlay, setShowOverlay] = useState(true);
    
    const videoRef = useRef(null);
    const scrollRef = useRef(null);
    
    const timeline = useMemo(() => data?.timeline || [], [data]);
    const meta = useMemo(() => data?.metadata || { resolution: [1280, 720], fps: 30 }, [data]);
    const frameData = timeline[frameIdx] || { agents: [], objects: [], interactions: [], timestamp: 0 };

    // --- VIDEO SYNC (MASTER-SLAVE) ---
    useEffect(() => {
        if (videoRef.current) {
            isPlaying ? videoRef.current.play().catch(()=>{}) : videoRef.current.pause();
        }
    }, [isPlaying]);

    const handleTimeUpdate = () => {
        if (!videoRef.current) return;
        const fps = meta.fps || 30;
        const idx = Math.floor(videoRef.current.currentTime * fps);
        if (idx !== frameIdx && idx < timeline.length) setFrameIdx(idx);
    };

    const handleScrubber = (e) => {
        const idx = parseInt(e.target.value);
        setFrameIdx(idx);
        if (videoRef.current) videoRef.current.currentTime = idx / (meta.fps || 30);
    };

    // Auto-scroll logs
    useEffect(() => {
        if (scrollRef.current) scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }, [frameIdx]);

    const handleExport = () => {
        const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
        const link = document.createElement('a');
        link.href = URL.createObjectURL(blob);
        link.download = `fidelity_exo_${Date.now()}.json`;
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
    };

    if (!data) return (
        <div className="fixed inset-0 z-[100] flex flex-col items-center justify-center bg-black text-zinc-500 font-mono animate-pulse">
            LOADING EXTRACTION DATA...
        </div>
    );

    return (
        <div className="fixed inset-0 z-[100] w-screen h-screen flex flex-col bg-black text-white font-sans overflow-hidden">
            
            {/* HEADER */}
            <div className="h-14 border-b border-white/10 flex items-center justify-between px-6 bg-zinc-950 shrink-0 z-50">
                <div className="flex items-center gap-4">
                    <button onClick={onBack} className="text-zinc-400 hover:text-white flex items-center gap-2 text-xs font-bold uppercase tracking-widest transition-colors">
                        <ArrowRight className="rotate-180" size={14}/> Exit Viewer
                    </button>
                    <div className="h-4 w-px bg-white/10"></div>
                    <div className="flex items-center gap-2">
                        <Activity size={14} className="text-cyan-400"/>
                        <span className="text-xs font-mono text-zinc-300">AGENTS: <span className="text-white">{frameData.agents.length}</span></span>
                    </div>
                    <div className="flex items-center gap-2">
                        <Target size={14} className="text-purple-400"/>
                        <span className="text-xs font-mono text-zinc-300">OBJECTS: <span className="text-white">{frameData.objects.length}</span></span>
                    </div>
                </div>
                <div className="flex gap-2">
                    <button onClick={() => setShowOverlay(!showOverlay)} className={clsx("flex items-center gap-2 px-3 py-1.5 rounded text-xs font-bold transition-all border", showOverlay ? "bg-cyan-900/30 border-cyan-500/30 text-cyan-300" : "bg-zinc-800 border-zinc-700 text-zinc-400")}>
                        <Eye size={14}/> {showOverlay ? "MOCAP ON" : "MOCAP OFF"}
                    </button>
                    <button onClick={handleExport} className="flex items-center gap-2 bg-emerald-600 hover:bg-emerald-500 text-white px-4 py-1.5 rounded text-xs font-bold transition-all shadow-lg shadow-emerald-900/20">
                        <Download size={14}/> EXPORT JSON
                    </button>
                </div>
            </div>

            {/* MAIN CONTENT */}
            <div className="flex-1 flex relative overflow-hidden h-full">
                
                {/* VIDEO CONTAINER */}
                <div className="flex-1 relative flex items-center justify-center bg-[#050505] overflow-hidden">
                    <div className="relative w-full h-full flex items-center justify-center">
                        <video 
                            ref={videoRef}
                            src={videoSrc}
                            className="w-full h-full object-contain max-h-[calc(100vh-8rem)]"
                            muted
                            playsInline
                            crossOrigin="anonymous"
                            onTimeUpdate={handleTimeUpdate}
                            onEnded={() => setIsPlaying(false)}
                        />
                        
                        {/* MOCAP OVERLAY */}
                        {showOverlay && (
                            <svg className="absolute inset-0 w-full h-full pointer-events-none" viewBox={`0 0 ${meta.resolution[0]} ${meta.resolution[1]}`} preserveAspectRatio="xMidYMid meet">
                                <defs>
                                    <filter id="neon-glow" x="-50%" y="-50%" width="200%" height="200%">
                                        <feGaussianBlur stdDeviation="2.5" result="coloredBlur"/>
                                        <feMerge>
                                            <feMergeNode in="coloredBlur"/>
                                            <feMergeNode in="SourceGraphic"/>
                                        </feMerge>
                                    </filter>
                                </defs>

                                {/* Agents */}
                                {frameData.agents.map((agent, ai) => {
                                    // Calculate Torso Polygon Points
                                    const torsoPoints = TORSO_INDICES.map(idx => agent.skeleton_2d[idx])
                                        .filter(p => p && p[0] !== 0)
                                        .map(p => p.join(',')).join(' ');

                                    return (
                                        <g key={`a2d-${ai}`}>
                                            {/* BODY HIGHLIGHT (TORSO FILL) */}
                                            {torsoPoints.length > 10 && (
                                                <polygon 
                                                    points={torsoPoints} 
                                                    fill="rgba(6, 182, 212, 0.25)" 
                                                    stroke="rgba(6, 182, 212, 0.8)" 
                                                    strokeWidth="1"
                                                />
                                            )}

                                            {/* SKELETON LINES */}
                                            {SKELETON_LINKS.map(([i, j], li) => {
                                                const p1 = agent.skeleton_2d[i];
                                                const p2 = agent.skeleton_2d[j];
                                                if (!p1 || !p2 || (p1[0]===0 && p1[1]===0) || (p2[0]===0 && p2[1]===0)) return null;
                                                return (
                                                    <line 
                                                        key={li} 
                                                        x1={p1[0]} y1={p1[1]} 
                                                        x2={p2[0]} y2={p2[1]} 
                                                        stroke="#06b6d4" 
                                                        strokeWidth="3" 
                                                        strokeLinecap="round" 
                                                        filter="url(#neon-glow)"
                                                        opacity="0.9" 
                                                    />
                                                );
                                            })}

                                            {/* JOINTS */}
                                            {agent.skeleton_2d.map((p, pi) => (
                                                (p[0]!==0) && <circle key={pi} cx={p[0]} cy={p[1]} r="3" fill="#ffffff" />
                                            ))}

                                            {/* ID BOX */}
                                            {agent.bbox_2d && (
                                                <g>
                                                    <rect x={agent.bbox_2d[0]} y={agent.bbox_2d[1]-20} width="80" height="20" fill="#06b6d4" opacity="0.9" rx="4"/>
                                                    <text x={agent.bbox_2d[0]+5} y={agent.bbox_2d[1]-6} fill="#000" fontSize="12" fontWeight="bold" fontFamily="monospace">
                                                        {agent.id.toUpperCase()}
                                                    </text>
                                                </g>
                                            )}
                                        </g>
                                    );
                                })}

                                {/* Objects */}
                                {frameData.objects.map((obj, oi) => {
                                    const b = obj.bbox_2d;
                                    return (
                                        <g key={`o2d-${oi}`}>
                                            <rect x={b[0]} y={b[1]} width={b[2]-b[0]} height={b[3]-b[1]} fill="rgba(168, 85, 247, 0.1)" stroke="#a855f7" strokeWidth="2" strokeDasharray="4,2"/>
                                            <text x={b[0]} y={b[1]-5} fill="#a855f7" fontSize="12" fontWeight="bold" fontFamily="monospace">{obj.class}</text>
                                        </g>
                                    );
                                })}
                            </svg>
                        )}
                    </div>
                </div>

                {/* SIDEBAR LOGS */}
                {showLogs && (
                    <div className="w-96 border-l border-white/10 bg-zinc-950 flex flex-col z-20 shadow-2xl shrink-0">
                        <div className="p-4 border-b border-white/10 bg-zinc-900/50 flex justify-between items-center">
                            <div>
                                <h3 className="text-xs font-bold text-zinc-400 uppercase tracking-widest mb-1">Live Inference Log</h3>
                                <div className="text-[10px] text-zinc-600 font-mono">FRAME: {frameIdx} / {timeline.length}</div>
                            </div>
                            <Activity className="text-emerald-500 animate-pulse" size={16}/>
                        </div>
                        
                        <div ref={scrollRef} className="flex-1 overflow-y-auto p-4 space-y-2 font-mono custom-scrollbar bg-black/20">
                            {frameData.agents.map((agent, i) => (
                                <div key={`a-${i}`} className="bg-cyan-900/10 border-l-2 border-cyan-500 p-2 rounded-r mb-2">
                                    <div className="flex items-center gap-2 text-cyan-400 font-bold text-xs"><User size={12}/> {agent.id}</div>
                                    <div className="text-zinc-500 text-[10px]">
                                        Torso Visible: {agent.skeleton_2d[5][0] !== 0 ? "YES" : "NO"}
                                    </div>
                                </div>
                            ))}
                            
                            {frameData.interactions?.map((ix, i) => (
                                <div key={`ix-${i}`} className="bg-yellow-500/10 p-2 rounded text-[10px] border border-yellow-500/30 text-yellow-200 flex items-center gap-2 mb-1">
                                    <ScanLine size={12}/> {ix.agent} ↔ {ix.object}
                                </div>
                            ))}
                            
                            {frameData.objects.map((obj, i) => (
                                <div key={`o-${i}`} className="text-xs text-purple-400/80 pl-2 border-l border-purple-500/20">
                                    OBJ: {obj.class}
                                </div>
                            ))}
                        </div>
                    </div>
                )}
            </div>

            {/* CONTROLLER */}
            <div className="h-16 bg-zinc-950 border-t border-white/10 p-3 flex items-center gap-4 shrink-0 z-50">
                <button onClick={() => setIsPlaying(!isPlaying)} className={clsx("w-10 h-10 flex flex-shrink-0 items-center justify-center rounded-full transition-all shadow-lg", isPlaying ? "bg-white text-black" : "bg-zinc-800 hover:bg-zinc-700 text-white")}>
                    {isPlaying ? <Pause size={18} fill="currentColor" /> : <Play size={18} fill="currentColor" className="ml-0.5" />}
                </button>
                <div className="flex-1 flex flex-col justify-center gap-1.5">
                    <input type="range" min="0" max={Math.max(0, timeline.length - 1)} value={frameIdx} onChange={handleScrubber} className="w-full h-1.5 bg-zinc-800 rounded-lg appearance-none cursor-pointer accent-cyan-500 hover:accent-cyan-400 transition-all"/>
                    <div className="flex justify-between text-[10px] font-mono text-zinc-500 px-1"><span>{frameData.timestamp?.toFixed(2)}s</span><span>{(meta.total_frames / (meta.fps || 30)).toFixed(2)}s</span></div>
                </div>
            </div>
        </div>
    );
};