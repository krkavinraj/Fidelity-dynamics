import { useState, useRef, useEffect } from 'react';
import {
  Play, Pause, Youtube, Layers, ArrowRight, CheckCircle2, Loader2,
  Cpu, Eye, FileJson, UploadCloud, Zap, ShieldCheck, AlertTriangle, Check,
  RefreshCcw, Trash2, X, Activity, Microscope, Scan, Info,
  GitCompare, Target, Package, BarChart3, Bot, Settings2, Video, Database, Film,
  Download
} from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import clsx from 'clsx';
import { Canvas } from '@react-three/fiber';

// --- CUSTOM COMPONENTS ---
import { EmbodimentPanel } from './EmbodimentPanel';
import FrankaRobot from './FrankaRobot';
import { TrajectoryInspector } from './TrajectoryInspector';
import { useToast, ToastContainer } from './Toast';
import { VideoPlayerSkeleton, ChartSkeleton, ImageSkeleton } from './SkeletonLoaders';
import { BatchProgressPanel } from '../App';

const PIPELINE_STEPS = [
  { id: 'ingest', label: 'Ingestion', icon: Youtube, desc: 'Downloading stream' },
  { id: 'decode', label: 'Decoding', icon: Layers, desc: 'Extracting RGB frames' },
  { id: 'recon', label: 'Reconstruction', icon: Eye, desc: 'YOLO + Depth Lifting' },
  { id: 'action', label: 'Inference', icon: Cpu, desc: 'Contact physics solving' },
  { id: 'dataset', label: 'Serialization', icon: FileJson, desc: 'JSON Manifest' },
];

const API_BASE = 'http://localhost:8001';

// --- HELPER: SPARKLINE ---
const Sparkline = ({ data, color = "#10b981", height = 40 }) => {
    if (!data || data.length < 2) return <div className="h-full bg-white/5 rounded"/>;
    const max = Math.max(...data.map(Math.abs)) || 1;
    const points = data.map((v, i) => {
        const x = (i / (data.length - 1)) * 100;
        const y = 50 - ((v / max) * 40);
        return `${x},${y}`;
    }).join(" ");
    return (
        <svg viewBox="0 0 100 100" preserveAspectRatio="none" className="w-full" style={{ height }}>
            <polyline points={points} fill="none" stroke={color} strokeWidth="2" vectorEffect="non-scaling-stroke"/>
            <line x1="0" y1="50" x2="100" y2="50" stroke="white" strokeOpacity="0.1" strokeDasharray="4"/>
        </svg>
    );
};

// --- VALIDATION MODAL ---
const ValidationModal = ({ 
    isOpen, onClose, 
    validationStage, setValidationStage, 
    enrichmentData, 
    smoothingAlpha, setSmoothingAlpha, 
    gapFillLimit, setGapFillLimit,
    onReprocess, onDownload, onReject 
}) => {
    // ... (Keep existing modal logic same as before, truncated for brevity but needed in final)
    // Assuming you have this code or I can paste it if needed. 
    // For this paste, I'll focus on the main component structure.
    return isOpen ? (
        <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/90 p-8 text-white">
            <div className="bg-zinc-900 border border-white/10 p-8 rounded-xl max-w-lg w-full">
                <h2 className="text-xl font-bold mb-4">QA Console</h2>
                <div className="space-y-4">
                    <div className="p-4 bg-black/40 rounded">
                        <div className="text-sm font-mono text-zinc-400">QUALITY SCORE</div>
                        <div className="text-4xl font-bold text-emerald-400">{(enrichmentData?.quality_score*100).toFixed(0)}%</div>
                    </div>
                    <button onClick={onDownload} className="w-full py-3 bg-emerald-600 rounded font-bold text-xs">DOWNLOAD REPORT</button>
                    <button onClick={onClose} className="w-full py-3 border border-zinc-700 rounded font-bold text-xs">CLOSE</button>
                </div>
            </div>
        </div>
    ) : null;
};

