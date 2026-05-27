import { createClient as createAdminClient } from "@supabase/supabase-js";
import { createClient } from "@/lib/supabase/server";
import Link from "next/link";
import { fetchTobashikkoRanking, joinBrandModel, type TobashikkoRankingRow, type TobashikkoMyRank, type TobashikkoRankingFilter } from "@/lib/tobashikko/ranking";

export const dynamic = "force-dynamic";

// ── 区分タブ定義 ──────────────────────────────────────────────
const CAT_TABS = [
  { key: "",             label: "全体" },
  { key: "am",           label: "アマ男性",  category: "amateur",   gender: "male" },
  { key: "af",           label: "アマ女性",  category: "amateur",   gender: "female" },
  { key: "pm",           label: "プロ男性",  category: "pro_coach", gender: "male" },
  { key: "pf",           label: "プロ女性",  category: "pro_coach", gender: "female" },
] as const;

const AGE_TABS = [
  { key: "",       label: "全年代" },
  { key: "20s",    label: "20代" },
  { key: "30s",    label: "30代" },
  { key: "40s",    label: "40代" },
  { key: "50s",    label: "50代" },
  { key: "60plus", label: "60代以上" },
] as const;

function catKeyForUser(category: string | null, gender: string | null): string {
  const tab = CAT_TABS.find(
    (t) => t.key && "category" in t && t.category === category && t.gender === gender
  );
  return tab?.key ?? "";
}

interface ActiveEvent {
  id:         string;
  event_name: string;
  start_date: string;
  end_date:   string;
}

function fmtDate(s: string) {
  return new Date(s).toLocaleDateString("ja-JP");
}

function Medal({ rank }: { rank: number }) {
  if (rank === 1) return <span className="text-2xl">🥇</span>;
  if (rank === 2) return <span className="text-2xl">🥈</span>;
  if (rank === 3) return <span className="text-2xl">🥉</span>;
  return <span className="text-sm font-bold text-amber-700">{rank}</span>;
}

