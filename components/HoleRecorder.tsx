"use client";

import { useState, useRef, useEffect } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { ShotRecorder } from "./ShotRecorder";
import type { Club } from "@/types";
import { CLUB_LABELS } from "@/types";
import { calculateDistance, metersToYards } from "@/lib/distance";

// ── Local types ─────────────────────────────────────────────────────

interface Shot {
  id: string;
  shot_number: number;
  club: string | null;
  distance_yards: number | null;
  lie_type: string | null;
  ball_direction: string | null;
  start_lat: number | null;
  start_lng: number | null;
}

interface Hole {
  id: string;
  hole_number: number;
  par: number;
  score: number | null;
  putts: number | null;
  penalties: number | null;
  shots: Shot[];
}

interface CourseHole {
  hole_number: number;
  par: number;
}

interface HoleRecorderProps {
  roundId: string;
  initialHoles: Hole[];
  startHole?: number;
  mode?: "shot" | "score";
  windDirection?: string | null;
  windSpeed?: string | null;
  courseRating?: number | null;
  slopeRating?: number | null;
  courseHoles?: CourseHole[];
  paymentStatus?: "pending" | "paid";
  golfCourseName?: string;
}

interface RoundShotEntry {
  holeNumber: number;
  club: string;
  yards: number;
  meters: number;
}

type Phase = "par_select" | "shooting" | "putt_select" | "score_entry";

// ── Helpers ──────────────────────────────────────────────────────────

const WOOD_CLUBS:  Club[] = ["1w", "3w", "5w", "7w", "9w"];
const UTIL_CLUBS:  Club[] = ["u2", "u3", "u4", "u5", "u6", "u7"];
const IRON_CLUBS:  Club[] = ["2i", "3i", "4i", "5i", "6i", "7i", "8i", "9i"];
const WEDGE_CLUBS: Club[] = ["pw", "aw", "gw", "sw", "lw"];

const BALL_DIRECTION_OPTIONS = ["hook", "draw", "straight", "fade", "slice"] as const;
const BALL_DIRECTION_LABELS: Record<string, string> = {
  hook: "フック", draw: "ドロー", straight: "ストレート", fade: "フェード", slice: "スライス",
};
const BALL_DIRECTION_SHORT: Record<string, string> = {
  hook: "フック", draw: "ドロー", straight: "ST", fade: "フェード", slice: "スライス",
};

// ── Lie: 2-stage system ──────────────────────────────────────────────

const LIE_S1 = ["fairway", "right", "left", "short", "over"] as const;
type LieS1 = typeof LIE_S1[number];
const LIE_S1_LABEL: Record<LieS1, string> = {
  fairway: "FW", right: "右", left: "左", short: "ショート", over: "オーバー",
};

const LIE_S2 = ["ob", "penalty", "bunker", "rough"] as const;
type LieS2 = typeof LIE_S2[number];
const LIE_S2_LABEL: Record<LieS2, string> = {
  ob: "OB", penalty: "ペナ", bunker: "バンカー", rough: "ラフ",
};

// Legacy lie_type values from old system
const LEGACY_LIE_SHORT: Record<string, string> = {
  tee: "T", fw: "FW", rough: "RF", ob: "OB", bunker: "BK", trees: "林", green: "GR", other: "他",
};

function lieLabelShort(lieType: string | null): string {
  if (!lieType) return "ライ";
  if (lieType === "fairway") return "FW";
  const parts = lieType.split(":");
  if (parts.length >= 2) {
    const [s1, s2, count] = parts;
    const s1label = LIE_S1_LABEL[s1 as LieS1] ?? s1;
    const s2label = LIE_S2_LABEL[s2 as LieS2] ?? s2;
    return count ? `${s1label}${s2label}×${count}` : `${s1label}${s2label}`;
  }
  return LEGACY_LIE_SHORT[lieType] ?? lieType;
}

function parseLieParts(lieType: string | null): { s1: LieS1 | null; s2: LieS2 | null; count: number | null } {
  if (!lieType) return { s1: null, s2: null, count: null };
  const parts = lieType.split(":");
  const s1 = LIE_S1.includes(parts[0] as LieS1) ? (parts[0] as LieS1) : null;
  const s2 = parts[1] && LIE_S2.includes(parts[1] as LieS2) ? (parts[1] as LieS2) : null;
  const count = parts[2] ? parseInt(parts[2]) : null;
  return { s1, s2, count };
}

function scoreLabel(score: number, par: number) {
  const d = score - par;
  if (d <= -2) return { text: `${score} (イーグル)`, cls: "bg-yellow-100 text-yellow-700" };
  if (d === -1) return { text: `${score} (バーディ)`, cls: "bg-red-100 text-red-600" };
  if (d === 0)  return { text: `${score} (パー)`,     cls: "bg-green-100 text-green-700" };
  if (d === 1)  return { text: `${score} (ボギー)`,   cls: "bg-blue-100 text-blue-600" };
  if (d === 2)  return { text: `${score} (ダブル)`,   cls: "bg-purple-100 text-purple-600" };
  return { text: `${score} (+${d})`, cls: "bg-gray-100 text-gray-600" };
}

// ── Main component ──────────────────────────────────────────────────

