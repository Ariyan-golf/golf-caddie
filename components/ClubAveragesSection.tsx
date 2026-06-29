"use client";

import { useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { CLUBS, CLUB_LABELS } from "@/types";
import type { Club } from "@/types";

// 未分類（club 未選択）ショット1件分。距離計測は済んでいる（distance_meters NOT NULL）が
// 番手が未入力のラウンドショット。番手の事後選択・詳細編集・削除をこのセクションで行う。
export interface UnassignedShot {
  id: string;
  shot_number: number;
  distance_yards: number | null;
  distance_meters: number;
  created_at: string;
  club: string | null;
  ball_shape: string | null;
  ball_direction: string | null;
  lie_vertical: string | null;
  lie_horizontal: string | null;
  note: string | null;
  hole_id: string;
  hole_number: number;
  round_id: string;
  round_date: string;
  course_name: string;
}

// 詳細編集の選択肢（旧 UnfilledShotsSection から移植。CHECK 制約と一致）。
const BALL_SHAPE_OPTIONS = [
  "フック", "ドロー", "ストレート", "フェード", "スライス", "トップ", "チョロ",
] as const;
const BALL_DIRECTION_OPTIONS = ["左", "真っ直ぐ", "右"] as const;
const LIE_VERTICAL_OPTIONS  = ["フラット", "左足上がり", "左足下り"] as const;
const LIE_HORIZONTAL_OPTIONS = ["フラット", "爪先上がり", "爪先下がり"] as const;

type UnassignedDraftMap = Record<string, Partial<UnassignedShot>>;

interface ShotRecord {
  id: string;
  distance_yards: number;
  distance_meters: number;
  created_at: string;
  source: "shot" | "distance";
}

interface ClubStat {
  club: string;
  average_distance_meters: number;
  shot_count: number;
  shots: ShotRecord[];
}

function formatDate(iso: string) {
  return new Date(iso).toLocaleDateString("ja-JP", {
    month: "numeric",
    day: "numeric",
  });
}

// 番手の平均・本数の再計算（削除・付け替えで共通利用）。距離は distance_meters のメートル平均（小数1桁）。
function recalcStat(stat: ClubStat, shots: ShotRecord[]): ClubStat {
  const totalMeters = shots.reduce((sum, sh) => sum + sh.distance_meters, 0);
  return {
    ...stat,
    shots,
    shot_count: shots.length,
    average_distance_meters: shots.length
      ? parseFloat((totalMeters / shots.length).toFixed(1))
      : 0,
  };
}

// shots 由来は削除API（API側で論理削除）、shot_distances 由来は本人RLSで直接 論理削除。
async function deleteShot(shotId: string): Promise<boolean> {
  const res = await fetch("/api/stats/delete-shot", {
    method: "DELETE",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ shotId }),
  });
  return res.ok;
}

async function deleteDistance(id: string): Promise<boolean> {
  const supabase = createClient();
  const { error } = await supabase
    .from("shot_distances")
    .update({ deleted_at: new Date().toISOString() })
    .eq("id", id);
  return !error;
}

function SourceTag({ source }: { source: "shot" | "distance" }) {
  const isDistance = source === "distance";
  return (
    <span
      className={`text-[10px] shrink-0 px-1.5 py-0.5 rounded-full font-medium ${
        isDistance
          ? "bg-sky-100 text-sky-600"
          : "bg-green-100 text-green-600"
      }`}
    >
      {isDistance ? "計測" : "ラウンド"}
    </span>
  );
}

