"use client";

import { useState, useEffect, useRef, useCallback } from "react";
import Image from "next/image";
import type { Location, ClubAverage } from "@/types";
import { calculateDistance, metersToYards } from "@/lib/distance";
import { fetchWeather, windArrowRotation, type WeatherData } from "@/lib/weather";
import { pickClub, getInstantAdvice, type CharacterId, type ClubInfo } from "./templates";

interface Props {
  clubAverages: ClubAverage[];
  hasAccess: boolean;
}

interface CharDef {
  id: CharacterId;
  name: string;
  imgSrc: string;
  emoji: string;
  tagline: string;
  desc: string;
  card: string;
  bubble: string;
  accent: string;
  tag: string;
  tri: string;
  btn: string;
}

const CHARS: CharDef[] = [
  {
    id: "mika", name: "AIちゃん", imgSrc: "/characters/mika.png", emoji: "👧",
    tagline: "元気・初心者向け",
    desc: "AIが状況に合わせてアドバイスしてくれる！",
    card: "bg-pink-50 border-pink-200 hover:border-pink-400",
    bubble: "bg-pink-50 border-pink-200", accent: "text-pink-700",
    tag: "bg-pink-100 text-pink-600", tri: "#fce7f3",
    btn: "bg-pink-500 hover:bg-pink-600 active:bg-pink-700 text-white",
  },
  {
    id: "yoshi", name: "ヨシさん", imgSrc: "/characters/yoshi.png", emoji: "👴",
    tagline: "ベテラン・的確",
    desc: "20年の経験から的確なアドバイスをくれる頼れるキャディ",
    card: "bg-sky-50 border-sky-200 hover:border-sky-400",
    bubble: "bg-sky-50 border-sky-200", accent: "text-sky-700",
    tag: "bg-sky-100 text-sky-600", tri: "#e0f2fe",
    btn: "bg-sky-500 hover:bg-sky-600 active:bg-sky-700 text-white",
  },
  {
    id: "sage", name: "ゴルフ仙人", imgSrc: "/characters/sennin.png", emoji: "🧙",
    tagline: "達人・独特の言い回し",
    desc: "哲学的な言葉でゴルフの真髄を語りかける",
    card: "bg-violet-50 border-violet-200 hover:border-violet-400",
    bubble: "bg-violet-50 border-violet-200", accent: "text-violet-700",
    tag: "bg-violet-100 text-violet-600", tri: "#ede9fe",
    btn: "bg-violet-500 hover:bg-violet-600 active:bg-violet-700 text-white",
  },
  {
    id: "taka", name: "タカさん", imgSrc: "/characters/taka.png", emoji: "🏌️",
    tagline: "プロ・コースマネジメント",
    desc: "リスクとリターンを計算した戦略的アドバイスが得意",
    card: "bg-emerald-50 border-emerald-200 hover:border-emerald-400",
    bubble: "bg-emerald-50 border-emerald-200", accent: "text-emerald-700",
    tag: "bg-emerald-100 text-emerald-600", tri: "#d1fae5",
    btn: "bg-emerald-600 hover:bg-emerald-700 active:bg-emerald-800 text-white",
  },
];

type Wind     = "calm" | "light" | "moderate" | "strong";
type WindDir  = "none" | "head" | "tail" | "cross";
type Lie      = "fw" | "rough" | "bunker" | "tee";
type Slope    = "flat" | "uphill" | "downhill";

const WIND_OPTS:     { v: Wind;    l: string }[] = [
  { v:"calm",     l:"無風" },{ v:"light",  l:"微風" },
  { v:"moderate", l:"普通" },{ v:"strong", l:"強風" },
];
const WIND_DIR_OPTS: { v: WindDir; l: string }[] = [
  { v:"none",  l:"なし" },{ v:"head", l:"向かい" },
  { v:"tail",  l:"追い" },{ v:"cross",l:"横" },
];
const LIE_OPTS:      { v: Lie;     l: string }[] = [
  { v:"fw",     l:"FW" },{ v:"rough",  l:"ラフ" },
  { v:"bunker", l:"バンカー" },{ v:"tee",    l:"ティー" },
];
const SLOPE_OPTS:    { v: Slope;   l: string }[] = [
  { v:"flat",     l:"平坦" },
  { v:"uphill",   l:"上り" },
  { v:"downhill", l:"下り" },
];

