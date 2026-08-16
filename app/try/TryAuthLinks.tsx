"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { createClient } from "@/lib/supabase/client";

type AuthStatus = "loading" | "guest" | "member";

export default function TryAuthLinks() {
  const [status, setStatus] = useState<AuthStatus>("loading");

  useEffect(() => {
    let active = true;
    const supabase = createClient();
    supabase.auth
      .getUser()
      .then(({ data }) => {
        if (!active) return;
        setStatus(data.user ? "member" : "guest");
      })
      .catch(() => {
        if (!active) return;
        setStatus("guest");
      });
    return () => {
      active = false;
    };
  }, []);

  if (status === "member") {
    return (
      <div className="pt-2 text-center space-y-2">
        <Link
          href="/"
          className="inline-block rounded-lg bg-green-600 px-6 py-2 text-sm font-semibold text-white"
        >
          ラウンドを開始する
        </Link>
        <p className="text-xs text-green-600">ログイン中です</p>
      </div>
    );
  }

  return (
    <div className="pt-2 text-center text-xs text-green-600 space-y-1">
      <p>
        計測データをクラウドに保存するには{" "}
        <Link href="/register" className="underline font-semibold">
          無料登録
        </Link>
      </p>
      <p>
        すでに会員の方は{" "}
        <Link href="/login" className="underline">
          ログイン
        </Link>
      </p>
    </div>
  );
}