function ShotList({
  stat,
  onShotDeleted,
  onClubChange,
}: {
  stat: ClubStat;
  onShotDeleted: (club: string, shotId: string) => void;
  // ラウンド分(source==='shot')の番手付け替え。未分類行などでは未指定＝付け替え不可。
  onClubChange?: (fromClub: string, shot: ShotRecord, newClub: string) => Promise<boolean>;
}) {
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [savingId, setSavingId] = useState<string | null>(null);
  const [errorId, setErrorId] = useState<string | null>(null);

  async function handleDeleteShot(shot: ShotRecord) {
    if (!confirm("このショットデータを削除しますか？")) return;
    setDeletingId(shot.id);
    try {
      const ok =
        shot.source === "distance"
          ? await deleteDistance(shot.id)
          : await deleteShot(shot.id);
      if (ok) onShotDeleted(stat.club, shot.id);
    } finally {
      setDeletingId(null);
    }
  }

  async function handleClubSelect(shot: ShotRecord, newClub: string) {
    if (!onClubChange || newClub === stat.club) return;
    setSavingId(shot.id);
    setErrorId(null);
    const ok = await onClubChange(stat.club, shot, newClub);
    setSavingId(null);
    if (!ok) setErrorId(shot.id);
  }

  if (stat.shots.length === 0) {
    return <p className="text-xs text-green-300 py-1">ショットデータなし</p>;
  }

  return (
    <>
      {stat.shots.map((shot) => {
        // 付け替えselectはラウンド分(source==='shot')かつ付け替え可の番手行のみ。
        const canChangeClub = !!onClubChange && shot.source === "shot";
        return (
          <div
            key={shot.id}
            className="flex items-center gap-2 py-1 border-b border-green-50 last:border-0"
          >
            <span className="text-xs text-green-400 tabular-nums w-10 shrink-0">
              {formatDate(shot.created_at)}
            </span>
            <SourceTag source={shot.source} />
            <span className="text-xs font-semibold text-green-700 shrink-0 tabular-nums">
              {shot.distance_yards}y
              <span className="text-green-400 font-normal ml-1">
                ({Math.round(shot.distance_meters)}m)
              </span>
            </span>
            {canChangeClub ? (
              <select
                value={stat.club}
                onChange={(e) => handleClubSelect(shot, e.target.value)}
                disabled={savingId === shot.id}
                className={`flex-1 min-w-0 text-xs px-1.5 py-1 rounded-lg border bg-white text-green-800
                            disabled:opacity-60 ${errorId === shot.id ? "border-red-300" : "border-green-200"}`}
              >
                {CLUBS.map((c) => (
                  <option key={c} value={c}>{CLUB_LABELS[c]}</option>
                ))}
              </select>
            ) : (
              <span className="flex-1" />
            )}
            {savingId === shot.id && (
              <span className="text-xs text-green-400 shrink-0">保存中</span>
            )}
            {errorId === shot.id && savingId !== shot.id && (
              <span className="text-xs text-red-500 shrink-0">失敗</span>
            )}
            <button
              onClick={() => handleDeleteShot(shot)}
              disabled={deletingId === shot.id}
              className="shrink-0 text-xs px-2 py-0.5 rounded border border-red-200 text-red-400
                         hover:bg-red-50 hover:text-red-600 transition-colors disabled:opacity-40"
            >
              {deletingId === shot.id ? "削除中" : "削除"}
            </button>
          </div>
        );
      })}
    </>
  );
}

function ClubRow({
  stat,
  maxYards,
  onShotDeleted,
  onClubChange,
}: {
  stat: ClubStat;
  maxYards: number;
  onShotDeleted: (club: string, shotId: string) => void;
  onClubChange: (fromClub: string, shot: ShotRecord, newClub: string) => Promise<boolean>;
}) {
  const [expanded, setExpanded] = useState(false);
  const label = CLUB_LABELS[stat.club as Club] ?? stat.club;

  // 記録ゼロの番手：薄く「まだ記録なし」（棒グラフ・展開なし）。
  if (stat.shot_count === 0) {
    return (
      <div className="flex justify-between items-center text-sm gap-2 opacity-50">
        <span className="text-green-700 font-bold w-10 shrink-0">{label}</span>
        <span className="text-green-400 flex-1 text-xs">まだ記録なし</span>
      </div>
    );
  }

  const yards = Math.round(stat.average_distance_meters * 1.09361);
  const pct = Math.round((yards / maxYards) * 100);

  return (
    <div>
      {/* ── サマリー行 ── */}
      <button
        type="button"
        onClick={() => setExpanded((v) => !v)}
        className="w-full text-left"
      >
        <div className="flex justify-between items-center text-sm mb-1 gap-2">
          <span className="text-green-700 font-bold w-10 shrink-0">{label}</span>
          <span className="text-green-600 flex-1">
            <span className="font-bold">{yards}y</span>
            <span className="text-green-400 text-xs ml-1">
              ({Math.round(stat.average_distance_meters)}m · {stat.shot_count}打)
            </span>
          </span>
          <span className="text-green-400 text-xs shrink-0">
            {expanded ? "▲" : "▼"}
          </span>
        </div>
        <div className="h-2 bg-green-100 rounded-full overflow-hidden">
          <div
            className="h-full bg-green-500 rounded-full transition-all"
            style={{ width: `${pct}%` }}
          />
        </div>
      </button>

      {/* ── 個別記録一覧（展開時） ── */}
      {expanded && (
        <div className="mt-2 ml-10 space-y-1 border-l-2 border-green-100 pl-3">
          <ShotList stat={stat} onShotDeleted={onShotDeleted} onClubChange={onClubChange} />
        </div>
      )}
    </div>
  );
}

