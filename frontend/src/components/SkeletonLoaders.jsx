export const VideoPlayerSkeleton = () => (
  <div className="relative w-full aspect-video rounded-xl overflow-hidden bg-zinc-900 border border-white/10">
    <div className="absolute inset-0 bg-gradient-to-r from-zinc-900 via-zinc-800 to-zinc-900 animate-pulse" />
    <div className="absolute inset-0 bg-gradient-to-r from-transparent via-white/5 to-transparent animate-shimmer" />
    <div className="absolute inset-0 flex items-center justify-center">
      <div className="text-zinc-600 text-sm font-mono">Loading video...</div>
    </div>
  </div>
);

export const ChartSkeleton = ({ height = "h-24" }) => (
  <div className={`${height} bg-black/40 rounded border border-white/5 relative overflow-hidden`}>
    <div className="absolute inset-0 bg-gradient-to-r from-transparent via-white/5 to-transparent animate-shimmer" />
    <div className="absolute inset-0 flex items-center justify-center">
      <div className="w-full h-full p-2">
        <div className="w-full h-full bg-gradient-to-r from-zinc-800 via-zinc-700 to-zinc-800 rounded animate-pulse" />
      </div>
    </div>
  </div>
);

export const ImageSkeleton = ({ className = "" }) => (
  <div className={`relative overflow-hidden bg-zinc-900 ${className}`}>
    <div className="absolute inset-0 bg-gradient-to-r from-zinc-900 via-zinc-800 to-zinc-900 animate-pulse" />
    <div className="absolute inset-0 bg-gradient-to-r from-transparent via-white/5 to-transparent animate-shimmer" />
  </div>
);

export const DataCardSkeleton = () => (
  <div className="bg-zinc-900/50 border border-white/10 rounded-xl p-6 space-y-4">
    <div className="h-4 w-1/3 bg-zinc-800 rounded animate-pulse" />
    <div className="h-8 w-2/3 bg-zinc-800 rounded animate-pulse" />
    <div className="space-y-2">
      <div className="h-3 w-full bg-zinc-800 rounded animate-pulse" />
      <div className="h-3 w-5/6 bg-zinc-800 rounded animate-pulse" />
    </div>
  </div>
);

export const TableRowSkeleton = () => (
  <div className="flex items-center gap-4 p-4 border-b border-white/5">
    <div className="h-10 w-10 bg-zinc-800 rounded animate-pulse" />
    <div className="flex-1 space-y-2">
      <div className="h-4 w-1/3 bg-zinc-800 rounded animate-pulse" />
      <div className="h-3 w-1/2 bg-zinc-800 rounded animate-pulse" />
    </div>
    <div className="h-8 w-20 bg-zinc-800 rounded animate-pulse" />
  </div>
);

// Add shimmer animation to Tailwind config or CSS
// @keyframes shimmer {
//   0% { transform: translateX(-100%); }
//   100% { transform: translateX(100%); }
// }
// .animate-shimmer {
//   animation: shimmer 2s infinite;
// }
