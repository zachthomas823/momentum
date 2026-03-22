"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

interface Tab {
  href: string;
  label: string;
  icon: string;
  raised?: boolean;
}

const tabs: Tab[] = [
  { href: "/", label: "Home", icon: "◎" },
  { href: "/impact", label: "Impact", icon: "⟁" },
  { href: "/log", label: "Log", icon: "+", raised: true },
  { href: "/weekly", label: "Summary", icon: "〰" },
  { href: "/progress", label: "Progress", icon: "📸" },
];

export function Shell() {
  const pathname = usePathname();

  const isActive = (href: string) =>
    href === "/" ? pathname === "/" : pathname.startsWith(href);

  return (
    <nav
      className="fixed bottom-0 left-1/2 -translate-x-1/2 w-full max-w-[430px] z-50"
      style={{
        background: "rgba(13, 17, 23, 0.92)",
        backdropFilter: "blur(12px)",
        WebkitBackdropFilter: "blur(12px)",
        borderTop: "1px solid rgba(255, 255, 255, 0.06)",
        paddingBottom: "env(safe-area-inset-bottom, 8px)",
      }}
    >
      <div className="flex items-end justify-around px-2 pt-1">
        {tabs.map((tab) => {
          const active = isActive(tab.href);

          if (tab.raised) {
            return (
              <Link
                key={tab.href}
                href={tab.href}
                className="flex flex-col items-center -mt-3 no-underline"
              >
                <div
                  className={`
                    flex items-center justify-center
                    w-14 h-14 rounded-full
                    text-2xl font-bold
                    transition-all duration-200
                    ${active ? "scale-105" : ""}
                  `}
                  style={{
                    background: active ? "var(--amber)" : "var(--raised)",
                    color: active ? "#0d1117" : "var(--t2)",
                    boxShadow: active
                      ? "0 0 24px rgba(245, 166, 35, 0.35)"
                      : "none",
                  }}
                >
                  {tab.icon}
                </div>
                <span
                  className="text-[10px] mt-1 transition-colors"
                  style={{ color: active ? "var(--amber)" : "var(--t3)" }}
                >
                  {tab.label}
                </span>
              </Link>
            );
          }

          return (
            <Link
              key={tab.href}
              href={tab.href}
              className="flex flex-col items-center py-2 min-w-[48px] min-h-[48px] justify-center no-underline"
            >
              <span
                className="text-lg transition-colors"
                style={{ color: active ? "var(--amber)" : "var(--t3)" }}
              >
                {tab.icon}
              </span>
              <span
                className="text-[10px] mt-0.5 transition-colors"
                style={{ color: active ? "var(--amber)" : "var(--t3)" }}
              >
                {tab.label}
              </span>
            </Link>
          );
        })}
      </div>
    </nav>
  );
}
