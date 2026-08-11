"use client";

import { useState } from "react";
import type { GuestShot, RoundGuest } from "@/types";
import { MAX_ROUND_GUESTS } from "@/lib/roundGuests";

/**
 * 同伴者の代理測定結果の一覧＋追加・削除UI（表示専用。通信は親の HoleRecorder が行う）。
 *
 * - 同伴者が0人のラウンドでは一覧セクションを描画しない（要件）。
 *   ただしラウンド中に同伴者を足せる導線が必要なため、0人のときは
 *   控えめな「＋ 同伴者を追加」テキストボタンだけを出す。
 * - 削除はすべて論理削除（deleted_at）。親が更新し、ここには生存分だけが渡る。
 * - 表示する飛距離は guest_shots の値のみ。shots は参照しない。
 */
export function GuestPanel({
  guests,
  guestShots,
  holeNumberById,
  onAddGuest,
  onDeleteGuest,
  onDeleteShot,
}: {
  guests: RoundGuest[];
  guestShots: GuestShot[];
  holeNumberById: Record<string, number>;
  onAddGuest: (name: string) => Promise<boolean>;
  onDeleteGuest: (guest: RoundGuest) => Promise<void>;
  onDeleteShot: (shot: GuestShot) => Promise<void>;
}) {
  const [adding, setAdding] = useState(false);
  const [newName, setNewName] = useState("");
  const [saving, setSaving] = useState(false);
  const [busyId, setBusyId] = useState<string | null>(null);

  const canAdd = guests.length < MAX_ROUND_GUESTS;

  async function handleAdd() {
    const name = newName.trim();
    if (!name || saving) return;
    setSaving(true);
    const ok = await onAddGuest(name);
    setSaving(false);
    if (ok) {
      setNewName("");
      setAdding(false);
    }
  }

  async function handleDeleteGuest(guest: RoundGuest) {
    if (!confirm(`「${guest.name}さん」と、その測定記録をすべて非表示にしますか？`)) return;
    setBusyId(guest.id);
    await onDeleteGuest(guest);
    setBusyId(null);
  }

  async function handleDeleteShot(shot: GuestShot) {
    if (!confirm("この測定記録を削除しますか？")) return;
    setBusyId(shot.id);
    await onDeleteShot(shot);
    setBusyId(null);
  }

  const addForm = (
    <div className="flex items-center gap-2">
      <input
        type="text"
        className="input flex-1"
        placeholder="同伴者の名前"
        value={newName}
        onChange={(e) => setNewName(e.target.value)}
        maxLength={20}
        autoFocus
      />
      <button
        type="button"
        onClick={handleAdd}
        disabled={saving || !newName.trim()}
        className="px-4 py-2 rounded-xl bg-green-600 text-white text-sm font-bold
                   disabled:opacity-50 disabled:cursor-not-allowed active:scale-95"
      >
        {saving ? "追加中..." : "追加"}
      </button>
      <button
        type="button"
        onClick={() => { setAdding(false); setNewName(""); }}
        className="text-sm text-gray-500 underline px-1"
      >
        やめる
      </button>
    </div>
  );

  // 同伴者0人：一覧セクションは出さず、追加導線だけを控えめに置く。
  if (guests.length === 0) {
    return (
      <div className="pt-1">
        {adding ? (
          addForm
        ) : (
          <button
            type="button"
            onClick={() => setAdding(true)}
            className="block mx-auto text-sm text-gray-400 hover:text-green-600 underline py-1"
          >
            ＋ 同伴者を追加して代理測定する
          </button>
        )}
      </div>
    );
  }

  return (
    <div className="card space-y-3">
      <div className="flex items-center justify-between">
        <h2 className="font-bold text-green-800">👥 同伴者の飛距離</h2>
        <span className="text-xs text-gray-400">
          {guests.length}/{MAX_ROUND_GUESTS}人
        </span>
      </div>

      <p className="text-xs text-gray-400 leading-relaxed">
        代理測定の記録です。あなたのスタッツ・クラブ別平均には含まれません。
      </p>

      <div className="space-y-3">
        {guests.map((guest) => {
          const shots = guestShots.filter((s) => s.guest_id === guest.id);
          return (
            <div key={guest.id} className="border border-green-100 rounded-xl p-3 space-y-2">
              <div className="flex items-center justify-between gap-2">
                <p className="font-bold text-green-800 truncate">
                  {guest.name}さん
                  <span className="ml-2 text-xs font-normal text-gray-400 tabular-nums">
                    {shots.length}球
                  </span>
                </p>
                <button
                  type="button"
                  onClick={() => handleDeleteGuest(guest)}
                  disabled={busyId === guest.id}
                  className="text-xs text-red-500 hover:text-red-700 underline shrink-0
                             disabled:opacity-50"
                >
                  この同伴者を削除
                </button>
              </div>

              {shots.length === 0 ? (
                <p className="text-sm text-gray-400">まだ記録がありません</p>
              ) : (
                <ul className="space-y-1">
                  {shots.map((shot) => {
                    const holeNumber = shot.hole_id ? holeNumberById[shot.hole_id] : undefined;
                    return (
                      <li
                        key={shot.id}
                        className="flex items-center justify-between gap-2 text-sm"
                      >
                        <span className="text-gray-600 tabular-nums">
                          <span className="inline-block w-12 text-green-600 font-medium">
                            {holeNumber != null ? `${holeNumber}H` : "—"}
                          </span>
                          <span className="font-bold text-green-900 text-base">
                            {shot.distance_yards ?? "—"}
                          </span>
                          ヤード
                          {shot.distance_meters != null && (
                            <span className="text-gray-400 ml-1">
                              （{Number(shot.distance_meters)}m）
                            </span>
                          )}
                        </span>
                        <button
                          type="button"
                          onClick={() => handleDeleteShot(shot)}
                          disabled={busyId === shot.id}
                          className="text-xs text-red-500 hover:text-red-700 underline shrink-0
                                     disabled:opacity-50"
                        >
                          削除
                        </button>
                      </li>
                    );
                  })}
                </ul>
              )}
            </div>
          );
        })}
      </div>

      {adding ? (
        addForm
      ) : canAdd ? (
        <button
          type="button"
          onClick={() => setAdding(true)}
          className="block mx-auto text-sm text-green-600 hover:text-green-800 underline py-1"
        >
          ＋ 同伴者を追加
        </button>
      ) : (
        <p className="text-center text-xs text-gray-400">
          同伴者は最大{MAX_ROUND_GUESTS}人までです
        </p>
      )}
    </div>
  );
}