export function HoleRecorder({ roundId, initialHoles, startHole = 1, mode = "shot", windDirection, windSpeed, courseRating, slopeRating, courseHoles, paymentStatus = "paid", golfCourseName = "" }: HoleRecorderProps) {
  const router = useRouter();
  const lastHole = initialHoles.at(-1);
  const initPhase: Phase =
    initialHoles.length === 0 ? "par_select" :
    lastHole?.score !== null  ? "par_select" :
    mode === "score"          ? "score_entry" :
                                "shooting";

  const [holes, setHoles]           = useState<Hole[]>(initialHoles);
  const [phase, setPhase]           = useState<Phase>(initPhase);
  const [holeMode, setHoleMode]     = useState<"shot" | "score">(mode);
  const [creating, setCreating]     = useState(false);
  const [expandedHole, setExpanded] = useState<string | null>(null);
  const [editing, setEditing] = useState<{ id: string; type: "club" | "lie" | "direction" } | null>(null);
  const [confirmGoBack, setConfirmGoBack] = useState(false);
  const [goingBack, setGoingBack]   = useState(false);
  const [penalties, setPenalties]   = useState(0);
  const [roundShotHistory, setRoundShotHistory] = useState<RoundShotEntry[]>([]);
  const [roundEndConfirmed, setRoundEndConfirmed] = useState(false);
  const [handicapDiff, setHandicapDiff] = useState<number | null>(null);
  const [confirmLoading, setConfirmLoading] = useState(false);
  const [showPaymentModal, setShowPaymentModal] = useState(false);
  const [payLoading, setPayLoading] = useState(false);
  const [payError, setPayError] = useState("");

  // Wind compass visibility — persisted to localStorage
  const [windVisible, setWindVisible] = useState(true);
  useEffect(() => {
    const stored = localStorage.getItem(COMPASS_STORAGE_KEY);
    if (stored !== null) setWindVisible(stored === "true");
  }, []);
  useEffect(() => {
    localStorage.setItem(COMPASS_STORAGE_KEY, String(windVisible));
  }, [windVisible]);

  const currentHole  = phase !== "par_select" ? holes.at(-1) ?? null : null;
  const holeCardRefs = useRef<Record<number, HTMLDivElement | null>>({});

  function scrollToHole(holeNumber: number) {
    const hole = holes.find((h) => h.hole_number === holeNumber);
    if (!hole) return;
    if (hole.score !== null) {
      holeCardRefs.current[holeNumber]?.scrollIntoView({ behavior: "smooth", block: "start" });
    } else {
      window.scrollTo({ top: 0, behavior: "smooth" });
    }
  }

  const completedHoles = holes.filter((h) => h.score !== null);
  const totalScore     = completedHoles.reduce((s, h) => s + (h.score ?? 0), 0);
  const totalPar       = completedHoles.reduce((s, h) => s + h.par, 0);
  const isRoundDone    = holes.length === 18 && holes.every((h) => h.score !== null);

  // Cleanup when round finishes — GPS is released by ShotRecorder unmount
  useEffect(() => {
    if (!isRoundDone) return;
    localStorage.removeItem(COMPASS_STORAGE_KEY);
  }, [isRoundDone]);

  // ── Actions ─────────────────────────────────────────────────────────

  function switchHoleMode() {
    const newMode = holeMode === "shot" ? "score" : "shot";
    setHoleMode(newMode);
    if (phase === "shooting" && newMode === "score") setPhase("score_entry");
    else if (phase === "score_entry" && newMode === "shot") setPhase("shooting");
  }

  // hole_number follows the start order: out(1→18) or in(10→18→1→9)
  function nextHoleNumber(currentHoleCount: number) {
    return ((startHole - 1 + currentHoleCount) % 18) + 1;
  }

  async function handleStartHole(par: number) {
    setCreating(true);
    const supabase = createClient();
    const holeNumber = nextHoleNumber(holes.length);
    const { data, error } = await supabase
      .from("holes")
      .insert({ round_id: roundId, hole_number: holeNumber, par })
      .select("*, shots(*)")
      .single();
    if (!error && data) {
      setHoles((prev) => [...prev, data as Hole]);
      setPhase(holeMode === "score" ? "score_entry" : "shooting");
    }
    setCreating(false);
  }

  async function refreshCurrent() {
    if (!currentHole) return;
    const supabase = createClient();
    const { data } = await supabase
      .from("holes").select("*, shots(*)").eq("id", currentHole.id).single();
    if (data) {
      setHoles((prev) => prev.map((h) => (h.id === (data as Hole).id ? (data as Hole) : h)));
    }
  }

  async function completeHole(putts: number) {
    if (!currentHole) return;
    const score = currentHole.shots.length + penalties + putts;
    const supabase = createClient();
    await supabase.from("holes").update({ score, putts, penalties }).eq("id", currentHole.id);
    const updated = holes.map((h) => h.id === currentHole.id ? { ...h, score, putts, penalties } : h);
    setHoles(updated);
    const total = updated.reduce((s, h) => s + (h.score ?? 0), 0);
    await supabase.from("rounds").update({ total_score: total }).eq("id", roundId);
    setPenalties(0);
    setPhase("par_select");
  }

  async function completeHoleByScore(totalScore: number, putts: number) {
    if (!currentHole) return;
    const supabase = createClient();
    await supabase.from("holes").update({ score: totalScore, putts, penalties: 0 }).eq("id", currentHole.id);
    const updated = holes.map((h) => h.id === currentHole.id ? { ...h, score: totalScore, putts, penalties: 0 } : h);
    setHoles(updated);
    const total = updated.reduce((s, h) => s + (h.score ?? 0), 0);
    await supabase.from("rounds").update({ total_score: total }).eq("id", roundId);
    setPhase("par_select");
  }

  async function updateClub(shotId: string, club: Club) {
    const supabase = createClient();
    await supabase.from("shots").update({ club }).eq("id", shotId);
    setHoles((prev) => prev.map((h) => ({
      ...h, shots: h.shots.map((s) => s.id === shotId ? { ...s, club } : s),
    })));
    setEditing(null);
  }

  async function updateLie(shotId: string, lie: string) {
    const supabase = createClient();
    await supabase.from("shots").update({ lie_type: lie }).eq("id", shotId);
    setHoles((prev) => prev.map((h) => ({
      ...h, shots: h.shots.map((s) => s.id === shotId ? { ...s, lie_type: lie } : s),
    })));
    setEditing(null);
  }

  async function updateBallDirection(shotId: string, dir: string) {
    const supabase = createClient();
    await supabase.from("shots").update({ ball_direction: dir }).eq("id", shotId);
    setHoles((prev) => prev.map((h) => ({
      ...h, shots: h.shots.map((s) => s.id === shotId ? { ...s, ball_direction: dir } : s),
    })));
    setEditing(null);
  }

  async function updateScore(holeId: string, newScore: number) {
    const supabase = createClient();
    await supabase.from("holes").update({ score: newScore }).eq("id", holeId);
    const updated = holes.map((h) => h.id === holeId ? { ...h, score: newScore } : h);
    setHoles(updated);
    const total = updated.reduce((s, h) => s + (h.score ?? 0), 0);
    await supabase.from("rounds").update({ total_score: total }).eq("id", roundId);
  }

  function handleHoleout() {
    setPhase("putt_select");

    // Record last shot's end position + distance in the background
    const lastShot = currentHole?.shots.at(-1);
    if (!lastShot?.start_lat || !lastShot?.start_lng || !navigator.geolocation) return;

    const shotId   = lastShot.id;
    const startLat = lastShot.start_lat;
    const startLng = lastShot.start_lng;

    navigator.geolocation.getCurrentPosition(
      async (pos) => {
        const supabase = createClient();
        const distM = calculateDistance(
          { latitude: startLat, longitude: startLng },
          { latitude: pos.coords.latitude, longitude: pos.coords.longitude },
        );
        await supabase.from("shots").update({
          end_lat: pos.coords.latitude,
          end_lng: pos.coords.longitude,
          distance_meters: distM,
          distance_yards: metersToYards(distM),
        }).eq("id", shotId);
      },
      () => { /* silent fail — last shot distance stays null */ },
      { enableHighAccuracy: true, timeout: 10000, maximumAge: 0 },
    );
  }

  async function goBackToPrevHole() {
    const lastHole = holes.at(-1);
    if (!lastHole) return;
    setGoingBack(true);
    const supabase = createClient();
    await supabase.from("holes").update({ score: null, putts: null }).eq("id", lastHole.id);
    const updatedHoles = holes.map((h) =>
      h.id === lastHole.id ? { ...h, score: null, putts: null } : h
    );
    setHoles(updatedHoles);
    const total = updatedHoles.reduce((s, h) => s + (h.score ?? 0), 0);
    await supabase.from("rounds").update({ total_score: total }).eq("id", roundId);
    setPenalties(lastHole.penalties ?? 0);
    setConfirmGoBack(false);
    setGoingBack(false);
    setPhase(holeMode === "score" ? "score_entry" : "putt_select");
  }

  function toggleEdit(id: string, type: "club" | "lie" | "direction") {
    setEditing((prev) =>
      prev?.id === id && prev.type === type ? null : { id, type }
    );
  }

  // ── Render ─────────────────────────────────────────────────────────

  async function handleRoundEndConfirm() {
    setConfirmLoading(true);
    let diff: number | null = null;
    if (courseRating != null && slopeRating != null && slopeRating !== 0) {
      diff = Math.round(((totalScore - courseRating) * 113 / slopeRating) * 10) / 10;
    }
    const supabase = createClient();
    await supabase.from("rounds").update({ handicap_differential: diff }).eq("id", roundId);
    setHandicapDiff(diff);
    setConfirmLoading(false);
    setRoundEndConfirmed(true);
    if (paymentStatus === "pending") {
      setShowPaymentModal(true);
    }
  }

  async function handlePayNow() {
    setPayLoading(true);
    setPayError("");
    try {
      const res = await fetch("/api/stripe/checkout-once", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ golf_course: golfCourseName }),
      });
      const data = await res.json();
      if (data.url) {
        window.location.href = data.url;
      } else {
        throw new Error(data.error ?? "no url");
      }
    } catch {
      setPayError("決済の開始に失敗しました。もう一度お試しください。");
      setPayLoading(false);
    }
  }

  if (isRoundDone && !roundEndConfirmed) {
    return <RoundEndScreen onConfirm={handleRoundEndConfirm} confirming={confirmLoading} />;
  }
  if (isRoundDone) {
    return (
      <>
        <RoundComplete
          holes={holes}
          totalScore={totalScore}
          totalPar={totalPar}
          mode={mode}
          handicapDiff={handicapDiff}
          paymentPending={paymentStatus === "pending"}
          onPayNow={() => setShowPaymentModal(true)}
        />
        {showPaymentModal && (
          <PaymentRequiredModal
            onPay={handlePayNow}
            onClose={() => setShowPaymentModal(false)}
            loading={payLoading}
            error={payError}
          />
        )}
      </>
    );
  }

  return (
    <div className="space-y-3">
      <HoleTabs
        holes={holes}
        startHole={startHole}
        activeHoleNumber={currentHole?.hole_number ?? null}
        onTabClick={scrollToHole}
      />

      {(windDirection || windSpeed) && (
        <WindCompassSection
          windDirection={windDirection}
          windSpeed={windSpeed}
          visible={windVisible}
          onToggle={() => setWindVisible((v) => !v)}
        />
      )}

      {/* ① 現在ホールの入力エリア — タブ直下に固定 */}
      <div>
        {phase === "par_select" && holes.length < 18 && (
          <div className="space-y-3">
            {holes.length === 0 && (
              <button
                onClick={() => router.back()}
                className="flex items-center gap-1 text-green-600 text-sm font-medium"
              >
                ← ラウンド情報に戻る
              </button>
            )}
            {(() => {
              const nextHole = nextHoleNumber(holes.length);
              const autoPar  = courseHoles?.find((ch) => ch.hole_number === nextHole)?.par;
              return autoPar != null
                ? <AutoParCard holeNumber={nextHole} par={autoPar} onCreate={handleStartHole} creating={creating} />
                : <ParSelector holeNumber={nextHole} onCreate={handleStartHole} creating={creating} />;
            })()}

            {holes.length > 0 && (
              confirmGoBack ? (
                <div className="card border-amber-200 bg-amber-50 space-y-3">
                  <div className="flex items-start gap-2">
                    <span className="text-xl flex-shrink-0">↩️</span>
                    <div>
                      <p className="font-semibold text-amber-800 text-base">前のホールに戻りますか？</p>
                      <p className="text-amber-700 text-sm mt-1">
                        ホール {holes.at(-1)?.hole_number} のスコアがリセットされ、
                        {holeMode === "score" ? "スコアを再入力できます。" : "パット数を再入力できます。"}
                      </p>
                    </div>
                  </div>
                  <div className="flex gap-2">
                    <button
                      onClick={goBackToPrevHole}
                      disabled={goingBack}
                      className="flex-1 py-3.5 rounded-xl bg-amber-500 hover:bg-amber-600 text-white text-base font-semibold transition-colors disabled:opacity-50"
                    >
                      {goingBack ? "戻り中..." : "戻る"}
                    </button>
                    <button
                      onClick={() => setConfirmGoBack(false)}
                      className="flex-1 py-3.5 rounded-xl bg-gray-100 text-gray-700 text-base font-semibold hover:bg-gray-200 transition-colors"
                    >
                      キャンセル
                    </button>
                  </div>
                </div>
              ) : (
                <button
                  onClick={() => setConfirmGoBack(true)}
                  className="w-full py-4 rounded-xl border border-gray-200 text-gray-500 text-base font-medium hover:bg-gray-50 transition-colors"
                >
                  ← 前のホールに戻る
                </button>
              )
            )}
          </div>
        )}

        {phase === "shooting" && currentHole && (
          <ActiveHoleCard
            hole={currentHole}
            roundId={roundId}
            penalties={penalties}
            onAddPenalty={() => setPenalties((p) => p + 1)}
            onRemovePenalty={() => setPenalties((p) => Math.max(0, p - 1))}
            onShotRecorded={refreshCurrent}
            onHoleout={handleHoleout}
            editing={editing}
            onToggleEdit={toggleEdit}
            onUpdateClub={updateClub}
            onUpdateLie={updateLie}
            onUpdateBallDirection={updateBallDirection}
          />
        )}

        {phase === "putt_select" && currentHole && (
          <PuttSelector
            shotCount={currentHole.shots.length}
            penalties={penalties}
            par={currentHole.par}
            isLastHole={holes.length === 18}
            onSelect={completeHole}
          />
        )}

        {phase === "score_entry" && currentHole && (
          <ScoreEntryCard
            hole={currentHole}
            isLastHole={holes.length === 18}
            onComplete={completeHoleByScore}
            roundShotHistory={roundShotHistory}
            onShotDistanceRecorded={(entry) => setRoundShotHistory((prev) => [...prev, entry])}
          />
        )}
      </div>

      {/* ② 完了済みホール一覧 — 入力エリアの下にスクロール */}
      {completedHoles.length > 0 && (
        <>
          <div className="flex items-center justify-between bg-green-700 text-white rounded-xl px-4 py-2">
            <span className="text-base font-medium">{completedHoles.length}H 終了</span>
            <span className="text-xl font-bold tabular-nums">
              {totalScore}
              <span className="text-base font-normal ml-1 opacity-80">
                ({totalScore - totalPar >= 0 ? "+" : ""}{totalScore - totalPar})
              </span>
            </span>
          </div>

          {completedHoles.map((hole) => (
            <div key={hole.id} ref={(el) => { holeCardRefs.current[hole.hole_number] = el; }}>
              <CompletedHoleCard
                hole={hole}
                mode={mode}
                expanded={expandedHole === hole.id}
                editing={editing}
                onToggle={() => setExpanded(expandedHole === hole.id ? null : hole.id)}
                onToggleEdit={toggleEdit}
                onUpdateClub={updateClub}
                onUpdateLie={updateLie}
                onUpdateBallDirection={updateBallDirection}
                onUpdateScore={updateScore}
              />
            </div>
          ))}
        </>
      )}
    </div>
  );
}