export default async function PublicTobashikkoRankingPage({
  searchParams,
}: {
  searchParams: Promise<{ cat?: string; age?: string }>;
}) {
  const params = await searchParams;

  // 公開ページなので Service Role で集計（RLS bypass）。
  const admin = createAdminClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  );

  const todayStr = new Date().toISOString().split("T")[0];

  // ── 開催中の飛ばしっこGOイベントを取得 ─────────────────────────
  const { data: events } = await admin
    .from("events")
    .select("id, event_name, start_date, end_date")
    .eq("event_type", "tobashikko")
    .lte("start_date", todayStr)
    .gte("end_date",   todayStr)
    .order("start_date", { ascending: false })
    .limit(1);

  const event: ActiveEvent | undefined = events?.[0];

  if (!event) {
    return (
      <PageShell>
        <div className="card text-center py-10">
          <p className="text-4xl mb-3">🏌️</p>
          <p className="text-green-600 font-semibold">現在開催中の飛ばしっこGOはありません</p>
        </div>
      </PageShell>
    );
  }

  // ── ログインユーザー取得（未ログインでも動作する公開ページ） ────
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();

  // ── ユーザープロフィール取得（ログイン時のみ） ─────────────
  let nicknameConfigured = false;
  let userCatKey = "";
  let userCategory: string | null = null;
  let userGender: string | null = null;
  if (user) {
    const { data: prof } = await admin
      .from("profiles")
      .select("nickname, age_group, gender, category")
      .eq("id", user.id)
      .single();
    nicknameConfigured = !!(prof?.nickname?.trim() && prof?.age_group);
    userCategory = prof?.category ?? null;
    userGender = prof?.gender ?? null;
    userCatKey = catKeyForUser(userCategory, userGender);
  }

  // ── タブの選択状態を決定 ──────────────────────────────────
  const rawCat = params.cat ?? undefined;
  const rawAge = params.age ?? undefined;

  // URL にパラメータがなければ初期値を使う
  const hasExplicitCat = rawCat !== undefined;
  const activeCatKey = hasExplicitCat
    ? (CAT_TABS.some((t) => t.key === rawCat) ? rawCat : "")
    : (user ? userCatKey : "");
  const activeAgeKey = AGE_TABS.some((t) => t.key === rawAge) ? (rawAge ?? "") : "";

  // ── フィルタ構築 ──────────────────────────────────────────
  const activeCatTab = CAT_TABS.find((t) => t.key === activeCatKey);
  const filter: TobashikkoRankingFilter = {};
  if (activeCatTab && "category" in activeCatTab) {
    filter.category = activeCatTab.category;
    filter.gender = activeCatTab.gender;
  }
  if (activeAgeKey) filter.ageGroup = activeAgeKey;

  // ── ランキング集計 ─────────────────────────────────────────
  const { ranking, myRank } = await fetchTobashikkoRanking(
    admin,
    { start_date: event.start_date, end_date: event.end_date },
    user?.id,
    filter,
  );

  // ── ハイライト表示判定: 自分が含まれるフィルタのときだけ ─────
  const showHighlight = (() => {
    if (!user || !nicknameConfigured) return true;
    if (activeCatKey === "") return true;
    return activeCatKey === userCatKey;
  })();

  // ── フィルタのラベル生成 ─────────────────────────────────────
  const filterLabel = [
    activeCatTab?.key ? activeCatTab.label : "",
    activeAgeKey ? AGE_TABS.find((t) => t.key === activeAgeKey)?.label : "",
  ].filter(Boolean).join("・");

  return (
    <PageShell>
      {/* 開催中イベント情報 */}
      <div className="card border-2 border-amber-300 bg-gradient-to-r from-amber-50 to-orange-50">
        <p className="text-xs font-bold text-amber-700 mb-1">🚀 開催中</p>
        <h2 className="text-lg font-bold text-amber-900">{event.event_name}</h2>
        <p className="text-xs text-amber-600 mt-1">
          {fmtDate(event.start_date)} 〜 {fmtDate(event.end_date)}
        </p>
      </div>

      {/* 区分タブ */}
      <FilterTabs
        tabs={CAT_TABS}
        activeKey={activeCatKey}
        paramName="cat"
        otherParams={{ age: activeAgeKey }}
      />

      {/* 年代タブ */}
      <FilterTabs
        tabs={AGE_TABS}
        activeKey={activeAgeKey}
        paramName="age"
        otherParams={{ cat: activeCatKey }}
      />

      {/* 本人ハイライト（ログイン時 & 自分が含まれるフィルタ） */}
      {user && showHighlight && (
        <MyRankCard myRank={myRank} nicknameConfigured={nicknameConfigured} filterLabel={filterLabel} />
      )}

      {/* ランキング */}
      {ranking.length === 0 ? (
        <div className="card text-center py-10">
          <p className="text-4xl mb-3">🏌️</p>
          <p className="text-green-600 font-semibold">該当するエントリーはまだありません</p>
        </div>
      ) : (
        <div className="card space-y-2">
          {ranking.map((row) => {
            const driverText = joinBrandModel(row.driver_brand, row.driver_model);
            return (
              <div
                key={`${row.rank}-${row.nickname}-${row.round_date}`}
                className={`flex items-center gap-3 py-2 border-b border-green-50 last:border-0 ${
                  row.rank === 1 ? "bg-yellow-50/40 -mx-2 px-2 rounded" :
                  row.rank === 2 ? "bg-gray-50/60  -mx-2 px-2 rounded" :
                  row.rank === 3 ? "bg-orange-50/40 -mx-2 px-2 rounded" : ""
                }`}
              >
                <div className="w-9 text-center flex-shrink-0">
                  <Medal rank={row.rank} />
                </div>
                <div className="flex-1 min-w-0">
                  <p className="font-semibold text-green-900 truncate">{row.nickname}</p>
                  {driverText && (
                    <p className="text-xs text-green-500 truncate">{driverText}</p>
                  )}
                  <p className="text-[10px] text-green-400 truncate">
                    {row.course_name} H{row.hole_number} {fmtDate(row.round_date)}
                  </p>
                </div>
                <div className="text-right flex-shrink-0">
                  <p className="text-lg font-bold text-amber-800 tabular-nums">
                    {row.distance_yards}
                    <span className="text-xs font-normal text-amber-500 ml-0.5">yd</span>
                  </p>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </PageShell>
  );
}

// ── フィルタタブ ─────────────────────────────────────────────
function FilterTabs({
  tabs,
  activeKey,
  paramName,
  otherParams,
}: {
  tabs: ReadonlyArray<{ key: string; label: string }>;
  activeKey: string;
  paramName: string;
  otherParams: Record<string, string>;
}) {
  return (
    <div className="flex gap-1.5 overflow-x-auto pb-1 -mx-1 px-1">
      {tabs.map((tab) => {
        const qs = new URLSearchParams();
        if (tab.key) qs.set(paramName, tab.key);
        for (const [k, v] of Object.entries(otherParams)) {
          if (v) qs.set(k, v);
        }
        const href = qs.toString() ? `?${qs.toString()}` : "/event/tobashikko/ranking";
        const isActive = tab.key === activeKey;
        return (
          <Link
            key={tab.key}
            href={href}
            className={`flex-shrink-0 px-3 py-1.5 rounded-full text-xs font-semibold transition-colors ${
              isActive
                ? "bg-green-700 text-white"
                : "bg-green-50 text-green-700 border border-green-200"
            }`}
          >
            {tab.label}
          </Link>
        );
      })}
    </div>
  );
}

// ── 本人ハイライトカード ─────────────────────────────────────
function MyRankCard({
  myRank,
  nicknameConfigured,
  filterLabel,
}: {
  myRank: TobashikkoMyRank | null;
  nicknameConfigured: boolean;
  filterLabel: string;
}) {
  if (!nicknameConfigured) {
    return (
      <div className="card border-2 border-amber-300 bg-gradient-to-r from-amber-50 to-orange-50 text-center py-6">
        <p className="text-amber-800 font-semibold">参加するにはニックネームの設定が必要です</p>
        <Link href="/event/tobashikko/settings" className="inline-block mt-3 text-sm font-bold text-amber-700 underline">
          設定ページへ
        </Link>
      </div>
    );
  }

  if (!myRank) {
    return (
      <div className="card border-2 border-amber-300 bg-gradient-to-r from-amber-50 to-orange-50 text-center py-6">
        <p className="text-amber-800 font-semibold">まだ記録がありません。エントリーして参加しよう！</p>
        <Link href="/event/tobashikko/entry" className="inline-block mt-3 text-sm font-bold text-amber-700 underline">
          エントリーページへ
        </Link>
      </div>
    );
  }

  const heading = filterLabel
    ? `🎯 あなたの順位（${filterLabel}）`
    : "🎯 あなたの順位";

  return (
    <div className="card border-2 border-amber-300 bg-gradient-to-r from-amber-50 to-orange-50 text-center py-6">
      <p className="text-xs font-bold text-amber-700 mb-1">{heading}</p>
      <p className="text-3xl font-bold text-amber-900">
        {myRank.rank}<span className="text-base font-normal text-amber-700 ml-1">位</span>
        <span className="text-sm font-normal text-amber-600 ml-2">/ {myRank.total}人中</span>
      </p>
      <p className="text-lg font-bold text-amber-800 mt-2 tabular-nums">
        {myRank.distance_yards}
        <span className="text-sm font-normal text-amber-500 ml-0.5">yd</span>
      </p>
    </div>
  );
}

// ── ページ共通シェル（ヘッダー + フッター） ─────────────────────────
function PageShell({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-screen pb-10">
      <div className="max-w-lg mx-auto p-4 space-y-5">
        <div className="pt-4">
          <h1 className="text-2xl font-bold text-green-800">飛ばしっこGO ランキング</h1>
          <p className="text-xs text-green-500 mt-1">
            ひとり1記録（期間内ベスト飛距離）を集計しています
          </p>
        </div>
        {children}
        <div className="pt-2 text-center">
          <Link href="/" className="text-xs text-green-600 underline">
            トップへ
          </Link>
        </div>
      </div>
    </div>
  );
}
