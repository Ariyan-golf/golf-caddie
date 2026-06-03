import { redirect } from "next/navigation";

// 旧「球筋」ページは「スタッツ」(/history) に統合済み。常に /history へ転送する。
export default function BallFlightPage() {
  redirect("/history");
}
