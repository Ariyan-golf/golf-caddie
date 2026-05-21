export default function Loading() {
  return (
    <div className="max-w-lg mx-auto p-4 space-y-4 pb-8">
      <div className="pt-4 space-y-2">
        <div className="h-7 w-28 rounded bg-green-50 animate-pulse" />
        <div className="h-4 w-56 rounded bg-green-50 animate-pulse" />
      </div>

      <div className="card space-y-3">
        <div className="h-5 w-36 rounded bg-green-50 animate-pulse" />
        <div className="h-48 rounded-xl bg-green-50 animate-pulse" />
      </div>

      <div className="card space-y-3">
        <div className="h-5 w-32 rounded bg-green-50 animate-pulse" />
        {Array.from({ length: 3 }).map((_, i) => (
          <div key={i} className="flex justify-between items-center py-2">
            <div className="h-4 w-24 rounded bg-green-50 animate-pulse" />
            <div className="h-4 w-16 rounded bg-green-100 animate-pulse" />
          </div>
        ))}
      </div>

      <p className="text-center text-sm text-green-500 pt-2 flex items-center justify-center gap-2">
        <span className="w-4 h-4 border-2 border-green-300 border-t-green-600 rounded-full animate-spin" />
        球筋データを読み込み中…
      </p>
    </div>
  );
}
