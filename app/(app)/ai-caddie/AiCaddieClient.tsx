"use client";

import { useState, useEffect, useRef, useCallback } from "react";
import type { Location } from "@/types";
import { calculateDistance, metersToYards } from "@/lib/distance";

type CharacterId = "mika" | "yoshi" | "sage" | "taka";

interface CharDef {
  id: CharacterId;
  name: string;
  icon: string;
  tagline: string;
  desc: string;
  card: string;
  bubble: string;
  accent: string;
  tag: string;
  triangleColor: string;
  btn: string;
}

const CHARS: CharDef[] = [
  {
    id: "mika",
    name: "ミカちゃん",
    icon: "👧",
    tagline: "元気・初心者向け",
    desc: "明るく優しく、初心者でもわかりやすく教えてくれる！",
    card:   "bg-pink-50 border-pink-200 hover:border-pink-400",
    bubble: "bg-pink-50 border-pink-200",
    accent: "text-pink-700",
    tag:    "bg-pink-100 text-pink-600",
    triangleColor: "#fce7f3",
    btn:    "bg-pink-500 hover:bg-pink-600 active:bg-pink-700 text-white",
  },
  {
    id: "yoshi",
    name: "ヨシさん",
    icon: "👴",
    tagline: "ベテラン・的確",
    desc: "20年の経験から的確なアドバイスをくれる頼れるキャディ",
    card:   "bg-sky-50 border-sky-200 hover:border-sky-400",
    bubble: "bg-sky-50 border-sky-200",
    accent: "text-sky-700",
    tag:    "bg-sky-100 text-sky-600",
    triangleColor: "#e0f2fe",
    btn:    "bg-sky-500 hover:bg-sky-600 active:bg-sky-700 text-white",
  },
  {
    id: "sage",
    name: "ゴルフ仙人",
    icon: "🧙",
    tagline: "達人・独特の言い回し",
    desc: "哲学的な言葉でゴルフの真髄を語りかける",
    card:   "bg-violet-50 border-violet-200 hover:border-violet-400",
    bubble: "bg-violet-50 border-violet-200",
    accent: "text-violet-700",
    tag:    "bg-violet-100 text-violet-600",
    triangleColor: "#ede9fe",
    btn:    "bg-violet-500 hover:bg-violet-600 active:bg-violet-700 text-white",
  },
  {
    id: "taka",
    name: "タカさん",
    icon: "🏌️",
    tagline: "プロ・コースマネジメント",
    desc: "リスクとリターンを計算した戦略的アドバイスが得意",
    card:   "bg-emerald-50 border-emerald-200 hover:border-emerald-400",
    bubble: "bg-emerald-50 border-emerald-200",
    accent: "text-emerald-700",
    tag:    "bg-emerald-100 text-emerald-600",
    triangleColor: "#d1fae5",
    btn:    "bg-emerald-600 hover:bg-emerald-700 active:bg-emerald-800 text-white",
  },
];

