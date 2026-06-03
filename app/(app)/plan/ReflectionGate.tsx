"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";

// 決済完了で /plan に戻った直後、webhook が DB に反映するまでの間だけ
// 決済ボタン（children）を隠して「反映中…」を表示する。
// pending=true の間は数秒間隔で router.refresh() してサーバー再描画を促し、
// 反映されると（サーバー側で pending=false に変わり）children を通常表示する。
//
// 反映が来ないまま MAX_MS を超えたら gaveUp=true にして children を必ず再表示する。
// これによりボタンが永久に消えたままになることを防ぐ（保険）。
export function ReflectionGate({
  pending,
  children,
}: {
  pending: boolean;
  children: React.ReactNode;
}) {
  const router = useRouter();
  const [gaveUp, setGaveUp] = useState(false);
  const startRef = useRef<number>(Date.now());

  useEffect(() => {
    if (!pending) return;

    const INTERVAL_MS = 3000;
    const MAX_MS = 30000;

    const id = setInterval(() => {
      if (Date.now() - startRef.current >= MAX_MS) {
        clearInterval(id);
        setGaveUp(true);
        return;
      }
      router.refresh();
    }, INTERVAL_MS);

    return () => clearInterval(id);
  }, [pending, router]);

  if (pending && !gaveUp) {
    return (
      <div
        className="w-full py-3 rounded-xl text-sm font-semibold bg-gray-100 text-gray-500
                   flex items-center justify-center gap-2"
        aria-busy="true"
      >
        <span
          className="w-4 h-4 border-2 border-gray-400 border-t-transparent rounded-full animate-spin"
          aria-hidden="true"
        />
        反映中…
      </div>
    );
  }

  return <>{children}</>;
}
