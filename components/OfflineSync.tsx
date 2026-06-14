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

    // ── auth 自動トークン更新のオフライン制御 ──────────────────────────
    // Supabase の auth 自動更新（/auth/v1/token への POST・約30秒tick＋
    // visibilitychange）は圏外でも走り、iOS の機内モードダイアログを誘発する。
    // 圏外では stopAutoRefresh() で止め、オンライン復帰で必ず startAutoRefresh()
    // を呼び戻す（呼び戻し忘れるとセッション失効でログアウトし得る）。
    // createClient() はブラウザではシングルトンなので常に同一インスタンスを操作する。
    function stopAuthRefresh() {
      try {
        void createClient().auth.stopAutoRefresh();
      } catch (err) {
        console.warn("[offline-sync] stopAutoRefresh failed", err);
      }
    }
    function startAuthRefresh() {
      try {
        void createClient().auth.startAutoRefresh();
      } catch (err) {
        console.warn("[offline-sync] startAutoRefresh failed", err);
      }
    }

    // mount 時：オフラインなら自動更新を止める（オンライン時は既定のまま＝挙動不変）。
    if (typeof navigator !== "undefined" && navigator.onLine === false) {
      stopAuthRefresh();
    }

    // mount 時に1回
    if (!cancelled) void run();

    // オンライン復帰：自動更新を再開してから同期。
    const onOnline = () => {
      startAuthRefresh();
      void run();
    };
    // 圏外化：自動更新を停止（無操作で走る更新POSTを止める）。
    const onOffline = () => {
      stopAuthRefresh();
    };
    window.addEventListener("online", onOnline);
    window.addEventListener("offline", onOffline);

    return () => {
      cancelled = true;
      window.removeEventListener("online", onOnline);
      window.removeEventListener("offline", onOffline);
    };
  }, []);

  return null;
}
