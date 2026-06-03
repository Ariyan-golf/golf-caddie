"use client";

import { useState, useEffect, useRef } from "react";
import Image from "next/image";
import type { Location, ClubAverage } from "@/types";
import { fetchWeather, windArrowRotation, type WeatherData } from "@/lib/weather";
import { pickClub, getInstantAdvice, type CharacterId, type ClubInfo } from "./templates";

// C8b ③: HoleRecorder から「🏌️ AIキャディに聞く」で渡されるラウンド文脈。
// null の場合は AIキャディタブからの直接アクセスとみなし、従来通り手動入力。
export interface InitialContext {
  roundId: string;
  holeNumber: number;
  courseName: string;
  par: number | null;
  distance: number | null;       // URL から渡された残り距離（GPS計測値）
  greenRegistered: boolean;      // この (course, hole, greenType) の green_centers 有無
}

interface Props {
  clubAverages: ClubAverage[];
  hasAccess: boolean;
  initialContext?: InitialContext | null;
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
    id: "mika", name: "AIちゃん", imgSrc: "/characters/ai.png", emoji: "👧",
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

export function AiCaddieClient({ clubAverages, hasAccess, initialContext = null }: Props) {
  const [charId, setCharId]     = useState<CharacterId | null>(null);
  const [phase, setPhase]       = useState<"select" | "caddie">("select");

  // GPS（天気取得用のみ・仕様書 v1.3 章6 風向き取得=低精度・60秒キャッシュOK）
  const [pos, setPos] = useState<Location | null>(null);

  // C8b ③: 残り距離。HoleRecorder 経由で来た場合は GPS計測値で初期化。
  // ユーザーが書き換えれば普通の手動入力扱い（initialContext は変更しない）。
  const [manualY, setManualY] = useState(
    initialContext?.distance != null ? String(initialContext.distance) : "",
  );

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

  const effectiveYards = manualY ? parseInt(manualY, 10) : null;

  // 天気の自動取得（GPS初回取得時に1回だけ実行）
  useEffect(() => {
    if (!pos || weatherFetchedRef.current) return;
    weatherFetchedRef.current = true;
    fetchWeather(pos.latitude, pos.longitude).then((data) => {
      if (data) setWeatherData(data);
    });
  }, [pos]);

  // 天気取得用の単発 GPS。仕様書 v1.3 章6: 風向き取得は ±100m で十分なので
  // enableHighAccuracy=false / maximumAge=60000 で電池節約。失敗時は警告のみ
  // （AIキャディの主機能は手動入力なのでブロックしない）。
  useEffect(() => {
    if (phase !== "caddie") return;
    if (typeof navigator === "undefined" || !navigator.geolocation) return;
    navigator.geolocation.getCurrentPosition(
      (p) => setPos({
        latitude: p.coords.latitude,
        longitude: p.coords.longitude,
        accuracy: p.coords.accuracy,
      }),
      (e) => console.warn("[ai-caddie] weather GPS failed:", e.message),
      { enableHighAccuracy: false, maximumAge: 60000, timeout: 15000 },
    );
  }, [phase]);

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
  async function handleDetailAdvice() {
    const yards = effectiveYards;
    if (!yards || !charId) return;
    setDL(true);
    setDetailErr(null);
    setDetailText(null);
    try {
      const dm = Math.round(yards / 1.09361);
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
  }

  function pickChar(id: CharacterId) {
    setCharId(id); setPhase("caddie");
    setQuickText(null); setClubInfo(null);
    setShowDetail(false); setDetailText(null); setDetailErr(null);
    setPos(null);
    // C8b ③: キャラ切替時も initialContext の distance は保持する（連携感の維持）。
    setManualY(initialContext?.distance != null ? String(initialContext.distance) : "");
    setWeatherData(null);
    weatherFetchedRef.current = false;
  }

  // C8b ③: ラウンド文脈バナー（HoleRecorder 経由で来た場合のみ表示）。
  // キャラ選択画面・キャディ画面の両方で同じ内容を出して連携感を維持する。
  const contextBanner = initialContext && (
    <div className="rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-2.5">
      <p className="text-sm text-emerald-700 leading-relaxed flex flex-wrap items-baseline gap-x-2 gap-y-0.5">
        <span aria-hidden="true">📍</span>
        <span className="font-semibold">{initialContext.courseName}</span>
        <span className="text-emerald-400" aria-hidden="true">·</span>
        <span>H{initialContext.holeNumber}</span>
        {initialContext.par != null && (
          <>
            <span className="text-emerald-400" aria-hidden="true">·</span>
            <span>パー {initialContext.par}</span>
          </>
        )}
        {initialContext.distance != null && (
          <>
            <span className="text-emerald-400" aria-hidden="true">·</span>
            <span className="font-semibold">残り {initialContext.distance}y</span>
            <span className="text-xs text-emerald-500">（GPS自動・編集可）</span>
          </>
        )}
      </p>
    </div>
  );

  // ── Character selection ─────────────────────────────────────────────
  if (phase === "select") {
    return (
      <div className="space-y-5">
        {contextBanner}
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

      {contextBanner}

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

      {/* Distance card — C8b ③ で initialContext に応じてヒント表示を分岐 */}
      <div className="card space-y-3">
        <h3 className="text-sm font-semibold text-green-700">残り距離</h3>
        {initialContext?.distance != null ? (
          <p className="text-xs text-emerald-700 bg-emerald-50 border border-emerald-200 rounded-xl p-2.5 leading-relaxed">
            📡 GPSで計測した残り距離を自動入力しています（編集可）
          </p>
        ) : initialContext?.greenRegistered ? (
          <p className="text-xs text-sky-700 bg-sky-50 border border-sky-200 rounded-xl p-2.5 leading-relaxed">
            💡 ラウンド画面の「📍 残り距離を計測」ボタンでGPSから自動取得できます
          </p>
        ) : (
          <p className="text-xs text-amber-700 bg-amber-50 border border-amber-200 rounded-xl p-2.5 leading-relaxed">
            🗺 残り距離を手動で入力してください（ラウンド画面から開けば自動連携できます）
          </p>
        )}
        <div className="space-y-2">
          <label className="text-xs text-green-600 block">グリーンセンターまでの距離（ヤード）</label>
          <div className="flex items-end gap-2">
            <input
              type="number"
              inputMode="numeric"
              className="input text-center text-3xl font-bold py-4 flex-1"
              placeholder="150"
              value={manualY}
              onChange={(e) => setManualY(e.target.value)}
              min={1}
              max={600}
            />
            <span className="text-green-600 font-bold text-xl pb-4">y</span>
          </div>
        </div>

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

      {/* Camera feature - Coming Soon（将来公開時に復活させる。現状は非表示） */}
      {/* <button
        disabled
        className="w-full py-3 px-6 rounded-xl text-sm font-semibold bg-gray-100 text-gray-400 border border-gray-200 cursor-not-allowed"
      >
        📷 スイング撮影・AI分析（近日公開）
      </button> */}

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
