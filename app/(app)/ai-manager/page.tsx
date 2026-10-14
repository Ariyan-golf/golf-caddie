import { AiManagerClient } from "./AiManagerClient";

// 現在の全機能を無料で提供しているため、会員限定のロック表示は持たない。
// （ベータモードの有無にかかわらず誰でも利用可。API 側の判定も lib/day-pass.ts の hasFullAccess で常に許可）
export default function AiManagerPage() {
  return (
    <div className="max-w-lg mx-auto p-4 space-y-4">
      <div className="pt-4">
        <a href="/" className="flex items-center gap-1 text-green-600 text-sm font-medium mb-2">
          ← ホームに戻る
        </a>
        <h1 className="text-2xl font-bold text-green-800">🤖 AIマネージャー</h1>
        <p className="text-base text-green-600 mt-1">
          ゴルフ場のコース情報をAIが案内します
        </p>
      </div>

      <AiManagerClient />
    </div>
  );
}