// ── HoleTabs ────────────────────────────────────────────────────────

function HoleTabs({
  holes, startHole, activeHoleNumber, onTabClick,
}: {
  holes: Hole[];
  startHole: number;
  activeHoleNumber: number | null;
  onTabClick: (holeNumber: number) => void;
}) {
  const playOrder = Array.from({ length: 18 }, (_, i) => ((startHole - 1 + i) % 18) + 1);
  const holeMap = Object.fromEntries(holes.map((h) => [h.hole_number, h]));
  const tabRefs = useRef<Record<number, HTMLButtonElement | null>>({});

  // Keep active tab in view
  useEffect(() => {
    const num = activeHoleNumber ?? holes.at(-1)?.hole_number;
    if (num) tabRefs.current[num]?.scrollIntoView({ behavior: "smooth", block: "nearest", inline: "center" });
  }, [activeHoleNumber, holes.length]);

  return (
    <div className="sticky top-0 z-10 -mx-4 px-4 py-2 bg-white border-b border-green-100">
      <div className="overflow-x-auto">
        <div className="flex gap-1 min-w-max">
          {playOrder.map((num) => {
            const hole = holeMap[num] as Hole | undefined;
            const isCompleted = hole?.score !== null && hole?.score !== undefined;
            const isActive = hole && hole.score === null;
            const isFuture = !hole;

            let containerCls = "";
            let numCls = "";
            let scoreTxt: string | null = null;

            if (isCompleted) {
              const d = hole.score! - hole.par;
              if (d <= -2) { containerCls = "bg-yellow-100 border-yellow-300"; numCls = "text-yellow-700"; }
              else if (d === -1) { containerCls = "bg-red-100 border-red-300"; numCls = "text-red-600"; }
              else if (d === 0)  { containerCls = "bg-green-100 border-green-300"; numCls = "text-green-700"; }
              else if (d === 1)  { containerCls = "bg-blue-100 border-blue-300"; numCls = "text-blue-600"; }
              else if (d === 2)  { containerCls = "bg-purple-100 border-purple-300"; numCls = "text-purple-600"; }
              else               { containerCls = "bg-gray-100 border-gray-300"; numCls = "text-gray-600"; }
              scoreTxt = String(hole.score);
            } else if (isActive) {
              containerCls = "bg-green-600 border-green-600 ring-2 ring-green-400 ring-offset-1";
              numCls = "text-white";
            } else {
              containerCls = "bg-gray-50 border-gray-200";
              numCls = "text-gray-300";
            }

            return (
              <button
                key={num}
                ref={(el) => { tabRefs.current[num] = el; }}
                disabled={isFuture}
                onClick={() => onTabClick(num)}
                className={`flex flex-col items-center rounded-xl border px-2.5 py-2 min-w-[3.5rem]
                            transition-colors active:scale-95 ${containerCls}
                            ${isFuture ? "cursor-default" : ""}`}
              >
                <span className={`text-base font-bold leading-tight ${numCls}`}>{num}H</span>
                {scoreTxt && (
                  <span className={`text-sm font-bold leading-none ${numCls}`}>{scoreTxt}</span>
                )}
                {isActive && (
                  <span className="w-1.5 h-1.5 rounded-full bg-white mt-1 animate-pulse" />
                )}
              </button>
            );
          })}
        </div>
      </div>
    </div>
  );
}

// ── Sub-components ──────────────────────────────────────────────────

function AutoParCard({
  holeNumber, par, onCreate, creating,
}: {
  holeNumber: number;
  par: number;
  onCreate: (par: number) => void;
  creating: boolean;
}) {
  return (
    <div className="card text-center space-y-4">
      <p className="text-sm font-medium text-green-500">ホール {holeNumber}</p>
      <p className="text-7xl font-bold text-green-700">Par {par}</p>
      <button
        onClick={() => onCreate(par)}
        disabled={creating}
        className="w-full py-5 rounded-xl bg-green-600 hover:bg-green-700 active:bg-green-800
                   text-white font-bold text-xl transition-colors disabled:opacity-50"
      >
        {creating ? "開始中..." : "スタート"}
      </button>
    </div>
  );
}

function ParSelector({
  holeNumber, onCreate, creating,
}: {
  holeNumber: number;
  onCreate: (par: number) => void;
  creating: boolean;
}) {
  return (
    <div className="card">
      <p className="text-lg font-bold text-green-700 mb-3 text-center">
        ホール {holeNumber} — パーを選択
      </p>
      <div className="grid grid-cols-3 gap-3">
        {[3, 4, 5].map((p) => (
          <button key={p} onClick={() => onCreate(p)} disabled={creating}
            className="py-8 rounded-xl bg-green-600 hover:bg-green-700 active:bg-green-800
                       text-white font-bold text-5xl transition-colors disabled:opacity-50">
            {p}
          </button>
        ))}
      </div>
    </div>
  );
}

