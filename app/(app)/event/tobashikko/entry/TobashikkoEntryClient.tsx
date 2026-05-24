"use client";

import { useMemo, useState } from "react";

export interface DriverShot {
  id: string;
  distance_yards: number;
  hole_number: number;
  course_name: string;
  date: string;
}

export interface EntryRow {
  id:           string;
  shot_id:      string;
  driver_brand: string | null;
  driver_model: string | null;
  shaft_brand:  string | null;
  shaft_model:  string | null;
  ball_brand:   string | null;
  ball_model:   string | null;
}

// ── メーカープルダウン候補（カテゴリ別） ─────────────────────────
const DRIVER_BRANDS = [
  "テーラーメイド", "キャロウェイ", "ピン", "タイトリスト",
  "ダンロップ・スリクソン", "ブリヂストン", "ミズノ", "本間",
  "ヤマハ", "コブラ",
];
const SHAFT_BRANDS = [
  "フジクラ", "三菱ケミカル", "グラファイトデザイン",
  "USTマミヤ", "グラフ", "純正",
];
const BALL_BRANDS = [
  "テーラーメイド", "キャロウェイ", "タイトリスト",
  "ダンロップ・スリクソン", "ブリヂストン", "本間", "スリクソン",
];

// ── 編集中6フィールドの型 ─────────────────────────────────────
type FormValues = {
  driver_brand: string; driver_model: string;
  shaft_brand:  string; shaft_model:  string;
  ball_brand:   string; ball_model:   string;
};
const FIELD_KEYS: (keyof FormValues)[] = [
  "driver_brand", "driver_model",
  "shaft_brand",  "shaft_model",
  "ball_brand",   "ball_model",
];

function entryToForm(e: EntryRow): FormValues {
  return {
    driver_brand: e.driver_brand ?? "",
    driver_model: e.driver_model ?? "",
    shaft_brand:  e.shaft_brand  ?? "",
    shaft_model:  e.shaft_model  ?? "",
    ball_brand:   e.ball_brand   ?? "",
    ball_model:   e.ball_model   ?? "",
  };
}

function fmtDate(s: string) {
  return new Date(s).toLocaleDateString("ja-JP");
}

function ShotLine({ shot }: { shot: DriverShot }) {
  return (
    <div className="text-sm text-green-800">
      <span className="font-bold tabular-nums">{shot.distance_yards}y</span>
      <span className="text-green-500 mx-1.5">/</span>
      <span>{shot.course_name} H{shot.hole_number}</span>
      <span className="text-xs text-green-400 ml-1.5">{fmtDate(shot.date)}</span>
    </div>
  );
}

