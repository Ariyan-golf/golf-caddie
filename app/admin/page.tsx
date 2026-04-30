import { createClient } from "@/lib/supabase/server";
import { createClient as createAdminClient } from "@supabase/supabase-js";
import { redirect } from "next/navigation";
import { InviteCodeForm, PlanSelector } from "./AdminActions";

const ADMIN_EMAIL = "t.a.0903076959@i.softbank.jp";

export default async function AdminPage() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user || user.email !== ADMIN_EMAIL) redirect("/");

  const admin = createAdminClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  );

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

  return (
    <div className="min-h-screen p-4 max-w-5xl mx-auto space-y-8">
      <div className="pt-6">
        <h1 className="text-2xl font-bold text-green-800">管理画面</h1>
        <p className="text-green-600 text-sm mt-1">招待コード発行・ユーザー管理</p>
      </div>

      {/* ── 招待コード管理 ─────────────────────────────── */}
      <section className="space-y-4">
        <h2 className="text-lg font-semibold text-green-800 border-b border-green-100 pb-2">
          招待コード管理
        </h2>

        {/* 発行フォーム */}
        <div className="bg-white border border-green-200 rounded-xl p-4 space-y-3">
          <p className="text-sm font-semibold text-green-700">新しい招待コードを発行</p>
          <InviteCodeForm onCreated={() => {}} />
        </div>

        {/* 既存コード一覧 */}
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
                    {/* Student codes are protected from deletion */}
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

      {/* ── ユーザー管理 ───────────────────────────────── */}
      <section className="space-y-4">
        <h2 className="text-lg font-semibold text-green-800 border-b border-green-100 pb-2">
          ユーザー管理
        </h2>

        <div className="bg-white border border-green-200 rounded-xl overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-green-100 text-green-600 text-xs">
                <th className="text-left px-3 py-3 font-semibold whitespace-nowrap">名前</th>
                <th className="text-left px-3 py-3 font-semibold whitespace-nowrap">メール</th>
                <th className="text-left px-3 py-3 font-semibold whitespace-nowrap">ロール</th>
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
                      <RoleBadge role={u.role ?? "general"} />
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
