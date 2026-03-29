"use client";

import { useSyncExternalStore, useCallback } from "react";

function getTheme(): "dark" | "light" {
  if (typeof window === "undefined") return "dark";
  return (localStorage.getItem("shocktest-theme") as "dark" | "light") ?? "light";
}

function subscribe(callback: () => void) {
  window.addEventListener("storage", callback);
  return () => window.removeEventListener("storage", callback);
}

export default function ThemeToggle() {
  const theme = useSyncExternalStore(subscribe, getTheme, () => "light");

  // Keep the DOM attribute in sync
  if (typeof document !== "undefined") {
    document.documentElement.setAttribute("data-theme", theme);
  }

  const toggle = useCallback(() => {
    const next = theme === "dark" ? "light" : "dark";
    localStorage.setItem("shocktest-theme", next);
    document.documentElement.setAttribute("data-theme", next);
    // Force re-render by dispatching storage event
    window.dispatchEvent(new StorageEvent("storage"));
  }, [theme]);

  return (
    <button
      onClick={toggle}
      className="rounded-md px-2 py-1.5 text-sm text-text-secondary hover:bg-surface-2 hover:text-text-primary"
      title={`Switch to ${theme === "dark" ? "light" : "dark"} mode`}
    >
      {theme === "dark" ? "Light" : "Dark"}
    </button>
  );
}
