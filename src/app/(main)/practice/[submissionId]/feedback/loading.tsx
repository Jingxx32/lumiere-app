export default function FeedbackLoading() {
  return (
    <div className="px-6 py-8 space-y-6 animate-pulse">
      <div className="max-w-[1200px] mx-auto space-y-3">
        <div className="flex items-center gap-3">
          <div className="h-8 w-32 bg-surface-muted rounded-lg" />
          <div className="h-5 w-10 bg-surface-muted rounded-full" />
        </div>
        <div className="h-4 w-80 bg-surface-muted rounded-lg" />
        <div className="h-3 w-48 bg-surface-muted rounded-lg" />
      </div>

      <div className="max-w-[1200px] mx-auto grid grid-cols-1 lg:grid-cols-[260px_minmax(0,1fr)_360px] gap-5">
        <div className="h-64 bg-surface-muted rounded-2xl" />
        <div className="h-96 bg-surface-muted rounded-2xl" />
        <div className="h-96 bg-surface-muted rounded-2xl" />
      </div>
    </div>
  );
}
