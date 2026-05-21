import Image from "next/image";

interface PageLoaderProps {
  message?: string;
  subMessage?: string;
}

export function PageLoader({
  message = "⛳ コースを読み込み中…",
  subMessage,
}: PageLoaderProps) {
  return (
    <div className="max-w-lg mx-auto p-4 pt-12 flex flex-col items-center justify-center min-h-[60vh] gap-5">
      <div className="w-28 h-28 overflow-hidden rounded-2xl shadow-sm border border-green-100">
        <Image
          src="/characters/ai.png"
          alt="AIちゃん"
          width={112}
          height={168}
          priority
          className="w-full h-auto object-cover object-top"
        />
      </div>
      <div className="flex items-center gap-2 text-green-700">
        <span className="w-5 h-5 border-2 border-green-300 border-t-green-600 rounded-full animate-spin" />
        <span className="text-lg font-semibold">{message}</span>
      </div>
      {subMessage && (
        <p className="text-sm text-green-500 text-center leading-relaxed">{subMessage}</p>
      )}
    </div>
  );
}