function ActiveHoleCard({
  hole, roundId, penalties, onAddPenalty, onRemovePenalty,
  onShotRecorded, onHoleout,
  editing, onToggleEdit, onUpdateClub, onUpdateLie, onUpdateBallDirection,
}: {
  hole: Hole;
  roundId: string;
  penalties: number;
  onAddPenalty: () => void;
  onRemovePenalty: () => void;
  onShotRecorded: () => void;
  onHoleout: () => void;
  editing: { id: string; type: "club" | "lie" | "direction" } | null;
  onToggleEdit: (id: string, type: "club" | "lie" | "direction") => void;
  onUpdateClub: (id: string, club: Club) => void;
  onUpdateLie: (id: string, lie: string) => void;
  onUpdateBallDirection: (id: string, dir: string) => void;
}) {
  const lastShot = hole.shots.at(-1);
  const prevShot =
    lastShot?.start_lat != null && lastShot?.start_lng != null
      ? { id: lastShot.id, start_lat: lastShot.start_lat, start_lng: lastShot.start_lng }
      : null;

  return (
    <div className="card space-y-4">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <div className="w-9 h-9 bg-green-600 rounded-full flex items-center justify-center
                          text-white font-bold text-base">
            {hole.hole_number}
          </div>
          <div>
            <p className="font-bold text-green-900 text-lg">ホール {hole.hole_number}</p>
            <p className="text-sm text-green-500">
              パー{hole.par} · {hole.shots.length}打記録済
              {penalties > 0 && <span className="text-red-500"> +{penalties}罰</span>}
            </p>
          </div>
        </div>
        <div className="flex flex-col items-end gap-1.5">
          <button onClick={onHoleout}
            className="bg-green-600 hover:bg-green-700 text-white font-bold
                       px-5 py-3 rounded-xl text-base transition-colors flex flex-col items-center gap-0.5">
            <span>グリーンオン</span>
            <span className="text-xs font-normal opacity-80">グリーンで押してね</span>
          </button>
        </div>
      </div>

      {/* Shot list shown above the record button */}
      {hole.shots.length > 0 && (
        <ShotList
          shots={hole.shots}
          editing={editing}
          onToggleEdit={onToggleEdit}
          onUpdateClub={onUpdateClub}
          onUpdateLie={onUpdateLie}
          onUpdateBallDirection={onUpdateBallDirection}
        />
      )}

      <ShotRecorder
        holeId={hole.id}
        roundId={roundId}
        shotNumber={hole.shots.length + 1}
        prevShot={prevShot}
        onShotRecorded={onShotRecorded}
      />

      {penalties > 0 ? (
        <div className="flex items-center justify-between bg-red-50 border border-red-200 rounded-xl px-4 py-3">
          <span className="text-base font-semibold text-red-700">ペナルティ</span>
          <div className="flex items-center gap-3">
            <button
              onClick={onRemovePenalty}
              className="w-10 h-10 rounded-lg bg-white border border-red-200 text-red-600
                         font-bold text-xl transition-colors active:scale-95 hover:bg-red-50"
            >
              −
            </button>
            <span className="text-2xl font-bold text-red-700 tabular-nums w-8 text-center">
              {penalties}
            </span>
            <button
              onClick={onAddPenalty}
              className="w-10 h-10 rounded-lg bg-red-500 hover:bg-red-600 text-white
                         font-bold text-xl transition-colors active:scale-95"
            >
              ＋
            </button>
          </div>
        </div>
      ) : (
        <button
          onClick={onAddPenalty}
          className="w-full py-3 rounded-xl border border-dashed border-red-200 text-red-400
                     text-base font-medium hover:bg-red-50 transition-colors active:scale-95"
        >
          ＋ ペナルティ追加（OB・前進4打など）
        </button>
      )}
    </div>
  );
}

function PuttSelector({
  shotCount, penalties, par, isLastHole, onSelect,
}: {
  shotCount: number;
  penalties: number;
  par: number;
  isLastHole: boolean;
  onSelect: (putts: number) => void;
}) {
  const [selectedPutts, setSelectedPutts] = useState<number | null>(null);

  const total       = selectedPutts != null ? shotCount + penalties + selectedPutts : null;
  const diff        = total != null ? total - par : null;
  const resultLabel = diff != null
    ? diff <= -2 ? "イーグル" : diff === -1 ? "バーディ" :
      diff === 0 ? "パー"     : diff === 1  ? "ボギー"   :
      diff === 2 ? "ダブル"   : `+${diff}`
    : null;

  return (
    <div className="card space-y-4">
      <div className="text-center">
        <p className="text-xl font-bold text-green-800">パット数は？</p>
        <p className="text-base text-green-500">
          ショット {shotCount}打
          {penalties > 0 && <span className="text-red-500"> +{penalties}罰</span>}
          {" "}+ パット
        </p>
      </div>
      <div className="grid grid-cols-4 gap-2">
        {[1, 2, 3, 4, 5, 6, 7, 8].map((putts) => {
          const t = shotCount + penalties + putts;
          const d = t - par;
          const label =
            d <= -2 ? "イーグル" : d === -1 ? "バーディ" :
            d === 0 ? "パー"     : d === 1  ? "ボギー"   :
            d === 2 ? "ダブル"   : `+${d}`;
          const isSelected = selectedPutts === putts;
          const color = isSelected
            ? "border-green-700 bg-green-700 text-white scale-105"
            : d <= -1 ? "border-red-400 bg-red-50 text-red-700" :
              d === 0  ? "border-green-500 bg-green-50 text-green-700" :
              d === 1  ? "border-blue-400 bg-blue-50 text-blue-700" :
              "border-gray-300 bg-gray-50 text-gray-700";
          return (
            <button key={putts} onClick={() => setSelectedPutts(putts)}
              className={`flex flex-col items-center py-5 rounded-2xl border-2 font-bold
                          transition-all active:scale-95 ${color}`}>
              <span className="text-4xl">{putts}</span>
              <span className="text-sm mt-1 font-medium">{label}</span>
              <span className="text-sm font-bold">{t}打</span>
            </button>
          );
        })}
      </div>

      {selectedPutts != null && total != null && resultLabel != null && (
        <div className="space-y-3">
          <div className="text-center py-2 bg-green-50 rounded-xl">
            <p className="text-base text-green-600">
              {shotCount}打
              {penalties > 0 && <span className="text-red-500"> +{penalties}罰</span>}
              {" "}+ {selectedPutts}パット ={" "}
              <span className="font-bold">{total}打</span>
            </p>
            <p className="font-bold text-xl text-green-800">{resultLabel}</p>
          </div>
          <button
            onClick={() => onSelect(selectedPutts)}
            className="w-full py-4 rounded-2xl bg-green-600 hover:bg-green-700 active:bg-green-800
                       text-white font-bold text-xl transition-colors">
            {isLastHole ? "ラウンド終了" : "次のホールへ →"}
          </button>
        </div>
      )}
    </div>
  );
}

function CompletedHoleCard({
  hole, mode, expanded, editing, onToggle, onToggleEdit, onUpdateClub, onUpdateLie, onUpdateBallDirection, onUpdateScore,
}: {
  hole: Hole;
  mode: "shot" | "score";
  expanded: boolean;
  editing: { id: string; type: "club" | "lie" | "direction" } | null;
  onToggle: () => void;
  onToggleEdit: (id: string, type: "club" | "lie" | "direction") => void;
  onUpdateClub: (id: string, club: Club) => void;
  onUpdateLie: (id: string, lie: string) => void;
  onUpdateBallDirection: (id: string, dir: string) => void;
  onUpdateScore: (holeId: string, newScore: number) => void;
}) {
  const [scoreEditing, setScoreEditing] = useState(false);
  const { text, cls } = scoreLabel(hole.score!, hole.par);

  return (
    <div className="card">
      {/* Header row */}
      <div className="flex items-center justify-between gap-1">
        <button onClick={onToggle} className="flex-1 flex items-center gap-2 min-w-0 text-left">
          <div className="w-8 h-8 bg-green-100 rounded-full flex items-center justify-center
                          text-green-700 font-bold text-sm shrink-0">
            {hole.hole_number}
          </div>
          <span className="text-base text-green-600 font-medium truncate">
            {mode === "score" ? (
              <>Par{hole.par} · {hole.score}打 / {hole.putts}P</>
            ) : (
              <>
                Par{hole.par} · {hole.shots.length}打
                {(hole.penalties ?? 0) > 0 && <span className="text-red-500">+{hole.penalties}罰</span>}
                +{hole.putts}P
              </>
            )}
          </span>
        </button>
        <div className="flex items-center gap-1 shrink-0">
          <span className={`px-2.5 py-1 rounded-full text-sm font-bold ${cls}`}>{text}</span>
          <button
            onClick={() => setScoreEditing((v) => !v)}
            className={`p-2.5 rounded-lg text-xl leading-none transition-colors ${
              scoreEditing ? "text-green-700 bg-green-100" : "text-green-300 hover:text-green-500"
            }`}
            aria-label="スコア修正"
          >
            ✏
          </button>
          <button onClick={onToggle} className="text-green-300 text-base p-2.5">
            {expanded ? "▲" : "▼"}
          </button>
        </div>
      </div>

      {/* Inline score editor */}
      {scoreEditing && (
        <ScoreEditor
          hole={hole}
          onSave={onUpdateScore}
          onClose={() => setScoreEditing(false)}
        />
      )}

      {/* Shot detail (expandable) */}
      {expanded && hole.shots.length > 0 && (
        <div className="mt-3 pt-3 border-t border-green-50">
          <ShotList
            shots={hole.shots}
            editing={editing}
            onToggleEdit={onToggleEdit}
            onUpdateClub={onUpdateClub}
            onUpdateLie={onUpdateLie}
            onUpdateBallDirection={onUpdateBallDirection}
          />
        </div>
      )}
    </div>
  );
}

