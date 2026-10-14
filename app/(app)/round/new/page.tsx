import { NewRoundForm } from "./NewRoundForm";
import { StickyHeader } from "./StickyHeader";

interface PageProps {
  searchParams: Promise<{ course?: string }>;
}

// 現在の全機能を無料で提供しているため、ラウンド数の上限・残り回数の表示は持たない。
// （ベータモードの有無にかかわらず同じ挙動）
export default async function NewRoundPage({ searchParams }: PageProps) {
  const { course } = await searchParams;

  return (
    <div className="max-w-lg mx-auto px-4 pb-4 space-y-4">
      <StickyHeader>
        <h1 className="text-2xl font-bold text-green-800">ラウンド開始</h1>
        <p className="text-sm text-green-600 mt-1">コース情報を入力してください</p>
      </StickyHeader>

      <NewRoundForm linkedCourseId={course} />
    </div>
  );
}