// 詳細編集の1項目（チップ選択）。旧 UnfilledShotsSection から移植。
function ChipRow({
  label, options, value, onChange,
}: {
  label: string;
  options: readonly string[];
  value: string | null;
  onChange: (v: string | null) => void;
}) {
  return (
    <div>
      <p className="text-xs font-semibold text-green-600 mb-1">{label}</p>
      <div className="flex flex-wrap gap-1">
        {options.map((opt) => {
          const active = value === opt;
          return (
            <button
              key={opt}
              onClick={() => onChange(active ? null : opt)}
              className={`text-xs px-2.5 py-1.5 rounded-lg border font-medium transition-colors ${
                active
                  ? "bg-green-600 border-green-600 text-white"
                  : "bg-white border-green-200 text-green-700 hover:bg-green-50"
              }`}
            >
              {opt}
            </button>
          );
        })}
      </div>
    </div>
  );
}

// 未分類ショット1件分の行（番手の事後選択・詳細編集・削除）。
// 編集中の値と各種 state（drafts / expanded / saving / deleting）は親
// ClubAveragesSection が単一 state で保持し、本コンポーネントは表示と通知のみ担う。
function UnassignedShotRow({
  shot, draft, expanded, saving, deleting,
  onToggleExpand, onDraftChange, onSave, onDelete,
}: {
  shot: UnassignedShot;
  draft: Partial<UnassignedShot>;
  expanded: boolean;
  saving: boolean;
  deleting: boolean;
  onToggleExpand: () => void;
  onDraftChange: (patch: Partial<UnassignedShot>) => void;
  onSave: () => void;
  onDelete: () => void;
}) {
  const club = (draft.club ?? shot.club) as string | null;
  return (
    <div className="bg-green-50 rounded-lg p-2.5 space-y-2">
      <p className="text-[11px] text-green-500">
        {new Date(shot.round_date).toLocaleDateString("ja-JP")} · {shot.course_name} · {shot.hole_number}H
      </p>
      <div className="flex items-center gap-2">
        <span className="text-xs font-medium text-green-600 w-12 shrink-0">
          第{shot.shot_number}打
        </span>
        <span className="text-xs text-green-500 tabular-nums w-16 shrink-0">
          {shot.distance_yards != null ? `${shot.distance_yards}y` : "—"}
          <span className="text-green-400 ml-1">({Math.round(shot.distance_meters)}m)</span>
        </span>
        <select
          value={club ?? ""}
          onChange={(e) => onDraftChange({ club: e.target.value || null })}
          className="flex-1 min-w-0 text-sm px-2 py-1.5 rounded-lg border border-green-200 bg-white text-green-800"
        >
          <option value="">クラブを選択</option>
          {CLUBS.map((c) => (
            <option key={c} value={c}>{CLUB_LABELS[c as Club]}</option>
          ))}
        </select>
        <button
          onClick={onToggleExpand}
          className="text-green-500 text-xs px-2 py-1.5 shrink-0"
        >
          {expanded ? "▲ 詳細" : "▼ 詳細"}
        </button>
      </div>

      {expanded && (
        <div className="space-y-2 pt-1.5 border-t border-green-100">
          <ChipRow
            label="球筋"
            options={BALL_SHAPE_OPTIONS}
            value={(draft.ball_shape ?? shot.ball_shape) as string | null}
            onChange={(v) => onDraftChange({ ball_shape: v })}
          />
          <ChipRow
            label="方向"
            options={BALL_DIRECTION_OPTIONS}
            value={(draft.ball_direction ?? shot.ball_direction) as string | null}
            onChange={(v) => onDraftChange({ ball_direction: v })}
          />
          <ChipRow
            label="ライ縦"
            options={LIE_VERTICAL_OPTIONS}
            value={(draft.lie_vertical ?? shot.lie_vertical) as string | null}
            onChange={(v) => onDraftChange({ lie_vertical: v })}
          />
          <ChipRow
            label="ライ横"
            options={LIE_HORIZONTAL_OPTIONS}
            value={(draft.lie_horizontal ?? shot.lie_horizontal) as string | null}
            onChange={(v) => onDraftChange({ lie_horizontal: v })}
          />
          <div>
            <p className="text-xs font-semibold text-green-600 mb-1">メモ</p>
            <textarea
              value={(draft.note ?? shot.note) ?? ""}
              onChange={(e) => onDraftChange({ note: e.target.value || null })}
              rows={2}
              className="w-full text-sm px-2 py-1.5 rounded-lg border border-green-200 bg-white text-green-800"
            />
          </div>
        </div>
      )}

      <div className="flex items-center gap-2">
        <button
          onClick={onSave}
          disabled={saving || !club}
          className="flex-1 py-2 rounded-lg bg-green-600 hover:bg-green-700 active:bg-green-800
                     text-white text-xs font-bold transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
        >
          {saving ? "保存中..." : "保存"}
        </button>
        <button
          onClick={onDelete}
          disabled={deleting}
          className="shrink-0 text-xs px-3 py-2 rounded-lg border border-red-200 text-red-400
                     hover:bg-red-50 hover:text-red-600 transition-colors disabled:opacity-40"
        >
          {deleting ? "削除中" : "削除"}
        </button>
      </div>
    </div>
  );
}