// ── ScoreEditor ───────────────────────────────────────────────────────

function ScoreEditor({ hole, onSave, onClose }: {
  hole: Hole;
  onSave: (holeId: string, newScore: number) => void;
  onClose: () => void;
}) {
  const [value, setValue] = useState(hole.score ?? 1);

  function clamp(n: number) { return Math.max(1, n); }

  return (
    <div className="flex items-center gap-2 py-3 mt-2 border-t border-green-50">
      <button
        onClick={() => setValue((v) => clamp(v - 1))}
        className="w-14 h-14 rounded-xl bg-gray-100 hover:bg-gray-200 text-gray-700
                   font-bold text-2xl transition-colors active:scale-95"
      >
        −
      </button>
      <input
        type="number"
        value={value}
        min={1}
        onChange={(e) => {
          const n = parseInt(e.target.value);
          if (!isNaN(n)) setValue(clamp(n));
        }}
        className="w-16 text-center text-2xl font-bold text-green-800
                   border-b-2 border-green-400 bg-transparent outline-none"
      />
      <button
        onClick={() => setValue((v) => v + 1)}
        className="w-14 h-14 rounded-xl bg-gray-100 hover:bg-gray-200 text-gray-700
                   font-bold text-2xl transition-colors active:scale-95"
      >
        ＋
      </button>
      <div className="flex gap-1.5 ml-auto">
        <button onClick={onClose}
          className="px-4 py-3 rounded-lg border border-gray-200 text-gray-500 text-sm font-bold">
          閉じる
        </button>
        <button
          onClick={() => { onSave(hole.id, value); onClose(); }}
          className="px-4 py-3 rounded-lg bg-green-600 hover:bg-green-700 text-white text-sm font-bold transition-colors"
        >
          保存
        </button>
      </div>
    </div>
  );
}

// ── ShotList ─────────────────────────────────────────────────────────
// Button order: 番手 → 球筋 → ライ

function ShotList({
  shots, editing, onToggleEdit, onUpdateClub, onUpdateLie, onUpdateBallDirection,
}: {
  shots: Shot[];
  editing: { id: string; type: "club" | "lie" | "direction" } | null;
  onToggleEdit: (id: string, type: "club" | "lie" | "direction") => void;
  onUpdateClub: (id: string, club: Club) => void;
  onUpdateLie: (id: string, lie: string) => void;
  onUpdateBallDirection: (id: string, dir: string) => void;
}) {
  return (
    <div className="space-y-1">
      {[...shots].sort((a, b) => a.shot_number - b.shot_number).map((shot) => {
        const clubOpen = editing?.id === shot.id && editing.type === "club";
        const dirOpen  = editing?.id === shot.id && editing.type === "direction";
        const lieOpen  = editing?.id === shot.id && editing.type === "lie";
        const clubLabel = shot.club ? (CLUB_LABELS[shot.club as Club] ?? shot.club) : null;

        return (
          <div key={shot.id} className="border-b border-green-50 last:border-0">
            {/* Row: 番手 → 球筋 → ライ */}
            <div className="flex items-center justify-between py-3">
              <span className="text-base font-medium text-green-700">
                第{shot.shot_number}打
              </span>
              <div className="flex items-center gap-2">
                {shot.distance_yards && (
                  <span className="text-sm font-semibold text-green-600 tabular-nums">
                    {shot.distance_yards}y
                  </span>
                )}
                {/* ① 番手 */}
                <button
                  onClick={() => onToggleEdit(shot.id, "club")}
                  className={`text-sm px-3 py-2.5 rounded-lg border font-bold transition-colors ${
                    clubLabel
                      ? clubOpen
                        ? "bg-green-700 border-green-700 text-white"
                        : "bg-green-600 border-green-600 text-white"
                      : clubOpen
                        ? "bg-green-100 border-green-400 text-green-700"
                        : "bg-gray-50 border-gray-200 text-gray-400"
                  }`}
                >
                  {clubLabel ?? "番手"}
                </button>
                {/* ② 球筋 */}
                <button
                  onClick={() => onToggleEdit(shot.id, "direction")}
                  className={`text-sm px-3 py-2.5 rounded-lg border font-bold transition-colors ${
                    shot.ball_direction
                      ? dirOpen
                        ? "bg-green-700 border-green-700 text-white"
                        : "bg-green-100 border-green-300 text-green-700"
                      : dirOpen
                        ? "bg-green-100 border-green-400 text-green-700"
                        : "bg-gray-50 border-gray-200 text-gray-400"
                  }`}
                >
                  {shot.ball_direction ? BALL_DIRECTION_SHORT[shot.ball_direction] : "球筋"}
                </button>
                {/* ③ ライ */}
                <button
                  onClick={() => onToggleEdit(shot.id, "lie")}
                  className={`text-sm px-3 py-2.5 rounded-lg border font-bold transition-colors ${
                    shot.lie_type
                      ? lieOpen
                        ? "bg-green-700 border-green-700 text-white"
                        : "bg-green-100 border-green-300 text-green-700"
                      : lieOpen
                        ? "bg-green-100 border-green-400 text-green-700"
                        : "bg-gray-50 border-gray-200 text-gray-400"
                  }`}
                >
                  {lieLabelShort(shot.lie_type)}
                </button>
              </div>
            </div>

            {/* Club picker */}
            {clubOpen && (
              <div className="pb-2 space-y-1.5">
                {[WOOD_CLUBS, UTIL_CLUBS, IRON_CLUBS, WEDGE_CLUBS].map((row, i) => (
                  <div
                    key={i}
                    className="grid gap-1.5"
                    style={{ gridTemplateColumns: `repeat(${row.length}, minmax(0, 1fr))` }}
                  >
                    {row.map((c) => (
                      <button key={c} onClick={() => onUpdateClub(shot.id, c)}
                        className={`py-3.5 rounded-lg text-sm font-bold border transition-colors ${
                          shot.club === c
                            ? "bg-green-600 border-green-600 text-white"
                            : "bg-white border-green-200 text-green-800 hover:bg-green-50"
                        }`}>
                        {CLUB_LABELS[c]}
                      </button>
                    ))}
                  </div>
                ))}
              </div>
            )}

            {/* Ball direction picker */}
            {dirOpen && (
              <div className="grid grid-cols-5 gap-1.5 pb-2">
                {BALL_DIRECTION_OPTIONS.map((dir) => (
                  <button key={dir} onClick={() => onUpdateBallDirection(shot.id, dir)}
                    className={`py-3.5 rounded-lg text-sm font-bold border transition-colors ${
                      shot.ball_direction === dir
                        ? "bg-green-600 border-green-600 text-white"
                        : "bg-white border-green-200 text-green-700 hover:bg-green-50"
                    }`}>
                    {BALL_DIRECTION_LABELS[dir]}
                  </button>
                ))}
              </div>
            )}

            {/* Lie picker (2-stage) */}
            {lieOpen && (
              <LiePicker
                shotId={shot.id}
                currentLie={shot.lie_type}
                onSave={onUpdateLie}
              />
            )}
          </div>
        );
      })}
    </div>
  );
}

// ── LiePicker: 2-stage lie selection ─────────────────────────────────
// Stage 1: FW / 右 / 左 / ショート / オーバー
// Stage 2 (non-FW): OB / ペナ / バンカー / ラフ → count 1-8

