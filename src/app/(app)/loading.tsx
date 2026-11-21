// Shown instantly when switching tabs, while the page's data loads.
export default function Loading() {
  return (
    <div aria-busy="true" aria-label="Loading" className="animate-pulse">
      <div className="border-b border-line px-4 pt-[max(env(safe-area-inset-top),0.75rem)] pb-3">
        <div className="h-5 w-32 rounded bg-line" />
        <div className="mt-2 h-3 w-48 rounded bg-line/70" />
      </div>
      <div className="space-y-4 p-4">
        <div className="card h-24" />
        <div className="card divide-y divide-line">
          {Array.from({ length: 6 }).map((_, i) => (
            <div key={i} className="flex items-center gap-3 px-3 py-3">
              <div className="size-6 rounded-md bg-line" />
              <div className="flex-1 space-y-2">
                <div className="h-3 w-2/3 rounded bg-line" />
                <div className="h-2.5 w-1/3 rounded bg-line/70" />
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
