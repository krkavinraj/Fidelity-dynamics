import { useState, useRef, useEffect } from 'react';
import { 
  ArrowRight, UploadCloud, Activity, Zap, BrainCircuit, 
  Database, Cloud, Github, Settings, Check, Link as LinkIcon,
  Box, Terminal
} from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import clsx from 'clsx';

// --- VISUALIZATIONS ---
const Sparkline = ({ data, color = "#f59e0b" }) => {
    if (!data || data.length < 2) return <div className="h-full bg-white/5 rounded"/>;
    const max = Math.max(...data);
    const min = Math.min(...data);
    const range = max - min || 1;
    const points = data.map((v, i) => {
        const x = (i / (data.length - 1)) * 100;
        const y = 100 - ((v - min) / range) * 100; 
        return `${x},${y}`;
    }).join(" ");
    return (
        <svg viewBox="0 0 100 100" preserveAspectRatio="none" className="w-full h-full overflow-visible">
            <polyline points={points} fill="none" stroke={color} strokeWidth="2" vectorEffect="non-scaling-stroke" strokeLinecap="round" strokeLinejoin="round"/>
        </svg>
    );
};

// --- MOCK DATA FOR INTEGRATIONS ---
const FRAMEWORKS = [
    { id: 'lerobot', name: 'LeRobot', desc: 'Hugging Face SOTA (ACT/Diffusion)', icon: '🤗' },
    { id: 'robomimic', name: 'Robomimic', desc: 'Offline RL baselines', icon: '🤖' },
    { id: 'isaac', name: 'Isaac Lab', desc: 'Sim-to-Real Reinforcement Learning', icon: '⚡' }
];

const CLOUD_DATASETS = [
    { id: 'd1', name: 'Franka_Kitchen_Pick_v4', size: '2.4GB', date: '2 hrs ago', type: 'Synthetic' },
    { id: 'd2', name: 'Teleop_Mug_Place_RAW', size: '850MB', date: 'Yesterday', type: 'Real' },
    { id: 'd3', name: 'OpenX_Bridge_Subset', size: '12GB', date: '3 days ago', type: 'External' }
];

