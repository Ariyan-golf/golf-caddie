import { createClient } from "@/lib/supabase/server";
import { createClient as createAdminClient } from "@supabase/supabase-js";
import { redirect } from "next/navigation";

const ADMIN_EMAIL = "t.a.0903076959@i.softbank.jp";

export default async function AdminPage() {
  // 通常クライアントでログイン中ユーザーを確認
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user || user.email !== ADMIN_EMAIL) redirect("/");

  // サービスロールクライアントで全データ取得（RLS バイパス）
  const admin = createAdminClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  );

  const [{ data: profiles }, { data: authData }] = await Promise.all([
    admin
      .from("profiles")
      .select("id, display_name, role, invite_code, graduation_year, plan, round_count, created_at")
      .order("created_at", { ascending: false }),
    admin.auth.admin.listUsers({ perPage: 1000 }),
  ]);

  // email を auth.users から引く
  const emailMap = new Map(
    (authData?.users ?? []).map((u) => [u.id, u.email ?? "—"])
  );

  const users = (profiles ?? []).map((p) => ({
    ...p,
    email: emailMap.get(p.id) ?? "—",
  }));

  const studentCount = users.filter((u) => u.role === "student").length;

  return (
    <div className="min-h-screen p-4 max-w-5xl mx-auto">
      <div className="pt-6 mb-6">
        <h1 className="text-2xl font-bold text-green-800">管理画面</h1>
        <p className="text-green-600 text-sm mt-1">学生・ユーザー一覧</p>
      </div>

      <div className="card overflow-x-auto p-0">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-green-100">
              <th className="text-left p-3 text-green-700 font-semibold whitespace-nowrap">名前</th>
              <th className="text-left p-3 text-green-700 font-semibold whitespace-nowrap">メール</th>
              <th className="text-left p-3 text-green-700 font-semibold whitespace-nowrap">ロール</th>
              <th className="text-left p-3 text-green-700 font-semibold whitespace-nowrap">招待コード</th>
              <th className="text-left p-3 text-green-700 font-semibold whitespace-nowrap">卒業年度</th>
              <th className="text-right p-3 text-green-700 font-semibold whitespace-nowrap">ラウンド数</th>
              <th className="text-left p-3 text-green-700 font-semibold whitespace-nowrap">プラン</th>
              <th className="text-left p-3 text-green-700 font-semibold whitespace-nowrap">登録日</th>
            </tr>
          </thead>
          <tbody>
            {users.length > 0 ? (
              users.map((u) => (
                <tr key={u.id} className="border-b border-green-50 last:border-0 hover:bg-green-50/50">
                  <td className="p-3 text-green-800 font-medium whitespace-nowrap">
                    {u.display_name ?? "—"}
                  </td>
                  <td className="p-3 text-green-700 whitespace-nowrap">{u.email}</td>
                  <td className="p-3 whitespace-nowrap">
                    <RoleBadge role={u.role ?? "general"} />
                  </td>
                  <td className="p-3 text-green-700 whitespace-nowrap font-mono text-xs">
                    {u.invite_code ?? "—"}
                  </td>
                  <td className="p-3 text-green-700 whitespace-nowrap">
                    {u.graduation_year ? `${u.graduation_year}年` : "—"}
                  </td>
                  <td className="p-3 text-right text-green-800 font-semibold whitespace-nowrap">
                    {u.round_count ?? 0}
                  </td>
                  <td className="p-3 whitespace-nowrap">
                    <PlanBadge plan={u.plan ?? "free"} />
                  </td>
                  <td className="p-3 text-green-500 text-xs whitespace-nowrap">
                    {new Date(u.created_at).toLocaleDateString("ja-JP")}
                  </td>
                </tr>
              ))
            ) : (
              <tr>
                <td colSpan={8} className="p-6 text-center text-green-400">
                  ユーザーがいません
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      <p className="text-xs text-green-400 mt-3 text-right">
        合計 {users.length} 名（学生: {studentCount} 名）
      </p>
    </div>
  );
}

function RoleBadge({ role }: { role: string }) {
  const map: Record<string, { label: string; className: string }> = {
    admin:   { label: "管理者", className: "bg-purple-100 text-purple-700" },
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
