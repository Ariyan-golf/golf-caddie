"use client";

import { useEffect, useRef, useState } from "react";
import { Html5Qrcode } from "html5-qrcode";

type Phase = "idle" | "scanning" | "confirm" | "loading" | "error";

export function QrScanner({ initialCourse }: { initialCourse?: string }) {
  const scannerRef = useRef<Html5Qrcode | null>(null);
  const [phase, setPhase] = useState<Phase>(initialCourse ? "confirm" : "idle");
  const [courseName, setCourseName] = useState(initialCourse ?? "");
  const [errorMsg, setErrorMsg] = useState("");

  useEffect(() => {
    return () => {
      scannerRef.current?.stop().catch(() => {});
    };
  }, []);

  async function startScan() {
    setPhase("scanning");
    const scanner = new Html5Qrcode("qr-reader");
    scannerRef.current = scanner;
    try {
      await scanner.start(
        { facingMode: "environment" },
        { fps: 10, qrbox: { width: 250, height: 250 } },
        (text) => {
          scanner.stop().catch(() => {});
          try {
            const url = new URL(text.trim());
            const course = url.searchParams.get("course");
            if (!course) throw new Error("no course param");
            setCourseName(course);
            setPhase("confirm");
          } catch {
            setErrorMsg("このQRコードは対応していません。提携ゴルフ場のQRコードをスキャンしてください。");
            setPhase("error");
          }
        },
        () => {}
      );
    } catch {
      setErrorMsg("カメラへのアクセスが許可されていません。ブラウザの設定を確認してください。");
      setPhase("error");
    }
  }

  async function handlePay() {
    setPhase("loading");
    try {
      const res = await fetch("/api/stripe/checkout-once", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ golf_course: courseName }),
      });
      const data = await res.json();
      if (data.url) {
        window.location.href = data.url;
      } else {
        throw new Error("no url");
      }
    } catch {
      setErrorMsg("決済の開始に失敗しました。もう一度お試しください。");
      setPhase("error");
    }
  }

  function reset() {
    scannerRef.current?.stop().catch(() => {});
    setCourseName("");
    setErrorMsg("");
    setPhase("idle");
  }

  return (
    <div className="space-y-6">
      {/* カメラビューは常にDOMに存在させ、CSSで表示切替 */}
      <div id="qr-reader" className={phase === "scanning" ? "rounded-xl overflow-hidden" : "hidden"} />

      {phase === "idle" && (
        <div className="card flex flex-col items-center gap-4 py-8">
          <span className="text-6xl">📷</span>
          <p className="text-green-700 text-sm text-center">
            提携ゴルフ場に設置されているQRコードをスキャンして、330円のラウンド利用料をお支払いください。
          </p>
          <button
            onClick={startScan}
            className="w-full py-3 rounded-xl bg-green-600 text-white font-semibold text-sm hover:bg-green-700 transition-colors"
          >
            QRコードをスキャン
          </button>
        </div>
      )}

      {phase === "scanning" && (
        <div className="text-center space-y-3">
          <p className="text-sm text-green-600">QRコードをカメラに向けてください</p>
          <button onClick={reset} className="text-sm text-gray-500 underline">
            キャンセル
          </button>
        </div>
      )}

      {phase === "confirm" && (
        <div className="card space-y-4">
          <div className="text-center space-y-1">
            <span className="text-4xl">⛳</span>
            <p className="text-xs text-green-500 mt-2">スキャン完了</p>
            <p className="font-bold text-green-800 text-lg">{courseName}</p>
          </div>
          <div className="bg-green-50 rounded-lg p-3 text-center">
            <p className="text-sm text-green-700">ラウンド利用料</p>
            <p className="text-2xl font-bold text-green-800">330円</p>
          </div>
          <button
            onClick={handlePay}
            className="w-full py-3 rounded-xl bg-green-600 text-white font-semibold text-sm hover:bg-green-700 transition-colors"
          >
            330円を支払う
          </button>
          <button onClick={reset} className="w-full text-sm text-gray-500 underline">
            やり直す
          </button>
        </div>
      )}

      {phase === "loading" && (
        <div className="card flex flex-col items-center gap-4 py-8">
          <span className="w-8 h-8 border-4 border-green-600 border-t-transparent rounded-full animate-spin" />
          <p className="text-sm text-green-600">決済ページに移動中...</p>
        </div>
      )}

      {phase === "error" && (
        <div className="card space-y-4">
          <p className="text-sm text-red-600 text-center">{errorMsg}</p>
          <button
            onClick={reset}
            className="w-full py-3 rounded-xl bg-green-600 text-white font-semibold text-sm hover:bg-green-700 transition-colors"
          >
            もう一度試す
          </button>
        </div>
      )}
    </div>
  );
}
