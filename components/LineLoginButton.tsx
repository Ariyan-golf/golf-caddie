"use client";

export default function LineLoginButton() {
  return (
    <a
      href="/auth/line"
      className="flex items-center justify-center gap-2 w-full rounded-xl py-3 px-4 font-semibold text-white bg-[#06C755] hover:bg-[#05b34c] transition-colors"
    >
      {/* LINE icon */}
      <svg
        xmlns="http://www.w3.org/2000/svg"
        viewBox="0 0 24 24"
        fill="currentColor"
        className="w-5 h-5"
        aria-hidden="true"
      >
        <path d="M12 2C6.48 2 2 6.03 2 11c0 3.16 1.72 5.95 4.37 7.71-.18.65-.66 2.37-.76 2.74-.12.46.17.45.36.33.15-.1 1.99-1.32 2.8-1.86.38.06.77.08 1.23.08 5.52 0 10-4.03 10-9C22 6.03 17.52 2 12 2zm-3.5 12.5h-1.25a.25.25 0 0 1-.25-.25v-4.5c0-.14.11-.25.25-.25H8.5c.14 0 .25.11.25.25v4.5c0 .14-.11.25-.25.25zm6.75 0h-1.17a.25.25 0 0 1-.2-.1l-2.08-2.81v2.66c0 .14-.11.25-.25.25H10.3a.25.25 0 0 1-.25-.25v-4.5c0-.14.11-.25.25-.25h1.17c.08 0 .15.04.2.1l2.08 2.81V9.75c0-.14.11-.25.25-.25h1.25c.14 0 .25.11.25.25v4.5c0 .14-.11.25-.25.25zm-3.5-6h-3a.25.25 0 0 0-.25.25v.5c0 .14.11.25.25.25h3c.14 0 .25-.11.25-.25v-.5a.25.25 0 0 0-.25-.25z" />
      </svg>
      LINEでログイン
    </a>
  );
}