export function AiCaddieClient({ clubAverages, hasAccess }: Props) {
  const [charId, setCharId]     = useState<CharacterId | null>(null);
  const [phase, setPhase]       = useState<"select" | "caddie">("select");

  // GPS
  const [pos, setPos]           = useState<Location | null>(null);
  const [pinPos, setPinPos]     = useState<Location | null>(null);
  const [gpsErr, setGpsErr]     = useState<string | null>(null);
  const [accuracy, setAccuracy] = useState<number | null>(null);
  const [manual, setManual]     = useState(false);
  const [manualY, setManualY]   = useState("");
  const [gpsLoading, setGpsLoading] = useState(false);

  // Weather (Open-Meteo)
  const [weatherData, setWeatherData]       = useState<WeatherData | null>(null);
  const weatherFetchedRef                   = useRef(false);

  // Stage 1
  const [clubInfo, setClubInfo]   = useState<ClubInfo | null>(null);
  const [quickText, setQuickText] = useState<string | null>(null);

  // Stage 2
  const [showDetail, setShowDetail]   = useState(false);
  const [wind, setWind]               = useState<Wind>("calm");
  const [windDir, setWindDir]         = useState<WindDir>("none");
  const [lie, setLie]                 = useState<Lie>("fw");
  const [slope, setSlope]             = useState<Slope>("flat");
  const [detailText, setDetailText]   = useState<string | null>(null);
  const [detailLoading, setDL]        = useState(false);
  const [detailErr, setDetailErr]     = useState<string | null>(null);

  const char = CHARS.find((c) => c.id === charId) ?? null;

  const distMeters = !manual && pos && pinPos ? calculateDistance(pos, pinPos) : null;
  const distYards  = distMeters != null ? metersToYards(distMeters) : null;

  const effectiveYards = !manual
    ? distYards
    : (manualY ? parseInt(manualY, 10) : null);

  // 天気の自動取得（GPS初回取得時に1回だけ実行）
  useEffect(() => {
    if (!pos || weatherFetchedRef.current) return;
    weatherFetchedRef.current = true;
    fetchWeather(pos.latitude, pos.longitude).then((data) => {
      if (data) setWeatherData(data);
    });
  }, [pos]);

  // Single-shot GPS fetch (replaces continuous watchPosition for battery).
  // Called on caddie phase entry and via the user-facing "残り距離を見る" /
  // "ピン位置をセット" buttons.
  const fetchCurrentPos = useCallback(async (): Promise<Location | null> => {
    if (!navigator.geolocation) {
      setGpsErr("このデバイスはGPSに対応していません");
      setManual(true);
      return null;
    }
    const options: PositionOptions = { enableHighAccuracy: true, timeout: 15000, maximumAge: 0 };
    console.log("[ai-caddie] getCurrentPosition", options);
    setGpsLoading(true);
    return new Promise<Location | null>((resolve) => {
      navigator.geolocation.getCurrentPosition(
        (p) => {
          const loc: Location = {
            latitude: p.coords.latitude,
            longitude: p.coords.longitude,
            accuracy: p.coords.accuracy,
          };
          console.log("[ai-caddie] getCurrentPosition OK", loc);
          setPos(loc);
          setAccuracy(loc.accuracy ?? null);
          setGpsErr(null);
          setGpsLoading(false);
          resolve(loc);
        },
        (e) => {
          console.error("[ai-caddie] getCurrentPosition ERR", {
            code: e.code,
            codeMeaning:
              e.code === 1 ? "PERMISSION_DENIED"
              : e.code === 2 ? "POSITION_UNAVAILABLE"
              : e.code === 3 ? "TIMEOUT"
              : "UNKNOWN",
            message: e.message,
          });
          if (e.code === 1) {
            setGpsErr("位置情報の許可が必要です。手動入力をお使いください。");
            setManual(true);
          } else {
            setGpsErr("GPS取得に失敗しました。もう一度お試しください。");
          }
          setGpsLoading(false);
          resolve(null);
        },
        options,
      );
    });
  }, []);

  // Initial GPS fetch on caddie phase entry (no continuous tracking)
  useEffect(() => {
    if (phase !== "caddie" || manual) return;
    void fetchCurrentPos();
  }, [phase, manual, fetchCurrentPos]);

  // Stage 1: instant template advice
  function handleQuickAdvice() {
    const yards = effectiveYards;
    if (!yards || yards <= 0 || !charId) return;
    const info = pickClub(yards, clubAverages);
    setClubInfo(info);
    setQuickText(getInstantAdvice(charId, yards, info));
    setShowDetail(false);
    setDetailText(null);
    setDetailErr(null);
  }

  // Stage 2: API advice
  const handleDetailAdvice = useCallback(async () => {
    const yards = effectiveYards;
    if (!yards || !charId) return;
    setDL(true);
    setDetailErr(null);
    setDetailText(null);
    try {
      const dm = !manual ? distMeters : Math.round(yards / 1.09361);
      const res = await fetch("/api/ai-caddie/gps-advice", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          character: charId,
          distanceMeters: dm,
          distanceYards: yards,
          wind, windDir, lie, slope,
        }),
      });
      if (!res.ok) { const d = await res.json(); throw new Error(d.error ?? "APIエラー"); }
      const d = await res.json();
      setDetailText(d.advice);
    } catch (e) {
      setDetailErr(e instanceof Error ? e.message : "取得に失敗しました");
    } finally {
      setDL(false);
    }
  }, [charId, effectiveYards, distMeters, manual, wind, windDir, lie, slope]);

  function pickChar(id: CharacterId) {
    setCharId(id); setPhase("caddie");
    setQuickText(null); setClubInfo(null);
    setShowDetail(false); setDetailText(null); setDetailErr(null);
    setPinPos(null); setPos(null); setGpsErr(null);
    setManual(false); setManualY("");
    setWeatherData(null);
    weatherFetchedRef.current = false;
  }

  // ── Character selection ─────────────────────────────────────────────
  if (phase === "select") {
    return (
      <div className="space-y-5">
        <p className="text-base text-green-600 text-center">
          一緒にラウンドするキャラクターを選んでください
        </p>
        <div className="grid grid-cols-2 gap-3">
          {CHARS.map((c) => (
            <button
              key={c.id} onClick={() => pickChar(c.id)}
              className={`flex flex-col items-center text-center rounded-2xl overflow-hidden
                          border-2 shadow-sm hover:shadow-md transition-all duration-150
                          active:scale-95 ${c.card}`}
            >
              {/* Image section */}
              <div className="w-full h-[210px] relative overflow-hidden flex items-center justify-center">
                <CharacterIcon imgSrc={c.imgSrc} emoji={c.emoji} name={c.name} size={64} expand />
              </div>
              {/* Info section */}
              <div className="w-full bg-white/60 px-3 pt-2 pb-4 space-y-1.5">
                <p className={`font-bold text-base ${c.accent}`}>{c.name}</p>
                <span className={`inline-block text-xs font-medium px-2 py-0.5 rounded-full ${c.tag}`}>{c.tagline}</span>
                <p className="text-xs text-green-600 leading-snug">{c.desc}</p>
              </div>
            </button>
          ))}
        </div>
      </div>
    );
  }

  if (!char) return null;

  const canAsk = !!effectiveYards && effectiveYards > 0;

  // ── Caddie screen ───────────────────────────────────────────────────
  return (
    <div className="space-y-4">

      {/* Header */}
      <div className={`flex items-center justify-between px-4 py-3 rounded-2xl border ${char.bubble}`}>
        <div className="flex items-center gap-3">
          <CharacterIcon imgSrc={char.imgSrc} emoji={char.emoji} name={char.name} size={40} />
          <div>
            <p className={`font-bold text-base ${char.accent}`}>{char.name}</p>
            <p className="text-xs text-green-500">{char.tagline}</p>
          </div>
        </div>
        <button
          onClick={() => { setPhase("select"); setQuickText(null); setDetailText(null); }}
          className="text-xs px-3 py-1.5 rounded-full border border-green-200 bg-white text-green-600 hover:bg-green-50"
        >
          変更
        </button>
      </div>

      {/* Wind & weather bar */}
      {weatherData && (
        <div className="flex items-center gap-3 px-3 py-2 bg-sky-50 border border-sky-100 rounded-xl text-sm">
          <span
            style={{ display: "inline-block", transform: `rotate(${windArrowRotation(weatherData.windDegrees)}deg)` }}
            className="text-xl text-sky-500 leading-none"
          >↑</span>
          <span className="font-medium text-sky-700">{weatherData.windDirection}</span>
          <span className="text-sky-600">{weatherData.windSpeedMs} m/s</span>
          <span className="text-sky-500 text-xs">({weatherData.windSpeed})</span>
          <span className="ml-auto text-sky-400 text-xs">🌡 {weatherData.temperature}°C</span>
          {weatherData.weather && (
            <span className="text-sky-400 text-xs">{weatherData.weather}</span>
          )}
        </div>
      )}

      {/* Distance card */}
      <div className="card space-y-3">
        <div className="flex items-center justify-between">
          <h3 className="text-sm font-semibold text-green-700">残り距離</h3>
          <div className="flex rounded-lg overflow-hidden border border-green-200 text-xs font-medium">
            {[{ v: false, l: "📍 GPS" }, { v: true, l: "✏️ 手動" }].map(({ v, l }) => (
              <button key={l} onClick={() => setManual(v)}
                className={`px-3 py-1.5 transition-colors ${
                  manual === v ? "bg-green-600 text-white" : "bg-white text-green-600 hover:bg-green-50"
                }`}>
                {l}
              </button>
            ))}
          </div>
        </div>

        {!manual ? (
          <div className="space-y-3">
            {gpsErr && (
              <p className="text-xs text-amber-700 bg-amber-50 border border-amber-200 rounded-xl p-3">{gpsErr}</p>
            )}
            <div className="flex items-center gap-2 text-xs text-green-500">
              <span className={`w-2 h-2 rounded-full shrink-0 ${
                gpsLoading ? "bg-amber-400 animate-pulse"
                : pos ? "bg-green-400"
                : "bg-gray-300"
              }`} />
              {gpsLoading
                ? "GPS取得中…"
                : pos
                  ? `GPS取得済み（精度 ±${Math.round(accuracy ?? 0)}m）`
                  : "未取得"}
            </div>
            {distMeters != null ? (
              <div className="text-center py-2">
                <p className="text-6xl font-bold text-green-700 tabular-nums leading-none">{distYards}</p>
                <p className="text-green-500 text-sm mt-2">ヤード（{Math.round(distMeters)}m）</p>
              </div>
            ) : (
              <div className="text-center py-4 text-green-400 text-sm">
                {pinPos ? "ボール位置で「残り距離を見る」を押してください" : "ピン位置をセットしてください"}
              </div>
            )}
            <button
              onClick={async () => {
                const loc = await fetchCurrentPos();
                if (loc) setPinPos(loc);
              }}
              disabled={gpsLoading}
              className="btn-secondary py-3 text-sm disabled:opacity-40"
            >
              📍 {pinPos ? "ピン位置を更新（現在地）" : "ピン位置をセット（現在地）"}
            </button>
            {pinPos && (
              <button
                onClick={() => { void fetchCurrentPos(); }}
                disabled={gpsLoading}
                className="btn-secondary py-3 text-sm disabled:opacity-40"
              >
                📏 残り距離を見る（現在地）
              </button>
            )}
            {!pinPos && (
              <p className="text-xs text-green-400 text-center leading-relaxed">
                ピン（旗）の近くでボタンを押して記録。<br />ボール位置に戻り「残り距離を見る」を押すと距離が表示されます。
              </p>
            )}
          </div>
        ) : (
          <div className="space-y-2">
            <label className="text-xs text-green-600 block">ピンまでの距離（ヤード）</label>
            <div className="flex items-end gap-2">
              <input type="number" inputMode="numeric" className="input text-center text-3xl font-bold py-4 flex-1"
                placeholder="150" value={manualY} onChange={(e) => setManualY(e.target.value)} min={1} max={600} />
              <span className="text-green-600 font-bold text-xl pb-4">y</span>
            </div>
          </div>
        )}

        {/* ① アドバイスを聞く */}
        <button
          onClick={handleQuickAdvice}
          disabled={!canAsk}
          className={`w-full font-semibold py-3 px-6 rounded-xl transition-colors
                      disabled:opacity-40 disabled:cursor-not-allowed ${char.btn}`}
        >
          🎯 アドバイスを聞く
        </button>
      </div>

      {/* Camera feature - Coming Soon */}
      <button
        disabled
        className="w-full py-3 px-6 rounded-xl text-sm font-semibold bg-gray-100 text-gray-400 border border-gray-200 cursor-not-allowed"
      >
        📷 スイング撮影・AI分析（近日公開）
      </button>

      {/* Stage 1: speech bubble */}
      {quickText && (
        <div>
          <div className="flex flex-col items-center gap-1 mb-1">
            <CharacterIcon imgSrc={char.imgSrc} emoji={char.emoji} name={char.name} size={80} />
            <span className={`text-sm font-bold ${char.accent}`}>{char.name}</span>
          </div>
          <div className="flex justify-center">
            <div style={{ width:0, height:0,
              borderLeft:"12px solid transparent", borderRight:"12px solid transparent",
              borderBottom:`14px solid ${char.tri}` }} />
          </div>
          <div className={`rounded-2xl border-2 px-5 py-4 ${char.bubble}`}>
            <p className={`text-base leading-relaxed ${char.accent}`}>{quickText}</p>
            {clubInfo && (
              <p className="text-xs text-green-400 mt-3 border-t border-green-100 pt-2">
                推奨番手: {clubInfo.label}（{clubInfo.personal ? "あなた" : "目安"}の平均 {clubInfo.avgYards}y）
              </p>
            )}
          </div>
        </div>
      )}

      {/* ② もっと詳しく */}
      {quickText && (
        <div className="space-y-3">
          {!hasAccess ? (
            <div className="card bg-amber-50 border-amber-200 text-center space-y-2 py-4">
              <p className="text-sm font-semibold text-amber-800">🔒 詳細アドバイスはサブスク会員限定</p>
              <p className="text-xs text-amber-700 leading-relaxed">
                月額サブスク（330円/月）または当日のラウンド利用料でご利用いただけます。
              </p>
            </div>
          ) : (
            <>
              <button
                onClick={() => { setShowDetail(!showDetail); setDetailText(null); setDetailErr(null); }}
                className="btn-secondary py-3 text-sm"
              >
                {showDetail ? "▲ 閉じる" : "🔍 もっと詳しく（風・コース状況込み）"}
              </button>

              {showDetail && (
                <div className="card space-y-4">
                  <p className="text-sm font-semibold text-green-700">コース状況を選んでください</p>

                  <ToggleGroup label="風" options={WIND_OPTS}     value={wind}    onChange={(v) => setWind(v as Wind)} />
                  <ToggleGroup label="風向き" options={WIND_DIR_OPTS} value={windDir} onChange={(v) => setWindDir(v as WindDir)} />
                  <ToggleGroup label="ライ"  options={LIE_OPTS}   value={lie}     onChange={(v) => setLie(v as Lie)} />
                  <ToggleGroup label="傾斜"  options={SLOPE_OPTS} value={slope}   onChange={(v) => setSlope(v as Slope)} />

                  <button
                    onClick={handleDetailAdvice}
                    disabled={detailLoading}
                    className={`w-full font-semibold py-3 px-6 rounded-xl transition-colors
                                disabled:opacity-50 disabled:cursor-not-allowed ${char.btn}`}
                  >
                    {detailLoading ? (
                      <span className="flex items-center justify-center gap-2">
                        <span className="w-4 h-4 border-2 border-current border-t-transparent rounded-full animate-spin" />
                        詳しく考え中...
                      </span>
                    ) : "🌟 詳細アドバイスを受け取る"}
                  </button>

                  {detailErr && <p className="text-sm text-red-500 text-center">{detailErr}</p>}

                  {detailText && (
                    <div className={`rounded-xl border p-4 ${char.bubble}`}>
                      <p className="text-xs font-semibold text-green-500 mb-2">🌟 詳細アドバイス（風・コース状況込み）</p>
                      <p className={`text-base leading-relaxed ${char.accent}`}>{detailText}</p>
                    </div>
                  )}
                </div>
              )}
            </>
          )}
        </div>
      )}
    </div>
  );
}

