export default function LoadingOverlay() {
  return (
    <div className="fixed inset-0 z-40 flex items-center justify-center bg-slate-950/20 backdrop-blur-[2px] dark:bg-slate-950/50">
      <div className="flex items-center gap-2.5 rounded-md border border-slate-200 bg-white px-3.5 py-2 shadow-lg dark:border-slate-800 dark:bg-slate-900">
        <div className="h-4 w-4 animate-spin rounded-full border-2 border-slate-300 border-t-brand dark:border-slate-700 dark:border-t-brand-light" />
        <span className="text-xs font-semibold text-slate-700 dark:text-slate-200">Syncing...</span>
      </div>
    </div>
  );
}
