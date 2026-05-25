"use client";

import { useState } from "react";
import Link from "next/link";

interface Section {
  title: string;
  body: string;
}

const sections: Section[] = [
  {
    title: "アプリをホーム画面に追加する",
    body: `このアプリはホーム画面に追加すると、普通のアプリのようにアイコンから開けます。お使いのスマホで手順が違います。

【iPhoneの方】
Safari（サファリ）でこのアプリを開いた状態で、画面下の中央にある共有ボタン（四角から矢印が上に出たマーク）を押します。出てきたメニューを下にスクロールして「ホーム画面に追加」を押し、右上の「追加」を押せば完了です。ホーム画面にアイコンができます。

【Androidの方】
Chrome（クローム）でこのアプリを開くと、画面の下や上に「アプリをインストール」「ホーム画面に追加」という案内が出ることがあります。それを押せば追加できます。出てこないときは、画面右上の点が縦に3つ並んだメニューを押し、「アプリをインストール」または「ホーム画面に追加」を選びます。`,
  },
  {
    title: "ラウンドのスコアを記録する",
    body: `ラウンドを始めると、画面の上にホール1から18の表が出ます。記録したいホール番号をタップして選ぶと、下にパー・打数・パットの3つの欄が出ます。数字の部分をタップすると、電話のような数字キーが開きます。数字を押して「確定」を押せば記録されます。間違えたら「⌫」で消せます。`,
  },
  {
    title: "飛距離を測る",
    body: `ラウンド画面で「飛距離を測る」ボタンを押します。まずボールの位置に立って「打つ前に押してね」のボタンを押します。次にショットして、ボールが止まった場所まで歩き、「止まった場所で押してね」のボタンを押します。すると飛距離が表示されるので、「このショットを記録する」を押せば保存されます。`,
  },
  {
    title: "球筋を記録する",
    body: `飛距離を測って記録したショットには、後から使ったクラブ（番手）、球の曲がり方（球筋）、ボールの状況（ライ）を記録できます。各ボタンを押して、当てはまるものを選ぶだけです。下のメニューの「球筋」では、クラブごとの平均飛距離や、これまでのショットの一覧が見られます。`,
  },
  {
    title: "記録を後から変更する",
    body: `スコアやパットを直したいときは、過去のラウンドを開いて、直したいセルをタップすれば数字を入れ直せます。クラブ（番手）は、ラウンド中ならボタンを押し直して選び直せます。後からなら「球筋」画面で変更できます。球筋やライも、ラウンド中にボタンを押し直せば変えられます。なお、飛距離はGPSで自動計算されるため後から直接は変更できません。測り直してください。`,
  },
  {
    title: "グリーンまでの距離を見る",
    body: `ラウンド画面で「残り距離を計測」ボタンを押すと、今いる場所からグリーンの中央までの距離が大きく表示されます。「再計測」で測り直せます。横の「AIキャディに聞く」を押すと、その距離をもとに番手のアドバイスがもらえます。\n\n※そのコースのグリーンの位置が登録されていないと距離が出ません。`,
  },
  {
    title: "風とコンパスの見方",
    body: `ラウンドを作るとき「自動取得」を押すと、その場所の風向きと風速がわかります。ラウンド中はコンパスが表示され、青い矢印が風の向きを示します。この矢印は「風が吹いていく方向」を表しています。「グリーン方向」ボタンを押すと、スマホを向けた方向をグリーンの方向として記録できます。`,
  },
  {
    title: "飛ばしっこGOに参加する",
    body: `まずホーム画面の「飛ばしっこGOに参加する」を押して、ニックネーム・年代・性別・区分を設定します（初回だけ）。次に「ショットをエントリーする」を押すと、ドライバーで飛距離を記録したショットが一覧で出ます。エントリーしたいショットの「エントリー」を押します。そのあと、使ったドライバー・シャフト・ボールのメーカーと機種名を入れて「保存」を押せば完了です。「ランキングを見る」で順位が見られます。`,
  },
];

function AccordionItem({ section }: { section: Section }) {
  const [open, setOpen] = useState(false);

  return (
    <div className="bg-white rounded-xl border border-green-100 shadow-sm overflow-hidden">
      <button
        type="button"
        onClick={() => setOpen(!open)}
        className="w-full flex items-center justify-between px-4 py-4 text-left active:bg-green-50 transition-colors"
      >
        <span className="font-semibold text-green-800 text-sm leading-snug pr-3">
          {section.title}
        </span>
        <span className="text-green-400 text-lg flex-shrink-0">
          {open ? "▼" : "▶"}
        </span>
      </button>
      {open && (
        <div className="px-4 pb-4 border-t border-green-50">
          <p className="text-sm text-gray-700 leading-relaxed whitespace-pre-line pt-3">
            {section.body}
          </p>
        </div>
      )}
    </div>
  );
}

export default function GuidePage() {
  return (
    <div className="max-w-lg mx-auto p-4 space-y-4">
      <div className="pt-4">
        <Link
          href="/"
          className="text-green-600 text-sm font-medium active:text-green-800"
        >
          ← ホームに戻る
        </Link>
        <h1 className="text-2xl font-bold text-green-800 mt-2">使い方ガイド</h1>
      </div>

      <div className="space-y-3">
        {sections.map((section) => (
          <AccordionItem key={section.title} section={section} />
        ))}
      </div>
    </div>
  );
}