export const PolicyLabModule = ({ onBack }) => {
    const [step, setStep] = useState('source'); // source -> config -> train -> result
    
    // Configuration State
    const [sourceTab, setSourceTab] = useState('cloud'); // cloud, upload, hf
    const [selectedDataset, setSelectedDataset] = useState(null);
    const [selectedFramework, setSelectedFramework] = useState('lerobot');
    const [useWandB, setUseWandB] = useState(true);
    
    // Training Simulation State
    const [trainingEpoch, setTrainingEpoch] = useState(0);
    const [lossHistory, setLossHistory] = useState([]);
    const [isTraining, setIsTraining] = useState(false);
    const fileInputRef = useRef(null);

    // --- HANDLERS ---
    const handleDatasetSelect = (d) => {
        setSelectedDataset(d);
        setTimeout(() => setStep('config'), 500); // Auto advance
    };

    const handleFileUpload = (e) => {
        const file = e.target.files[0];
        if(file) handleDatasetSelect({ name: file.name, size: 'Local', type: 'Upload' });
    };

    const startTraining = () => {
        setStep('train');
        setIsTraining(true);
        let epoch = 0;
        let loss = 2.5; 
        setLossHistory([2.5]);

        const interval = setInterval(() => {
            epoch++;
            loss = loss * 0.94 + (Math.random() * 0.05); 
            setTrainingEpoch(epoch);
            setLossHistory(prev => [...prev, loss]);

            if(epoch >= 100) {
                clearInterval(interval);
                setIsTraining(false);
                setStep('result');
            }
        }, 50);
    };

    return (
        <div className="min-h-screen w-full bg-[#050505] flex flex-col items-center justify-center font-sans relative overflow-hidden text-zinc-100">
            <div className="absolute inset-0 bg-[radial-gradient(circle_at_center,rgba(245,158,11,0.05)_0%,transparent_70%)] pointer-events-none"/>
            
            <div className="z-10 w-full max-w-5xl p-6">
                
                {/* Header */}
                <div className="flex items-center justify-between mb-8">
                    <button onClick={onBack} className="text-zinc-500 hover:text-white flex items-center gap-2 transition-colors text-xs font-bold tracking-widest">
                        <ArrowRight className="rotate-180" size={16}/> RETURN TO HUB
                    </button>
                    <div className="text-right">
                        <h2 className="text-2xl font-bold text-white flex items-center gap-3 justify-end">
                            <BrainCircuit className="text-amber-500"/> Policy Iteration Lab
                        </h2>
                        <div className="text-xs text-zinc-500 font-mono mt-1">TRAINING CLUSTER: ONLINE</div>
                    </div>
                </div>

                {/* Main Card */}
                <div className="bg-zinc-900/80 border border-white/10 rounded-2xl shadow-2xl relative overflow-hidden min-h-[500px] flex flex-col backdrop-blur-md">
                    
                    {/* --- STEP 1: DATA SOURCE SELECTION --- */}
                    {step === 'source' && (
                        <div className="flex-1 flex flex-col">
                            {/* Tabs */}
                            <div className="flex border-b border-white/5 bg-black/20">
                                {[
                                    { id: 'cloud', label: 'Fidelity Cloud', icon: Cloud },
                                    { id: 'upload', label: 'Local Upload', icon: UploadCloud },
                                    { id: 'hf', label: 'Hugging Face', icon: Github },
                                ].map(tab => (
                                    <button 
                                        key={tab.id}
                                        onClick={() => setSourceTab(tab.id)}
                                        className={clsx(
                                            "flex-1 py-4 text-xs font-bold flex items-center justify-center gap-2 transition-all border-b-2",
                                            sourceTab === tab.id 
                                                ? "border-amber-500 text-amber-400 bg-amber-500/5" 
                                                : "border-transparent text-zinc-500 hover:text-zinc-300 hover:bg-white/5"
                                        )}
                                    >
                                        <tab.icon size={16}/> {tab.label}
                                    </button>
                                ))}
                            </div>

                            <div className="flex-1 p-8">
                                {sourceTab === 'cloud' && (
                                    <div className="space-y-3 animate-in fade-in slide-in-from-bottom-2">
                                        <div className="text-xs text-zinc-500 font-mono mb-2">RECENTLY GENERATED DATASETS</div>
                                        {CLOUD_DATASETS.map((d, i) => (
                                            <div key={i} onClick={() => handleDatasetSelect(d)} className="flex items-center justify-between p-4 bg-zinc-800/30 border border-white/5 hover:border-amber-500/50 hover:bg-zinc-800/80 rounded-xl cursor-pointer group transition-all">
                                                <div className="flex items-center gap-4">
                                                    <div className="p-2 bg-amber-500/10 rounded text-amber-500"><Database size={18}/></div>
                                                    <div>
                                                        <div className="font-bold text-white group-hover:text-amber-400 transition-colors">{d.name}</div>
                                                        <div className="text-xs text-zinc-500">{d.type} • {d.size}</div>
                                                    </div>
                                                </div>
                                                <div className="text-xs text-zinc-600 font-mono">{d.date}</div>
                                            </div>
                                        ))}
                                    </div>
                                )}

                                {sourceTab === 'upload' && (
                                    <div className="h-full flex flex-col items-center justify-center border-2 border-dashed border-zinc-700 hover:border-amber-500/50 rounded-xl bg-black/20 transition-all cursor-pointer group animate-in fade-in" onClick={() => fileInputRef.current.click()}>
                                        <input type="file" ref={fileInputRef} onChange={handleFileUpload} className="hidden" accept=".zip,.hdf5" />
                                        <UploadCloud className="text-zinc-600 group-hover:text-amber-400 mb-4 transition-colors" size={48}/>
                                        <h3 className="text-lg font-bold text-white mb-2">Drop Training Mixture</h3>
                                        <p className="text-sm text-zinc-500 font-mono">Supports .HDF5 (RLDS) or LeRobot .ZIP</p>
                                    </div>
                                )}

                                {sourceTab === 'hf' && (
                                    <div className="h-full flex flex-col items-center justify-center text-zinc-500 animate-in fade-in">
                                        <Github size={48} className="mb-4 opacity-20"/>
                                        <p className="text-sm">Connect Hugging Face Token to browse Open X-Embodiment.</p>
                                        <button className="mt-4 px-4 py-2 bg-white/10 hover:bg-white/20 rounded text-xs font-bold text-white transition-colors">CONNECT ACCOUNT</button>
                                    </div>
                                )}
                            </div>
                        </div>
                    )}

                    {/* --- STEP 2: CONFIGURATION & INTEGRATIONS --- */}
                    {step === 'config' && (
                        <motion.div initial={{opacity: 0, x: 20}} animate={{opacity: 1, x: 0}} className="flex-1 flex flex-col p-8">
                            <div className="flex items-center gap-3 mb-8 pb-4 border-b border-white/5">
                                <div className="p-2 bg-amber-500/10 rounded-lg"><Settings className="text-amber-400" size={20}/></div>
                                <div>
                                    <div className="font-bold text-white">Configure Training Run</div>
                                    <div className="text-xs text-zinc-500">TARGET: {selectedDataset?.name}</div>
                                </div>
                            </div>

                            <div className="grid grid-cols-2 gap-8 mb-8">
                                {/* Framework Selection */}
                                <div>
                                    <label className="text-xs text-zinc-500 font-bold mb-3 block">TRAINING ENGINE</label>
                                    <div className="space-y-2">
                                        {FRAMEWORKS.map(fw => (
                                            <button 
                                                key={fw.id}
                                                onClick={() => setSelectedFramework(fw.id)}
                                                className={clsx(
                                                    "w-full text-left p-3 rounded-lg border flex items-center gap-3 transition-all",
                                                    selectedFramework === fw.id 
                                                        ? "bg-amber-500/10 border-amber-500/50 text-white" 
                                                        : "bg-zinc-900 border-zinc-800 text-zinc-400 hover:border-zinc-700"
                                                )}
                                            >
                                                <div className="text-lg">{fw.icon}</div>
                                                <div>
                                                    <div className="text-sm font-bold">{fw.name}</div>
                                                    <div className="text-[10px] opacity-70">{fw.desc}</div>
                                                </div>
                                                {selectedFramework === fw.id && <Check size={16} className="ml-auto text-amber-400"/>}
                                            </button>
                                        ))}
                                    </div>
                                </div>

                                {/* Integrations */}
                                <div>
                                    <label className="text-xs text-zinc-500 font-bold mb-3 block">INTEGRATIONS</label>
                                    <div className="space-y-3">
                                        <div onClick={() => setUseWandB(!useWandB)} className="flex items-center justify-between p-3 bg-zinc-900 rounded-lg border border-zinc-800 cursor-pointer hover:border-zinc-700">
                                            <div className="flex items-center gap-3">
                                                <div className="w-8 h-8 rounded bg-[#FFBE00] text-black font-black flex items-center justify-center text-xs">W&B</div>
                                                <div>
                                                    <div className="text-sm font-bold">Weights & Biases</div>
                                                    <div className="text-[10px] text-zinc-500">Live Experiment Tracking</div>
                                                </div>
                                            </div>
                                            <div className={clsx("w-4 h-4 rounded-full border flex items-center justify-center", useWandB ? "bg-amber-500 border-amber-500" : "border-zinc-600")}>
                                                {useWandB && <Check size={10} className="text-black"/>}
                                            </div>
                                        </div>
                                        
                                        <div className="flex items-center justify-between p-3 bg-zinc-900 rounded-lg border border-zinc-800 opacity-50 cursor-not-allowed">
                                            <div className="flex items-center gap-3">
                                                <div className="w-8 h-8 rounded bg-blue-600 text-white flex items-center justify-center"><Box size={16}/></div>
                                                <div>
                                                    <div className="text-sm font-bold">Kubernetes</div>
                                                    <div className="text-[10px] text-zinc-500">Remote Cluster Dispatch</div>
                                                </div>
                                            </div>
                                            <LinkIcon size={14} className="text-zinc-600"/>
                                        </div>
                                    </div>
                                </div>
                            </div>

                            <div className="mt-auto">
                                <button onClick={startTraining} className="w-full py-4 bg-amber-600 hover:bg-amber-500 text-white font-bold rounded-xl transition-all shadow-lg shadow-amber-900/20 flex items-center justify-center gap-2 group">
                                    <Zap size={18} className="group-hover:text-yellow-200 fill-current"/> 
                                    LAUNCH {selectedFramework.toUpperCase()} JOB
                                </button>
                            </div>
                        </motion.div>
                    )}

                    {/* --- STEP 3: TRAINING SIMULATION --- */}
                    {(step === 'train' || step === 'result') && (
                        <div className="flex-1 flex flex-col h-full p-6">
                            <div className="flex justify-between items-end mb-4">
                                <div>
                                    <div className="text-[10px] text-zinc-500 font-bold mb-1 tracking-wider">TRAINING PROGRESS</div>
                                    <div className="text-3xl font-mono font-bold text-white flex items-baseline gap-2">
                                        Epoch {trainingEpoch} <span className="text-sm text-zinc-600">/ 100</span>
                                    </div>
                                </div>
                                <div className="text-right">
                                    <div className="text-[10px] text-zinc-500 font-bold mb-1 tracking-wider">LOSS (MSE)</div>
                                    <div className="text-3xl font-mono font-bold text-amber-400">
                                        {lossHistory[lossHistory.length-1]?.toFixed(4) || "2.500"}
                                    </div>
                                </div>
                            </div>

                            {/* LOSS GRAPH */}
                            <div className="flex-1 bg-black/40 rounded-xl border border-white/5 p-4 relative overflow-hidden mb-4 flex flex-col min-h-[200px]">
                                <div className="absolute inset-0 p-4 opacity-70">
                                    <Sparkline data={lossHistory} color="#f59e0b" />
                                </div>
                                {/* Terminal Overlay */}
                                <div className="mt-auto relative z-10 font-mono text-[10px] text-zinc-400 space-y-1 bg-black/60 p-2 rounded backdrop-blur-sm border border-white/5 w-fit min-w-[300px]">
                                    {isTraining ? (
                                        <>
                                            <div className="flex gap-2"><span className="text-blue-400">info</span> <span>Using device: cuda:0</span></div>
                                            <div className="flex gap-2"><span className="text-purple-400">wandb</span> <span>Run initiated: {selectedDataset?.name}_run_01</span></div>
                                            <div>[{selectedFramework}] Batch {trainingEpoch * 8}: loss={lossHistory[lossHistory.length-1]?.toFixed(4)}</div>
                                            <div className="text-amber-500 animate-pulse">{'>> Backpropagating gradients...'}</div>
                                        </>
                                    ) : (
                                        <div className="text-emerald-400 font-bold">{'>> OPTIMIZATION COMPLETE. MODEL SAVED.'}</div>
                                    )}
                                </div>
                            </div>

                            {/* WandB Link Mockup */}
                            {useWandB && isTraining && (
                                <div className="text-[10px] text-zinc-500 flex items-center gap-2 mb-4">
                                    <div className="w-2 h-2 bg-green-500 rounded-full animate-pulse"/>
                                    Live syncing to <span className="text-[#FFBE00] underline cursor-pointer">wandb.ai/fidelity/projects</span>
                                </div>
                            )}

                            {step === 'result' && (
                                <div className="flex gap-4 animate-in fade-in slide-in-from-bottom-2 mt-auto">
                                    <button className="flex-1 py-3 bg-zinc-800 hover:bg-zinc-700 text-white font-bold rounded-lg text-xs tracking-wide border border-white/10">
                                        DOWNLOAD ONNX
                                    </button>
                                    <button onClick={() => setStep('source')} className="flex-1 py-3 bg-amber-600 hover:bg-amber-500 text-white font-bold rounded-lg text-xs tracking-wide shadow-lg shadow-amber-900/20">
                                        START NEW EXPERIMENT
                                    </button>
                                </div>
                            )}
                        </div>
                    )}

                </div>
            </div>
        </div>
    );
};