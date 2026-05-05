"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

// ── Invite code creation form ─────────────────────────────────────

export function InviteCodeForm() {
  const router = useRouter();
  const [code,  setCode]  = useState("");
  const [role,  setRole]  = useState("pro");
  const [plan,  setPlan]  = useState("premium");
  const [label, setLabel] = useState("");
  const [loading, setLoading] = useState(false);
  const [error,   setError]   = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError(null);
    setSuccess(null);

    const res = await fetch("/api/admin/invite-codes", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ code, role, plan, label }),
    });
    const data = await res.json();

    if (!res.ok) {
      setError(data.error ?? "エラーが発生しました");
    } else {
      setSuccess(`コード「${code.toUpperCase()}」を発行しました`);
      setCode("");
      setLabel("");
      router.refresh();
    }
    setLoading(false);
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-3">
      <div className="grid grid-cols-2 gap-3">
        <div>
          <label className="text-xs text-green-600 font-medium block mb-1">コード *</label>
          <input
            value={code}
            onChange={(e) => setCode(e.target.value)}
            placeholder="ENDO_PRO"
            required
            className="w-full border border-green-200 rounded-lg px-3 py-2 text-sm
                       font-mono uppercase placeholder:normal-case
                       focus:outline-none focus:ring-2 focus:ring-green-400"
          />
        </div>
        <div>
          <label className="text-xs text-green-600 font-medium block mb-1">ラベル（説明）</label>
          <input
            value={label}
            onChange={(e) => setLabel(e.target.value)}
            placeholder="遠藤プロ招待"
            className="w-full border border-green-200 rounded-lg px-3 py-2 text-sm
                       focus:outline-none focus:ring-2 focus:ring-green-400"
          />
        </div>
      </div>
      <div className="grid grid-cols-2 gap-3">
        <div>
          <label className="text-xs text-green-600 font-medium block mb-1">ロール *</label>
          <select
            value={role}
            onChange={(e) => setRole(e.target.value)}
            className="w-full border border-green-200 rounded-lg px-3 py-2 text-sm
                       focus:outline-none focus:ring-2 focus:ring-green-400"
          >
            <option value="pro">pro（プロ）</option>
            <option value="general">general（一般）</option>
            <option value="student">student（学生）</option>
          </select>
        </div>
        <div>
          <label className="text-xs text-green-600 font-medium block mb-1">付与プラン *</label>
          <select
            value={plan}
            onChange={(e) => setPlan(e.target.value)}
            className="w-full border border-green-200 rounded-lg px-3 py-2 text-sm
                       focus:outline-none focus:ring-2 focus:ring-green-400"
          >
            <option value="premium">Premium（無料）</option>
            <option value="premium_paid">Premium（770円/月）</option>
            <option value="standard">Standard</option>
            <option value="free">Free</option>
          </select>
        </div>
      </div>

      {error   && <p className="text-xs text-red-600 bg-red-50 border border-red-200 rounded-lg px-3 py-2">⚠️ {error}</p>}
      {success && <p className="text-xs text-green-700 bg-green-50 border border-green-200 rounded-lg px-3 py-2">✅ {success}</p>}

      <button
        type="submit"
        disabled={loading || !code}
        className="px-5 py-2 rounded-lg bg-green-600 hover:bg-green-700 text-white text-sm
                   font-semibold transition-colors disabled:opacity-50"
      >
        {loading ? "発行中..." : "招待コードを発行"}
      </button>
    </form>
  );
}

// ── Invite code delete button ─────────────────────────────────────

export function DeleteCodeButton({ code }: { code: string }) {
  const router = useRouter();
  const [loading, setLoading] = useState(false);

  async function handleDelete() {
    if (!confirm(`コード「${code}」を削除しますか？`)) return;
    setLoading(true);
    await fetch("/api/admin/invite-codes", {
      method: "DELETE",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ code }),
    });
    router.refresh();
    setLoading(false);
  }

  return (
    <button
      onClick={handleDelete}
      disabled={loading}
      className="text-xs px-2 py-1 rounded border border-red-200 text-red-500
                 hover:bg-red-50 transition-colors disabled:opacity-50"
    >
      {loading ? "削除中" : "削除"}
    </button>
  );
}

// ── Per-user role change selector ────────────────────────────────

export function RoleSelector({ userId, currentRole }: { userId: string; currentRole: string }) {
  const [role, setRole]     = useState(currentRole);
  const [loading, setLoading] = useState(false);
  const [saved, setSaved]   = useState(false);

  async function handleChange(next: string) {
    setLoading(true);
    setSaved(false);
    const res = await fetch("/api/admin/update-role", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ userId, role: next }),
    });
    if (res.ok) { setRole(next); setSaved(true); setTimeout(() => setSaved(false), 2000); }
    setLoading(false);
  }

  const colors: Record<string, string> = {
    admin:   "bg-purple-100 text-purple-800 border-purple-300",
    pro:     "bg-orange-100 text-orange-800 border-orange-300",
    general: "bg-gray-100 text-gray-600 border-gray-200",
    student: "bg-blue-100 text-blue-800 border-blue-200",
  };

  return (
    <div className="flex items-center gap-1">
      <select
        value={role}
        disabled={loading}
        onChange={(e) => handleChange(e.target.value)}
        className={`text-xs px-2 py-1 rounded border font-medium
                    focus:outline-none cursor-pointer disabled:opacity-50
                    ${colors[role] ?? colors.general}`}
      >
        <option value="general">general</option>
        <option value="pro">pro</option>
        <option value="admin">admin</option>
        <option value="student">student</option>
      </select>
      {saved && <span className="text-xs text-green-600">✓</span>}
    </div>
  );
}

// ── Per-user plan change button ───────────────────────────────────

export function PlanSelector({ userId, currentPlan }: { userId: string; currentPlan: string }) {
  const [plan, setPlan]     = useState(currentPlan);
  const [loading, setLoading] = useState(false);
  const [saved, setSaved]   = useState(false);

  async function handleChange(next: string) {
    setLoading(true);
    setSaved(false);
    const res = await fetch("/api/admin/update-plan", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ userId, plan: next }),
    });
    if (res.ok) { setPlan(next); setSaved(true); setTimeout(() => setSaved(false), 2000); }
    setLoading(false);
  }

  const colors: Record<string, string> = {
    premium:      "bg-yellow-100 text-yellow-800 border-yellow-300",
    premium_paid: "bg-orange-100 text-orange-800 border-orange-300",
    standard:     "bg-green-100 text-green-800 border-green-300",
    free:         "bg-gray-100 text-gray-600 border-gray-200",
  };

  return (
    <div className="flex items-center gap-1">
      <select
        value={plan}
        disabled={loading}
        onChange={(e) => handleChange(e.target.value)}
        className={`text-xs px-2 py-1 rounded border font-medium
                    focus:outline-none cursor-pointer disabled:opacity-50
                    ${colors[plan] ?? colors.free}`}
      >
        <option value="free">Free</option>
        <option value="standard">Standard</option>
        <option value="premium">Premium</option>
      </select>
      {saved && <span className="text-xs text-green-600">✓</span>}
    </div>
  );
}
