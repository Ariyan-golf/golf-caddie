"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

const navItems = [
  { href: "/", label: "ホーム", icon: "🏠" },
  { href: "/round", label: "ラウンド", icon: "⛳" },
  { href: "/advice", label: "番手", icon: "🏌️" },
  { href: "/ai-manager", label: "AIマネ", icon: "🤖" },
  { href: "/swing", label: "スイング", icon: "📊" },
  { href: "/history", label: "履歴", icon: "📋" },
];

export function Navigation() {
  const pathname = usePathname();

  return (
    <nav className="fixed bottom-0 left-0 right-0 bg-white border-t border-green-100 z-50 safe-area-bottom">
      <div className="flex items-center justify-around max-w-lg mx-auto">
        {navItems.map(({ href, label, icon }) => {
          const isActive = href === "/" ? pathname === "/" : pathname.startsWith(href);
          return (
            <Link
              key={href}
              href={href}
              className={`flex flex-col items-center py-2 px-1 min-w-0 flex-1 transition-colors ${
                isActive ? "text-green-600" : "text-green-400"
              }`}
            >
              <span className="text-xl leading-none">{icon}</span>
              <span className={`text-xs mt-1 font-medium ${isActive ? "text-green-600" : "text-green-400"}`}>
                {label}
              </span>
              {isActive && (
                <div className="absolute bottom-0 w-8 h-0.5 bg-green-600 rounded-full" />
              )}
            </Link>
          );
        })}
      </div>
    </nav>
  );
}