function LiePicker({
  shotId, currentLie, onSave,
}: {
  shotId: string;
  currentLie: string | null;
  onSave: (shotId: string, lie: string) => void;
}) {
  const init = parseLieParts(currentLie);
  const [s1, setS1] = useState<LieS1 | null>(init.s1);
  const [s2, setS2] = useState<LieS2 | null>(init.s2);
  const [count, setCount] = useState<number | null>(init.count);

  function selectS1(val: LieS1) {
    setS1(val);
    setS2(null);
    setCount(null);
    if (val === "fairway") {
      onSave(shotId, "fairway");
    }
  }

  function selectS2(val: LieS2) {
    setS2(val);
    setCount(null);
  }

  function selectCount(n: number) {
    setCount(n);
    if (!s1 || !s2) return;
    onSave(shotId, `${s1}:${s2}:${n}`);
  }

  return (
    <div className="pb-2 space-y-2">
      {/* Stage 1 */}
      <div className="grid grid-cols-5 gap-1.5">
        {LIE_S1.map((val) => (
          <button key={val} onClick={() => selectS1(val)}
            className={`py-3.5 rounded-lg text-sm font-bold border transition-colors ${
              s1 === val
                ? "bg-green-600 border-green-600 text-white"
                : "bg-white border-green-200 text-green-700 hover:bg-green-50"
            }`}>
            {LIE_S1_LABEL[val]}
          </button>
        ))}
      </div>

      {/* Stage 2: shown when non-fairway selected */}
      {s1 && s1 !== "fairway" && (
        <div className="grid grid-cols-4 gap-1.5">
          {LIE_S2.map((val) => (
            <button key={val} onClick={() => selectS2(val)}
              className={`py-3.5 rounded-lg text-sm font-bold border transition-colors ${
                s2 === val
                  ? "bg-orange-500 border-orange-500 text-white"
                  : "bg-white border-orange-200 text-orange-700 hover:bg-orange-50"
              }`}>
              {LIE_S2_LABEL[val]}
            </button>
          ))}
        </div>
      )}

      {/* Count 1-8: shown when stage 2 selected */}
      {s1 && s1 !== "fairway" && s2 && (
        <>
          <p className="text-sm text-gray-400 font-medium">回数</p>
          <div className="grid grid-cols-4 gap-1.5">
            {[1, 2, 3, 4, 5, 6, 7, 8].map((n) => (
              <button key={n} onClick={() => selectCount(n)}
                className={`py-3.5 rounded-lg text-base font-bold border transition-colors ${
                  count === n
                    ? "bg-gray-600 border-gray-600 text-white"
                    : "bg-white border-gray-200 text-gray-700 hover:bg-gray-50"
                }`}>
                {n}
              </button>
            ))}
          </div>
        </>
      )}
    </div>
  );
}

// ── Distance measurement clubs ────────────────────────────────────────
const DM_CLUBS = [
  { value: "driver", label: "ドライバー" },
  { value: "3w",     label: "3W" },
  { value: "5w",     label: "5W" },
  { value: "4i",     label: "4I" },
  { value: "5i",     label: "5I" },
  { value: "6i",     label: "6I" },
  { value: "7i",     label: "7I" },
  { value: "8i",     label: "8I" },
  { value: "9i",     label: "9I" },
  { value: "pw",     label: "PW" },
  { value: "aw",     label: "AW" },
  { value: "sw",     label: "SW" },
  { value: "putter", label: "パター" },
] as const;

// ── ScoreEntryCard: score mode hole completion ────────────────────────

function ScoreEntryCard({
  hole, isLastHole, onComplete, roundShotHistory, onShotDistanceRecorded,
}: {
  hole: Hole;
  isLastHole: boolean;
  onComplete: (score: number, putts: number) => void;
  roundShotHistory: RoundShotEntry[];
  onShotDistanceRecorded: (entry: RoundShotEntry) => void;
}) {
  const [strokes, setStrokes] = useState(hole.score ?? hole.par);
  const [putts, setPutts]     = useState(hole.putts ?? 2);

  // Distance measurement state
  const [showDM, setShowDM]         = useState(false);
  const [showHistory, setShowHistory] = useState(false);
  const [dmStart, setDmStart]       = useState<{lat: number; lng: number} | null>(null);
  const [dmEnd, setDmEnd]           = useState<{lat: number; lng: number} | null>(null);
  const [dmLoading, setDmLoading]   = useState<"idle" | "start" | "end">("idle");
  const [dmDistance, setDmDistance] = useState<{yards: number; meters: number} | null>(null);
  const [dmClub, setDmClub]         = useState("driver");
  const [dmSaved, setDmSaved]       = useState(false);
  const [dmHistory, setDmHistory]   = useState<Array<{club: string; yards: number; meters: number}>>([]);

  async function handleDmStart() {
    if (!navigator.geolocation) return;
    setDmLoading("start");
    try {
      const pos = await new Promise<GeolocationPosition>((resolve, reject) =>
        navigator.geolocation.getCurrentPosition(resolve, reject, {
          enableHighAccuracy: true, timeout: 15000, maximumAge: 0,
        })
      );
      setDmStart({ lat: pos.coords.latitude, lng: pos.coords.longitude });
      setDmEnd(null);
      setDmDistance(null);
    } catch {
      // GPS unavailable
    } finally {
      setDmLoading("idle");
    }
  }

  async function handleDmEnd() {
    if (!navigator.geolocation || !dmStart) return;
    setDmLoading("end");
    try {
      const pos = await new Promise<GeolocationPosition>((resolve, reject) =>
        navigator.geolocation.getCurrentPosition(resolve, reject, {
          enableHighAccuracy: true, timeout: 15000, maximumAge: 0,
        })
      );
      const endLat = pos.coords.latitude;
      const endLng = pos.coords.longitude;
      setDmEnd({ lat: endLat, lng: endLng });
      const distM = calculateDistance(
        { latitude: dmStart.lat, longitude: dmStart.lng },
        { latitude: endLat, longitude: endLng }
      );
      const distY = metersToYards(distM);
      setDmDistance({ yards: distY, meters: Math.round(distM * 10) / 10 });
    } catch {
      // GPS unavailable
    } finally {
      setDmLoading("idle");
    }
  }

  async function handleDmSave() {
    if (!dmDistance) return;
    const supabase = createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return;
    await supabase.from("shot_distances").insert({
      user_id: user.id,
      club: dmClub,
      distance_yards: dmDistance.yards,
      distance_meters: dmDistance.meters,
    });
    onShotDistanceRecorded({ holeNumber: hole.hole_number, club: dmClub, yards: dmDistance.yards, meters: dmDistance.meters });
    setDmHistory((prev) => [...prev, { club: dmClub, yards: dmDistance.yards, meters: dmDistance.meters }]);
    setDmSaved(true);
    setTimeout(() => {
      setDmStart(null);
      setDmEnd(null);
      setDmDistance(null);
      setDmSaved(false);
    }, 1500);
  }

  const diff = strokes - hole.par;
  const resultLabel =
    diff <= -2 ? "イーグル" : diff === -1 ? "バーディ" :
    diff === 0  ? "パー"     : diff === 1  ? "ボギー"   :
    diff === 2  ? "ダブル"   : `+${diff}`;

  const resultColor =
    diff <= -2 ? "text-yellow-600" : diff === -1 ? "text-red-500" :
    diff === 0  ? "text-green-600" : diff === 1  ? "text-blue-500" : "text-gray-500";

  return (
    <div className="card space-y-5">
      {/* Header */}
      <div className="text-center">
        <div className="flex items-center justify-center gap-2 mb-1">
          <div className="w-8 h-8 bg-green-600 rounded-full flex items-center justify-center
                          text-white font-bold text-sm">
            {hole.hole_number}
          </div>
          <p className="text-xl font-bold text-green-800">ホール {hole.hole_number}</p>
        </div>
        <p className="text-base text-green-500">パー {hole.par}</p>
      </div>

      {/* Shot distance measurement */}
      <div className="space-y-2">
        {dmHistory.length > 0 && (
          <div className="bg-green-50 rounded-xl px-4 py-3 space-y-1.5">
            <p className="text-xs font-semibold text-green-500 mb-1">飛距離記録</p>
            {dmHistory.map((r, i) => (
              <div key={i} className="flex justify-between text-sm">
                <span className="text-green-600 font-medium">
                  {DM_CLUBS.find((c) => c.value === r.club)?.label ?? r.club}
                </span>
                <span className="font-bold text-green-800 tabular-nums">
                  {r.yards}y ({Math.round(r.meters)}m)
                </span>
              </div>
            ))}
          </div>
        )}
        {!showDM ? (
          <>
            <button
              onClick={() => setShowDM(true)}
              className="w-full py-5 rounded-2xl border-2 border-green-300 bg-green-50 text-green-700
                         hover:bg-green-100 font-bold text-base transition-colors active:scale-95"
            >
              📍 このショットの飛距離を記録する
            </button>
            <button
              onClick={() => setShowHistory((v) => !v)}
              className="w-full py-1.5 text-sm text-green-600 font-medium text-center hover:underline"
            >
              📋 今日のショット記録を見る
              {roundShotHistory.length > 0 && ` (${roundShotHistory.length}件)`}
            </button>
            {showHistory && (
              <div className="bg-green-50 rounded-xl p-4 space-y-2">
                <p className="text-sm font-semibold text-green-700 text-center">今日のショット記録</p>
                {roundShotHistory.length === 0 ? (
                  <p className="text-sm text-gray-400 text-center py-2">まだ記録がありません</p>
                ) : (
                  <div className="space-y-1.5">
                    {roundShotHistory.map((entry, i) => (
                      <div key={i} className="flex items-center justify-between text-sm border-b border-green-100 pb-1.5 last:border-0 last:pb-0">
                        <span className="text-green-600 font-medium w-10">{entry.holeNumber}H</span>
                        <span className="text-green-700 flex-1 text-center">
                          {DM_CLUBS.find((c) => c.value === entry.club)?.label ?? entry.club}
                        </span>
                        <span className="font-bold text-green-900 tabular-nums">
                          {entry.yards}y ({Math.round(entry.meters)}m)
                        </span>
                      </div>
                    ))}
                  </div>
                )}
                <button
                  onClick={() => setShowHistory(false)}
                  className="w-full pt-1 text-xs text-gray-400 text-center"
                >
                  閉じる
                </button>
              </div>
            )}
          </>
        ) : (
          <div className="border-2 border-green-200 rounded-2xl p-4 space-y-3 bg-green-50">
            <div>
              <p className="text-xs font-semibold text-green-600 mb-1.5">使用クラブ</p>
              <select
                value={dmClub}
                onChange={(e) => setDmClub(e.target.value)}
                className="w-full px-3 py-2 rounded-xl border border-green-200 bg-white text-green-900
                           text-sm font-medium focus:outline-none focus:ring-2 focus:ring-green-400"
              >
                {DM_CLUBS.map((c) => (
                  <option key={c.value} value={c.value}>{c.label}</option>
                ))}
              </select>
            </div>
            <button
              onClick={handleDmStart}
              disabled={dmLoading !== "idle"}
              className={`w-full py-4 rounded-2xl border-2 font-bold text-base transition-colors
                          active:scale-95 disabled:opacity-50 ${
                dmStart
                  ? "border-green-500 bg-green-500 text-white"
                  : "border-green-300 bg-white text-green-700 hover:bg-green-50"
              }`}
            >
              {dmLoading === "start" ? "📡 GPS取得中..." : dmStart ? "✅ 打点を記録済み" : "📍 打つ前に押してね"}
            </button>
            <button
              onClick={handleDmEnd}
              disabled={dmLoading !== "idle" || !dmStart}
              className={`w-full py-4 rounded-2xl border-2 font-bold text-base transition-colors
                          active:scale-95 disabled:opacity-50 ${
                dmEnd
                  ? "border-blue-500 bg-blue-500 text-white"
                  : "border-blue-300 bg-white text-blue-700 hover:bg-blue-50"
              }`}
            >
              {dmLoading === "end" ? "📡 GPS取得中..." : dmEnd ? "✅ 着地点を記録済み" : "📍 止まった場所で押してね"}
            </button>
            {dmDistance && (
              <div className="bg-white rounded-xl px-4 py-3 text-center border border-green-200">
                <p className="text-xs text-green-500 mb-0.5">飛距離</p>
                <p className="text-2xl font-bold text-green-900 tabular-nums">
                  {dmDistance.yards}ヤード（{Math.round(dmDistance.meters)}m）
                </p>
              </div>
            )}
            <div className="flex gap-2">
              <button
                onClick={() => {
                  setShowDM(false);
                  setDmStart(null);
                  setDmEnd(null);
                  setDmDistance(null);
                  setDmSaved(false);
                }}
                className="flex-1 py-3 rounded-xl border border-gray-200 text-gray-500
                           hover:bg-gray-50 text-sm font-medium transition-colors active:scale-95"
              >
                閉じる
              </button>
              {dmDistance && (
                <button
                  onClick={handleDmSave}
                  disabled={dmSaved}
                  className="flex-1 py-3 rounded-xl bg-green-600 hover:bg-green-700 text-white
                             font-bold text-sm transition-colors active:scale-95 disabled:opacity-60"
                >
                  {dmSaved ? "✅ 保存済み" : "記録する"}
                </button>
              )}
            </div>
          </div>
        )}
      </div>

      {/* Stroke counter */}
      <div className="space-y-2">
        <p className="text-sm font-semibold text-green-600 text-center">スコア（打数）</p>
        <div className="flex items-center justify-center gap-6">
          <button
            onClick={() => setStrokes((v) => Math.max(1, v - 1))}
            className="w-14 h-14 rounded-xl bg-gray-100 hover:bg-gray-200 text-gray-700
                       font-bold text-2xl transition-colors active:scale-95"
          >
            −
          </button>
          <span className="text-6xl font-bold text-green-900 tabular-nums w-16 text-center">
            {strokes}
          </span>
          <button
            onClick={() => setStrokes((v) => v + 1)}
            className="w-14 h-14 rounded-xl bg-gray-100 hover:bg-gray-200 text-gray-700
                       font-bold text-2xl transition-colors active:scale-95"
          >
            ＋
          </button>
        </div>
        <p className={`text-center text-lg font-bold ${resultColor}`}>{resultLabel}</p>
      </div>

      {/* Putt counter */}
      <div className="space-y-2">
        <p className="text-sm font-semibold text-green-600 text-center">パット数</p>
        <div className="flex items-center justify-center gap-6">
          <button
            onClick={() => setPutts((v) => Math.max(0, v - 1))}
            className="w-14 h-14 rounded-xl bg-gray-100 hover:bg-gray-200 text-gray-700
                       font-bold text-2xl transition-colors active:scale-95"
          >
            −
          </button>
          <span className="text-6xl font-bold text-green-900 tabular-nums w-16 text-center">
            {putts}
          </span>
          <button
            onClick={() => setPutts((v) => v + 1)}
            className="w-14 h-14 rounded-xl bg-gray-100 hover:bg-gray-200 text-gray-700
                       font-bold text-2xl transition-colors active:scale-95"
          >
            ＋
          </button>
        </div>
      </div>

      <button
        onClick={() => onComplete(strokes, putts)}
        className="w-full py-4 rounded-2xl bg-green-600 hover:bg-green-700 active:bg-green-800
                   text-white font-bold text-xl transition-colors"
      >
        {isLastHole ? "ラウンド終了" : "次のホールへ →"}
      </button>
    </div>
  );
}

