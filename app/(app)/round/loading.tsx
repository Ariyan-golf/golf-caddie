export default function Loading() {
  return (
    <div className="max-w-lg mx-auto p-4 space-y-4">
      <div className="pt-4 flex items-center justify-between">
        <div className="h-8 w-32 rounded-lg bg-green-50 animate-pulse" />
        <div className="h-9 w-20 rounded-xl bg-green-100 animate-pulse" />
      </div>

      <div className="space-y-2">
        {Array.from({ length: 5 }).map((_, i) => (
          <div
            key={i}
            className="card flex items-center justify-between py-3"
            aria-hidden="true"
          >
            <div className="space-y-2">
              <div className="h-4 w-40 rounded bg-green-50 animate-pulse" />
              <div className="h-3 w-24 rounded bg-green-50 animate-pulse" />
            </div>
            <div className="h-7 w-12 rounded-lg bg-green-100 animate-pulse" />
          </div>
        ))}
      </div>

      <p className="text-center text-sm text-green-500 pt-2 flex items-center justify-center gap-2">
        <span className="w-4 h-4 border-2 border-green-300 border-t-green-600 rounded-full animate-spin" />
        ラウンドを読み込み中…
      </p>
    </div>
  );
}
