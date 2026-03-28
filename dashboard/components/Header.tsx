"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import ThemeToggle from "./ThemeToggle";

export default function Header() {
  const pathname = usePathname();

  const tabs = [
    { href: "/", label: "Dashboard" },
    { href: "/portfolio", label: "Portfolio" },
  ];

  return (
    <header className="border-b border-border bg-surface-base">
      <div className="mx-auto flex max-w-7xl items-center justify-between px-4 py-3 sm:px-6 lg:px-8">
        <Link href="/" className="block">
          <span className="font-mono text-base font-medium tracking-tight text-text-primary">
            shock<span className="text-accent">.</span>test
          </span>
        </Link>

        <div className="flex items-center gap-0.5 rounded-lg border border-border bg-surface-1 p-0.5">
          {tabs.map((tab) => (
            <Link
              key={tab.href}
              href={tab.href}
              className={`rounded-md px-3 py-1.5 text-xs font-medium transition-all ${
                pathname === tab.href
                  ? "bg-surface-2 text-text-primary"
                  : "text-text-muted hover:text-text-secondary"
              }`}
            >
              {tab.label}
            </Link>
          ))}
        </div>

        <div className="flex items-center gap-3">
          <span className="hidden text-xs text-text-muted sm:inline">
            Detect overreactions. Size the trade.
          </span>
          <ThemeToggle />
        </div>
      </div>
    </header>
  );
}