// ── Wind compass ──────────────────────────────────────────────────────

const COMPASS_STORAGE_KEY = "golfCaddieWindCompass";

const WIND_ARROWS: Record<string, string> = {
  "北": "↑", "北東": "↗", "東": "→", "南東": "↘",
  "南": "↓", "南西": "↙", "西": "←", "北西": "↖",
};

// Direction text → compass degrees (wind FROM this direction)
const DIR_DEG: Record<string, number> = {
  "北": 0, "北東": 45, "東": 90, "南東": 135,
  "南": 180, "南西": 225, "西": 270, "北西": 315,
};

// Approximate m/s mid-value for each wind speed label
const SPEED_MS: Record<string, string> = {
  "無風": "1 m/s", "微風": "5 m/s", "普通": "9 m/s", "強風": "13 m/s",
};

function WindCompassSection({
  windDirection, windSpeed, visible, onToggle,
}: {
  windDirection?: string | null;
  windSpeed?: string | null;
  visible: boolean;
  onToggle: () => void;
}) {
  return (
    <div className="space-y-2">
      {/* Toggle row */}
      <div className="flex items-center justify-between px-1">
        <div className="flex items-center gap-1.5 text-sm text-sky-600">
          <span className="text-base">{windDirection ? WIND_ARROWS[windDirection] ?? "🧭" : "🧭"}</span>
          <span className="font-medium">{windDirection ?? "—"}</span>
          <span className="text-sky-400 text-xs">/ {windSpeed ?? "—"}</span>
        </div>
        <button
          onClick={onToggle}
          className={`text-xs font-semibold px-3 py-1 rounded-full border transition-colors ${
            visible
              ? "bg-sky-100 border-sky-300 text-sky-700"
              : "bg-gray-100 border-gray-200 text-gray-500"
          }`}
        >
          🧭 {visible ? "OFF" : "ON"}
        </button>
      </div>

      {/* Compass */}
      {visible && <WindCompass windDirection={windDirection} windSpeed={windSpeed} />}
    </div>
  );
}

