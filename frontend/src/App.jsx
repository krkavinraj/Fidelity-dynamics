import { useState, useEffect, useRef } from 'react';
import {
  Layers, Zap, ArrowRight, Terminal, Globe, Lock, Sparkles, Database,
  Scan, Search, UploadCloud, Loader2, Youtube, Cpu, Network, BrainCircuit,
  BarChart3, CheckSquare, Square, X, Download, ChevronDown, ChevronUp, Eye, Play, Check
} from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import clsx from 'clsx';

// --- COMPONENT IMPORTS ---
import { EgoEnrichment } from './components/EgoEnrichment';
import { ExoViz } from './components/ExoViz';
import { PolicyLabModule } from './components/PolicyLabModule';

// --- MATRIX TERMINAL LOADER ---
const ProcessingTerminal = ({ message }) => {
    const [lines, setLines] = useState([">_ INITIALIZING PIPELINE..."]);
    useEffect(() => {
        const steps = [
            ">> ALLOCATING GPU MEMORY [CUDA:0]",
            ">> LOADING YOLOv8-POSE WEIGHTS",
            ">> ESTABLISHING TEMPORAL CONTEXT",
            ">> TRIANGULATING 3D KEYPOINTS",
            ">> OPTIMIZING TRAJECTORY SMOOTHING",
            ">> GENERATING INTERACTION GRAPH",
            ">> FINALIZING JSON MANIFEST...",
            ">> DATA_READY"
        ];
        let i = 0;
        const interval = setInterval(() => {
            if (i < steps.length) {
                setLines(prev => [...prev.slice(-5), steps[i]]); 
                i++;
            }
        }, 600);
        return () => clearInterval(interval);
    }, []);

    return (
        <div className="w-full max-w-lg bg-black border border-cyan-500/30 rounded-xl p-6 font-mono text-xs shadow-[0_0_30px_rgba(6,182,212,0.15)] relative overflow-hidden">
            <div className="absolute top-0 left-0 w-full h-1 bg-gradient-to-r from-transparent via-cyan-500 to-transparent animate-pulse"/>
            <div className="flex items-center gap-3 mb-6 border-b border-white/10 pb-2">
                <Loader2 className="animate-spin text-cyan-400" size={16}/>
                <span className="text-cyan-400 font-bold tracking-widest">{message}</span>
            </div>
            <div className="space-y-2 h-40 flex flex-col justify-end">
                {lines.map((line, idx) => (
                    <div key={idx} className="text-zinc-400 animate-in fade-in slide-in-from-bottom-2 duration-300">
                        <span className="text-cyan-600 mr-2">root@fidelity:~$</span>
                        <span className={idx === lines.length - 1 ? "text-white font-bold typing-cursor" : ""}>{line}</span>
                    </div>
                ))}
            </div>
        </div>
    );
};

// --- INTERNAL MODULE: EXOCENTRIC INGESTION & PROCESSOR ---
const ExocentricModule = ({ onBack, initialUrl, autoStart, batchJobId }) => {
  const [step, setStep] = useState('input');
  const [inputType, setInputType] = useState('url');
  const [url, setUrl] = useState(initialUrl || "");
  const [loading, setLoading] = useState(false);
  const [loadingMsg, setLoadingMsg] = useState("");

  const [exoData, setExoData] = useState(null);
  const [videoSrc, setVideoSrc] = useState(null);
  const fileInputRef = useRef(null);
  const processingRef = useRef(false);

  useEffect(() => {
    if (autoStart && initialUrl && !processingRef.current) {
        processingRef.current = true;
        handleUrlIngest();
    }
  }, []);

  const handleUrlIngest = async () => {
      if (!url) return;
      setLoading(true);
      setLoadingMsg("DOWNLOADING STREAM");
      try {
          const ingRes = await fetch('http://localhost:8001/enrich/ingest', {
              method: 'POST', headers: {'Content-Type': 'application/json'},
              body: JSON.stringify({ type: 'youtube', url: url })
          }).then(r=>r.json());
          if (ingRes.status === 'ok') {
              setVideoSrc(`http://localhost:8001${ingRes.path}`); 
              await processVideo(ingRes.path);
          } else { alert("Ingest Failed"); setLoading(false); processingRef.current = false; }
      } catch (e) { alert("Error"); setLoading(false); processingRef.current = false; }
  };

  const handleFileUpload = async (e) => {
    const file = e.target.files[0];
    if (!file) return;
    setLoading(true);
    setLoadingMsg("UPLOADING BITSTREAM");
    const formData = new FormData(); formData.append("file", file);
    try {
      const upRes = await fetch('http://localhost:8001/enrich/upload', { method: 'POST', body: formData }).then(r=>r.json());
      if(upRes.status === 'ok') await processVideo(upRes.path);
    } catch (e) { setLoading(false); }
  };

  const processVideo = async (serverPath) => {
      setStep('processing');
      setLoadingMsg("RUNNING INFERENCE");
      try {
          const procRes = await fetch('http://localhost:8001/exo/process', {
              method: 'POST', headers: {'Content-Type': 'application/json'},
              body: JSON.stringify({ video_path: serverPath })
          }).then(r=>r.json());
          if (procRes.status !== 'error') { setExoData(procRes); setStep('viz'); } 
          else { setStep('input'); }
      } catch(e) { setStep('input'); } finally { setLoading(false); processingRef.current = false; }
  };

  if (step === 'viz') return <ExoViz data={exoData} videoSrc={videoSrc} onBack={onBack} />;

  return (
    <div className="h-screen w-full bg-zinc-950 flex flex-col items-center justify-center relative overflow-hidden font-sans">
      <div className="absolute inset-0 bg-[linear-gradient(rgba(6,182,212,0.03)_1px,transparent_1px),linear-gradient(90deg,rgba(6,182,212,0.03)_1px,transparent_1px)] bg-[size:40px_40px] pointer-events-none"/>
      {loading ? <ProcessingTerminal message={loadingMsg} /> : (
          <div className="z-10 w-full max-w-2xl p-8 bg-zinc-900/90 backdrop-blur-xl border border-white/10 rounded-2xl shadow-2xl relative space-y-6">
            <button onClick={onBack} className="absolute top-4 left-4 text-zinc-500 hover:text-white transition-colors"><ArrowRight className="rotate-180" size={18}/></button>

            {/* Batch Progress Panel */}
            {batchJobId && (
              <div className="pt-8">
                <BatchProgressPanel jobId={batchJobId} />
              </div>
            )}

            <div className="text-center">
              <div className="w-16 h-16 bg-cyan-500/10 rounded-full flex items-center justify-center mx-auto mb-4 border border-cyan-500/20 shadow-[0_0_20px_rgba(6,182,212,0.2)]"><Scan className="text-cyan-400" size={32}/></div>
              <h2 className="text-2xl font-bold text-white mb-2 tracking-tight">Spatial Semantics</h2>
              <p className="text-zinc-400 text-sm">Extract 3D humanoid priors and interaction graphs from third-person footage.</p>
            </div>
            <div className="flex bg-black/40 p-1 rounded-lg mb-6 border border-white/5">
                <button onClick={()=>setInputType('url')} className={clsx("flex-1 py-2 text-xs font-bold rounded-md transition-all flex items-center justify-center gap-2", inputType==='url' ? "bg-zinc-800 text-white shadow" : "text-zinc-500 hover:text-zinc-300")}><Youtube size={14}/> YOUTUBE URL</button>
                <button onClick={()=>setInputType('upload')} className={clsx("flex-1 py-2 text-xs font-bold rounded-md transition-all flex items-center justify-center gap-2", inputType==='upload' ? "bg-zinc-800 text-white shadow" : "text-zinc-500 hover:text-zinc-300")}><UploadCloud size={14}/> FILE UPLOAD</button>
            </div>
            <div className="space-y-4">
                {inputType === 'url' ? (
                    <div className="space-y-4"><input className="w-full bg-black/50 border border-zinc-700 rounded-xl px-4 py-3 text-sm text-white focus:border-cyan-500 outline-none transition-all placeholder:text-zinc-600 font-mono" placeholder="https://youtube.com/..." value={url} onChange={(e) => setUrl(e.target.value)} /><button onClick={handleUrlIngest} className="w-full py-3.5 bg-cyan-600 hover:bg-cyan-500 text-white font-bold rounded-xl transition-all shadow-lg shadow-cyan-900/20 text-xs tracking-wider">INITIALIZE EXTRACTION</button></div>
                ) : (
                    <div className="space-y-4"><input type="file" ref={fileInputRef} onChange={handleFileUpload} className="hidden" accept=".mp4,.mov" /><div onClick={() => fileInputRef.current.click()} className="w-full h-32 border-2 border-dashed border-zinc-700 hover:border-cyan-500/50 hover:bg-cyan-500/5 rounded-xl flex flex-col items-center justify-center cursor-pointer transition-all group"><UploadCloud className="text-zinc-600 group-hover:text-cyan-400 mb-2 transition-colors" size={32}/><span className="text-xs text-zinc-500 font-bold group-hover:text-zinc-300">CLICK TO UPLOAD MP4</span></div></div>
                )}
            </div>
          </div>
      )}
    </div>
  );
};