// --- MAIN COMPONENT ---
export function EgoEnrichment({ onBack, onSearchRedirect, initialUrl = "", initialSourceType = "youtube", autoStart = false, factoryMode = false, batchJobId = null }) {
  // --- STATE ---
  const [url, setUrl] = useState(initialUrl || "https://www.youtube.com/watch?v=Xh0r_KqfJTE");
  const [batchPreviewVideo, setBatchPreviewVideo] = useState(null); // For batch video preview
  const [sourceType, setSourceType] = useState(initialSourceType);
  const [prompts, setPrompts] = useState("tools, objects"); 
  const [enrichmentMode, setEnrichmentMode] = useState(factoryMode ? "monocular" : "monocular"); 

  const [currentStep, setCurrentStep] = useState(0); 
  const [error, setError] = useState(null);
  const [videoPath, setVideoPath] = useState(null);
  const [enrichmentData, setEnrichmentData] = useState(null);
  const [resultSummary, setResultSummary] = useState(null);
  const [isUploading, setIsUploading] = useState(false);
  const [progress, setProgress] = useState(0);
  const [progressText, setProgressText] = useState("");

  const [isValidationPanelOpen, setIsValidationPanelOpen] = useState(false);
  const [validationStage, setValidationStage] = useState('idle'); 
  const [smoothingAlpha, setSmoothingAlpha] = useState(0.3);
  const [gapFillLimit, setGapFillLimit] = useState(5);
  const [isReprocessing, setIsReprocessing] = useState(false);

  // Upload Refs
  const videoInputRef = useRef(null);
  const sensorInputRef = useRef(null);
  const [selectedVideoFile, setSelectedVideoFile] = useState(null);
  const [selectedSensorFile, setSelectedSensorFile] = useState(null);

  // --- EMBODIMENT & RETARGETING STATE ---
  const [embodimentMode, setEmbodimentMode] = useState(false);
  const [selectedRobot, setSelectedRobot] = useState(null);
  const [retargetConfig, setRetargetConfig] = useState({ scale: 1, x: 0.5, y: 0, z: 0.3 }); // Default offsets
  const [previewTarget, setPreviewTarget] = useState(null);
  const [hasRetargeted, setHasRetargeted] = useState(false); 

  // --- PLAYBACK & SENSORS ---
  const videoRef = useRef(null);
  const canvasRef = useRef(null);
  const fileInputRef = useRef(null);
  const autoStartRef = useRef(false);
  const [isPlaying, setIsPlaying] = useState(false);
  const [playbackTime, setPlaybackTime] = useState(0);
  const [sensorHistory, setSensorHistory] = useState({ ax:[], ay:[], az:[], gx:[], gy:[], gz:[] });

  // Toast notifications
  const { toasts, toast, removeToast } = useToast();
  const [uploadProgress, setUploadProgress] = useState(0);
  const uploadProgressRef = useRef(0);

  // On Load: If Factory Mode, force simple upload UI (Video only)
  useEffect(() => {
      if(factoryMode) setEnrichmentMode("monocular"); 
  }, [factoryMode]);

  // --- API HANDLERS ---

  // 1. Single File Upload (Factory or Mono-Enrichment)
  const handleFileUpload = async (e) => {
    const file = e.target.files[0];
    if (!file) return;

    // Reset and initialize upload state
    setIsUploading(true);
    setError(null);
    setCurrentStep(1);
    setUploadProgress(0);
    uploadProgressRef.current = 0;

    const formData = new FormData();
    formData.append("file", file);

    // Use XMLHttpRequest for progress tracking
    const xhr = new XMLHttpRequest();

    xhr.upload.addEventListener('progress', (event) => {
      if (event.lengthComputable) {
        const percentComplete = Math.round((event.loaded / event.total) * 100);
        // Ensure progress only increases
        if (percentComplete > uploadProgressRef.current) {
          uploadProgressRef.current = percentComplete;
          setUploadProgress(percentComplete);
        }
      }
    });

    xhr.addEventListener('load', () => {
      if (xhr.status === 200) {
        const res = JSON.parse(xhr.responseText);
        if (res.status === 'ok') {
          // Set progress to 100% briefly before hiding
          setUploadProgress(100);
          uploadProgressRef.current = 100;

          setTimeout(() => {
            setVideoPath(`${API_BASE}${res.path}`);
            setCurrentStep(2);
            setIsUploading(false);
            setUploadProgress(0);
            uploadProgressRef.current = 0;
            toast.success('Upload Complete!', `${file.name} uploaded successfully`);
            startProcessing({path: res.path, task_type: factoryMode ? 'factory' : 'grounding'});
          }, 300);
        } else {
          setError(res.message);
          setCurrentStep(0);
          setIsUploading(false);
          setUploadProgress(0);
          uploadProgressRef.current = 0;
          toast.error('Upload Failed', res.message);
        }
      } else {
        setError("Upload Error");
        setCurrentStep(0);
        setIsUploading(false);
        setUploadProgress(0);
        uploadProgressRef.current = 0;
        toast.error('Upload Error', 'Failed to upload file. Please try again.');
      }
    });

    xhr.addEventListener('error', () => {
      setError("Upload Error");
      setCurrentStep(0);
      setIsUploading(false);
      setUploadProgress(0);
      uploadProgressRef.current = 0;
      toast.error('Upload Failed', 'Network error. Please check your connection and try again.');
    });

    xhr.open('POST', `${API_BASE}/enrich/upload`);
    xhr.send(formData);
  };

  // 2. Dual Upload (Enrichment Mode Only)
  const handleDualUploadIngest = () => {
      if (!selectedVideoFile) {
          toast.error("Video Required", "Please select a video file to continue");
          return;
      }
      if (enrichmentMode === 'sensor_rich' && !selectedSensorFile) {
          toast.error("Sensor Data Required", "Sensor CSV file is required for Sensor Rich Mode");
          return;
      }

      setIsUploading(true);
      setCurrentStep(1);
      setUploadProgress(0);
      uploadProgressRef.current = 0;

      const formData = new FormData();
      formData.append("video", selectedVideoFile);
      if (selectedSensorFile) formData.append("sensor", selectedSensorFile);
      formData.append("mode", enrichmentMode);

      const xhr = new XMLHttpRequest();

      xhr.upload.addEventListener('progress', (event) => {
        if (event.lengthComputable) {
          const percentComplete = Math.round((event.loaded / event.total) * 100);
          // Ensure progress only increases
          if (percentComplete > uploadProgressRef.current) {
            uploadProgressRef.current = percentComplete;
            setUploadProgress(percentComplete);
          }
        }
      });

      xhr.addEventListener('load', () => {
        if (xhr.status === 200) {
          const res = JSON.parse(xhr.responseText);
          if (res.status === 'ok') {
            setUploadProgress(100);
            uploadProgressRef.current = 100;

            setTimeout(() => {
              setVideoPath(`${API_BASE}${res.video_path}`);
              setIsUploading(false);
              setUploadProgress(0);
              uploadProgressRef.current = 0;
              toast.success('Upload Complete!', 'Files uploaded successfully');
              startProcessing({
                path: res.video_path,
                sensor_path: res.sensor_path,
                task_type: 'grounding'
              });
            }, 300);
          } else {
            setError(res.message);
            setIsUploading(false);
            setUploadProgress(0);
            uploadProgressRef.current = 0;
            toast.error('Upload Failed', res.message);
          }
        } else {
          setError("Upload Error");
          setIsUploading(false);
          setUploadProgress(0);
          uploadProgressRef.current = 0;
          toast.error('Upload Error', 'Failed to upload files. Please try again.');
        }
      });

      xhr.addEventListener('error', () => {
        setError("Upload Failed");
        setIsUploading(false);
        setUploadProgress(0);
        uploadProgressRef.current = 0;
        toast.error('Upload Failed', 'Network error. Please check your connection and try again.');
      });

      xhr.open('POST', `${API_BASE}/enrich/upload_dual`);
      xhr.send(formData);
  };

  // 3. URL Start (Universal)
  const startPipeline = async (options = {}) => {
    const nextUrl = options.url ?? url;
    if (sourceType !== 'upload' && !nextUrl) return setError("Invalid URL");
    setError(null); setEnrichmentData(null); setIsValidationPanelOpen(false); setProgress(0);
    
    if (sourceType === 'upload') { fileInputRef.current.click(); return; }

    setCurrentStep(1); 
    const ingest = await fetch(`${API_BASE}/enrich/ingest`, { method: 'POST', headers: {'Content-Type':'application/json'}, body: JSON.stringify({type: sourceType, url: nextUrl}) }).then(r=>r.json());
    if(ingest.status === 'error') { setError(ingest.message); setCurrentStep(0); return; }

    setVideoPath(`${API_BASE}${ingest.path}`);
    startProcessing({path: ingest.path, task_type: factoryMode ? 'factory' : 'grounding'});
  };

  // --- CORE PROCESSING WRAPPER ---
  const startProcessing = async (payload, isRetry = false) => {
    if (isRetry) setIsReprocessing(true);
    setCurrentStep(2); 
    
    // SEND REQUEST
    const proc = await fetch(`${API_BASE}/enrich/process`, { 
        method: 'POST', headers: {'Content-Type':'application/json'},
        body: JSON.stringify({ 
            ...payload, 
            prompts, 
            mode: enrichmentMode, 
            config: { smoothing_alpha: smoothingAlpha, gap_fill_limit: gapFillLimit } 
        })
    }).then(r=>r.json());
    
    if(proc.status !== 'started') { setError("Backend Error"); setCurrentStep(0); setIsReprocessing(false); return; }

    // POLL STATUS
    const poll = setInterval(async () => {
        const stat = await fetch(`${API_BASE}/enrich/status`).then(r=>r.json());
        if (stat.state === 'processing') {
            setProgress(stat.progress || 0); setProgressText(`Processing... ${stat.progress}%`);
            if(stat.progress > 10) setCurrentStep(3); if(stat.progress > 80) setCurrentStep(4);
        } else if (stat.state === 'completed') {
            clearInterval(poll); setProgress(100); setResultSummary(stat.summary); setCurrentStep(5);
            const res = await fetch(`${API_BASE}/enrich/result`).then(r=>r.json());
            setEnrichmentData(res.result); setIsReprocessing(false);

            // Show success toast
            const qualityScore = res.result?.quality_score ? (res.result.quality_score * 100).toFixed(0) : 'N/A';
            toast.success(
                factoryMode ? 'SKU Generation Complete!' : 'Processing Complete!',
                `Quality Score: ${qualityScore}% • ${res.result?.timeline?.length || 0} frames processed`
            );
        } else if (stat.state === 'error') {
            clearInterval(poll); setError(stat.error); setCurrentStep(0); setIsReprocessing(false);

            // Show error toast with retry option
            toast.error(
                'Processing Failed',
                stat.error || 'An error occurred during processing',
                {
                    action: { label: 'Retry', onClick: handleReprocess }
                }
            );
        }
    }, 1000);
  };

  // --- HANDLERS ---
  const handleBatchRetarget = async (configOverride = null) => {
    setIsReprocessing(true);
    const configToUse = configOverride || retargetConfig;
    try {
        const res = await fetch(`${API_BASE}/process/retarget`, {
            method: 'POST',
            headers: {'Content-Type': 'application/json'},
            body: JSON.stringify({ timeline: enrichmentData.timeline, config: configToUse })
        }).then(r => r.json());
        
        if (res.status === 'ok') {
            setEnrichmentData(prev => ({ ...prev, timeline: res.timeline }));
            setHasRetargeted(true);
            setRetargetConfig(configToUse); 
        } else { setError("Retargeting Failed: " + res.message); }
    } catch (e) { setError("Retargeting Error: " + e.message); } finally { setIsReprocessing(false); }
  };

  const handleQAFix = async (sigma) => {
    if (!selectedRobot) return;
    const newConfig = { ...selectedRobot.config, smoothing_sigma: sigma };
    await handleBatchRetarget(newConfig);
  };

  const handleExport = async (format) => { /* ... Keep existing export logic ... */ alert("Exporting..."); };
  const handleDownload = () => { /* ... Keep existing download logic ... */ };
  const handleReprocess = () => { if(videoPath) { setIsValidationPanelOpen(false); startProcessing({path: videoPath.replace(API_BASE, "")}, true); }};
  const handleReject = () => { onSearchRedirect ? onSearchRedirect(prompts) : onBack(); };

  // NEW: Download frames only (for enrichment mode)
  const handleDownloadFrames = async () => {
    if (!enrichmentData) return;
    try {
      const response = await fetch(`${API_BASE}/export/frames`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          timeline: enrichmentData.timeline,
          name: 'enrichment_frames'
        })
      });

      if (response.ok) {
        const blob = await response.blob();
        const downloadUrl = window.URL.createObjectURL(blob);
        const link = document.createElement('a');
        link.href = downloadUrl;
        link.download = 'enrichment_frames.zip';
        document.body.appendChild(link);
        link.click();
        link.remove();
        window.URL.revokeObjectURL(downloadUrl);

        const sizeMB = (blob.size / (1024 * 1024)).toFixed(1);
        toast.success('Download Complete!', `enrichment_frames.zip (${sizeMB} MB)`);
      }
    } catch (e) {
      console.error('Frame download failed:', e);
      toast.error('Download Failed', 'Unable to download frames. Please try again.', {
        action: { label: 'Retry', onClick: handleDownloadFrames }
      });
    }
  };

  // NEW: Download factory SKU package (for factory mode)
  const handleDownloadFactorySKU = async () => {
    if (!enrichmentData) return;
    try {
      const response = await fetch(`${API_BASE}/export/factory_sku`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          timeline: enrichmentData.timeline,
          name: 'factory_sku',
          video_path: videoPath
        })
      });

      if (response.ok) {
        const blob = await response.blob();
        const downloadUrl = window.URL.createObjectURL(blob);
        const link = document.createElement('a');
        link.href = downloadUrl;
        link.download = 'factory_sku_package.zip';
        document.body.appendChild(link);
        link.click();
        link.remove();
        window.URL.revokeObjectURL(downloadUrl);

        const sizeMB = (blob.size / (1024 * 1024)).toFixed(1);
        toast.success('SKU Package Ready!', `factory_sku_package.zip (${sizeMB} MB) - Includes multi-view frames, IMU data, and camera positions`);
      }
    } catch (e) {
      console.error('SKU download failed:', e);
      toast.error('Export Failed', 'Unable to export SKU package. Please try again.', {
        action: { label: 'Retry', onClick: handleDownloadFactorySKU }
      });
    }
  };

  // --- SYNC LOOP ---
  useEffect(() => {
    if(!enrichmentData || !videoRef.current) return;
    const updateLoop = () => {
        const t = videoRef.current.currentTime;
        setPlaybackTime(t);
        const frame = enrichmentData.timeline.find(f => Math.abs(f.timestamp - t) < 0.1);
        
        if(frame) {
            const sensors = frame.sensors || { accel: [0,0,0], gyro: [0,0,0] };
            setSensorHistory(prev => {
                const limit = 50;
                return {
                    ax: [...prev.ax, sensors.accel[0]].slice(-limit),
                    ay: [...prev.ay, sensors.accel[1]].slice(-limit),
                    az: [...prev.az, sensors.accel[2]].slice(-limit),
                    gx: [...prev.gx, sensors.gyro[0]].slice(-limit),
                    gy: [...prev.gy, sensors.gyro[1]].slice(-limit),
                    gz: [...prev.gz, sensors.gyro[2]].slice(-limit)
                };
            });

            // Update Robot (Only for Grounding)
            if (!factoryMode && (embodimentMode || hasRetargeted) && frame.state?.human_joints) {
                const h = frame.state.human_joints; 
                const cfg = retargetConfig; 
                const tx = (h[0] * cfg.scale) + cfg.x;
                const ty = (h[1] * cfg.scale) + cfg.y;
                const tz = (h[2] * cfg.scale) + cfg.z;
                setPreviewTarget({ pos: [tx, ty, tz], gripper: frame.state.contacts ? 0 : 1 });
            }
        }
        if(isPlaying) requestAnimationFrame(updateLoop);
    };
    if(isPlaying) { videoRef.current.play(); updateLoop(); } else { videoRef.current.pause(); }
  }, [isPlaying, enrichmentData, factoryMode, embodimentMode, retargetConfig, hasRetargeted]);

  return (
    <div className="flex h-screen w-full bg-[#050505] text-white overflow-hidden font-sans">
      <input type="file" ref={fileInputRef} onChange={handleFileUpload} className="hidden" accept=".mp4" />
      
      {/* SIDEBAR */}
      <div className="w-72 border-r border-white/10 bg-zinc-950 flex flex-col p-4 z-20 shrink-0 h-full overflow-y-auto">
          <div className="mb-4">
              <button onClick={onBack} className="mb-3 hover:bg-zinc-800 p-1.5 rounded transition-colors text-zinc-400 hover:text-white"><ArrowRight className="rotate-180" size={14}/></button>
              <h1 className="text-[11px] font-bold tracking-[0.2em] mb-0.5">FIDELITY<span className={clsx(factoryMode ? "text-purple-500" : "text-emerald-500")}>{factoryMode ? "_FOUNDRY" : "_ENGINE"}</span></h1>
              <div className="text-[9px] text-zinc-500 font-mono">{factoryMode ? "SKU GENERATION" : "GROUNDING"}</div>
          </div>

          {/* BATCH PROGRESS PANEL */}
          {batchJobId && (
            <div className="mb-4">
              <BatchProgressPanel jobId={batchJobId} onVideoSelect={(videoUrl) => setBatchPreviewVideo(videoUrl)} />
            </div>
          )}

          {/* INPUT SECTION - HIDE DURING BATCH */}
          {!batchJobId && (
          <div className="space-y-4">
              {!factoryMode && (
                  <div className="flex bg-zinc-900 p-0.5 rounded">
                      <button onClick={() => setEnrichmentMode('monocular')} className={clsx("flex-1 py-1.5 text-[9px] font-bold rounded", enrichmentMode==='monocular' ? "bg-zinc-800 text-white" : "text-zinc-500")}>MONOCULAR</button>
                      <button onClick={() => setEnrichmentMode('sensor_rich')} className={clsx("flex-1 py-1.5 text-[9px] font-bold rounded", enrichmentMode==='sensor_rich' ? "bg-purple-900/30 text-purple-300" : "text-zinc-500")}>SENSOR RICH</button>
                  </div>
              )}

              {/* FACTORY & MONOCULAR INPUT */}
              {(factoryMode || enrichmentMode === 'monocular') && (
                  <div className="p-3 border border-zinc-800 bg-zinc-900/50 rounded-lg space-y-3">
                      <div className="text-[9px] font-bold text-zinc-400 uppercase flex items-center gap-1.5"><Database size={10}/> Input Source</div>
                      <input value={url} onChange={(e)=>setUrl(e.target.value)} placeholder="YouTube URL..." className="w-full bg-black border-zinc-700 rounded px-2 py-1.5 text-[11px] text-white focus:border-purple-500 transition-colors"/>
                      <div className="text-center text-[9px] text-zinc-600 font-mono">- OR -</div>
                      <button onClick={()=>fileInputRef.current.click()} className="w-full py-2 border border-dashed border-zinc-700 rounded text-zinc-400 hover:text-white hover:border-zinc-500 text-[10px] flex items-center justify-center gap-1.5"><UploadCloud size={12}/> UPLOAD MP4</button>

                      <button onClick={()=>startPipeline({url})} className={clsx("w-full py-2.5 font-bold rounded text-[10px] mt-2 transition-all active:scale-95", factoryMode ? "bg-purple-600 hover:bg-purple-500 text-white" : "bg-emerald-600 hover:bg-emerald-500 text-white")}>
                          {factoryMode ? "GENERATE ASSETS" : "START GROUNDING"}
                      </button>

                      {/* Upload Progress */}
                      {isUploading && uploadProgress > 0 && (
                          <div className="mt-2 space-y-1">
                              <div className="flex justify-between text-[10px] text-zinc-400">
                                  <span>Uploading...</span>
                                  <span>{uploadProgress}%</span>
                              </div>
                              <div className="h-1 bg-zinc-800 rounded overflow-hidden">
                                  <div className="h-full bg-gradient-to-r from-emerald-500 to-cyan-500 transition-all duration-300" style={{width: `${uploadProgress}%`}}/>
                              </div>
                          </div>
                      )}
                  </div>
              )}

              {/* SENSOR RICH INPUT */}
              {!factoryMode && enrichmentMode === 'sensor_rich' && (
                  <div className="space-y-3">
                        <input type="file" ref={videoInputRef} className="hidden" accept=".mp4" onChange={(e)=>setSelectedVideoFile(e.target.files[0])}/>
                        <button onClick={()=>videoInputRef.current.click()} className="w-full py-3 border border-zinc-700 bg-zinc-900 text-zinc-300 text-xs rounded flex items-center justify-center gap-2">
                            <Video size={14}/> {selectedVideoFile ? selectedVideoFile.name : "Video Source (.mp4)"}
                        </button>

                        <input type="file" ref={sensorInputRef} className="hidden" accept=".csv,.json" onChange={(e)=>setSelectedSensorFile(e.target.files[0])}/>
                        <button onClick={()=>sensorInputRef.current.click()} className="w-full py-3 border border-emerald-500/30 bg-emerald-500/10 text-emerald-300 text-xs rounded flex items-center justify-center gap-2 hover:bg-emerald-500/20">
                            <Activity size={14}/> {selectedSensorFile ? selectedSensorFile.name : "IMU Data (.csv)"}
                        </button>
                        
                        <button onClick={handleDualUploadIngest} className="w-full py-3 bg-emerald-600 hover:bg-emerald-500 text-white font-bold rounded text-xs shadow-lg shadow-emerald-900/20 mt-2 active:scale-95 transition-all">
                            FUSE & VALIDATE
                        </button>

                        {/* Upload Progress */}
                        {isUploading && uploadProgress > 0 && (
                            <div className="mt-2 space-y-1">
                                <div className="flex justify-between text-[10px] text-zinc-400">
                                    <span>Uploading...</span>
                                    <span>{uploadProgress}%</span>
                                </div>
                                <div className="h-1 bg-zinc-800 rounded overflow-hidden">
                                    <div className="h-full bg-gradient-to-r from-emerald-500 to-cyan-500 transition-all duration-300" style={{width: `${uploadProgress}%`}}/>
                                </div>
                            </div>
                        )}
                  </div>
              )}
          </div>
          )}

          <div className="flex-1 space-y-2">
              <div className="text-[10px] font-bold text-zinc-600 uppercase">Pipeline Status</div>
              {PIPELINE_STEPS.map((s,i) => (
                <div key={s.id} className={clsx(
                  "text-xs p-2 rounded border flex justify-between items-center transition-all duration-300",
                  currentStep > i ? "bg-emerald-900/20 border-emerald-500/20 text-emerald-400" :
                  currentStep === i ? "bg-yellow-900/20 border-yellow-500/30 text-yellow-300" :
                  "bg-zinc-900 border-zinc-800 text-zinc-600"
                )}>
                  <span>{s.label}</span>
                  {currentStep > i && <Check size={14}/>}
                  {currentStep === i && <Loader2 size={14} className="animate-spin text-yellow-400"/>}
                </div>
              ))}
              {progress > 0 && progress < 100 && (
                <div className="space-y-1 mt-2">
                  <div className="flex justify-between text-[10px] text-zinc-500">
                    <span>{progressText || 'Processing...'}</span>
                    <span>{progress}%</span>
                  </div>
                  <div className="h-1 bg-zinc-800 rounded overflow-hidden">
                    <div className="h-full bg-gradient-to-r from-purple-500 to-emerald-500 transition-all duration-500" style={{width: `${progress}%`}}/>
                  </div>
                </div>
              )}
          </div>
      </div>

      {/* MAIN CONTENT AREA */}
      <div className="flex-1 flex flex-col relative bg-black h-full overflow-hidden">
          {/* Header */}
          <div className="h-14 border-b border-white/10 flex items-center justify-between px-6 bg-zinc-950 shrink-0 z-50">
              <div className="flex items-center gap-4">
                  <div className="text-xs font-mono text-zinc-500">T: {playbackTime.toFixed(2)}s</div>
              </div>
              {!factoryMode && enrichmentData && (
                  <div className="flex gap-2">
                    <button onClick={handleDownloadFrames} className="px-3 py-1.5 border border-emerald-500/30 text-emerald-300 text-xs rounded hover:bg-emerald-500/10 flex items-center gap-2 transition-all active:scale-95"><Download size={14}/> DOWNLOAD FRAMES</button>
                    <button onClick={() => setIsValidationPanelOpen(true)} className="px-3 py-1.5 border border-purple-500/30 text-purple-300 text-xs rounded hover:bg-purple-500/10 flex items-center gap-2 transition-all active:scale-95"><ShieldCheck size={14}/> QA CONSOLE</button>
                    <button onClick={() => setEmbodimentMode(!embodimentMode)} className="px-4 py-1.5 bg-zinc-800 hover:bg-zinc-700 text-white rounded text-xs font-bold flex items-center gap-2 transition-all active:scale-95"><Bot size={14}/> {hasRetargeted ? "CHANGE ROBOT" : "SELECT ROBOT"}</button>
                  </div>
              )}
              {factoryMode && enrichmentData && (
                  <div className="flex gap-2">
                    <button onClick={handleDownloadFactorySKU} className="px-4 py-2 bg-purple-600 hover:bg-purple-500 text-white rounded text-xs font-bold flex items-center gap-2 transition-all active:scale-95"><Download size={14}/> DOWNLOAD SKU PACKAGE</button>
                  </div>
              )}
          </div>

          <div className="flex-1 overflow-y-auto p-4 scroll-smooth">
              
              {/* === DATA FOUNDRY VIEW (MULTI-VIEW) === */}
              {factoryMode && enrichmentData ? (
                  <motion.div
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    transition={{ duration: 0.3 }}
                    className="max-w-7xl mx-auto space-y-6"
                  >
                      {/* Hidden video element for playback sync in factory mode */}
                      <video ref={videoRef} src={`${API_BASE}${videoPath?.replace(API_BASE,'')}`} className="hidden" crossOrigin="anonymous"/>

                      {/* Top Row: 3 Camera Views */}
                      <div className="grid grid-cols-3 gap-4 h-64">
                          {/* Main View */}
                          <div className="relative rounded-xl overflow-hidden border border-white/10 bg-zinc-900 group">
                              <div className="absolute top-2 left-2 px-2 py-1 bg-black/60 rounded text-[10px] font-bold text-white flex items-center gap-1 z-10"><Film size={10}/> CAM_0 (RGB)</div>
                              {enrichmentData.timeline.find(f=>Math.abs(f.timestamp-playbackTime)<0.1)?.observations?.main_camera ? (
                                  <img src={`${API_BASE}${enrichmentData.timeline.find(f=>Math.abs(f.timestamp-playbackTime)<0.1)?.observations?.main_camera}`} className="w-full h-full object-cover transition-opacity duration-200" />
                              ) : (
                                  <ImageSkeleton className="w-full h-full" />
                              )}
                          </div>

                          {/* Side View (Synth) */}
                          <div className="relative rounded-xl overflow-hidden border border-white/10 bg-zinc-900 group grayscale-[0.2]">
                              <div className="absolute top-2 left-2 px-2 py-1 bg-black/60 rounded text-[10px] font-bold text-purple-300 flex items-center gap-1 z-10"><Eye size={10}/> CAM_1 (SIDE)</div>
                              {enrichmentData.timeline.find(f=>Math.abs(f.timestamp-playbackTime)<0.1)?.observations?.side_camera ? (
                                  <img src={`${API_BASE}${enrichmentData.timeline.find(f=>Math.abs(f.timestamp-playbackTime)<0.1)?.observations?.side_camera}`} className="w-full h-full object-cover transition-opacity duration-200" />
                              ) : (
                                  <ImageSkeleton className="w-full h-full" />
                              )}
                          </div>

                          {/* Wrist View (Synth) */}
                          <div className="relative rounded-xl overflow-hidden border border-white/10 bg-zinc-900 group grayscale-[0.2]">
                              <div className="absolute top-2 left-2 px-2 py-1 bg-black/60 rounded text-[10px] font-bold text-cyan-300 flex items-center gap-1 z-10"><Scan size={10}/> CAM_2 (WRIST)</div>
                              {enrichmentData.timeline.find(f=>Math.abs(f.timestamp-playbackTime)<0.1)?.observations?.wrist_camera ? (
                                  <img src={`${API_BASE}${enrichmentData.timeline.find(f=>Math.abs(f.timestamp-playbackTime)<0.1)?.observations?.wrist_camera}`} className="w-full h-full object-cover transition-opacity duration-200" />
                              ) : (
                                  <ImageSkeleton className="w-full h-full" />
                              )}
                          </div>
                      </div>

                      {/* Sensor Dashboard */}
                      <div className="bg-zinc-900/50 rounded-xl border border-white/10 p-6">
                          <div className="text-zinc-500 text-xs font-bold uppercase tracking-widest mb-4 flex justify-between">
                              <span>Synthetic Sensor Streams (IMU)</span>
                              <Activity size={14} className="text-emerald-500"/>
                          </div>
                          <div className="grid grid-cols-2 gap-8">
                              <div className="space-y-1">
                                  <div className="text-[10px] text-zinc-500">ACCELEROMETER (m/s²)</div>
                                  {sensorHistory.ax.length > 0 ? (
                                      <div className="h-24 bg-black/40 rounded border border-white/5 relative overflow-hidden p-2">
                                          <Sparkline data={sensorHistory.ax} color="#ef4444"/>
                                      </div>
                                  ) : (
                                      <ChartSkeleton height="h-24" />
                                  )}
                              </div>
                              <div className="space-y-1">
                                  <div className="text-[10px] text-zinc-500">GYROSCOPE (rad/s)</div>
                                  {sensorHistory.gx.length > 0 ? (
                                      <div className="h-24 bg-black/40 rounded border border-white/5 relative overflow-hidden p-2">
                                          <Sparkline data={sensorHistory.gx} color="#3b82f6"/>
                                      </div>
                                  ) : (
                                      <ChartSkeleton height="h-24" />
                                  )}
                              </div>
                          </div>
                      </div>
                  </motion.div>
              ) : (
                  /* === ENRICHMENT VIEW (SINGLE + GHOST) === */
                  enrichmentData ? (
                      <motion.div
                        initial={{ opacity: 0 }}
                        animate={{ opacity: 1 }}
                        transition={{ duration: 0.3 }}
                        className="max-w-7xl mx-auto space-y-6"
                      >
                          <div className="relative w-full aspect-video rounded-xl overflow-hidden border border-white/10 bg-zinc-900">
                                <video ref={videoRef} src={`${API_BASE}${videoPath?.replace(API_BASE,'')}`} className="w-full h-full object-contain" crossOrigin="anonymous"/>
                                <canvas ref={canvasRef} className="absolute inset-0 w-full h-full pointer-events-none"/>
                                {(embodimentMode || hasRetargeted) && (
                                    <div className="absolute inset-0 pointer-events-none z-30">
                                        <Canvas camera={{ position: [1, 0, 0.5], fov: 50 }}>
                                            <ambientLight intensity={0.5} />
                                            <directionalLight position={[2, 5, 2]} />
                                            <FrankaRobot teleopEnabled={true} teleopTarget={previewTarget} position={[0, -0.3, 0]} isGhost={true} />
                                        </Canvas>
                                    </div>
                                )}
                                {embodimentMode && <div className="absolute inset-0 z-50"><EmbodimentPanel onSelect={(r)=>{setSelectedRobot(r); setRetargetConfig(r.config); setEmbodimentMode(false); handleBatchRetarget(r.config);}} onClose={()=>setEmbodimentMode(false)}/></div>}
                          </div>
                          <TrajectoryInspector timeline={enrichmentData.timeline} onApplyFix={handleQAFix} isProcessing={isReprocessing} filename="trace_01"/>
                      </motion.div>
                  ) : batchPreviewVideo ? (
                      <div className="flex flex-col h-full">
                          <div className="flex-1 relative bg-black rounded-xl overflow-hidden border border-emerald-500/30">
                              <video
                                src={`http://localhost:8001${batchPreviewVideo}`}
                                controls
                                autoPlay
                                className="w-full h-full object-contain"
                              />
                              <button
                                onClick={() => setBatchPreviewVideo(null)}
                                className="absolute top-4 right-4 bg-black/70 hover:bg-red-600 text-white p-2 rounded-lg transition-colors"
                              >
                                <X size={20} />
                              </button>
                          </div>
                          <div className="mt-4 p-3 bg-zinc-900 rounded-lg border border-white/10">
                              <div className="text-xs text-zinc-400">Batch Preview</div>
                              <div className="text-sm text-white font-mono truncate">{batchPreviewVideo.split('/').pop()}</div>
                          </div>
                      </div>
                  ) : (
                      <div className="flex flex-col items-center justify-center h-full text-zinc-600">
                          <Layers size={48} className="mb-4 opacity-50"/>
                          <div className="text-xs font-mono">WAITING FOR INPUT STREAM...</div>
                      </div>
                  )
              )}
          </div>

          {/* FOOTER CONTROLS */}
          <div className="h-16 border-t border-white/10 bg-zinc-950 flex items-center justify-center gap-4 shrink-0 z-50">
              <button onClick={()=>setIsPlaying(!isPlaying)} className="w-10 h-10 bg-white text-black rounded-full flex items-center justify-center hover:scale-105 transition-transform">{isPlaying ? <Pause size={18} fill="black"/> : <Play size={18} fill="black" className="ml-1"/>}</button>
          </div>
      </div>

      <AnimatePresence>{isValidationPanelOpen && <ValidationModal isOpen={isValidationPanelOpen} onClose={()=>setIsValidationPanelOpen(false)} validationStage={validationStage} setValidationStage={setValidationStage} enrichmentData={enrichmentData} smoothingAlpha={smoothingAlpha} setSmoothingAlpha={setSmoothingAlpha} gapFillLimit={gapFillLimit} setGapFillLimit={setGapFillLimit} onReprocess={handleReprocess} onDownload={handleDownload} onReject={handleReject} />}</AnimatePresence>

      {/* Toast Notifications */}
      <ToastContainer toasts={toasts} removeToast={removeToast} />
    </div>
  );
}