export function TobashikkoEntryClient({
  driverShots,
  entries:       initialEntries,
  hiddenShotIds: initialHiddenShotIds,
}: {
  driverShots:   DriverShot[];
  entries:       EntryRow[];
  hiddenShotIds: string[];
}) {
  const [entries,       setEntries]       = useState<EntryRow[]>(initialEntries);
  const [hiddenShotIds, setHiddenShotIds] = useState<string[]>(initialHiddenShotIds);
  const [busyShotId,    setBusyShotId]    = useState<string | null>(null);
  const [topError,      setTopError]      = useState<string>("");
  const [showHidden,    setShowHidden]    = useState(false);

  const entryByShotId = useMemo(
    () => new Map(entries.map((e) => [e.shot_id, e])),
    [entries]
  );
  const shotById = useMemo(
    () => new Map(driverShots.map((s) => [s.id, s])),
    [driverShots]
  );
  const hiddenSet = useMemo(() => new Set(hiddenShotIds), [hiddenShotIds]);

  // 「まだエントリーしていない」かつ「非表示にしていない」ドライバーショットのみ。
  const entryable = driverShots.filter(
    (s) => !entryByShotId.has(s.id) && !hiddenSet.has(s.id)
  );
  const entered = entries
    .map((e) => ({ entry: e, shot: shotById.get(e.shot_id) }))
    .filter((row): row is { entry: EntryRow; shot: DriverShot } => row.shot != null)
    .sort((a, b) => b.shot.distance_yards - a.shot.distance_yards);
  // 非表示一覧（飛距離降順）。driverShots に存在するものだけ表示。
  const hiddenShots = driverShots
    .filter((s) => hiddenSet.has(s.id))
    .sort((a, b) => b.distance_yards - a.distance_yards);

  async function handleEntry(shotId: string) {
    setTopError("");
    setBusyShotId(shotId);
    try {
      const res = await fetch("/api/event/tobashikko/entry", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ shot_id: shotId }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok || !data.entry) {
        setTopError(data.error ?? "エントリーに失敗しました");
        return;
      }
      setEntries((prev) => [...prev, data.entry as EntryRow]);
    } finally {
      setBusyShotId(null);
    }
  }

  async function handleHide(shotId: string) {
    if (!confirm("このショットはエントリーを見送ります。スタッツ画面の記録はそのまま残ります。よろしいですか？")) return;
    setTopError("");
    setBusyShotId(shotId);
    try {
      const res = await fetch("/api/event/tobashikko/hidden", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ shot_id: shotId }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        setTopError(data.error ?? "見送りにできませんでした");
        return;
      }
      setHiddenShotIds((prev) => (prev.includes(shotId) ? prev : [...prev, shotId]));
    } finally {
      setBusyShotId(null);
    }
  }

  async function handleUnhide(shotId: string) {
    setTopError("");
    setBusyShotId(shotId);
    try {
      const res = await fetch(`/api/event/tobashikko/hidden/${shotId}`, { method: "DELETE" });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        setTopError(data.error ?? "元に戻せませんでした");
        return;
      }
      setHiddenShotIds((prev) => prev.filter((id) => id !== shotId));
    } finally {
      setBusyShotId(null);
    }
  }

  function handleUpdated(updated: EntryRow) {
    setEntries((prev) => prev.map((e) => (e.id === updated.id ? updated : e)));
  }

  function handleDeleted(id: string) {
    setEntries((prev) => prev.filter((e) => e.id !== id));
  }

  return (
    <>
      {topError && (
        <div className="bg-red-50 border border-red-200 text-red-600 rounded-xl p-3 text-sm">
          {topError}
        </div>
      )}

      {/* セクション1: エントリー済み（上に表示） */}
      <section className="card space-y-3">
        <h2 className="font-semibold text-green-800">
          エントリー済み（使用ドライバー・シャフト・ボールを入力）
        </h2>
        {entered.length === 0 ? (
          <p className="text-sm text-green-500 py-2">エントリー済みのショットはまだありません。</p>
        ) : (
          <div className="space-y-4">
            {entered.map(({ entry, shot }) => (
              <EnteredRow
                key={entry.id}
                entry={entry}
                shot={shot}
                onUpdated={handleUpdated}
                onDeleted={handleDeleted}
              />
            ))}
          </div>
        )}
      </section>

      {/* セクション2: エントリーできるショット（下に表示） */}
      <section className="card space-y-3">
        <h2 className="font-semibold text-green-800">エントリーできるショット</h2>
        {entryable.length === 0 ? (
          <p className="text-sm text-green-500 leading-relaxed py-2">
            エントリーできるショットがありません。<br />
            ラウンドでドライバーの飛距離を記録するとここに表示されます。
          </p>
        ) : (
          <div className="space-y-2">
            {entryable.map((shot) => (
              <div
                key={shot.id}
                className="flex items-center justify-between gap-2 py-2 border-b border-green-50 last:border-0"
              >
                <ShotLine shot={shot} />
                <div className="flex gap-1.5 flex-shrink-0">
                  <button
                    onClick={() => handleEntry(shot.id)}
                    disabled={busyShotId === shot.id}
                    className="bg-green-600 hover:bg-green-700 active:bg-green-800 disabled:opacity-50 text-white text-xs font-semibold px-3 py-2 rounded-lg"
                  >
                    {busyShotId === shot.id ? "..." : "エントリー"}
                  </button>
                  <button
                    onClick={() => handleHide(shot.id)}
                    disabled={busyShotId === shot.id}
                    className="bg-gray-200 hover:bg-gray-300 disabled:opacity-50 text-gray-600 text-xs font-medium px-2.5 py-2 rounded-lg"
                    title="このショットのエントリーを見送る"
                  >
                    見送る
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}

        {/* 非表示にしたショットの展開トグル */}
        {hiddenShots.length > 0 && (
          <div className="pt-2 border-t border-green-50">
            <button
              onClick={() => setShowHidden((v) => !v)}
              className="text-xs text-green-600 underline"
            >
              {showHidden
                ? `見送ったショットを隠す（${hiddenShots.length}件）`
                : `見送ったショットを表示（${hiddenShots.length}件）`}
            </button>
            {showHidden && (
              <div className="mt-3 space-y-2">
                {hiddenShots.map((shot) => (
                  <div
                    key={shot.id}
                    className="flex items-center justify-between gap-2 py-1.5 border-b border-green-50 last:border-0"
                  >
                    <ShotLine shot={shot} />
                    <button
                      onClick={() => handleUnhide(shot.id)}
                      disabled={busyShotId === shot.id}
                      className="bg-gray-200 hover:bg-gray-300 disabled:opacity-50 text-gray-700 text-xs font-medium px-2.5 py-1.5 rounded-lg flex-shrink-0"
                    >
                      {busyShotId === shot.id ? "..." : "元に戻す"}
                    </button>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}
      </section>
    </>
  );
}

// ── エントリー済み1行（編集UI付き） ─────────────────────────────────
function EnteredRow({
  entry, shot, onUpdated, onDeleted,
}: {
  entry:     EntryRow;
  shot:      DriverShot;
  onUpdated: (e: EntryRow) => void;
  onDeleted: (id: string) => void;
}) {
  const [values,   setValues]   = useState<FormValues>(() => entryToForm(entry));
  const [baseline, setBaseline] = useState<FormValues>(() => entryToForm(entry));
  const [saving,   setSaving]   = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [errMsg,   setErrMsg]   = useState<string>("");
  // 「保存しました」バッジ表示フラグ。編集に触れたら自動で消す。
  const [savedJustNow, setSavedJustNow] = useState(false);

  const isDirty = useMemo(
    () => FIELD_KEYS.some((k) => values[k] !== baseline[k]),
    [values, baseline]
  );

  function updateField<K extends keyof FormValues>(key: K, val: string) {
    setValues((prev) => ({ ...prev, [key]: val }));
    if (savedJustNow) setSavedJustNow(false);
    if (errMsg) setErrMsg("");
  }

  async function handleSave() {
    setErrMsg("");
    setSaving(true);
    try {
      // 空欄は null として送る（API 側でも trim→空なら null に正規化される）。
      const payload: Record<string, string | null> = {};
      for (const k of FIELD_KEYS) {
        const v = values[k].trim();
        payload[k] = v === "" ? null : v;
      }

      const res = await fetch(`/api/event/tobashikko/entry/${entry.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok || !data.entry) {
        setErrMsg(data.error ?? "保存に失敗しました");
        return;
      }
      const next = entryToForm(data.entry as EntryRow);
      onUpdated(data.entry as EntryRow);
      setBaseline(next);
      setValues(next);          // server で trim 済の値で UI も同期
      setSavedJustNow(true);
    } finally {
      setSaving(false);
    }
  }

  async function handleDelete() {
    if (!confirm("このエントリーを取り消しますか？")) return;
    setDeleting(true);
    setErrMsg("");
    try {
      const res = await fetch(`/api/event/tobashikko/entry/${entry.id}`, { method: "DELETE" });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        setErrMsg(data.error ?? "削除に失敗しました");
        return;
      }
      onDeleted(entry.id);
    } finally {
      setDeleting(false);
    }
  }

  // 保存ボタンの見た目
  const isSavedState = savedJustNow && !isDirty;
  const saveClass = isSavedState
    ? "bg-green-200 text-green-700 cursor-default"
    : "bg-green-600 hover:bg-green-700 text-white";
  const saveLabel = saving ? "保存中..." : isSavedState ? "保存済み" : "保存";

  return (
    <div className="border border-green-100 rounded-xl p-3 space-y-4 bg-green-50/40">
      <div className="flex items-center justify-between gap-2">
        <ShotLine shot={shot} />
        <span className="text-[10px] bg-green-100 text-green-700 font-semibold px-2 py-0.5 rounded-full flex-shrink-0">
          エントリー済み
        </span>
      </div>

      {/* 使用ドライバー */}
      <fieldset className="space-y-2">
        <legend className="text-sm font-semibold text-green-800">使用ドライバー</legend>
        <BrandPicker
          label="メーカー"
          options={DRIVER_BRANDS}
          value={values.driver_brand}
          onChange={(v) => updateField("driver_brand", v)}
        />
        <TextField
          label="機種名"
          placeholder="例：Qi10LS 9.5度"
          value={values.driver_model}
          onChange={(v) => updateField("driver_model", v)}
        />
      </fieldset>

      {/* 使用シャフト */}
      <fieldset className="space-y-2">
        <legend className="text-sm font-semibold text-green-800">使用シャフト（任意）</legend>
        <BrandPicker
          label="メーカー"
          options={SHAFT_BRANDS}
          value={values.shaft_brand}
          onChange={(v) => updateField("shaft_brand", v)}
        />
        <TextField
          label="機種名"
          placeholder="例：ベンタスTR"
          value={values.shaft_model}
          onChange={(v) => updateField("shaft_model", v)}
        />
      </fieldset>

      {/* 使用ボール */}
      <fieldset className="space-y-2">
        <legend className="text-sm font-semibold text-green-800">使用ボール</legend>
        <BrandPicker
          label="メーカー"
          options={BALL_BRANDS}
          value={values.ball_brand}
          onChange={(v) => updateField("ball_brand", v)}
        />
        <TextField
          label="機種名"
          placeholder="例：TOUR B X"
          value={values.ball_model}
          onChange={(v) => updateField("ball_model", v)}
        />
      </fieldset>

      {errMsg && <p className="text-xs text-red-600">{errMsg}</p>}
      {isSavedState && (
        <div className="flex items-center gap-1.5 bg-green-100 border border-green-300 text-green-800 rounded-lg px-3 py-2 text-sm font-semibold">
          <span aria-hidden="true">✓</span>
          <span>保存しました</span>
        </div>
      )}

      <div className="flex gap-2 pt-1">
        <button
          onClick={handleSave}
          disabled={saving || isSavedState}
          className={`flex-1 disabled:opacity-50 text-sm font-semibold py-2 rounded-xl transition-colors ${saveClass}`}
        >
          {saveLabel}
        </button>
        <button
          onClick={handleDelete}
          disabled={deleting}
          className="bg-gray-200 hover:bg-gray-300 disabled:opacity-50 text-gray-700 text-xs font-medium px-3 py-2 rounded-xl"
        >
          {deleting ? "..." : "エントリー取消"}
        </button>
      </div>
    </div>
  );
}

// ── BrandPicker: プルダウン + 常時表示テキスト欄 ─────────────────
// プルダウンで選ぶとテキスト欄に値が流れ込み、ユーザーは自由に書き換え可。
// 保存時はテキスト欄の値が真。プルダウンは「候補にあれば」その項目を反映表示する。
function BrandPicker({
  label, options, value, onChange,
}: {
  label:    string;
  options:  string[];
  value:    string;
  onChange: (v: string) => void;
}) {
  const selectVal = options.includes(value) ? value : "";
  return (
    <div>
      <label className="label">{label}</label>
      <select
        value={selectVal}
        onChange={(e) => onChange(e.target.value)}
        className="input"
      >
        <option value="">未選択</option>
        {options.map((b) => (
          <option key={b} value={b}>{b}</option>
        ))}
      </select>
      <input
        type="text"
        className="input mt-2"
        placeholder="メーカー名（プルダウンに無いものは直接入力）"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        maxLength={100}
      />
    </div>
  );
}

function TextField({
  label, placeholder, value, onChange,
}: {
  label:       string;
  placeholder: string;
  value:       string;
  onChange:    (v: string) => void;
}) {
  return (
    <div>
      <label className="label">{label}</label>
      <input
        type="text"
        className="input"
        placeholder={placeholder}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        maxLength={100}
      />
    </div>
  );
}
