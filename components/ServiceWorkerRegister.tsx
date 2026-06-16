"use client";

import { useEffect } from "react";

export function ServiceWorkerRegister() {
  useEffect(() => {
    if (typeof window === "undefined") return;
    if (!("serviceWorker" in navigator)) return;

    // 新SWが既存ページを支配した（controllerchange）ら、最新のHTML＋chunkを
    // 取り直すために1回だけリロードする。これによりデプロイ更新時の白画面から
    // 自動回復する。
    //   - hadController: 初回インストール（これまで制御SWなし）では reload しない。
    //     更新時（既に制御SWがある状態で新SWが claim）だけ reload する。
    //   - refreshing ガード: reload は一度きり。連続発火によるループを防ぐ。
    const hadController = !!navigator.serviceWorker.controller;
    let refreshing = false;
    const onControllerChange = () => {
      if (refreshing) return;
      refreshing = true;
      if (hadController) window.location.reload();
    };
    navigator.serviceWorker.addEventListener("controllerchange", onControllerChange);

    navigator.serviceWorker
      .register("/sw.js")
      .then((reg) => console.log("[sw] registered, scope:", reg.scope))
      .catch((err) => console.warn("[sw] register failed:", err));

    return () => {
      navigator.serviceWorker.removeEventListener("controllerchange", onControllerChange);
    };
  }, []);

  return null;
}