// --- INTERNAL MODULE: SMART SEARCH ---
const SearchModule = ({ onBack, onLaunchEnrichment, onLaunchBatch }) => {
  const [query, setQuery] = useState("");
  const [loading, setLoading] = useState(false);
  const [results, setResults] = useState(null);
  const [filters, setFilters] = useState({ sortBy: 'relevance', uploadDate: null, duration: 'any', type: 'video' });
  const [durationRange, setDurationRange] = useState([0, 60]); // min and max in minutes
  const [selectedVideos, setSelectedVideos] = useState(new Map()); // Changed to Map to store video metadata
  const [showBatchModal, setShowBatchModal] = useState(false);
  const searchTimeoutRef = useRef(null);

  // Cleanup timeout on unmount
  useEffect(() => {
    return () => {
      if (searchTimeoutRef.current) {
        clearTimeout(searchTimeoutRef.current);
      }
    };
  }, []);

  const handleSearch = async (filterOverrides = {}) => {
    if (!query) return;
    setLoading(true);
    try {
      const mergedFilters = { ...filters, ...filterOverrides };
      const res = await fetch('http://localhost:8001/search/youtube', {
        method: 'POST', headers: {'Content-Type': 'application/json'},
        body: JSON.stringify({ query, page: 1, filters: mergedFilters })
      }).then(r=>r.json());
      setResults(res);
      setSelectedVideos(new Map()); // Clear selection on new search
    } catch(e) { alert("Search Error: " + e.message); } finally { setLoading(false); }
  };

  const handleFilterChange = (key, value) => {
    const newFilters = { ...filters, [key]: value };

    // Convert uploadDate to publishedAfter ISO timestamp
    if (key === 'uploadDate') {
      const now = new Date();
      const timestamps = {
        today: new Date(now.setHours(0, 0, 0, 0)),
        thisWeek: new Date(now.setDate(now.getDate() - 7)),
        thisMonth: new Date(now.setMonth(now.getMonth() - 1)),
        thisYear: new Date(now.setFullYear(now.getFullYear() - 1))
      };
      newFilters.publishedAfter = timestamps[value]?.toISOString();
    }

    setFilters(newFilters);
    handleSearch(newFilters);
  };

  // Convert slider duration range to YouTube API filter
  const getDurationFilter = (minMinutes, maxMinutes) => {
    // YouTube API accepts ONLY ONE value: short (<4min), medium (4-20min), long (>20min), any

    // If full range, show all
    if (minMinutes === 0 && maxMinutes >= 60) {
      return 'any';
    }

    // Determine which category the range primarily falls into
    const midpoint = (minMinutes + maxMinutes) / 2;

    if (maxMinutes <= 4) {
      return 'short'; // Entirely in short range
    } else if (minMinutes >= 20) {
      return 'long'; // Entirely in long range
    } else if (minMinutes >= 4 && maxMinutes <= 20) {
      return 'medium'; // Entirely in medium range
    } else if (midpoint < 4) {
      return 'short'; // Primarily short
    } else if (midpoint > 20) {
      return 'long'; // Primarily long
    } else {
      return 'medium'; // Primarily medium
    }
  };

  const handleDurationChange = (newRange) => {
    setDurationRange(newRange);
    // Filter happens client-side instantly - no search needed
  };

  // Filter results client-side based on duration
  const getFilteredResults = () => {
    if (!results?.results) return [];

    return results.results.filter(video => {
      const length = video.length || "0:00";
      const parts = length.split(':').reverse();
      const seconds = parseInt(parts[0]) || 0;
      const minutes = parseInt(parts[1]) || 0;
      const hours = parseInt(parts[2]) || 0;
      const totalMinutes = hours * 60 + minutes + seconds / 60;

      return totalMinutes >= durationRange[0] && totalMinutes <= durationRange[1];
    });
  };

  const toggleVideoSelection = (video) => {
    const newSelection = new Map(selectedVideos);
    if (newSelection.has(video.url)) {
      newSelection.delete(video.url);
    } else {
      // Store video metadata including duration
      newSelection.set(video.url, {
        url: video.url,
        title: video.title,
        length: video.length, // e.g., "5:30"
        thumbnail: video.thumbnail
      });
    }
    setSelectedVideos(newSelection);
  };

  const selectAll = () => {
    const newSelection = new Map();
    // Only select videos that pass the current filter
    getFilteredResults().forEach(video => {
      newSelection.set(video.url, {
        url: video.url,
        title: video.title,
        length: video.length,
        thumbnail: video.thumbnail
      });
    });
    setSelectedVideos(newSelection);
  };

  const deselectAll = () => {
    setSelectedVideos(new Map());
  };

  // Calculate total duration of selected videos
  const getTotalDuration = () => {
    let totalSeconds = 0;
    selectedVideos.forEach(video => {
      const length = video.length || "0:00";
      const parts = length.split(':').reverse(); // [seconds, minutes, hours]
      const seconds = parseInt(parts[0]) || 0;
      const minutes = parseInt(parts[1]) || 0;
      const hours = parseInt(parts[2]) || 0;
      totalSeconds += seconds + (minutes * 60) + (hours * 3600);
    });

    // Format as hours:minutes:seconds
    const hours = Math.floor(totalSeconds / 3600);
    const minutes = Math.floor((totalSeconds % 3600) / 60);
    const seconds = totalSeconds % 60;

    if (hours > 0) {
      return `${hours}h ${minutes}m ${seconds}s`;
    } else if (minutes > 0) {
      return `${minutes}m ${seconds}s`;
    } else {
      return `${seconds}s`;
    }
  };

  return (
    <div className="min-h-screen w-full bg-[#050505] flex flex-col font-sans">
      <div className="h-20 border-b border-white/10 flex items-center px-8 bg-zinc-950 gap-4 sticky top-0 z-50">
        <button onClick={onBack} className="p-2 hover:bg-zinc-900 rounded text-zinc-400 hover:text-white transition-colors"><ArrowRight className="rotate-180"/></button>
        <div className="flex-1 max-w-2xl relative">
          <input className="w-full bg-zinc-900 border border-zinc-800 rounded-lg py-3 pl-10 pr-4 text-sm text-white focus:border-emerald-500 outline-none transition-all font-mono" placeholder="Describe a task (e.g., 'fixing a bicycle chain POV')..." value={query} onChange={e=>setQuery(e.target.value)} onKeyDown={e=>e.key==='Enter' && handleSearch()} />
          <Search className="absolute left-3 top-3.5 text-zinc-500" size={16}/>
        </div>
        <button onClick={()=>handleSearch()} disabled={loading} className="bg-emerald-600 hover:bg-emerald-500 text-white px-6 py-2.5 rounded-lg text-xs font-bold tracking-wide transition-all shadow-lg shadow-emerald-900/20">{loading ? "SEARCHING..." : "DEPLOY AGENT"}</button>
      </div>
      <div className="flex-1 p-8">
        {/* FILTER BAR - Duration Slider */}
        {results && (
          <div className="max-w-7xl mx-auto mb-6 bg-gradient-to-br from-zinc-900/80 to-zinc-900/50 border border-emerald-500/20 rounded-2xl p-6 shadow-xl shadow-emerald-900/5">
            <div className="flex items-center justify-between mb-5">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 bg-emerald-500/10 rounded-lg flex items-center justify-center border border-emerald-500/20">
                  <Database size={20} className="text-emerald-400" />
                </div>
                <div>
                  <div className="text-xs text-zinc-400 font-bold uppercase tracking-wider">Duration Filter</div>
                  <div className="text-[10px] text-zinc-600 mt-0.5">Drag to filter videos instantly</div>
                </div>
              </div>
              <div className="flex items-center gap-4">
                <div className="text-sm text-emerald-400 font-mono font-bold px-3 py-1.5 bg-emerald-500/10 rounded-lg border border-emerald-500/20">
                  {durationRange[0]}m - {durationRange[1] >= 60 ? '60+m' : `${durationRange[1]}m`}
                </div>
                {(durationRange[0] !== 0 || durationRange[1] !== 60) && (
                  <button
                    onClick={() => setDurationRange([0, 60])}
                    className="text-xs text-zinc-500 hover:text-emerald-400 transition-colors px-3 py-1.5 rounded-lg hover:bg-zinc-800"
                  >
                    Reset
                  </button>
                )}
              </div>
            </div>

            {/* Dual Range Slider */}
            <div className="relative pt-3 pb-3">
              {/* Track background */}
              <div className="absolute w-full h-3 bg-zinc-800 rounded-full top-3 shadow-inner" />

              {/* Active range highlight */}
              <div
                className="absolute h-3 bg-gradient-to-r from-emerald-500 via-emerald-400 to-cyan-500 rounded-full top-3 transition-all duration-200 shadow-lg shadow-emerald-500/30"
                style={{
                  left: `${(durationRange[0] / 60) * 100}%`,
                  width: `${((durationRange[1] - durationRange[0]) / 60) * 100}%`
                }}
              />

              {/* Min slider */}
              <input
                type="range"
                min="0"
                max="60"
                step="1"
                value={durationRange[0]}
                onChange={(e) => {
                  const newMin = parseInt(e.target.value);
                  if (newMin < durationRange[1]) {
                    handleDurationChange([newMin, durationRange[1]]);
                  }
                }}
                className="range-slider range-slider-min absolute w-full top-0 h-6"
              />

              {/* Max slider */}
              <input
                type="range"
                min="0"
                max="60"
                step="1"
                value={durationRange[1]}
                onChange={(e) => {
                  const newMax = parseInt(e.target.value);
                  if (newMax > durationRange[0]) {
                    handleDurationChange([durationRange[0], newMax]);
                  }
                }}
                className="range-slider range-slider-max absolute w-full top-0 h-6"
              />
            </div>

            {/* Duration markers */}
            <div className="flex justify-between mt-4 text-[10px] text-zinc-500 font-mono">
              <span className="bg-zinc-800 px-2 py-0.5 rounded">0m</span>
              <span>15m</span>
              <span>30m</span>
              <span>45m</span>
              <span className="bg-zinc-800 px-2 py-0.5 rounded">60m+</span>
            </div>

            {/* Quick presets */}
            <div className="flex gap-2 mt-5">
              <button
                onClick={() => handleDurationChange([0, 4])}
                className="flex-1 px-4 py-2 text-[10px] font-bold bg-zinc-800/50 hover:bg-emerald-500/20 border border-zinc-700 hover:border-emerald-500/40 text-zinc-400 hover:text-emerald-400 rounded-lg transition-all"
              >
                Short <span className="text-zinc-600">&lt;4m</span>
              </button>
              <button
                onClick={() => handleDurationChange([4, 20])}
                className="flex-1 px-4 py-2 text-[10px] font-bold bg-zinc-800/50 hover:bg-emerald-500/20 border border-zinc-700 hover:border-emerald-500/40 text-zinc-400 hover:text-emerald-400 rounded-lg transition-all"
              >
                Medium <span className="text-zinc-600">4-20m</span>
              </button>
              <button
                onClick={() => handleDurationChange([20, 60])}
                className="flex-1 px-4 py-2 text-[10px] font-bold bg-zinc-800/50 hover:bg-emerald-500/20 border border-zinc-700 hover:border-emerald-500/40 text-zinc-400 hover:text-emerald-400 rounded-lg transition-all"
              >
                Long <span className="text-zinc-600">20m+</span>
              </button>
            </div>
          </div>
        )}

        {/* SELECTION CONTROLS */}
        {results?.results && (
          <div className="max-w-7xl mx-auto mb-6 flex gap-3 items-center flex-wrap">
            <div className="text-xs text-zinc-400 px-3 py-2 bg-zinc-900/50 rounded-lg border border-zinc-800">
              Showing <span className="text-emerald-400 font-bold">{getFilteredResults().length}</span> of {results.results.length} videos
            </div>
            <button onClick={selectAll} className="text-xs px-4 py-2 bg-zinc-800 hover:bg-zinc-700 text-zinc-300 rounded-lg transition-all"><CheckSquare size={12} className="inline mr-1"/> Select All ({getFilteredResults().length})</button>
            <button onClick={deselectAll} className="text-xs px-4 py-2 bg-zinc-800 hover:bg-zinc-700 text-zinc-300 rounded-lg transition-all"><Square size={12} className="inline mr-1"/> Deselect All</button>
            {selectedVideos.size > 0 && (
              <button onClick={() => setShowBatchModal(true)} className="px-6 py-2.5 bg-emerald-600 hover:bg-emerald-500 text-white font-bold rounded-lg shadow-lg transition-all ml-auto">
                <div className="flex items-center gap-2">
                  <Database size={16}/>
                  <div className="text-left">
                    <div className="text-xs leading-none">MASS INGESTION</div>
                    <div className="text-[10px] text-emerald-200 mt-0.5 leading-none">{selectedVideos.size} videos · {getTotalDuration()}</div>
                  </div>
                </div>
              </button>
            )}
          </div>
        )}

        {results?.overall_summary && (
          <div className="max-w-5xl mx-auto mb-8 bg-emerald-900/10 border border-emerald-500/20 p-4 rounded-xl flex gap-4 animate-in fade-in slide-in-from-bottom-2">
            <Sparkles className="text-emerald-400 shrink-0" size={20}/>
            <div className="text-sm text-emerald-100 leading-relaxed opacity-80">{results.overall_summary}</div>
          </div>
        )}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6 max-w-7xl mx-auto">
          {getFilteredResults().map((vid, i) => (
            <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: i*0.05 }} key={i} className={`bg-zinc-900/50 border hover:border-white/20 rounded-xl overflow-hidden group flex flex-col relative ${selectedVideos.has(vid.url) ? 'border-emerald-500 ring-2 ring-emerald-500/50' : 'border-white/5'}`}>
              {/* Checkbox overlay */}
              <div className="absolute top-2 left-2 z-10" onClick={(e) => { e.stopPropagation(); toggleVideoSelection(vid); }}>
                {selectedVideos.has(vid.url) ? <CheckSquare className="text-emerald-400 cursor-pointer" size={24}/> : <Square className="text-white/50 hover:text-white cursor-pointer" size={24}/>}
              </div>
              <div className="relative aspect-video bg-black">
                <img src={vid.thumbnail} className="w-full h-full object-cover opacity-80 group-hover:opacity-100 transition-opacity"/>
                <div className="absolute top-2 right-2 bg-black/80 text-white text-[10px] font-bold px-1.5 py-0.5 rounded">{vid.length}</div>
                {vid.score > 70 && <div className="absolute bottom-2 right-2 bg-emerald-500 text-white text-[10px] font-bold px-2 py-0.5 rounded shadow-lg">HIGH QUALITY</div>}
              </div>
              <div className="p-4 flex-1 flex flex-col">
                <h3 className="font-bold text-sm text-zinc-200 line-clamp-2 mb-2 group-hover:text-emerald-400 transition-colors">{vid.title}</h3>
                <div className="text-xs text-zinc-500 mb-4">{vid.channel} • {vid.published}</div>
                <div className="mt-auto grid grid-cols-2 gap-2">
                  <button onClick={()=>onLaunchEnrichment(vid.url, 'extractor')} className="py-2 bg-zinc-800 hover:bg-zinc-700 rounded text-[10px] font-bold text-zinc-300 transition-colors">EXTRACT KINEMATICS</button>
                  <button onClick={()=>onLaunchEnrichment(vid.url, 'exocentric')} className="py-2 bg-cyan-900/30 hover:bg-cyan-900/50 border border-cyan-500/20 rounded text-[10px] font-bold text-cyan-300 transition-colors flex items-center justify-center gap-1"><Scan size={10}/> SPATIAL SCAN</button>
                </div>
              </div>
            </motion.div>
          ))}
        </div>

        {/* BATCH MODAL */}
        {showBatchModal && <BatchModal selectedVideos={selectedVideos} onClose={() => setShowBatchModal(false)} onStart={(module, videos) => {
          onLaunchBatch(module, Array.from(videos.keys()));
          setShowBatchModal(false);
          setSelectedVideos(new Map()); // Clear selections after starting batch
        }} />}
      </div>
    </div>
  );
};

