"use client";

import { useState, useRef, useEffect } from "react";
import Link from "next/link";
import Image from "next/image";

function ExtensionPopup({ onClose }: { onClose: () => void }) {
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function handleClick(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) onClose();
    }
    document.addEventListener("mousedown", handleClick);
    return () => document.removeEventListener("mousedown", handleClick);
  }, [onClose]);

  return (
    <div
      ref={ref}
      className="absolute right-0 top-full mt-2 w-80 rounded-lg border bg-surface-1 p-4 shadow-lg"
      style={{ borderColor: "var(--st-border)", zIndex: 100 }}
    >
      <div className="mb-3 flex items-center justify-between">
        <h3 className="text-sm font-semibold text-text-primary">Chrome Extension</h3>
        <button onClick={onClose} className="text-text-muted hover:text-text-primary text-lg leading-none">&times;</button>
      </div>
      <p className="mb-3 text-xs leading-relaxed text-text-secondary">
        Get live shock alerts, reversion signals, and chart overlays directly on Polymarket.
      </p>

      <div className="mb-3 rounded-md bg-surface-2 p-3">
        <p className="mb-1.5 text-xs font-medium text-text-primary">1. Clone the repo</p>
        <code className="block overflow-x-auto whitespace-nowrap rounded bg-surface-3 px-2 py-1.5 font-mono text-[11px] text-text-secondary select-all">
          git clone https://github.com/janszmajda/shocktest.git
        </code>
      </div>

      <div className="mb-3 rounded-md bg-surface-2 p-3">
        <p className="mb-1.5 text-xs font-medium text-text-primary">2. Load in Chrome</p>
        <ul className="space-y-1 text-xs text-text-secondary">
          <li>Open <code className="rounded bg-surface-3 px-1 py-0.5 font-mono text-[11px]">chrome://extensions</code></li>
          <li>Enable <span className="font-medium text-text-primary">Developer mode</span> (top right)</li>
          <li>Click <span className="font-medium text-text-primary">Load unpacked</span></li>
          <li>Select the <code className="rounded bg-surface-3 px-1 py-0.5 font-mono text-[11px]">chrome-extension/</code> folder</li>
        </ul>
      </div>

      <div className="rounded-md bg-surface-2 p-3">
        <p className="mb-1.5 text-xs font-medium text-text-primary">3. Configure</p>
        <p className="text-xs text-text-secondary">
          Click the extension icon → Settings → set your API URL to this dashboard.
        </p>
      </div>

      <a
        href="https://github.com/janszmajda/shocktest"
        target="_blank"
        rel="noopener noreferrer"
        className="mt-3 flex items-center justify-center gap-2 rounded-md py-2 text-xs font-semibold transition-opacity hover:opacity-80"
        style={{ background: "var(--st-accent)", color: "#fff" }}
      >
        <svg width="14" height="14" viewBox="0 0 16 16" fill="currentColor">
          <path d="M8 0C3.58 0 0 3.58 0 8c0 3.54 2.29 6.53 5.47 7.59.4.07.55-.17.55-.38 0-.19-.01-.82-.01-1.49-2.01.37-2.53-.49-2.69-.94-.09-.23-.48-.94-.82-1.13-.28-.15-.68-.52-.01-.53.63-.01 1.08.58 1.23.82.72 1.21 1.87.87 2.33.66.07-.52.28-.87.51-1.07-1.78-.2-3.64-.89-3.64-3.95 0-.87.31-1.59.82-2.15-.08-.2-.36-1.02.08-2.12 0 0 .67-.21 2.2.82.64-.18 1.32-.27 2-.27.68 0 1.36.09 2 .27 1.53-1.04 2.2-.82 2.2-.82.44 1.1.16 1.92.08 2.12.51.56.82 1.27.82 2.15 0 3.07-1.87 3.75-3.65 3.95.29.25.54.73.54 1.48 0 1.07-.01 1.93-.01 2.2 0 .21.15.46.55.38A8.013 8.013 0 0016 8c0-4.42-3.58-8-8-8z"/>
        </svg>
        View on GitHub
      </a>
    </div>
  );
}

export function ExtensionButton() {
  const [showExtension, setShowExtension] = useState(false);

  return (
    <div className="relative">
      <button
        onClick={() => setShowExtension(!showExtension)}
        className="flex items-center gap-1.5 rounded-md px-3 py-1.5 text-xs font-medium transition-all hover:opacity-80"
        style={{ background: "var(--st-accent)", color: "#fff" }}
      >
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <path d="M4 17v2a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-2"/>
          <polyline points="7 11 12 16 17 11"/>
          <line x1="12" y1="4" x2="12" y2="16"/>
        </svg>
        Get Extension
      </button>
      {showExtension && <ExtensionPopup onClose={() => setShowExtension(false)} />}
    </div>
  );
}

export default function Header() {
  return (
    <nav className="sticky top-0 z-50 bg-surface-base" style={{ borderBottom: "2px solid var(--st-accent)" }}>
      <div className="mx-auto flex max-w-7xl items-center justify-between px-4 py-3 sm:px-6 lg:px-8">
        <Link href="/" className="block">
          <Image
            src="/Frame 9.svg"
            alt="ShockTEST"
            width={120}
            height={80}
            className="h-11 w-auto"
            priority
          />
        </Link>
        <ExtensionButton />
      </div>
    </nav>
  );
}
