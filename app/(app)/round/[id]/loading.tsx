export default function Loading() {
  return (
    <div className="max-w-lg mx-auto p-4 space-y-4">
      <div className="pt-4 flex items-center justify-between">
        <div className="space-y-2">
          <div className="h-6 w-44 rounded bg-green-50 animate-pulse" />
          <div className="h-4 w-28 rounded bg-green-50 animate-pulse" />
        </div>
      </div>

      <div className="space-y-2 pb-3">
        <div className="flex items-center justify-between gap-2 px-1 pt-1">
          <div className="h-7 w-40 rounded bg-green-50 animate-pulse" />
          <div className="h-5 w-24 rounded bg-green-50 animate-pulse" />
        </div>

        <div className="rounded-xl border border-green-100 bg-white p-3 space-y-2">
          {Array.from({ length: 4 }).map((_, i) => (
            <div key={i} className="grid grid-cols-9 gap-1">
              {Array.from({ length: 9 }).map((__, j) => (
                <div
                  key={j}
                  className="h-6 rounded bg-green-50 animate-pulse"
                />
              ))}
            </div>
          ))}
        </div>

        <div className="h-32 rounded-2xl bg-green-50 animate-pulse" />

        <div className="card space-y-3">
          <div className="h-12 rounded-xl bg-green-100 animate-pulse" />
          <div className="grid grid-cols-3 gap-2">
            <div className="h-10 rounded-lg bg-green-50 animate-pulse" />
            <div className="h-10 rounded-lg bg-green-50 animate-pulse" />
            <div className="h-10 rounded-lg bg-green-50 animate-pulse" />
          </div>
        </div>

        <div className="h-11 rounded-xl bg-emerald-50 border border-emerald-100 animate-pulse" />

        <p className="text-center text-sm text-green-500 pt-2 flex items-center justify-center gap-2">
          <span className="w-4 h-4 border-2 border-green-300 border-t-green-600 rounded-full animate-spin" />
          ⛳ ホール情報を読み込み中…
        </p>
      </div>
    </div>
  );
}
