"use client";

// オフラインバッファ同期の常駐コンポーネント（Stage 1・描画なし）。
//
// - mount 時に1回 flush（再接続後の再起動を拾う）。
// - window 'online' イベントで flush（圏外→復帰の即時同期）。
// - 実行中フラグで二重起動を防止。
//
// Stage 1 時点ではバッファに書く側（HoleRecorder）が未接続のため、flush は
// 空バッファに対する no-op。挙動は一切変わらない。

import { useEffect, useRef } from "react";
import { createClient } from "@/lib/supabase/client";
import { flush } from "@/lib/offline/sync";

export function OfflineSync() {
  const runningRef = useRef(false);

  useEffect(() => {
    let cancelled = false;

    async function run() {
      if (runningRef.current) return; // 二重起動防止
      // オフライン時は flush しない（通信を投げず iOS の機内モードダイアログを誘発しない）。
      // 復帰は 'online' イベントが拾う（その時点では navigator.onLine === true）。
      if (typeof navigator !== "undefined" && navigator.onLine === false) return;
      runningRef.current = true;
      try {
        const supabase = createClient();
        await flush(supabase);
      } catch (err) {
        console.warn("[offline-sync] run failed", err);
      } finally {
        runningRef.current = false;
      }
    }

    // mount 時に1回
    if (!cancelled) void run();

    // オンライン復帰で同期
    const onOnline = () => void run();
    window.addEventListener("online", onOnline);

    return () => {
      cancelled = true;
      window.removeEventListener("online", onOnline);
    };
  }, []);

  return null;
}