function WindCompass({
  windDirection, windSpeed,
}: {
  windDirection?: string | null;
  windSpeed?: string | null;
}) {
  const deg       = windDirection ? (DIR_DEG[windDirection] ?? 0) : 0;
  const speedText = windSpeed ? (SPEED_MS[windSpeed] ?? windSpeed) : null;
  // SVG constants
  const cx = 100, cy = 100, r = 80;

  return (
    <div className="flex flex-col items-center gap-1 w-[62vw] max-w-[240px] mx-auto">
      <svg viewBox="0 0 200 200" className="w-full">
        {/* Outer ring */}
        <circle cx={cx} cy={cy} r={r} fill="none" stroke="#bae6fd" strokeWidth="1.5" />
        {/* Inner ring */}
        <circle cx={cx} cy={cy} r={r * 0.4} fill="none" stroke="#e0f2fe" strokeWidth="1" strokeDasharray="3 3" />
        {/* Crosshair — horizontal */}
        <line x1={cx - r} y1={cy} x2={cx + r} y2={cy}
              stroke="#7dd3fc" strokeWidth="1" strokeDasharray="5 4" />
        {/* Crosshair — vertical */}
        <line x1={cx} y1={cy - r} x2={cx} y2={cy + r}
              stroke="#7dd3fc" strokeWidth="1" strokeDasharray="5 4" />
        {/* Cardinal labels */}
        <text x={cx}      y={cy - r - 7}  textAnchor="middle" fontSize="13" fill="#0ea5e9" fontWeight="700">北</text>
        <text x={cx}      y={cy + r + 17} textAnchor="middle" fontSize="13" fill="#0ea5e9" fontWeight="700">南</text>
        <text x={cx + r + 13} y={cy + 5}  textAnchor="middle" fontSize="13" fill="#0ea5e9" fontWeight="700">東</text>
        <text x={cx - r - 13} y={cy + 5}  textAnchor="middle" fontSize="13" fill="#0ea5e9" fontWeight="700">西</text>
        {/* Rotating wind arrow group */}
        <g transform={`rotate(${deg} ${cx} ${cy})`}>
          {/* Shaft */}
          <line x1={cx} y1={cy + 48} x2={cx} y2={cy - 52}
                stroke="#0284c7" strokeWidth="3" strokeLinecap="round" />
          {/* Arrowhead pointing up (= wind origin direction) */}
          <polygon
            points={`${cx},${cy - 66} ${cx - 9},${cy - 50} ${cx + 9},${cy - 50}`}
            fill="#0284c7"
          />
          {/* Tail feathers */}
          <line x1={cx - 9} y1={cy + 48} x2={cx} y2={cy + 34}
                stroke="#0284c7" strokeWidth="2.5" strokeLinecap="round" />
          <line x1={cx + 9} y1={cy + 48} x2={cx} y2={cy + 34}
                stroke="#0284c7" strokeWidth="2.5" strokeLinecap="round" />
        </g>
        {/* Center dot */}
        <circle cx={cx} cy={cy} r={4} fill="#0284c7" />
      </svg>

      {/* Speed label */}
      {speedText && (
        <p className="text-sky-600 text-sm font-semibold tabular-nums">{speedText}</p>
      )}
    </div>
  );
}

// ── Round end confirmation screen ───────────────────────────────────

function RoundEndScreen({ onConfirm, confirming }: { onConfirm: () => void; confirming?: boolean }) {
  return (
    <div className="min-h-screen flex flex-col items-center justify-center p-6 bg-gradient-to-b from-green-50 to-white">
      <div className="flex flex-col items-center gap-5 max-w-sm w-full">
        <img
          src="/characters/ai.png"
          alt="AIキャディ"
          className="w-28 h-28 object-contain drop-shadow-md"
        />
        <div className="bg-white border border-green-200 rounded-2xl p-5 shadow-sm text-center space-y-1">
          <p className="text-green-800 text-base leading-relaxed">
            今日はお疲れ様でした。ディボット跡やバンカーの足跡、グリーン上でのボールマークの修復、ありがとうございました！
          </p>
        </div>
        <p className="text-green-500 text-sm text-center">
          GPS機能とゴルフ場データとの接続を終了します。
        </p>
        <button
          onClick={onConfirm}
          disabled={confirming}
          className="w-full py-4 rounded-2xl bg-green-600 hover:bg-green-700 active:bg-green-800 text-white text-base font-bold transition-colors shadow-md disabled:opacity-60"
        >
          {confirming ? "集計中..." : "ラウンド終了"}
        </button>
      </div>
    </div>
  );
}

// ── Payment required modal (post-pay round flow) ────────────────────

function PaymentRequiredModal({
  onPay, onClose, loading, error,
}: {
  onPay: () => void;
  onClose: () => void;
  loading: boolean;
  error: string;
}) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
      <div className="bg-white rounded-2xl max-w-sm w-full p-6 space-y-4 shadow-xl">
        <div className="text-center space-y-2">
          <span className="text-4xl">💳</span>
          <h2 className="text-lg font-bold text-green-800">決済のお願い</h2>
        </div>
        <p className="text-sm text-gray-700 leading-relaxed">
          本日のラウンドデータを保存するには、<strong>本日23:59まで</strong>の決済が必要です。
          未決済の場合、<strong>明日午前0:30にデータは自動削除</strong>されます。
        </p>
        <div className="bg-green-50 rounded-lg p-3 text-center">
          <p className="text-xs text-green-700">ラウンド利用料</p>
          <p className="text-2xl font-bold text-green-800">330円</p>
        </div>
        {error && (
          <p className="text-xs text-red-600 bg-red-50 border border-red-200 rounded-lg px-3 py-2">
            ⚠️ {error}
          </p>
        )}
        <button
          onClick={onPay}
          disabled={loading}
          className="w-full py-3 rounded-xl bg-green-600 hover:bg-green-700 active:bg-green-800
                     text-white text-sm font-bold transition-colors disabled:opacity-60"
        >
          {loading ? "決済ページへ移動中..." : "今すぐ決済する"}
        </button>
        <button
          onClick={onClose}
          disabled={loading}
          className="w-full text-xs text-gray-500 underline"
        >
          あとで決済する
        </button>
      </div>
    </div>
  );
}

// ── Round complete ──────────────────────────────────────────────────

function RoundComplete({
  holes, totalScore, totalPar, mode, handicapDiff, paymentPending, onPayNow,
}: {
  holes: Hole[];
  totalScore: number;
  totalPar: number;
  mode: "shot" | "score";
  handicapDiff?: number | null;
  paymentPending?: boolean;
  onPayNow?: () => void;
}) {
  const diff       = totalScore - totalPar;
  const totalPutts = holes.reduce((s, h) => s + (h.putts ?? 0), 0);
  const out        = holes.slice(0, 9).reduce((s, h) => s + (h.score ?? 0), 0);
  const outPutts   = holes.slice(0, 9).reduce((s, h) => s + (h.putts ?? 0), 0);
  const inn        = holes.slice(9).reduce((s, h)  => s + (h.score ?? 0), 0);
  const innPutts   = holes.slice(9).reduce((s, h)  => s + (h.putts ?? 0), 0);

  return (
    <div className="space-y-4">
      <div className="bg-green-600 text-white rounded-2xl p-5 text-center">
        <p className="text-sm opacity-80">ラウンド完了</p>
        <p className="text-5xl font-bold tabular-nums mt-1">
          {totalScore}
          <span className="text-2xl font-normal opacity-80 ml-2">/ {totalPutts}P</span>
        </p>
        <p className="text-lg opacity-90">
          {diff === 0 ? "イーブン" : diff > 0 ? `+${diff}` : `${diff}`}
        </p>
        {holes.length === 18 && (
          <p className="text-sm opacity-70 mt-2">
            OUT {out} / {outPutts}P　IN {inn} / {innPutts}P
          </p>
        )}
      </div>

      {paymentPending && onPayNow && (
        <div className="bg-amber-50 border-2 border-amber-300 rounded-2xl p-4 space-y-3">
          <div className="flex items-start gap-2">
            <span className="text-xl">⚠️</span>
            <p className="text-sm text-amber-900 leading-relaxed">
              <strong>未決済です。</strong>本日23:59までに決済を完了してください。
              未決済の場合、明日午前0:30にこのラウンドのデータは自動削除されます。
            </p>
          </div>
          <button
            onClick={onPayNow}
            className="w-full py-3 rounded-xl bg-amber-600 hover:bg-amber-700 active:bg-amber-800
                       text-white text-sm font-bold transition-colors"
          >
            今すぐ330円を決済する
          </button>
        </div>
      )}

      {handicapDiff != null && (
        <div className="bg-amber-50 border border-amber-200 rounded-2xl p-4 text-center space-y-1">
          <p className="text-xs text-amber-600 font-medium">ハンディキャップ差分（参考）</p>
          <p className="text-3xl font-bold tabular-nums text-amber-800">{handicapDiff}</p>
          <p className="text-xs text-amber-500">
            JGA方式に準じた計算です。公式ハンディキャップではありません。
          </p>
        </div>
      )}

      <div className="card overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="text-green-500 text-xs border-b border-green-100">
              <th className="text-left py-1">H</th>
              <th className="text-center py-1">Par</th>
              <th className="text-center py-1">打</th>
              <th className="text-center py-1">P</th>
              <th className="text-right py-1">計</th>
            </tr>
          </thead>
          <tbody>
            {holes.map((hole) => {
              const d = (hole.score ?? 0) - hole.par;
              const color =
                d <= -2 ? "text-yellow-600" :
                d === -1 ? "text-red-500" :
                d === 0  ? "text-green-600" :
                d === 1  ? "text-blue-500" : "text-gray-500";
              return (
                <tr key={hole.id} className="border-b border-green-50">
                  <td className="py-1 text-green-700 font-medium">{hole.hole_number}</td>
                  <td className="py-1 text-center text-green-500">{hole.par}</td>
                  <td className="py-1 text-center text-green-700">
                    {mode === "score"
                      ? (hole.score ?? 0) - (hole.putts ?? 0)
                      : hole.shots.length + (hole.penalties ?? 0)}
                  </td>
                  <td className="py-1 text-center text-green-500">{hole.putts ?? "—"}</td>
                  <td className={`py-1 text-right font-bold ${color}`}>{hole.score}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}
