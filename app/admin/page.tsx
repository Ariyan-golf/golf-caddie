import { createClient } from "@/lib/supabase/server";
import { createClient as createAdminClient } from "@supabase/supabase-js";
import { redirect } from "next/navigation";
import Link from "next/link";
import { InviteCodeForm, PlanSelector, RoleSelector } from "./AdminActions";

const ADMIN_EMAIL = "t.a.0903076959@i.softbank.jp";

export default async function AdminPage({
  searchParams,
}: {
  searchParams: Promise<{ tab?: string }>;
}) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user || user.email !== ADMIN_EMAIL) redirect("/");

  const admin = createAdminClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  );

  const { tab = "invite" } = await searchParams;

  // ─── 共通データ ──────────────────────────────────────────────────
  const [{ data: profiles }, { data: authData }, { data: inviteCodes }] = await Promise.all([
    admin
      .from("profiles")
      .select("id, display_name, role, invite_code, graduation_year, plan, round_count, created_at")
      .order("created_at", { ascending: false }),
    admin.auth.admin.listUsers({ perPage: 1000 }),
    admin.from("invite_codes").select("*").order("created_at", { ascending: false }),
  ]);

  const emailMap = new Map(
    (authData?.users ?? []).map((u) => [u.id, u.email ?? "—"])
  );
  const users = (profiles ?? []).map((p) => ({
    ...p,
    email: emailMap.get(p.id) ?? "—",
  }));
  const studentCount = users.filter((u) => u.role === "student").length;
  const proCount     = users.filter((u) => u.role === "pro").length;

  // ─── 収益管理タブ専用データ ───────────────────────────────────────
  let revenueStats: RevenueStats | null = null;
  if (tab === "revenue") {
    revenueStats = await fetchRevenueStats(admin, users);
  }

  const tabs: { key: string; label: string }[] = [
    { key: "invite", label: "招待コード" },
    { key: "users",  label: "ユーザー管理" },
    { key: "revenue", label: "💰 収益管理" },
  ];

  return (
    <div className="min-h-screen p-4 max-w-5xl mx-auto space-y-6">
      <div className="pt-6">
        <h1 className="text-2xl font-bold text-green-800">管理画面</h1>
        <p className="text-green-600 text-sm mt-1">招待コード発行・ユーザー管理・収益管理</p>
      </div>

      {/* ── タブナビゲーション ─────────────────────────────── */}
      <div className="flex gap-1 border-b border-green-100">
        {tabs.map((t) => (
          <Link
            key={t.key}
            href={`/admin?tab=${t.key}`}
            className={`px-4 py-2.5 text-sm font-medium rounded-t-lg transition-colors ${
              tab === t.key
                ? "bg-green-600 text-white"
                : "text-green-600 hover:bg-green-50"
            }`}
          >
            {t.label}
          </Link>
        ))}
      </div>

      {/* ── 招待コード管理タブ ──────────────────────────────── */}
      {tab === "invite" && (
        <section className="space-y-4">
          <div className="bg-white border border-green-200 rounded-xl p-4 space-y-3">
            <p className="text-sm font-semibold text-green-700">新しい招待コードを発行</p>
            <InviteCodeForm />
          </div>

          <div className="bg-white border border-green-200 rounded-xl overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-green-100 text-green-600 text-xs">
                  <th className="text-left px-4 py-3 font-semibold">コード</th>
                  <th className="text-left px-4 py-3 font-semibold">ラベル</th>
                  <th className="text-left px-4 py-3 font-semibold">ロール</th>
                  <th className="text-left px-4 py-3 font-semibold">付与プラン</th>
                  <th className="text-left px-4 py-3 font-semibold">作成日</th>
                  <th className="px-4 py-3" />
                </tr>
              </thead>
              <tbody>
                {(inviteCodes ?? []).map((ic) => (
                  <tr key={ic.id} className="border-b border-green-50 last:border-0">
                    <td className="px-4 py-3 font-mono font-semibold text-green-900">{ic.code}</td>
                    <td className="px-4 py-3 text-green-600">{ic.label ?? "—"}</td>
                    <td className="px-4 py-3"><RoleBadge role={ic.role} /></td>
                    <td className="px-4 py-3"><PlanBadge plan={ic.plan ?? "free"} /></td>
                    <td className="px-4 py-3 text-green-400 text-xs">
                      {new Date(ic.created_at).toLocaleDateString("ja-JP")}
                    </td>
                    <td className="px-4 py-3 text-right">
                      {!ic.code.startsWith("TOKAI") && (
                        <span className="text-xs text-red-400 cursor-pointer hover:underline">削除</span>
                      )}
                    </td>
                  </tr>
                ))}
                {(inviteCodes ?? []).length === 0 && (
                  <tr>
                    <td colSpan={6} className="px-4 py-6 text-center text-green-400 text-sm">
                      招待コードがありません
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </section>
      )}

      {/* ── ユーザー管理タブ ────────────────────────────────── */}
      {tab === "users" && (
        <section className="space-y-4">
          <div className="bg-white border border-green-200 rounded-xl overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-green-100 text-green-600 text-xs">
                  <th className="text-left px-3 py-3 font-semibold whitespace-nowrap">名前</th>
                  <th className="text-left px-3 py-3 font-semibold whitespace-nowrap">メール</th>
                  <th className="text-left px-3 py-3 font-semibold whitespace-nowrap">ロール変更</th>
                  <th className="text-left px-3 py-3 font-semibold whitespace-nowrap">招待コード</th>
                  <th className="text-right px-3 py-3 font-semibold whitespace-nowrap">R数</th>
                  <th className="text-left px-3 py-3 font-semibold whitespace-nowrap">プラン変更</th>
                  <th className="text-left px-3 py-3 font-semibold whitespace-nowrap">登録日</th>
                </tr>
              </thead>
              <tbody>
                {users.length > 0 ? (
                  users.map((u) => (
                    <tr key={u.id} className="border-b border-green-50 last:border-0 hover:bg-green-50/50">
                      <td className="px-3 py-3 text-green-800 font-medium whitespace-nowrap">
                        {u.display_name ?? "—"}
                      </td>
                      <td className="px-3 py-3 text-green-700 whitespace-nowrap text-xs">{u.email}</td>
                      <td className="px-3 py-3 whitespace-nowrap">
                        <RoleSelector userId={u.id} currentRole={u.role ?? "general"} />
                      </td>
                      <td className="px-3 py-3 text-green-600 whitespace-nowrap font-mono text-xs">
                        {u.invite_code ?? "—"}
                      </td>
                      <td className="px-3 py-3 text-right text-green-800 font-semibold whitespace-nowrap">
                        {u.round_count ?? 0}
                      </td>
                      <td className="px-3 py-3 whitespace-nowrap">
                        <PlanSelector userId={u.id} currentPlan={u.plan ?? "free"} />
                      </td>
                      <td className="px-3 py-3 text-green-400 text-xs whitespace-nowrap">
                        {new Date(u.created_at).toLocaleDateString("ja-JP")}
                      </td>
                    </tr>
                  ))
                ) : (
                  <tr>
                    <td colSpan={7} className="px-4 py-6 text-center text-green-400">
                      ユーザーがいません
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
          <p className="text-xs text-green-400 text-right">
            合計 {users.length} 名（学生: {studentCount} 名 / プロ: {proCount} 名）
          </p>
        </section>
      )}

      {/* ── 収益管理タブ ────────────────────────────────────── */}
      {tab === "revenue" && revenueStats && (
        <RevenueSection stats={revenueStats} />
      )}
    </div>
  );
}

// ── 収益データ集計 ────────────────────────────────────────────────

interface UserEntry {
  id: string;
  display_name: string | null;
  email: string;
}

interface RevenueRow {
  userId: string;
  name: string;
  email: string;
  referralTotal: number;
  agentTotal: number;
}

interface RevenueStats {
  totalRevenue: number;
  totalCourseShare: number;
  totalReferrerShare: number;
  totalAgentShare: number;
  totalCompanyShare: number;
  roundCount: number;
  rows: RevenueRow[];
  referralCount: number;
  agentCount: number;
}

async function fetchRevenueStats(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  admin: any,
  users: UserEntry[]
): Promise<RevenueStats> {
  const [{ data: revenueRows }, { data: referrals }, { data: agentLinks }] = await Promise.all([
    admin.from("round_revenue").select(
      "referrer_id, agent_id, total_amount, course_share, referrer_share, agent_share, company_share"
    ),
    admin.from("referrals").select("id"),
    admin.from("golf_course_agents").select("id"),
  ]);

  const rows = revenueRows ?? [];

  // サマリー集計
  const totalRevenue      = rows.reduce((s: number, r: { total_amount: number }) => s + (r.total_amount ?? 0), 0);
  const totalCourseShare  = rows.reduce((s: number, r: { course_share: number }) => s + (r.course_share ?? 0), 0);
  const totalReferrerShare = rows.reduce((s: number, r: { referrer_share: number }) => s + (r.referrer_share ?? 0), 0);
  const totalAgentShare   = rows.reduce((s: number, r: { agent_share: number }) => s + (r.agent_share ?? 0), 0);
  const totalCompanyShare = rows.reduce((s: number, r: { company_share: number }) => s + (r.company_share ?? 0), 0);

  // ユーザー別集計
  const byUser: Record<string, { referral: number; agent: number }> = {};
  for (const r of rows) {
    if (r.referrer_id) {
      byUser[r.referrer_id] ??= { referral: 0, agent: 0 };
      byUser[r.referrer_id].referral += r.referrer_share ?? 0;
    }
    if (r.agent_id) {
      byUser[r.agent_id] ??= { referral: 0, agent: 0 };
      byUser[r.agent_id].agent += r.agent_share ?? 0;
    }
  }

  const nameMap = new Map(users.map((u) => [u.id, { name: u.display_name ?? "—", email: u.email }]));

  const revenueRows2: RevenueRow[] = Object.entries(byUser)
    .map(([userId, { referral, agent }]) => ({
      userId,
      name: nameMap.get(userId)?.name ?? "—",
      email: nameMap.get(userId)?.email ?? "—",
      referralTotal: referral,
      agentTotal: agent,
    }))
    .sort((a, b) => (b.referralTotal + b.agentTotal) - (a.referralTotal + a.agentTotal));

  return {
    totalRevenue,
    totalCourseShare,
    totalReferrerShare,
    totalAgentShare,
    totalCompanyShare,
    roundCount: rows.length,
    rows: revenueRows2,
    referralCount: (referrals ?? []).length,
    agentCount: (agentLinks ?? []).length,
  };
}

// ── 収益管理セクション（Server Component） ──────────────────────

function RevenueSection({ stats }: { stats: RevenueStats }) {
  const fmt = (n: number) => n.toLocaleString("ja-JP");

  return (
    <section className="space-y-5">
      {/* サマリーカード */}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <StatCard label="総売上" value={`¥${fmt(stats.totalRevenue)}`} sub={`${stats.roundCount} ラウンド`} color="green" />
        <StatCard label="自社取り分" value={`¥${fmt(stats.totalCompanyShare)}`} sub={`売上の ${stats.totalRevenue > 0 ? Math.round(stats.totalCompanyShare / stats.totalRevenue * 100) : 0}%`} color="emerald" />
        <StatCard label="累計紹介料" value={`¥${fmt(stats.totalReferrerShare)}`} sub={`紹介関係 ${stats.referralCount} 件`} color="blue" />
        <StatCard label="累計営業料" value={`¥${fmt(stats.totalAgentShare)}`} sub={`営業担当 ${stats.agentCount} 件`} color="purple" />
      </div>

      {/* 分配内訳 */}
      <div className="bg-white border border-green-200 rounded-xl p-4 space-y-2">
        <p className="text-sm font-semibold text-green-700 mb-3">売上分配内訳（累計）</p>
        <DistBar label="ゴルフ場"   amount={stats.totalCourseShare}   total={stats.totalRevenue} color="bg-amber-400" />
        <DistBar label="紹介者"     amount={stats.totalReferrerShare} total={stats.totalRevenue} color="bg-blue-400" />
        <DistBar label="営業担当"   amount={stats.totalAgentShare}    total={stats.totalRevenue} color="bg-purple-400" />
        <DistBar label="自社"       amount={stats.totalCompanyShare}  total={stats.totalRevenue} color="bg-green-500" />
      </div>

      {/* ユーザー別収益一覧 */}
      <div>
        <h3 className="text-sm font-semibold text-green-800 mb-2">ユーザー別累計収益</h3>
        <div className="bg-white border border-green-200 rounded-xl overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-green-100 text-green-600 text-xs">
                <th className="text-left px-4 py-3 font-semibold">名前</th>
                <th className="text-left px-4 py-3 font-semibold">メール</th>
                <th className="text-right px-4 py-3 font-semibold whitespace-nowrap">累計紹介料</th>
                <th className="text-right px-4 py-3 font-semibold whitespace-nowrap">累計営業料</th>
                <th className="text-right px-4 py-3 font-semibold whitespace-nowrap">合計</th>
              </tr>
            </thead>
            <tbody>
              {stats.rows.length > 0 ? (
                <>
                  {stats.rows.map((row) => (
                    <tr key={row.userId} className="border-b border-green-50 last:border-0 hover:bg-green-50/50">
                      <td className="px-4 py-3 font-medium text-green-800 whitespace-nowrap">{row.name}</td>
                      <td className="px-4 py-3 text-green-600 text-xs whitespace-nowrap">{row.email}</td>
                      <td className="px-4 py-3 text-right tabular-nums whitespace-nowrap">
                        {row.referralTotal > 0
                          ? <span className="font-semibold text-blue-600">¥{fmt(row.referralTotal)}</span>
                          : <span className="text-gray-300">—</span>
                        }
                      </td>
                      <td className="px-4 py-3 text-right tabular-nums whitespace-nowrap">
                        {row.agentTotal > 0
                          ? <span className="font-semibold text-purple-600">¥{fmt(row.agentTotal)}</span>
                          : <span className="text-gray-300">—</span>
                        }
                      </td>
                      <td className="px-4 py-3 text-right tabular-nums font-bold text-green-800 whitespace-nowrap">
                        ¥{fmt(row.referralTotal + row.agentTotal)}
                      </td>
                    </tr>
                  ))}
                  {/* 合計行 */}
                  <tr className="bg-green-50 font-bold text-green-800">
                    <td colSpan={2} className="px-4 py-2.5 text-xs">合計</td>
                    <td className="px-4 py-2.5 text-right tabular-nums text-blue-700">
                      ¥{fmt(stats.totalReferrerShare)}
                    </td>
                    <td className="px-4 py-2.5 text-right tabular-nums text-purple-700">
                      ¥{fmt(stats.totalAgentShare)}
                    </td>
                    <td className="px-4 py-2.5 text-right tabular-nums">
                      ¥{fmt(stats.totalReferrerShare + stats.totalAgentShare)}
                    </td>
                  </tr>
                </>
              ) : (
                <tr>
                  <td colSpan={5} className="px-4 py-10 text-center text-green-400 text-sm">
                    <p className="text-2xl mb-2">📊</p>
                    <p>まだ収益データがありません</p>
                    <p className="text-xs mt-1 text-green-300">ラウンド支払いが発生すると自動的に集計されます</p>
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </section>
  );
}

function StatCard({
  label, value, sub, color,
}: {
  label: string; value: string; sub: string; color: "green" | "emerald" | "blue" | "purple";
}) {
  const bg: Record<string, string> = {
    green:   "bg-green-50 border-green-200",
    emerald: "bg-emerald-50 border-emerald-200",
    blue:    "bg-blue-50 border-blue-200",
    purple:  "bg-purple-50 border-purple-200",
  };
  const txt: Record<string, string> = {
    green:   "text-green-700",
    emerald: "text-emerald-700",
    blue:    "text-blue-700",
    purple:  "text-purple-700",
  };
  return (
    <div className={`rounded-xl border p-3 space-y-0.5 ${bg[color]}`}>
      <p className="text-xs text-gray-500 font-medium">{label}</p>
      <p className={`text-lg font-bold tabular-nums ${txt[color]}`}>{value}</p>
      <p className="text-xs text-gray-400">{sub}</p>
    </div>
  );
}

function DistBar({
  label, amount, total, color,
}: {
  label: string; amount: number; total: number; color: string;
}) {
  const pct = total > 0 ? Math.round(amount / total * 100) : 0;
  return (
    <div className="space-y-1">
      <div className="flex justify-between text-xs">
        <span className="text-gray-600 font-medium">{label}</span>
        <span className="text-gray-500 tabular-nums">
          ¥{amount.toLocaleString("ja-JP")} ({pct}%)
        </span>
      </div>
      <div className="h-2 bg-gray-100 rounded-full overflow-hidden">
        <div className={`h-full rounded-full transition-all ${color}`} style={{ width: `${pct}%` }} />
      </div>
    </div>
  );
}

function RoleBadge({ role }: { role: string }) {
  const map: Record<string, { label: string; className: string }> = {
    admin:   { label: "管理者", className: "bg-purple-100 text-purple-700" },
    pro:     { label: "プロ",   className: "bg-orange-100 text-orange-700" },
    student: { label: "学生",   className: "bg-blue-100 text-blue-700" },
    general: { label: "一般",   className: "bg-gray-100 text-gray-600" },
  };
  const config = map[role] ?? map.general;
  return (
    <span className={`inline-block px-2 py-0.5 rounded-full text-xs font-medium ${config.className}`}>
      {config.label}
    </span>
  );
}

function PlanBadge({ plan }: { plan: string }) {
  const map: Record<string, { label: string; className: string }> = {
    premium:  { label: "Premium",  className: "bg-yellow-100 text-yellow-700" },
    standard: { label: "Standard", className: "bg-green-100 text-green-700" },
    free:     { label: "Free",     className: "bg-gray-100 text-gray-500" },
  };
  const config = map[plan] ?? map.free;
  return (
    <span className={`inline-block px-2 py-0.5 rounded-full text-xs font-medium ${config.className}`}>
      {config.label}
    </span>
  );
}
