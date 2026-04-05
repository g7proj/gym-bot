export default function LoadingOverlay() {
  return (
    <div className="fixed inset-0 z-40 flex items-center justify-center bg-white/70 backdrop-blur-sm">
      <div className="flex flex-col items-center gap-3 rounded-md border border-slate-200 bg-white px-6 py-4 shadow-lg">
        <div className="h-10 w-10 animate-spin rounded-md border-4 border-slate-200 border-t-slate-900" />
        <div className="text-sm font-medium text-slate-700">Loading...</div>
      </div>
    </div>
  );
}