export function AiCaddieClient() {
  const [charId, setCharId]     = useState<CharacterId | null>(null);
  const [phase, setPhase]       = useState<"select" | "caddie">("select");
  const [pos, setPos]           = useState<Location | null>(null);
  const [pinPos, setPinPos]     = useState<Location | null>(null);
  const [gpsErr, setGpsErr]     = useState<string | null>(null);
  const [accuracy, setAccuracy] = useState<number | null>(null);
  const [manual, setManual]     = useState(false);
  const [manualY, setManualY]   = useState("");
  const [advice, setAdvice]     = useState<string | null>(null);
  const [loading, setLoading]   = useState(false);
  const [fetchErr, setFetchErr] = useState<string | null>(null);
  const watchRef = useRef<number | null>(null);

  const char = CHARS.find((c) => c.id === charId) ?? null;

  const distMeters =
    !manual && pos && pinPos ? calculateDistance(pos, pinPos) : null;
  const distYards = distMeters != null ? metersToYards(distMeters) : null;

  // GPS watch — runs when in caddie mode and not manual
  useEffect(() => {
    if (phase !== "caddie" || manual) return;
    if (!navigator.geolocation) {
      setGpsErr("このデバイスはGPSに対応していません");
      setManual(true);
      return;
    }
    const id = navigator.geolocation.watchPosition(
      (p) => {
        setPos({
          latitude: p.coords.latitude,
          longitude: p.coords.longitude,
          accuracy: p.coords.accuracy,
        });
        setAccuracy(p.coords.accuracy);
        setGpsErr(null);
      },
      (e) => {
        if (e.code === 1) {
          setGpsErr("位置情報の許可が必要です。手動入力をお使いください。");
          setManual(true);
        }
      },
      { enableHighAccuracy: true, maximumAge: 3000 }
    );
    watchRef.current = id;
    return () => {
      if (watchRef.current !== null) {
        navigator.geolocation.clearWatch(watchRef.current);
        watchRef.current = null;
      }
    };
  }, [phase, manual]);

  const fetchAdvice = useCallback(
    async (dm: number | null, dy: number | null) => {
      if (!charId) return;
      setLoading(true);
      setFetchErr(null);
      try {
        const res = await fetch("/api/ai-caddie/gps-advice", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ character: charId, distanceMeters: dm, distanceYards: dy }),
        });
        if (!res.ok) {
          const d = await res.json();
          throw new Error(d.error ?? "APIエラー");
        }
        const d = await res.json();
        setAdvice(d.advice);
      } catch (e) {
        setFetchErr(e instanceof Error ? e.message : "取得に失敗しました");
      } finally {
        setLoading(false);
      }
    },
    [charId]
  );

  function pickChar(id: CharacterId) {
    setCharId(id);
    setPhase("caddie");
    setAdvice(null);
    setFetchErr(null);
    setPinPos(null);
    setPos(null);
    setGpsErr(null);
    setManual(false);
    setManualY("");
  }

  function handleSetPin() {
    if (!pos) return;
    setPinPos({ ...pos });
  }

  function handleManualFetch() {
    const y = parseInt(manualY, 10);
    if (!y || y <= 0) return;
    fetchAdvice(Math.round(y / 1.09361), y);
  }

  // ── Character selection screen ──────────────────────────────────────
  if (phase === "select") {
    return (
      <div className="space-y-5">
        <p className="text-base text-green-600 text-center">
          一緒にラウンドするキャラクターを選んでください
        </p>
        <div className="grid grid-cols-2 gap-3">
          {CHARS.map((c) => (
            <button
              key={c.id}
              onClick={() => pickChar(c.id)}
              className={`flex flex-col items-center text-center gap-2 p-4 rounded-2xl
                          border-2 transition-all duration-150 active:scale-95 ${c.card}`}
            >
              <span className="text-5xl leading-none">{c.icon}</span>
              <span className={`text-xs font-medium px-2 py-0.5 rounded-full ${c.tag}`}>
                {c.tagline}
              </span>
              <span className={`font-bold text-base ${c.accent}`}>{c.name}</span>
              <span className="text-xs text-green-600 leading-snug">{c.desc}</span>
            </button>
          ))}
        </div>
      </div>
    );
  }

  if (!char) return null;

  // ── Caddie screen ───────────────────────────────────────────────────
  return (
    <div className="space-y-4">

      {/* Character header bar */}
      <div className={`flex items-center justify-between px-4 py-3 rounded-2xl border ${char.bubble}`}>
        <div className="flex items-center gap-3">
          <span className="text-3xl leading-none">{char.icon}</span>
          <div>
            <p className={`font-bold text-base ${char.accent}`}>{char.name}</p>
            <p className="text-xs text-green-500">{char.tagline}</p>
          </div>
        </div>
        <button
          onClick={() => { setPhase("select"); setAdvice(null); setFetchErr(null); }}
          className="text-xs px-3 py-1.5 rounded-full border border-green-200
                     bg-white text-green-600 hover:bg-green-50 transition-colors"
        >
          変更
        </button>
      </div>

      {/* Distance card */}
      <div className="card space-y-3">
        <div className="flex items-center justify-between">
          <h3 className="text-sm font-semibold text-green-700">残り距離</h3>
          <div className="flex rounded-lg overflow-hidden border border-green-200 text-xs font-medium">
            <button
              onClick={() => setManual(false)}
              className={`px-3 py-1.5 transition-colors ${
                !manual ? "bg-green-600 text-white" : "bg-white text-green-600 hover:bg-green-50"
              }`}
            >
              📍 GPS
            </button>
            <button
              onClick={() => setManual(true)}
              className={`px-3 py-1.5 transition-colors ${
                manual ? "bg-green-600 text-white" : "bg-white text-green-600 hover:bg-green-50"
              }`}
            >
              ✏️ 手動
            </button>
          </div>
        </div>

        {!manual ? (
          // GPS mode
          <div className="space-y-3">
            {gpsErr && (
              <p className="text-xs text-amber-700 bg-amber-50 border border-amber-200 rounded-xl p-3 leading-relaxed">
                {gpsErr}
              </p>
            )}

            <div className="flex items-center gap-2 text-xs text-green-500">
              <span
                className={`w-2 h-2 rounded-full shrink-0 ${
                  pos ? "bg-green-400 animate-pulse" : "bg-gray-300"
                }`}
              />
              {pos
                ? `GPS取得済み（精度 ±${Math.round(accuracy ?? 0)}m）`
                : "GPS取得中…"}
            </div>

            {/* Distance display */}
            {distMeters != null ? (
              <div className="text-center py-2">
                <p className="text-6xl font-bold text-green-700 tabular-nums leading-none">
                  {distYards}
                </p>
                <p className="text-green-500 text-sm mt-2">
                  ヤード（{Math.round(distMeters)}m）
                </p>
              </div>
            ) : (
              <div className="text-center py-5 text-green-400 text-sm">
                {pinPos ? "現在地を移動してください" : "ピン位置をセットしてください"}
              </div>
            )}

            {/* Set pin button */}
            <button
              onClick={handleSetPin}
              disabled={!pos}
              className="btn-secondary py-3 text-sm disabled:opacity-40"
            >
              📍 {pinPos ? "ピン位置を更新（現在地）" : "ピン位置をセット（現在地）"}
            </button>

            {!pinPos && (
              <p className="text-xs text-green-400 text-center leading-relaxed">
                ピン（旗）の近くでボタンを押して位置を記録。<br />
                ボール位置に戻ると残り距離が表示されます。
              </p>
            )}

            {/* Advice fetch button (GPS mode) */}
            {pinPos && distMeters != null && (
              <button
                onClick={() => fetchAdvice(distMeters, distYards)}
                disabled={loading}
                className={`w-full font-semibold py-3 px-6 rounded-xl transition-colors
                            disabled:opacity-50 disabled:cursor-not-allowed ${char.btn}`}
              >
                {loading ? (
                  <span className="flex items-center justify-center gap-2">
                    <span className="w-4 h-4 border-2 border-current border-t-transparent rounded-full animate-spin" />
                    考え中...
                  </span>
                ) : (
                  "🎯 アドバイスを聞く"
                )}
              </button>
            )}
          </div>
        ) : (
          // Manual mode
          <div className="space-y-3">
            <div className="flex items-end gap-2">
              <div className="flex-1">
                <label className="text-xs text-green-600 block mb-1.5">
                  ピンまでの距離（ヤード）
                </label>
                <input
                  type="number"
                  inputMode="numeric"
                  className="input text-center text-3xl font-bold py-4"
                  placeholder="150"
                  value={manualY}
                  onChange={(e) => setManualY(e.target.value)}
                  min={1}
                  max={600}
                />
              </div>
              <span className="text-green-600 font-bold text-xl pb-4">y</span>
            </div>
            <button
              onClick={handleManualFetch}
              disabled={!manualY || parseInt(manualY) <= 0 || loading}
              className={`w-full font-semibold py-3 px-6 rounded-xl transition-colors
                          disabled:opacity-50 disabled:cursor-not-allowed ${char.btn}`}
            >
              {loading ? (
                <span className="flex items-center justify-center gap-2">
                  <span className="w-4 h-4 border-2 border-current border-t-transparent rounded-full animate-spin" />
                  考え中...
                </span>
              ) : (
                "🎯 アドバイスを聞く"
              )}
            </button>
          </div>
        )}
      </div>

      {/* Speech bubble section */}
      <div>
        {/* Character icon above bubble */}
        <div className="flex flex-col items-center gap-1 mb-1">
          <span className="text-6xl leading-none">{char.icon}</span>
          <span className={`text-sm font-bold ${char.accent}`}>{char.name}</span>
        </div>

        {/* Triangle pointing up */}
        <div className="flex justify-center">
          <div
            style={{
              width: 0,
              height: 0,
              borderLeft: "12px solid transparent",
              borderRight: "12px solid transparent",
              borderBottom: `14px solid ${char.triangleColor}`,
            }}
          />
        </div>

        {/* Bubble */}
        <div className={`rounded-2xl border-2 px-5 py-4 min-h-[100px] ${char.bubble}`}>
          {loading ? (
            <div className="flex items-center justify-center gap-3 py-6">
              <div className="w-5 h-5 border-2 border-current border-t-transparent rounded-full animate-spin opacity-60" />
              <p className={`text-sm opacity-60 ${char.accent}`}>アドバイスを考えています…</p>
            </div>
          ) : fetchErr ? (
            <p className="text-sm text-red-500 text-center py-4">{fetchErr}</p>
          ) : advice ? (
            <p className={`text-base leading-relaxed whitespace-pre-line ${char.accent}`}>
              {advice}
            </p>
          ) : (
            <p className={`text-sm text-center py-6 opacity-40 leading-relaxed ${char.accent}`}>
              {!manual
                ? "ピン位置をセットして\nアドバイスを聞いてみよう！"
                : "距離を入力して\nアドバイスを聞いてみよう！"}
            </p>
          )}
        </div>
      </div>

      {/* Retry / get another advice */}
      {advice && !loading && (
        <button
          onClick={() => {
            if (!manual) {
              fetchAdvice(distMeters, distYards);
            } else {
              const y = parseInt(manualY, 10);
              if (y > 0) fetchAdvice(Math.round(y / 1.09361), y);
            }
          }}
          className="btn-secondary py-3 text-sm"
        >
          🔄 別のアドバイスを聞く
        </button>
      )}
    </div>
  );
}
