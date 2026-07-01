"use client";

import { useEffect, useState } from "react";
import { Share, X } from "lucide-react";

// 一度閉じたら7日間は再表示しない。
const DISMISS_KEY = "gca_install_prompt_dismissed_at";
const DISMISS_DAYS = 7;

/**
 * PWA「ホーム画面に追加」導線。/try の計測直後と会員ホームで共用する。
 * - 既に standalone（ホーム画面起動）なら何も出さない。
 * - iOS Safari は beforeinstallprompt が来ないため手順を案内。
 * - Android/Chrome は beforeinstallprompt を捕まえてネイティブ導入を提示。
 */
export function InstallPrompt() {
  const [show, setShow] = useState(false);
  const [isIOS, setIsIOS] = useState(false);
  const [deferred, setDeferred] = useState<Event | null>(null);

  useEffect(() => {
    // 既に PWA として起動済みなら出さない。
    const standalone =
      window.matchMedia("(display-mode: standalone)").matches ||
      (window.navigator as unknown as { standalone?: boolean }).standalone === true;
    if (standalone) return;

    // 7日以内に閉じていれば出さない。
    try {
      const at = localStorage.getItem(DISMISS_KEY);
      if (at) {
        const days = (Date.now() - Number(at)) / (1000 * 60 * 60 * 24);
        if (days < DISMISS_DAYS) return;
      }
    } catch {
      /* localStorage 不可でも表示継続 */
    }

    const ua = window.navigator.userAgent;
    const ios = /iphone|ipad|ipod/i.test(ua);
    setIsIOS(ios);

    const onBeforeInstall = (e: Event) => {
      e.preventDefault();
      setDeferred(e);
      setShow(true);
    };
    window.addEventListener("beforeinstallprompt", onBeforeInstall);

    // iOS はプロンプトが来ないので手順表示で対応。
    if (ios) setShow(true);

    return () => window.removeEventListener("beforeinstallprompt", onBeforeInstall);
  }, []);

  async function handleInstall() {
    const promptEvent = deferred as unknown as {
      prompt: () => void;
      userChoice: Promise<unknown>;
    } | null;
    if (!promptEvent) return;
    promptEvent.prompt();
    await promptEvent.userChoice;
    setDeferred(null);
    setShow(false);
  }

  function dismiss() {
    try {
      localStorage.setItem(DISMISS_KEY, String(Date.now()));
    } catch {
      /* 保存不可でも閉じる */
    }
    setShow(false);
  }

  if (!show) return null;

  return (
    <div className="card border-2 border-green-300 bg-green-50 relative">
      <button
        type="button"
        onClick={dismiss}
        aria-label="閉じる"
        className="absolute top-2 right-2 text-green-400 hover:text-green-600 p-1"
      >
        <X size={18} />
      </button>

      <p className="font-semibold text-green-800 text-sm pr-6">
        📲 ホーム画面に追加すると便利です
      </p>
      <p className="text-xs text-green-600 mt-1 leading-relaxed">
        次回からアイコンをタップするだけで起動できます。GPSもより安定して動作します。
      </p>

      {isIOS ? (
        <p className="text-xs text-green-700 mt-3 leading-relaxed">
          画面下の共有ボタン
          <Share size={14} className="inline mx-1 align-text-bottom" aria-hidden="true" />
          を押して、「ホーム画面に追加」を選んでください。
        </p>
      ) : (
        <button
          type="button"
          onClick={handleInstall}
          className="mt-3 w-full py-2.5 rounded-xl bg-green-600 hover:bg-green-700 active:bg-green-800 text-white text-sm font-bold transition-colors"
        >
          ホーム画面に追加する
        </button>
      )}
    </div>
  );
}
