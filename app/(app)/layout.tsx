import Link from "next/link";
import { Navigation } from "@/components/Navigation";
import { createClient } from "@/lib/supabase/server";
import { redirect } from "next/navigation";

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const supabase = await createClient();
  // middleware.ts で getUser() による検証＋トークン refresh が済んでいるので、
  // ここでは Cookie をローカル読みする getSession() に置換（ネットワーク呼び出しなし）。
  // 防衛的に session が無ければ /login に飛ばす。
  const {
    data: { session },
  } = await supabase.auth.getSession();
  const user = session?.user ?? null;

  if (!user) redirect("/login");

  return (
    <div className="min-h-screen pb-20">
      {children}
      <footer className="text-center text-xs text-green-400 py-4">
        <Link href="/terms" className="underline hover:text-green-600">利用規約</Link>
        <span className="mx-2">·</span>
        <Link href="/privacy" className="underline hover:text-green-600">プライバシーポリシー</Link>
      </footer>
      <Navigation />
    </div>
  );
}
