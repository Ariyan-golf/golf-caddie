// 旧: 提携ゴルフ場の QR を読み取り 220円のラウンド利用料を決済するページ。
// 現在の全機能を無料で提供しているため、決済は行わず案内のみ出す。
export default function GolfQrPage() {
  return (
    <div className="max-w-lg mx-auto p-4 space-y-6 pb-24">
      <div className="pt-4">
        <a href="/" className="flex items-center gap-1 text-green-600 text-sm font-medium mb-2">
          ← ホームに戻る
        </a>
        <h1 className="text-2xl font-bold text-green-800">⛳ 提携ゴルフ場と連携</h1>
      </div>

      <div className="card bg-green-50 border-green-300 space-y-2">
        <p className="font-semibold text-green-800">現在の全機能を無料でご利用いただけます</p>
        <p className="text-sm text-green-600">
          ラウンド利用料のお支払いは必要ありません。ホームからそのままラウンドを開始してください。
        </p>
      </div>

      <a href="/round/new" className="btn-primary text-center block">
        ラウンドを開始する
      </a>
    </div>
  );
}
