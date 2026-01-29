import React from 'react';
import { Bot, CheckCircle2, ChevronRight, X, Activity, Box, User } from 'lucide-react';
import clsx from 'clsx';
import { motion } from 'framer-motion';

const ROBOTS = [
    {
        category: "Single Arm Manipulation",
        icon: Bot,
        color: "text-cyan-400",
        bg: "bg-cyan-500/10",
        border: "border-cyan-500/20",
        description: "Standard 6/7-DOF arms for pick-and-place & tool use.",
        items: [
            {
                id: 'franka',
                name: 'Franka Emika FR3',
                type: '7-DOF Torque-Controlled',
                stats: '1kg Payload • 855mm Reach',
                desc: 'Research standard. Ideal for delicate manipulation.',
                config: { scale: 1.0, x: 0.5, y: 0.0, z: 0.3 }
            },
            {
                id: 'ur5',
                name: 'Universal Robots UR5e',
                type: '6-DOF Industrial',
                stats: '5kg Payload • 850mm Reach',
                desc: 'Robust industrial cobot. Good for repetitive tasks.',
                config: { scale: 1.2, x: 0.6, y: 0.0, z: 0.2 }
            },
            {
                id: 'xarm',
                name: 'UFACTORY xArm 7',
                type: '7-DOF Cost-Effective',
                stats: '3.5kg Payload • 700mm Reach',
                desc: 'Budget-friendly 7-axis arm for education.',
                config: { scale: 1.0, x: 0.5, y: 0.0, z: 0.25 }
            }
        ]
    },
    {
        category: "Bimanual Systems",
        icon: Box,
        color: "text-purple-400",
        bg: "bg-purple-500/10",
        border: "border-purple-500/20",
        description: "Dual-arm setups for complex, two-handed tasks.",
        items: [
            {
                id: 'aloha',
                name: 'ALOHA Stationary',
                type: 'Dual ViperX 300',
                stats: 'Bimanual • Teleop Native',
                desc: 'The current SOTA for fine bimanual manipulation.',
                config: { scale: 1.0, x: 0.4, y: 0.0, z: 0.2, mode: 'bimanual' }
            }
        ]
    },
    {
        category: "Humanoid / Mobile",
        icon: User,
        color: "text-emerald-400",
        bg: "bg-emerald-500/10",
        border: "border-emerald-500/20",
        description: "Whole-body motion and mobile manipulation.",
        items: [
            {
                id: 'h1',
                name: 'Unitree H1',
                type: 'Full Body Humanoid',
                stats: 'Mobile • Torso Actuated',
                desc: 'Retargets hand motion to upper-body chain.',
                config: { scale: 0.9, x: 0.3, y: -0.2, z: 1.1 }
            }
        ]
    }
];

export const EmbodimentPanel = ({ onSelect, onClose }) => {
    return (
        <div className="fixed inset-0 z-[100] flex items-center justify-center p-8 bg-black/80 backdrop-blur-sm animate-in fade-in duration-200">
            <motion.div 
                initial={{ opacity: 0, scale: 0.95, y: 20 }}
                animate={{ opacity: 1, scale: 1, y: 0 }}
                className="w-full max-w-5xl bg-zinc-950 border border-white/10 rounded-2xl shadow-2xl flex flex-col overflow-hidden max-h-[90vh]"
            >
                {/* Header */}
                <div className="p-6 border-b border-white/10 bg-zinc-900/50 flex justify-between items-start">
                    <div>
                        <h2 className="text-xl font-bold text-white flex items-center gap-3">
                            <Bot className="text-indigo-400" /> Select Target Embodiment
                        </h2>
                        <p className="text-zinc-400 text-sm mt-1">
                            Choose the hardware profile for kinematic retargeting. This will auto-scale the human motion to the robot's physical workspace.
                        </p>
                    </div>
                    <button 
                        onClick={onClose}
                        className="p-2 hover:bg-white/10 rounded-full transition-colors text-zinc-500 hover:text-white"
                    >
                        <X size={24} />
                    </button>
                </div>

                {/* Content Grid */}
                <div className="flex-1 overflow-y-auto p-8 custom-scrollbar">
                    <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                        {ROBOTS.map((cat, idx) => (
                            <div key={idx} className="flex flex-col gap-4">
                                {/* Category Header */}
                                <div className={`p-4 rounded-xl border ${cat.bg} ${cat.border} flex items-center gap-3`}>
                                    <cat.icon size={20} className={cat.color} />
                                    <div>
                                        <div className={`text-xs font-bold uppercase tracking-wider ${cat.color}`}>{cat.category}</div>
                                        <div className="text-[10px] text-zinc-400 leading-tight mt-0.5">{cat.description}</div>
                                    </div>
                                </div>

                                {/* Robot Cards */}
                                <div className="flex flex-col gap-3">
                                    {cat.items.map((bot) => (
                                        <button
                                            key={bot.id}
                                            onClick={() => onSelect(bot)}
                                            className="group relative text-left bg-zinc-900/50 hover:bg-zinc-800 border border-white/5 hover:border-white/20 p-4 rounded-xl transition-all hover:shadow-xl hover:scale-[1.02]"
                                        >
                                            <div className="flex justify-between items-start mb-2">
                                                <span className="font-bold text-sm text-zinc-200 group-hover:text-white transition-colors">
                                                    {bot.name}
                                                </span>
                                                <ChevronRight size={16} className="text-zinc-600 group-hover:text-white transition-colors opacity-0 group-hover:opacity-100 transform -translate-x-2 group-hover:translate-x-0" />
                                            </div>
                                            
                                            <div className="text-[10px] font-mono text-indigo-400 mb-2 bg-indigo-500/10 inline-block px-2 py-0.5 rounded border border-indigo-500/20">
                                                {bot.type}
                                            </div>
                                            
                                            <div className="text-[10px] text-zinc-500 mb-2 font-medium">
                                                {bot.stats}
                                            </div>

                                            <p className="text-[11px] text-zinc-400 leading-relaxed">
                                                {bot.desc}
                                            </p>
                                        </button>
                                    ))}
                                </div>
                            </div>
                        ))}
                    </div>
                </div>

                {/* Footer Tip */}
                <div className="p-4 border-t border-white/10 bg-zinc-900/80 text-center">
                    <p className="text-[10px] text-zinc-500 flex items-center justify-center gap-2">
                        <Activity size={12} className="text-emerald-500"/>
                        <span>Selecting a robot will automatically run the backend Inverse Kinematics solver.</span>
                    </p>
                </div>
            </motion.div>
        </div>
    );
};