// --- VIDEO PREVIEW MODAL WITH NAVIGATION ---
const VideoPreviewModal = ({ videos, currentIndex, onClose, onNavigate }) => {
  const videoRef = useRef(null);
  const currentVideo = videos[currentIndex];

  useEffect(() => {
    // Auto-play when video changes
    if (videoRef.current) {
      videoRef.current.load();
      videoRef.current.play().catch(e => console.log("Autoplay prevented:", e));
    }
  }, [currentIndex]);

  useEffect(() => {
    const handleKeyDown = (e) => {
      if (e.key === 'Escape') onClose();
      if (e.key === 'ArrowLeft' && currentIndex > 0) onNavigate(currentIndex - 1);
      if (e.key === 'ArrowRight' && currentIndex < videos.length - 1) onNavigate(currentIndex + 1);
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [currentIndex, videos.length, onClose, onNavigate]);

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      className="fixed inset-0 bg-black/95 flex items-center justify-center z-[200] p-4"
      onClick={onClose}
    >
      <motion.div
        initial={{ scale: 0.9 }}
        animate={{ scale: 1 }}
        exit={{ scale: 0.9 }}
        className="relative w-full max-w-5xl"
        onClick={e => e.stopPropagation()}
      >
        {/* Close */}
        <button onClick={onClose} className="absolute -top-12 right-0 text-white hover:text-emerald-400 flex items-center gap-2">
          <span className="text-sm">ESC</span>
          <X size={28} />
        </button>

        {/* Left Arrow */}
        {currentIndex > 0 && (
          <button
            onClick={() => onNavigate(currentIndex - 1)}
            className="absolute left-0 top-1/2 -translate-y-1/2 -translate-x-16 bg-zinc-900/90 hover:bg-emerald-600 p-4 rounded-full transition-all"
          >
            <ArrowRight size={24} className="rotate-180" />
          </button>
        )}

        {/* Right Arrow */}
        {currentIndex < videos.length - 1 && (
          <button
            onClick={() => onNavigate(currentIndex + 1)}
            className="absolute right-0 top-1/2 -translate-y-1/2 translate-x-16 bg-zinc-900/90 hover:bg-emerald-600 p-4 rounded-full transition-all"
          >
            <ArrowRight size={24} />
          </button>
        )}

        {/* Video Player */}
        <div className="bg-black rounded-xl overflow-hidden border-2 border-emerald-500/30">
          <video
            ref={videoRef}
            src={`http://localhost:8001${currentVideo.downloadUrl}`}
            controls
            autoPlay
            className="w-full h-auto max-h-[80vh]"
          />
        </div>

        {/* Info */}
        <div className="mt-4 flex items-center justify-between bg-zinc-900/90 border border-white/10 rounded-lg p-3">
          <div className="flex-1">
            <p className="text-xs text-zinc-400">Video {currentIndex + 1} of {videos.length}</p>
            <p className="text-sm text-white font-mono">{currentVideo.downloadUrl.split('/').pop()}</p>
          </div>
          <a href={`http://localhost:8001${currentVideo.downloadUrl}`} download className="px-4 py-2 bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-bold rounded transition-all">
            <Download size={14} className="inline mr-1" /> Download
          </a>
        </div>
      </motion.div>
    </motion.div>
  );
};

// --- BATCH PROGRESS PANEL COMPONENT (for embedding in modules) ---
export const BatchProgressPanel = ({ jobId, onVideoComplete, onVideoSelect }) => {
  const [jobStatus, setJobStatus] = useState(null);
  const [collapsed, setCollapsed] = useState(false);
  const [previewIndex, setPreviewIndex] = useState(null);

  useEffect(() => {
    if (!jobId) return;

    const fetchStatus = async () => {
      try {
        const res = await fetch(`http://localhost:8001/enrich/batch/${jobId}/status`).then(r => r.json());
        setJobStatus(res);

        // Notify parent when a video completes
        if (onVideoComplete && res.videos) {
          res.videos.forEach(vid => {
            if (vid.status === 'complete' && !vid.notified) {
              onVideoComplete(vid);
              vid.notified = true;
            }
          });
        }

        if (res.status === 'complete' || res.status === 'failed') {
          return true; // Stop polling
        }
      } catch (e) {
        console.error("Failed to fetch batch status:", e);
      }
      return false;
    };

    fetchStatus();
    const interval = setInterval(async () => {
      const done = await fetchStatus();
      if (done) clearInterval(interval);
    }, 2000);

    return () => clearInterval(interval);
  }, [jobId, onVideoComplete]);

  if (!jobId || !jobStatus) return null;

  const { total, completed, failed, videos, status, batchDownloadUrl, totalDuration } = jobStatus;
  const progress = total > 0 ? (completed / total) * 100 : 0;

  // Format total duration
  const formatDuration = (seconds) => {
    if (!seconds) return "0s";
    const hours = Math.floor(seconds / 3600);
    const minutes = Math.floor((seconds % 3600) / 60);
    const secs = seconds % 60;

    if (hours > 0) {
      return `${hours}h ${minutes}m ${secs}s`;
    } else if (minutes > 0) {
      return `${minutes}m ${secs}s`;
    } else {
      return `${secs}s`;
    }
  };

  return (
    <div className="w-full bg-zinc-900/80 border border-cyan-500/30 rounded-lg overflow-hidden backdrop-blur-sm">
      <div
        className="flex justify-between items-center p-3 bg-zinc-800/50 cursor-pointer hover:bg-zinc-800/70 transition-all"
        onClick={() => setCollapsed(!collapsed)}
      >
        <div className="flex-1 min-w-0">
          <h3 className="text-xs font-bold text-white flex items-center gap-1.5">
            {status === 'complete' ? '✓' : <Loader2 className="animate-spin" size={12}/>}
            Batch ({completed}/{total})
          </h3>
          {totalDuration > 0 && (
            <p className="text-[9px] text-emerald-400 mt-0.5 font-mono">
              {formatDuration(totalDuration)}
            </p>
          )}
        </div>
        <div className="flex items-center gap-1.5">
          <span className="text-[10px] text-zinc-400">{Math.round(progress)}%</span>
          {collapsed ? <ChevronDown size={14} className="text-zinc-400"/> : <ChevronUp size={14} className="text-zinc-400"/>}
        </div>
      </div>

      {!collapsed && (
        <div className="p-3 space-y-3">
          {/* Overall progress bar */}
          <div className="space-y-1">
            <div className="flex justify-between text-[10px] text-zinc-400">
              <span>{completed} done</span>
              {failed > 0 && <span className="text-red-400">{failed} failed</span>}
            </div>
            <div className="h-1.5 bg-zinc-800 rounded-full overflow-hidden">
              <div
                className="h-full bg-gradient-to-r from-emerald-500 to-cyan-500 transition-all duration-500"
                style={{ width: `${progress}%` }}
              />
            </div>
          </div>

          {/* Video list */}
          <div className="space-y-1.5 max-h-48 overflow-y-auto">
            {videos?.map((vid, i) => (
              <div
                key={i}
                className={`flex items-center gap-2 text-xs p-1.5 rounded transition-all cursor-pointer group ${
                  vid.status === 'complete' ? 'bg-emerald-900/20 border border-emerald-500/30 hover:bg-emerald-900/30' :
                  vid.status === 'failed' ? 'bg-red-900/20 border border-red-500/30' :
                  vid.status === 'processing' ? 'bg-cyan-900/20 border border-cyan-500/30 animate-pulse' :
                  'bg-zinc-800/50 border border-zinc-700'
                }`}
                onClick={() => {
                  if (vid.status === 'complete' && vid.downloadUrl) {
                    if (onVideoSelect) {
                      onVideoSelect(vid.downloadUrl);
                    } else {
                      setPreviewIndex(i);
                    }
                  }
                }}
              >
                {/* Compact status icon */}
                <div className="w-8 h-8 flex-shrink-0 bg-black rounded flex items-center justify-center border border-white/10">
                  {vid.status === 'complete' && <Check size={14} className="text-emerald-400"/>}
                  {vid.status === 'processing' && <Loader2 className="animate-spin text-cyan-400" size={12}/>}
                  {vid.status === 'pending' && <span className="text-zinc-600 text-xs">○</span>}
                  {vid.status === 'failed' && <X size={14} className="text-red-400"/>}
                </div>

                {/* Video info */}
                <div className="flex-1 min-w-0">
                  <div className="text-zinc-300 font-mono text-[10px] font-semibold truncate">
                    Video {i + 1}
                  </div>
                  {vid.status === 'complete' && (
                    <div className="text-emerald-400 text-[8px]">
                      Ready
                    </div>
                  )}
                  {vid.status === 'failed' && (
                    <div className="text-red-400 text-[8px] truncate">
                      Failed
                    </div>
                  )}
                </div>

                {/* Download button */}
                {vid.status === 'complete' && vid.downloadUrl && (
                  <a
                    href={`http://localhost:8001${vid.downloadUrl}`}
                    download
                    onClick={(e) => e.stopPropagation()}
                    className="text-cyan-400 hover:text-cyan-300 p-1 rounded hover:bg-cyan-900/30 transition-all opacity-0 group-hover:opacity-100"
                    title="Download"
                  >
                    <Download size={12}/>
                  </a>
                )}
              </div>
            ))}
          </div>

          {/* Batch download button */}
          {status === 'complete' && (
            <div className="pt-2 border-t border-zinc-700">
              <div className="text-[8px] text-zinc-500 mb-1 text-center">
                Each ZIP: Enriched Frames + Timeline JSON + Metadata
              </div>
              <a
                href={`http://localhost:8001/enrich/batch/${jobId}/download`}
                download={`batch_${jobId}.zip`}
                className="flex items-center justify-center gap-1.5 w-full py-2 bg-emerald-600 hover:bg-emerald-500 text-white text-[10px] font-bold rounded transition-all"
              >
                <Download size={12}/> Download All ({completed} Enriched Datasets)
              </a>
            </div>
          )}
        </div>
      )}

      {/* Video Preview Modal */}
      <AnimatePresence>
        {previewIndex !== null && videos && (
          <VideoPreviewModal
            videos={videos.filter(v => v.status === 'complete' && v.downloadUrl)}
            currentIndex={videos.filter(v => v.status === 'complete' && v.downloadUrl).findIndex((_, idx) => videos.indexOf(videos.filter(v => v.status === 'complete' && v.downloadUrl)[idx]) === previewIndex)}
            onClose={() => setPreviewIndex(null)}
            onNavigate={(newIdx) => {
              const completeVideos = videos.map((v, i) => ({ ...v, originalIndex: i })).filter(v => v.status === 'complete' && v.downloadUrl);
              setPreviewIndex(completeVideos[newIdx]?.originalIndex ?? previewIndex);
            }}
          />
        )}
      </AnimatePresence>
    </div>
  );
};

// --- BATCH MODAL COMPONENT ---
const BatchModal = ({ selectedVideos, onClose, onStart }) => {
  const videosArray = Array.from(selectedVideos.values());

  return (
    <div className="fixed inset-0 bg-black/90 flex items-center justify-center z-50 p-4 backdrop-blur-sm" onClick={onClose}>
      <div className="bg-zinc-900 border border-cyan-500/30 rounded-2xl p-8 max-w-6xl w-full max-h-[90vh] overflow-y-auto" onClick={e => e.stopPropagation()}>
        <div className="flex justify-between items-center mb-6">
          <div>
            <h2 className="text-2xl font-bold text-white mb-2">Mass Ingestion & Enrichment</h2>
            <p className="text-sm text-zinc-400">Selected: <span className="text-emerald-400 font-bold">{selectedVideos.size} videos</span> · Each will be processed & exported as enriched data</p>
            <p className="text-xs text-zinc-500 mt-1">💾 Download: Frames + JSON Timeline + Annotations (ZIP format)</p>
          </div>
          <button onClick={onClose} className="text-zinc-400 hover:text-white"><X size={24}/></button>
        </div>

        {/* Show selected video thumbnails */}
        <div className="mb-6 bg-zinc-800/50 rounded-xl p-4 border border-white/5">
          <h3 className="text-xs font-bold text-zinc-400 uppercase tracking-wider mb-3">Selected Videos</h3>
          <div className="grid grid-cols-4 md:grid-cols-6 lg:grid-cols-8 gap-2 max-h-32 overflow-y-auto">
            {videosArray.map((video, i) => (
              <div key={i} className="relative group">
                <img
                  src={video.thumbnail}
                  alt={video.title}
                  className="w-full aspect-video object-cover rounded border border-emerald-500/50 shadow-lg shadow-emerald-500/10"
                />
                <div className="absolute inset-0 bg-black/60 opacity-0 group-hover:opacity-100 transition-opacity rounded flex items-center justify-center">
                  <span className="text-[8px] text-white font-mono">{video.length}</span>
                </div>
              </div>
            ))}
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          {/* Card 1: Egocentric Grounding Engine */}
          <div
            onClick={() => onStart('extractor', selectedVideos)}
            className="group relative bg-zinc-900/40 border border-white/10 hover:border-blue-500/50 rounded-xl p-6 cursor-pointer transition-all hover:scale-[1.02] hover:shadow-2xl hover:shadow-blue-500/20"
          >
            <div className="p-3 bg-zinc-800/50 w-fit rounded-lg border border-white/10 mb-4 group-hover:bg-blue-900/30 group-hover:border-blue-500/30 transition-all">
              <Cpu className="text-blue-300" size={28} />
            </div>
            <h3 className="text-base font-bold text-white mb-2 flex items-center gap-2">
              Egocentric Grounding
              <ArrowRight className="w-4 h-4 opacity-0 -translate-x-2 group-hover:opacity-100 group-hover:translate-x-0 transition-all text-blue-400" />
            </h3>
            <p className="text-xs text-zinc-500 leading-relaxed mb-2">Ground raw egocentric footage with sensor-rich 6-DOF trajectories</p>
            <div className="text-[10px] text-blue-400 font-mono">→ Frames + Timeline JSON + Kinematics</div>
          </div>

          {/* Card 2: Multimodal Data Foundry */}
          <div
            onClick={() => onStart('factory', selectedVideos)}
            className="group relative bg-gradient-to-br from-purple-900/10 to-black border border-purple-500/30 hover:border-purple-500/70 rounded-xl p-6 cursor-pointer transition-all hover:scale-[1.02] hover:shadow-2xl hover:shadow-purple-500/20"
          >
            <div className="absolute top-3 right-3 px-2 py-0.5 bg-purple-500 text-white text-[8px] font-bold rounded uppercase tracking-wider">
              Enterprise
            </div>
            <div className="p-3 bg-purple-900/30 w-fit rounded-lg border border-purple-500/30 mb-4 group-hover:bg-purple-800/40 group-hover:border-purple-500/50 transition-all">
              <Database className="text-purple-300" size={28} />
            </div>
            <h3 className="text-base font-bold text-white mb-2 flex items-center gap-2">
              Data Foundry
              <ArrowRight className="w-4 h-4 opacity-0 -translate-x-2 group-hover:opacity-100 group-hover:translate-x-0 transition-all text-purple-400" />
            </h3>
            <p className="text-xs text-zinc-400 leading-relaxed mb-2">Hallucinate hardware-grade sensors (IMU, Depth) from monocular feeds</p>
            <div className="text-[10px] text-purple-400 font-mono">→ Multi-View Frames + IMU + JSON</div>
          </div>

          {/* Card 3: Spatial Semantics & Mocap */}
          <div
            onClick={() => onStart('exocentric', selectedVideos)}
            className="group relative bg-zinc-900/40 border border-white/10 hover:border-cyan-500/50 rounded-xl p-6 cursor-pointer transition-all hover:scale-[1.02] hover:shadow-2xl hover:shadow-cyan-500/20"
          >
            <div className="p-3 bg-cyan-900/20 w-fit rounded-lg border border-cyan-500/20 mb-4 group-hover:bg-cyan-800/40 group-hover:border-cyan-500/40 transition-all">
              <Scan className="text-cyan-300" size={28} />
            </div>
            <h3 className="text-base font-bold text-white mb-2 flex items-center gap-2">
              Spatial Semantics
              <ArrowRight className="w-4 h-4 opacity-0 -translate-x-2 group-hover:opacity-100 group-hover:translate-x-0 transition-all text-cyan-400" />
            </h3>
            <p className="text-xs text-zinc-500 leading-relaxed mb-2">Extract full-body humanoid priors and scene interaction graphs</p>
            <div className="text-[10px] text-cyan-400 font-mono">→ Annotations JSON + Source Video</div>
          </div>
        </div>

        <div className="mt-6 text-center">
          <button onClick={onClose} className="px-6 py-2 bg-zinc-800 hover:bg-zinc-700 text-white text-sm rounded transition-all">
            Cancel
          </button>
        </div>
      </div>
    </div>
  );
};


// --- MAIN APP ENTRY POINT ---
function App() {
  const [activeModule, setActiveModule] = useState('home');
  const [prefillUrl, setPrefillUrl] = useState("");
  const [batchVideos, setBatchVideos] = useState([]);
  const [batchJobId, setBatchJobId] = useState(null);
  const [mousePos, setMousePos] = useState({ x: 0, y: 0 });

  useEffect(() => {
    const handleMouseMove = (e) => {
      setMousePos({ x: (e.clientX / window.innerWidth) * 2 - 1, y: (e.clientY / window.innerHeight) * 2 - 1 });
    };
    window.addEventListener('mousemove', handleMouseMove);
    return () => window.removeEventListener('mousemove', handleMouseMove);
  }, []);

  const launchFromSearch = (url, type) => {
    setPrefillUrl(url);
    setBatchVideos([]);
    setBatchJobId(null);
    setActiveModule(type);
  };

  const launchBatch = async (moduleType, videoUrls) => {
    // Start batch job
    try {
      const taskType = moduleType === 'extractor' ? 'grounding' : moduleType === 'factory' ? 'factory' : 'exocentric';
      const res = await fetch('http://localhost:8001/enrich/batch', {
        method: 'POST',
        headers: {'Content-Type': 'application/json'},
        body: JSON.stringify({ videos: videoUrls, taskType })
      }).then(r => r.json());

      setBatchJobId(res.job_id);
      setBatchVideos(videoUrls);
      setPrefillUrl("");
      setActiveModule(moduleType);
    } catch (e) {
      alert("Failed to start batch job: " + e.message);
    }
  };

  // ROUTING
  if (activeModule === 'extractor') return <EgoEnrichment onBack={() => setActiveModule('home')} factoryMode={false} initialUrl={prefillUrl} autoStart={!!prefillUrl} batchJobId={batchJobId} />;
  if (activeModule === 'factory') return <EgoEnrichment onBack={() => setActiveModule('home')} factoryMode={true} initialUrl={prefillUrl} autoStart={!!prefillUrl} batchJobId={batchJobId} />;
  if (activeModule === 'exocentric') return <ExocentricModule onBack={() => setActiveModule('home')} initialUrl={prefillUrl} autoStart={!!prefillUrl} batchJobId={batchJobId} />;
  if (activeModule === 'search') return <SearchModule onBack={() => setActiveModule('home')} onLaunchEnrichment={launchFromSearch} onLaunchBatch={launchBatch} />;
  if (activeModule === 'lab') return <PolicyLabModule onBack={() => setActiveModule('home')} />; // NEW

  return (
    <div className="min-h-screen bg-[#030303] text-white font-sans selection:bg-purple-500/30 overflow-x-hidden">
      
      {/* Background FX */}
      <div className="fixed inset-0 z-0 pointer-events-none">
        <div className="absolute top-[-10%] left-[-10%] w-[40%] h-[40%] bg-purple-900/20 blur-[120px] rounded-full mix-blend-screen opacity-50" style={{ transform: `translate(${mousePos.x * 20}px, ${mousePos.y * 20}px)` }} />
        <div className="absolute bottom-[-10%] right-[-10%] w-[40%] h-[40%] bg-emerald-900/10 blur-[120px] rounded-full mix-blend-screen opacity-50" style={{ transform: `translate(${mousePos.x * -20}px, ${mousePos.y * -20}px)` }} />
        <div className="absolute inset-0 bg-[linear-gradient(rgba(255,255,255,0.02)_1px,transparent_1px),linear-gradient(90deg,rgba(255,255,255,0.02)_1px,transparent_1px)] bg-[size:64px_64px] [mask-image:radial-gradient(ellipse_at_center,black_40%,transparent_100%)]" />
      </div>

      <nav className="sticky top-0 left-0 right-0 h-20 z-50 flex items-center justify-between px-8 border-b border-white/5 bg-[#030303]/80 backdrop-blur-md">
        <div className="flex items-center gap-3">
          <div className="w-8 h-8 bg-white text-black flex items-center justify-center font-bold text-lg rounded-md">F</div>
          <div className="text-sm font-bold tracking-[0.2em] text-zinc-300">FIDELITY<span className="text-zinc-600">PLATFORM</span></div>
        </div>
        <div className="hidden md:flex gap-6 text-[11px] font-mono text-zinc-500 uppercase tracking-widest">
          <span className="flex items-center gap-2"><div className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse"/> System Operational</span>
          <span>v2.4.0</span>
        </div>
      </nav>

      <div className="relative z-10 max-w-7xl mx-auto px-6 py-20 flex flex-col min-h-[calc(100vh-80px)]">
        
        <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.8 }} className="mb-16 md:mb-24">
          <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full border border-purple-500/30 bg-purple-500/10 text-purple-300 text-[10px] font-bold tracking-widest mb-6 uppercase"><Sparkles className="w-3 h-3" /> Data Factory Live</div>
          <h1 className="text-5xl md:text-7xl font-bold tracking-tighter mb-6 bg-gradient-to-r from-white via-zinc-400 to-zinc-700 bg-clip-text text-transparent max-w-4xl leading-[1.1]">Infrastructure for <br/> Embodied Intelligence.</h1>
          <p className="text-lg md:text-xl text-zinc-500 max-w-2xl font-light leading-relaxed">We bridge the gap between Internet Video and Robot Hardware. Ingest, Simulate, and Validate training data at the speed of software.</p>
        </motion.div>

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6 mb-20">
          
          {/* 1. EGOCENTRIC GROUNDING ENGINE (UPDATED) */}
          <motion.div whileHover={{ scale: 1.01 }} onClick={() => setActiveModule('extractor')} className="group relative h-64 bg-zinc-900/40 border border-white/5 hover:border-white/20 rounded-2xl p-8 cursor-pointer overflow-hidden transition-all backdrop-blur-sm">
            <div className="relative z-10 flex flex-col h-full justify-between">
              <div className="p-3 bg-zinc-800/50 w-fit rounded-xl border border-white/5 mb-4 group-hover:bg-zinc-700 transition-colors"><Cpu className="text-blue-300" size={24} /></div>
              <div>
                <h3 className="text-xl font-bold text-white mb-2 flex items-center gap-2">
                  Egocentric Grounding Engine
                  <ArrowRight className="w-4 h-4 opacity-0 -translate-x-2 group-hover:opacity-100 group-hover:translate-x-0 transition-all text-blue-400" />
                </h3>
                <p className="text-sm text-zinc-500 leading-relaxed">Ground raw egocentric footage with sensor-rich descriptors. Transform flat video into physically grounded 6-DOF trajectories for rigorous policy training.</p>
              </div>
            </div>
          </motion.div>

          {/* 2. DATA FOUNDRY */}
          <motion.div whileHover={{ scale: 1.01 }} onClick={() => setActiveModule('factory')} className="group relative h-64 bg-gradient-to-br from-purple-900/10 to-black border border-purple-500/20 hover:border-purple-500/50 rounded-2xl p-8 cursor-pointer overflow-hidden transition-all backdrop-blur-sm">
            <div className="absolute top-4 right-4 px-2 py-1 bg-purple-500 text-white text-[9px] font-bold rounded uppercase tracking-wider">Enterprise</div>
            <div className="relative z-10 flex flex-col h-full justify-between">
              <div className="p-3 bg-purple-900/30 w-fit rounded-xl border border-purple-500/30 mb-4 group-hover:bg-purple-800/30 transition-colors"><Database className="text-purple-300" size={24} /></div>
              <div><h3 className="text-xl font-bold text-white mb-2 flex items-center gap-2">Multimodal Data Foundry<ArrowRight className="w-4 h-4 opacity-0 -translate-x-2 group-hover:opacity-100 group-hover:translate-x-0 transition-all text-purple-400" /></h3><p className="text-sm text-zinc-400 leading-relaxed">Hallucinate hardware-grade sensors (IMU, Depth) from monocular feeds. Generate physics-verified training SKUs at scale.</p></div>
            </div>
          </motion.div>

          {/* 3. SPATIAL SEMANTICS */}
          <motion.div whileHover={{ scale: 1.01 }} onClick={() => setActiveModule('exocentric')} className="group relative h-64 bg-zinc-900/40 border border-white/5 hover:border-cyan-500/30 rounded-2xl p-8 cursor-pointer overflow-hidden transition-all backdrop-blur-sm">
            <div className="relative z-10 flex flex-col h-full justify-between">
              <div className="p-3 bg-cyan-900/20 w-fit rounded-xl border border-cyan-500/20 mb-4 group-hover:bg-cyan-800/30 transition-colors"><Scan className="text-cyan-300" size={24} /></div>
              <div><h3 className="text-xl font-bold text-white mb-2 flex items-center gap-2">Spatial Semantics & Mocap<ArrowRight className="w-4 h-4 opacity-0 -translate-x-2 group-hover:opacity-100 group-hover:translate-x-0 transition-all text-cyan-400" /></h3><p className="text-sm text-zinc-500 leading-relaxed">Global-view analysis. Extract full-body humanoid priors and scene interaction graphs from third-person surveillance.</p></div>
            </div>
          </motion.div>

          {/* 4. ACQUISITION AGENT */}
          <motion.div whileHover={{ scale: 1.01 }} onClick={() => setActiveModule('search')} className="group relative h-64 bg-zinc-900/40 border border-white/5 hover:border-emerald-500/30 rounded-2xl p-8 cursor-pointer overflow-hidden transition-all backdrop-blur-sm">
            <div className="relative z-10 flex flex-col h-full justify-between">
              <div className="p-3 bg-emerald-900/20 w-fit rounded-xl border border-emerald-500/20 mb-4 group-hover:bg-emerald-800/30 transition-colors"><Network className="text-emerald-300" size={24} /></div>
              <div><h3 className="text-xl font-bold text-white mb-2 flex items-center gap-2">Neural Acquisition Agent<ArrowRight className="w-4 h-4 opacity-0 -translate-x-2 group-hover:opacity-100 group-hover:translate-x-0 transition-all text-emerald-400" /></h3><p className="text-sm text-zinc-500 leading-relaxed">Autonomous video curation. An AI agent that scours the open web to build domain-specific datasets for you.</p></div>
            </div>
          </motion.div>

          {/* 5. POLICY LAB (NEW) */}
          <motion.div whileHover={{ scale: 1.01 }} onClick={() => setActiveModule('lab')} className="group relative h-64 bg-zinc-900/40 border border-white/5 hover:border-amber-500/30 rounded-2xl p-8 cursor-pointer overflow-hidden transition-all backdrop-blur-sm md:col-span-2 lg:col-span-1">
            <div className="relative z-10 flex flex-col h-full justify-between">
              <div className="p-3 bg-amber-900/20 w-fit rounded-xl border border-amber-500/20 mb-4 group-hover:bg-amber-800/30 transition-colors"><BrainCircuit className="text-amber-300" size={24} /></div>
              <div><h3 className="text-xl font-bold text-white mb-2 flex items-center gap-2">Adaptive Policy Lab<ArrowRight className="w-4 h-4 opacity-0 -translate-x-2 group-hover:opacity-100 group-hover:translate-x-0 transition-all text-amber-400" /></h3><p className="text-sm text-zinc-500 leading-relaxed">The final mile. Upload your mixtures, audit data health, and train lightweight proof-of-concept policies in the loop.</p></div>
            </div>
          </motion.div>

        </div>

        <div className="mt-auto border-t border-white/5 pt-8 flex flex-col md:flex-row items-center justify-between text-[10px] text-zinc-600 font-mono uppercase tracking-widest gap-4">
          <div className="flex gap-6">
            <span className="hover:text-zinc-400 cursor-pointer flex items-center gap-2"><Terminal size={12}/> API Docs</span>
            <span className="hover:text-zinc-400 cursor-pointer flex items-center gap-2"><Globe size={12}/> Global Network</span>
            <span className="hover:text-zinc-400 cursor-pointer flex items-center gap-2"><Lock size={12}/> Data Privacy</span>
          </div>
          <div className="opacity-50">Fidelity Dynamics Inc. © 2026</div>
        </div>

      </div>
    </div>
  );
}

export default App;