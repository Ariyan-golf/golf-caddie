"use client";

import { MAX_ROUND_GUESTS } from "@/lib/roundGuests";

/**
 * ラウンド開始フローの「同伴者名」入力欄（最大 MAX_ROUND_GUESTS 人）。
 *
 * 全欄が空のままでもラウンドは開始できる（必須入力にしない）。
 * 空欄のときは round_guests への INSERT 自体を行わないため、
 * 同伴者を使わないユーザーの開始フローは従来と完全に同じ挙動になる。
 *
 * 値の配列は常に長さ MAX_ROUND_GUESTS 固定。添字がそのまま display_order になる。
 */
export function GuestNameFields({
  names,
  onChange,
  disabled = false,
}: {
  names: string[];
  onChange: (names: string[]) => void;
  disabled?: boolean;
}) {
  function setAt(index: number, value: string) {
    const next = [...names];
    next[index] = value;
    onChange(next);
  }

  return (
    <div className="space-y-2">
      <label className="label">同伴者（任意・最大{MAX_ROUND_GUESTS}人）</label>
      <p className="text-xs text-gray-400 leading-relaxed">
        名前を入れると、ラウンド中に同伴者の飛距離を代理で測れます。
        代理測定はあなたのスタッツ（クラブ別平均など）には一切入りません。
        空欄のままでも開始できます。
      </p>
      <div className="space-y-2">
        {Array.from({ length: MAX_ROUND_GUESTS }, (_, i) => (
          <input
            key={i}
            type="text"
            className="input"
            placeholder={`同伴者${i + 1}（例：たなかさん）`}
            value={names[i] ?? ""}
            onChange={(e) => setAt(i, e.target.value)}
            disabled={disabled}
            maxLength={20}
          />
        ))}
      </div>
      <p className="text-xs text-gray-400">
        あとからラウンド画面で追加・削除もできます
      </p>
    </div>
  );
}
