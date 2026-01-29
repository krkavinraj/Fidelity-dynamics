import React, { useState, useEffect } from 'react';
import { Sliders, CheckCircle2, RefreshCw, Eye, EyeOff, X } from 'lucide-react';

export const RetargetingPanel = ({ 
    onClose, 
    onPreviewChange, // Sends config back to parent for viz
    onRunBatch,      // The "Button"
    isProcessing 
}) => {
    // Default Calibration: Robot sits slightly in front and below the camera view
    const [config, setConfig] = useState({
        scale: 1.0,
        x: 0.5, // Forward/Back relative to robot base
        y: 0.0, // Left/Right
        z: 0.3  // Up/Down
    });

    const [isVisible, setIsVisible] = useState(true);

    // Live update the ghost robot when sliders move
    useEffect(() => {
        onPreviewChange(config);
    }, [config]);

    const handleChange = (key, val) => {
        setConfig(prev => ({ ...prev, [key]: parseFloat(val) }));
    };

    if (!isVisible) {
        return (
            <button 
                onClick={() => setIsVisible(true)}
                className="absolute top-4 right-4 bg-zinc-900 border border-purple-500/50 text-purple-400 p-2 rounded-lg shadow-xl z-50 hover:bg-zinc-800 transition-all"
            >
                <Sliders size={20}/>
            </button>
        );
    }

    return (
        <div className="absolute top-4 right-4 w-72 bg-zinc-950/95 border border-purple-500/30 rounded-xl p-5 backdrop-blur-md shadow-2xl z-50 animate-in slide-in-from-right duration-300">
            <div className="flex items-center justify-between mb-6 border-b border-white/10 pb-3">
                <div className="flex items-center gap-2 text-purple-400 font-bold text-xs uppercase tracking-wider">
                    <Sliders size={14}/> Kinematic Alignment
                </div>
                <div className="flex gap-2">
                    <button onClick={() => setIsVisible(false)} className="text-zinc-500 hover:text-white transition-colors">
                        <EyeOff size={14}/>
                    </button>
                    <button onClick={onClose} className="text-zinc-500 hover:text-red-400 transition-colors">
                        <X size={14}/>
                    </button>
                </div>
            </div>

            <div className="space-y-5">
                {/* Scale Control */}
                <div className="space-y-2">
                    <div className="flex justify-between text-[10px] text-zinc-400 font-bold uppercase">
                        <span>Motion Scale</span>
                        <span className="font-mono text-purple-300">{config.scale.toFixed(2)}x</span>
                    </div>
                    <input 
                        type="range" min="0.5" max="2.0" step="0.1" 
                        value={config.scale} 
                        onChange={e => handleChange('scale', e.target.value)}
                        className="w-full h-1.5 bg-zinc-800 rounded-lg appearance-none cursor-pointer accent-purple-500 hover:accent-purple-400 transition-all"
                    />
                </div>

                {/* X Offset */}
                <div className="space-y-2">
                    <div className="flex justify-between text-[10px] text-zinc-400 font-bold uppercase">
                        <span>Offset X (Reach)</span>
                        <span className="font-mono text-cyan-300">{config.x.toFixed(2)}m</span>
                    </div>
                    <input 
                        type="range" min="0.2" max="0.8" step="0.05" 
                        value={config.x} 
                        onChange={e => handleChange('x', e.target.value)}
                        className="w-full h-1.5 bg-zinc-800 rounded-lg appearance-none cursor-pointer accent-cyan-500 hover:accent-cyan-400 transition-all"
                    />
                </div>

                {/* Y Offset */}
                <div className="space-y-2">
                    <div className="flex justify-between text-[10px] text-zinc-400 font-bold uppercase">
                        <span>Offset Y (Side)</span>
                        <span className="font-mono text-emerald-300">{config.y.toFixed(2)}m</span>
                    </div>
                    <input 
                        type="range" min="-0.5" max="0.5" step="0.05" 
                        value={config.y} 
                        onChange={e => handleChange('y', e.target.value)}
                        className="w-full h-1.5 bg-zinc-800 rounded-lg appearance-none cursor-pointer accent-emerald-500 hover:accent-emerald-400 transition-all"
                    />
                </div>

                {/* Z Offset */}
                <div className="space-y-2">
                    <div className="flex justify-between text-[10px] text-zinc-400 font-bold uppercase">
                        <span>Offset Z (Height)</span>
                        <span className="font-mono text-orange-300">{config.z.toFixed(2)}m</span>
                    </div>
                    <input 
                        type="range" min="0.0" max="0.8" step="0.05" 
                        value={config.z} 
                        onChange={e => handleChange('z', e.target.value)}
                        className="w-full h-1.5 bg-zinc-800 rounded-lg appearance-none cursor-pointer accent-orange-500 hover:accent-orange-400 transition-all"
                    />
                </div>

                {/* Info Box */}
                <div className="bg-purple-900/20 border border-purple-500/20 p-3 rounded-lg">
                    <p className="text-[10px] text-purple-200 leading-relaxed opacity-80">
                        Align the ghost robot with the video hand. 
                        Click generate to solve Inverse Kinematics for the entire timeline.
                    </p>
                </div>

                {/* THE MAGIC BUTTON */}
                <button 
                    onClick={() => onRunBatch(config)} 
                    disabled={isProcessing}
                    className="w-full py-3.5 bg-gradient-to-r from-purple-600 to-indigo-600 hover:from-purple-500 hover:to-indigo-500 text-white font-bold rounded-xl text-xs flex items-center justify-center gap-2 shadow-lg shadow-purple-900/30 transition-all active:scale-95 disabled:opacity-50 disabled:cursor-not-allowed"
                >
                    {isProcessing ? <RefreshCw className="animate-spin" size={14}/> : <CheckCircle2 size={14}/>}
                    GENERATE ROBOT JOINTS
                </button>
            </div>
        </div>
    );
};