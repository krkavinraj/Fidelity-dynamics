import React from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { X, CheckCircle2, AlertTriangle, Download, FileText, Activity, ShieldCheck } from 'lucide-react';

export const QualityReportModal = ({ isOpen, onClose, data, filename }) => {
    if (!isOpen || !data) return null;

    const { healthScore, maxVel, maxAcc, velocities } = data;
    const isPassing = healthScore > 80;

    const downloadReport = () => {
        const report = {
            id: `RPT-${Date.now().toString().slice(-6)}`,
            timestamp: new Date().toISOString(),
            dataset: filename || "untitled_sku",
            metrics: {
                health_score: healthScore.toFixed(1),
                peak_velocity: maxVel.toFixed(4),
                peak_acceleration: maxAcc.toFixed(4),
                singularity_risk: maxVel > 0.1 ? "HIGH" : "LOW",
                status: isPassing ? "APPROVED" : "REQUIRES_SMOOTHING"
            },
            notes: "Generated via Fidelity Data Factory QA Layer."
        };

        const blob = new Blob([JSON.stringify(report, null, 2)], { type: 'application/json' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `QA_REPORT_${filename || "sku"}.json`;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
    };

    return (
        <div className="fixed inset-0 z-[200] flex items-center justify-center bg-black/80 backdrop-blur-sm p-4">
            <motion.div 
                initial={{ opacity: 0, scale: 0.95 }} 
                animate={{ opacity: 1, scale: 1 }} 
                exit={{ opacity: 0, scale: 0.95 }}
                className="w-full max-w-2xl bg-zinc-950 border border-white/10 rounded-2xl shadow-2xl overflow-hidden flex flex-col"
            >
                {/* Header */}
                <div className="h-16 border-b border-white/10 flex items-center justify-between px-8 bg-zinc-900/50">
                    <div className="flex items-center gap-3">
                        <ShieldCheck className={isPassing ? "text-emerald-500" : "text-amber-500"} size={20}/>
                        <h2 className="text-sm font-bold tracking-widest uppercase text-white">Data Quality Certificate</h2>
                    </div>
                    <button onClick={onClose} className="text-zinc-500 hover:text-white transition-colors">
                        <X size={20} />
                    </button>
                </div>

                {/* Body */}
                <div className="p-8 flex-1 overflow-y-auto">
                    <div className="flex justify-between items-start mb-8">
                        <div>
                            <div className="text-xs text-zinc-500 font-mono mb-1">DATASET ID</div>
                            <div className="text-xl font-bold text-white">{filename || "SKU_PENDING"}</div>
                        </div>
                        <div className={`px-4 py-2 rounded-lg border ${isPassing ? "bg-emerald-500/10 border-emerald-500/20 text-emerald-400" : "bg-red-500/10 border-red-500/20 text-red-400"} text-center`}>
                            <div className="text-[10px] font-bold uppercase tracking-wider mb-1">QUALITY GRADE</div>
                            <div className="text-2xl font-black">{healthScore.toFixed(0)}/100</div>
                        </div>
                    </div>

                    <div className="grid grid-cols-2 gap-4 mb-8">
                        <div className="p-4 bg-zinc-900 rounded-xl border border-white/5">
                            <div className="flex items-center gap-2 text-zinc-500 mb-2">
                                <Activity size={14} /> <span className="text-[10px] font-bold uppercase">Kinematic Stability</span>
                            </div>
                            <div className="text-2xl font-mono text-white">{maxVel.toFixed(3)} <span className="text-xs text-zinc-600">rad/s</span></div>
                            <div className="text-xs text-zinc-500 mt-1">Peak Joint Velocity</div>
                        </div>
                        <div className="p-4 bg-zinc-900 rounded-xl border border-white/5">
                            <div className="flex items-center gap-2 text-zinc-500 mb-2">
                                <AlertTriangle size={14} /> <span className="text-[10px] font-bold uppercase">Singularity Risk</span>
                            </div>
                            <div className={`text-2xl font-mono ${maxVel > 0.1 ? "text-red-400" : "text-emerald-400"}`}>
                                {maxVel > 0.1 ? "DETECTED" : "CLEAR"}
                            </div>
                            <div className="text-xs text-zinc-500 mt-1">Jacobian Determinant Proxy</div>
                        </div>
                    </div>

                    {/* Mini Histogram */}
                    <div className="mb-8">
                         <div className="text-xs text-zinc-500 font-mono mb-2">VELOCITY DISTRIBUTION</div>
                         <div className="h-16 flex items-end gap-0.5 opacity-50">
                            {velocities.filter((_, i) => i % 2 === 0).map((v, i) => ( // Downsample for display
                                <div key={i} className="flex-1 bg-zinc-500" style={{ height: `${Math.min(100, v * 1000)}%` }} />
                            ))}
                         </div>
                    </div>

                    <div className="text-[10px] text-zinc-600 font-mono border-t border-white/5 pt-4">
                        CERTIFIED BY FIDELITY DYNAMICS QA ENGINE v2.4
                    </div>
                </div>

                {/* Footer */}
                <div className="p-4 border-t border-white/10 bg-zinc-900/50 flex gap-3">
                    <button onClick={downloadReport} className="flex-1 py-3 bg-white text-black font-bold rounded-lg text-xs flex items-center justify-center gap-2 hover:bg-zinc-200 transition-colors">
                        <Download size={14}/> DOWNLOAD FULL REPORT
                    </button>
                    <button onClick={onClose} className="px-6 py-3 bg-zinc-800 text-white font-bold rounded-lg text-xs hover:bg-zinc-700 transition-colors">
                        CLOSE
                    </button>
                </div>
            </motion.div>
        </div>
    );
};