function CharacterIcon({
  imgSrc, emoji, name, size, expand = false,
}: {
  imgSrc: string;
  emoji: string;
  name: string;
  size: number;
  expand?: boolean;
}) {
  const [failed, setFailed] = useState(false);
  const emojiSize = size >= 70 ? "text-6xl" : size >= 50 ? "text-4xl" : "text-3xl";

  if (failed) {
    return <span className={`${emojiSize} leading-none`}>{emoji}</span>;
  }
  if (expand) {
    return (
      <Image
        src={imgSrc}
        alt={name}
        fill
        className="object-cover object-top"
        onError={() => setFailed(true)}
      />
    );
  }
  return (
    <div
      style={{ width: size, height: size }}
      className="overflow-hidden rounded-xl shrink-0"
    >
      <Image
        src={imgSrc}
        alt={name}
        width={size}
        height={size}
        className="w-full h-full object-cover object-top"
        onError={() => setFailed(true)}
      />
    </div>
  );
}

function ToggleGroup<T extends string>({
  label, options, value, onChange,
}: {
  label: string;
  options: { v: T; l: string }[];
  value: T;
  onChange: (v: T) => void;
}) {
  return (
    <div className="space-y-1.5">
      <p className="text-xs text-green-600 font-medium">{label}</p>
      <div className="flex gap-1.5 flex-wrap">
        {options.map(({ v, l }) => (
          <button key={v} onClick={() => onChange(v)}
            className={`px-3 py-1.5 rounded-lg text-xs font-medium border transition-colors ${
              value === v
                ? "bg-green-600 text-white border-green-600"
                : "bg-white text-green-700 border-green-200 hover:bg-green-50"
            }`}>
            {l}
          </button>
        ))}
      </div>
    </div>
  );
}