export function ClubAveragesSection({
  initialStats,
  initialUnassigned,
}: {
  initialStats: ClubStat[];
  initialUnassigned: UnassignedShot[];
}) {
  const [stats, setStats] = useState<ClubStat[]>(initialStats);
  // 未記録番手の折りたたみ（ページ内ローカルstateのみ・保存不要）。
  const [showUnrecorded, setShowUnrecorded] = useState(false);

  // 未分類ショットは「番手別平均」と同じこのコンポーネントの単一 state で管理する。
  // 件数表示もリストも下の unassigned から導出するため、保存・削除後に件数とリストが
  // ずれることがない（旧 UnfilledShotsSection との二重管理・非同期バグを解消）。
  const [unassigned, setUnassigned] = useState<UnassignedShot[]>(initialUnassigned);
  const [drafts, setDrafts] = useState<UnassignedDraftMap>({});
  const [expanded, setExpanded] = useState<Record<string, boolean>>({});
  const [savingId, setSavingId] = useState<string | null>(null);
  const [deletingId, setDeletingId] = useState<string | null>(null);

  const totalClubs = stats.length;
  const recordedCount = stats.filter((s) => s.shot_count > 0).length;

  // 棒グラフのスケールはデータのある番手の最大平均で正規化。
  const withData = stats.filter((s) => s.shot_count > 0);
  const maxYards = withData.length
    ? Math.round(Math.max(...withData.map((s) => s.average_distance_meters)) * 1.09361)
    : 1;

  function handleShotDeleted(club: string, shotId: string) {
    setStats((prev) =>
      prev.map((s) =>
        // 番手は0件でも行は残し「まだ記録なし」表示に戻す。
        s.club === club ? recalcStat(s, s.shots.filter((sh) => sh.id !== shotId)) : s
      )
    );
  }

  // ラウンド分(source==='shot')の番手付け替え。楽観更新＋失敗時ロールバック。
  async function handleClubChange(
    fromClub: string,
    shot: ShotRecord,
    newClub: string
  ): Promise<boolean> {
    if (newClub === fromClub) return true;
    const snapshot = stats;

    // 楽観更新：元番手から外し、新番手へ移し、両番手を再計算。
    setStats((prev) =>
      prev.map((s) => {
        if (s.club === fromClub) {
          return recalcStat(s, s.shots.filter((sh) => sh.id !== shot.id));
        }
        if (s.club === newClub) {
          const merged = [{ ...shot }, ...s.shots].sort((a, b) =>
            b.created_at.localeCompare(a.created_at)
          );
          return recalcStat(s, merged);
        }
        return s;
      })
    );

    const supabase = createClient();
    const { error } = await supabase
      .from("shots")
      .update({ club: newClub, club_input_at: "事後" })
      .eq("id", shot.id);

    if (error) {
      console.error("[stats] club change error:", error.message);
      setStats(snapshot);
      return false;
    }
    return true;
  }

  // ── 未分類ショットの編集（旧 UnfilledShotsSection から移植）─────────────
  function setDraft(id: string, patch: Partial<UnassignedShot>) {
    setDrafts((prev) => ({ ...prev, [id]: { ...prev[id], ...patch } }));
  }

  // 番手＋詳細を一括保存。番手が付いたら未分類リストから外す（club 非null になるため）。
  async function saveUnassigned(shot: UnassignedShot) {
    const draft = drafts[shot.id] ?? {};
    setSavingId(shot.id);
    const supabase = createClient();
    const payload = {
      club: draft.club ?? shot.club,
      // このスタッツ画面での番手割り当ては常に事後入力。付け替え(handleClubChange)が
      // 既に "事後" を付けているのと挙動を揃え、初回割り当てだけ空になる食い違いを防ぐ。
      // （保存ボタンは番手選択時のみ活性なので、保存時は必ず club が入っている）
      club_input_at: "事後",
      ball_shape: draft.ball_shape ?? shot.ball_shape,
      ball_direction: draft.ball_direction ?? shot.ball_direction,
      lie_vertical: draft.lie_vertical ?? shot.lie_vertical,
      lie_horizontal: draft.lie_horizontal ?? shot.lie_horizontal,
      note: draft.note ?? shot.note,
    };
    const { error } = await supabase.from("shots").update(payload).eq("id", shot.id);
    setSavingId(null);
    if (error) {
      console.error("[unassigned] save error:", error.message);
      return;
    }
    if (payload.club) {
      setUnassigned((prev) => prev.filter((x) => x.id !== shot.id));
      setDrafts((prev) => { const n = { ...prev }; delete n[shot.id]; return n; });
    } else {
      setUnassigned((prev) => prev.map((x) => (x.id === shot.id ? { ...x, ...payload } : x)));
    }
  }

  // 削除は既存の番手別と同じ /api/stats/delete-shot（RLS で holes→rounds.user_id を強制）。
  async function deleteUnassigned(shot: UnassignedShot) {
    if (!confirm("このショットデータを削除しますか？")) return;
    setDeletingId(shot.id);
    const ok = await deleteShot(shot.id);
    setDeletingId(null);
    if (ok) {
      setUnassigned((prev) => prev.filter((x) => x.id !== shot.id));
      setDrafts((prev) => { const n = { ...prev }; delete n[shot.id]; return n; });
    }
  }

  // 記録済みが0件のときだけ従来どおり全番手を最初から表示（空カード回避）。
  const showAllFromStart = recordedCount === 0;
  const recordedRows = showAllFromStart ? stats : stats.filter((s) => s.shot_count > 0);
  const unrecordedRows = showAllFromStart ? [] : stats.filter((s) => s.shot_count === 0);

  return (
    <div className="card">
      <div className="flex items-center justify-between mb-1">
        <h2 className="font-semibold text-green-800">番手別平均飛距離</h2>
        <span className="text-xs text-green-500 tabular-nums">
          {recordedCount} / {totalClubs} 番手 記録済み
        </span>
      </div>
      <p className="text-xs text-green-400 mb-3">番手をタップすると個別記録が開きます</p>
      <div className="space-y-3">
        {recordedRows.map((stat) => (
          <ClubRow
            key={stat.club}
            stat={stat}
            maxYards={maxYards}
            onShotDeleted={handleShotDeleted}
            onClubChange={handleClubChange}
          />
        ))}
        {unrecordedRows.length > 0 && (
          <>
            <button
              type="button"
              onClick={() => setShowUnrecorded((v) => !v)}
              className="w-full text-center text-xs text-green-500 hover:text-green-700 py-1 transition-colors"
            >
              {showUnrecorded ? "未記録の番手を隠す ▲" : "未記録の番手を表示 ▼"}
            </button>
            {showUnrecorded &&
              unrecordedRows.map((stat) => (
                <ClubRow
                  key={stat.club}
                  stat={stat}
                  maxYards={maxYards}
                  onShotDeleted={handleShotDeleted}
                  onClubChange={handleClubChange}
                />
              ))}
          </>
        )}
      </div>
      <p className="text-[11px] text-green-400 mt-3">
        ラウンド中の距離計測で番手ごとの飛距離が貯まります
      </p>

      {/* ── 未分類（番手未入力）：番手の事後選択・詳細編集・削除の唯一の入口 ── */}
      {unassigned.length > 0 && (
        <div className="mt-4 pt-4 border-t border-green-100 space-y-3">
          <div className="flex items-center justify-between">
            <h3 className="font-semibold text-green-800">未分類（番手未入力）</h3>
            <span className="text-xs text-green-500 tabular-nums">{unassigned.length} 件</span>
          </div>
          <p className="text-[11px] text-green-400">
            距離計測だけ済んだショットです。番手を選んで保存すると番手別平均へ反映されます。
          </p>
          {unassigned.map((shot) => (
            <UnassignedShotRow
              key={shot.id}
              shot={shot}
              draft={drafts[shot.id] ?? {}}
              expanded={!!expanded[shot.id]}
              saving={savingId === shot.id}
              deleting={deletingId === shot.id}
              onToggleExpand={() => setExpanded((prev) => ({ ...prev, [shot.id]: !prev[shot.id] }))}
              onDraftChange={(patch) => setDraft(shot.id, patch)}
              onSave={() => saveUnassigned(shot)}
              onDelete={() => deleteUnassigned(shot)}
            />
          ))}
        </div>
      )}
    </div>
  );
}
