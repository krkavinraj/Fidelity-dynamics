import React, { useMemo, useState } from 'react';
import { Activity, Zap, RefreshCcw, FileText, ChevronRight } from 'lucide-react';
import { QualityReportModal } from './QualityReportModal';

export const TrajectoryInspector = ({ timeline, onApplyFix, isProcessing, filename }) => {
    const [sigma, setSigma] = useState(2.0);
    const [showReport, setShowReport] = useState(false);

    // 1. ANALYZE TRAJECTORY
    const analytics = useMemo(() => {
        if (!timeline || timeline.length < 2) return null;

        let maxVel = 0;
        let maxAcc = 0;
        let jerkiness = 0;
        const velocities = [];

        for (let i = 1; i < timeline.length; i++) {
            const curr = timeline[i].robot_state?.qpos || [];
            const prev = timeline[i-1].robot_state?.qpos || [];
            
            if (curr.length === 0 || prev.length === 0) {
                velocities.push(0);
                continue;
            }

            let dist = 0;
            const dims = Math.min(curr.length, 7); 
            for(let j=0; j < dims; j++) {
                dist += Math.pow(curr[j] - prev[j], 2);
            }
            const v = Math.sqrt(dist); 
            velocities.push(v);

            if (v > maxVel) maxVel = v;
            if (i > 1) {
                const prevV = velocities[i-2] || 0;
                const acc = Math.abs(v - prevV);
                if (acc > maxAcc) maxAcc = acc;
                jerkiness += acc; 
            }
        }

        const avgJerk = jerkiness / timeline.length;
        const healthScore = Math.max(0, 100 - (avgJerk * 500)); 
        
        return { maxVel, maxAcc, healthScore, velocities };
    }, [timeline]);

    if (!analytics) return <div className="p-4 text-xs text-zinc-500 font-mono border-t border-white/5">Waiting for kinematic data...</div>;

    return (
        <>
            <div className="bg-zinc-900/80 border border-white/10 rounded-xl overflow-hidden shadow-xl backdrop-blur-md">
                {/* Header Bar - Compact */}
                <div className="px-4 py-2 border-b border-white/5 flex items-center justify-between bg-black/40">
                    <div className="flex items-center gap-2">
                        <div className={`w-2 h-2 rounded-full ${analytics.healthScore > 80 ? "bg-emerald-500" : "bg-amber-500"} animate-pulse`} />
                        <span className="text-[10px] font-bold text-zinc-300 tracking-wider">QA MONITORING ACTIVE</span>
                    </div>
                    <div className="flex items-center gap-3">
                         <span className="text-[10px] text-zinc-500">SCORE</span>
                         <span className={`text-sm font-mono font-bold ${analytics.healthScore > 80 ? "text-emerald-400" : "text-amber-400"}`}>
                            {analytics.healthScore.toFixed(0)}/100
                        </span>
                    </div>
                </div>

                <div className="p-4 flex flex-col gap-4">
                    {/* The Graph - Sleeker */}
                    <div className="h-16 flex items-end gap-[2px] opacity-80 relative">
                        {analytics.velocities.map((v, i) => {
                            const h = Math.min(100, (v / 0.1) * 100); 
                            const isSpike = v > 0.05; 
                            return (
                                <div 
                                    key={i} 
                                    className={`flex-1 rounded-t-sm ${isSpike ? 'bg-red-500' : 'bg-gradient-to-t from-emerald-900 to-emerald-500'}`}
                                    style={{ height: `${h}%` }}
                                />
                            );
                        })}
                        {/* Threshold Line */}
                        <div className="absolute top-[30%] w-full h-px bg-red-500/30 border-t border-dashed border-red-500/50 pointer-events-none"></div>
                    </div>

                    {/* Controls Row */}
                    <div className="flex items-center justify-between gap-4">
                        
                        {/* Auto Fixer */}
                        <div className="flex items-center gap-3 bg-black/20 p-1.5 pr-3 rounded-lg border border-white/5">
                            <div className="flex flex-col px-2">
                                <label className="text-[8px] text-zinc-500 font-bold mb-0.5">SMOOTHING</label>
                                <input 
                                    type="range" min="0" max="5" step="0.5" 
                                    value={sigma} 
                                    onChange={(e) => setSigma(parseFloat(e.target.value))}
                                    className="w-20 accent-emerald-500 h-1 bg-zinc-700 rounded-full appearance-none cursor-pointer"
                                />
                            </div>
                            <button 
                                onClick={() => onApplyFix(sigma)}
                                disabled={isProcessing}
                                className="bg-white hover:bg-zinc-200 text-black px-3 py-1.5 rounded-md text-[10px] font-bold flex items-center gap-1.5 transition-all shadow-lg shadow-white/10"
                            >
                                {isProcessing ? <RefreshCcw size={12} className="animate-spin"/> : <Zap size={12} fill="black" />}
                                FIX
                            </button>
                        </div>

                        {/* View Report */}
                        <button 
                            onClick={() => setShowReport(true)}
                            className="text-zinc-400 hover:text-white text-[10px] font-bold flex items-center gap-2 px-3 py-2 hover:bg-white/5 rounded-lg transition-colors border border-transparent hover:border-white/10"
                        >
                            <FileText size={14} /> VIEW REPORT <ChevronRight size={12} />
                        </button>
                    </div>
                </div>
            </div>

            {/* The Modal */}
            <QualityReportModal 
                isOpen={showReport} 
                onClose={() => setShowReport(false)} 
                data={analytics}
                filename={filename}
            />
        </>
    );
};