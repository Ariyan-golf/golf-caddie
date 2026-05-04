"use client";

import Link from "next/link";
import Image from "next/image";
import { usePathname } from "next/navigation";

interface NavItem {
  href: string;
  label: string;
  icon?: string;
  imgSrc?: string;
}

const navItems: NavItem[] = [
  { href: "/",           label: "ホーム",    icon: "🏠" },
  { href: "/round",      label: "ラウンド",  icon: "⛳" },
  { href: "/ai-manager", label: "ルール",    icon: "🤖" },
  { href: "/ai-caddie",  label: "AIキャディ", imgSrc: "/characters/ai.png" },
  { href: "/swing",      label: "球筋",      icon: "📊" },
  { href: "/history",    label: "スタッツ",  icon: "🗂️" },
];

export function Navigation() {
  const pathname = usePathname();

  return (
    <nav className="fixed bottom-0 left-0 right-0 bg-white border-t border-green-100 z-50 safe-area-bottom">
      <div className="flex items-center justify-around max-w-lg mx-auto">
        {navItems.map(({ href, label, icon, imgSrc }) => {
          const isActive = href === "/" ? pathname === "/" : pathname.startsWith(href);
          return (
            <Link
              key={href}
              href={href}
              className={`flex flex-col items-center py-1.5 px-0.5 min-w-0 flex-1 transition-colors ${
                isActive ? "text-green-600" : "text-green-400"
              }`}
            >
              {imgSrc ? (
                <div className={`w-6 h-6 overflow-hidden rounded-md ${isActive ? "ring-1 ring-green-400" : ""}`}>
                  <Image
                    src={imgSrc}
                    alt={label}
                    width={24}
                    height={24}
                    className="w-full h-full object-cover object-top"
                  />
                </div>
              ) : (
                <span className="text-xl leading-none">{icon}</span>
              )}
              <span className={`text-xs mt-1 font-medium whitespace-nowrap ${isActive ? "text-green-600" : "text-green-400"}`}>
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
