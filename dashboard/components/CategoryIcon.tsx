/** Color map for each category — used for badges, icons, sidebar, etc. */
export const CATEGORY_COLORS: Record<string, { text: string; bg: string }> = {
  politics:    { text: "#818cf8", bg: "rgba(129,140,248,0.12)" }, // indigo
  elections:   { text: "#818cf8", bg: "rgba(129,140,248,0.12)" }, // indigo
  sports:      { text: "#34d399", bg: "rgba(52,211,153,0.12)" },  // emerald
  esports:     { text: "#a78bfa", bg: "rgba(167,139,250,0.12)" }, // violet
  crypto:      { text: "#fbbf24", bg: "rgba(251,191,36,0.12)" },  // amber
  finance:     { text: "#60a5fa", bg: "rgba(96,165,250,0.12)" },  // blue
  geopolitics: { text: "#f472b6", bg: "rgba(244,114,182,0.12)" }, // pink
  tech:        { text: "#22d3ee", bg: "rgba(34,211,238,0.12)" },  // cyan
  weather:     { text: "#94a3b8", bg: "rgba(148,163,184,0.12)" }, // slate
  other:       { text: "#9ca3af", bg: "rgba(156,163,175,0.12)" }, // gray
};

export function getCategoryColor(category: string | null): { text: string; bg: string } {
  return CATEGORY_COLORS[(category ?? "other").toLowerCase()] ?? CATEGORY_COLORS.other;
}

/** Inline SVG icon for each shock category. */
export default function CategoryIcon({
  category,
  className = "h-3.5 w-3.5",
}: {
  category: string | null;
  className?: string;
}) {
  const cat = (category ?? "other").toLowerCase();

  const props = {
    className,
    fill: "none",
    stroke: "currentColor",
    viewBox: "0 0 24 24",
    strokeWidth: 1.8,
    strokeLinecap: "round" as const,
    strokeLinejoin: "round" as const,
  };

  switch (cat) {
    case "politics":
    case "elections":
      // Landmark / capitol building
      return (
        <svg {...props}>
          <path d="M3 21h18M4 18h16M6 18v-4M10 18v-4M14 18v-4M18 18v-4M12 3l9 7H3l9-7z" />
        </svg>
      );
    case "sports":
      // Trophy
      return (
        <svg {...props}>
          <path d="M6 9H3a1 1 0 01-1-1V5a1 1 0 011-1h3M18 9h3a1 1 0 001-1V5a1 1 0 00-1-1h-3M6 4h12v5a6 6 0 01-12 0V4zM9 21h6M12 15v6" />
        </svg>
      );
    case "esports":
      // Game controller
      return (
        <svg {...props}>
          <path d="M6 11h4M8 9v4M15 12h.01M18 10h.01" />
          <path d="M17.32 5H6.68a4 4 0 00-3.978 3.59c-.006.052-.01.101-.017.152C2.604 9.416 2 14.456 2 16a3 3 0 003 3c1 0 1.5-.5 2-1l1.414-1.414A2 2 0 019.828 16h4.344a2 2 0 011.414.586L17 18c.5.5 1 1 2 1a3 3 0 003-3c0-1.545-.604-6.584-.685-7.258-.007-.05-.011-.1-.017-.151A4 4 0 0017.32 5z" />
        </svg>
      );
    case "crypto":
      // Bitcoin-style circle with lines
      return (
        <svg {...props}>
          <circle cx="12" cy="12" r="9" />
          <path d="M9 8h4a2 2 0 010 4H9V8zM9 12h5a2 2 0 010 4H9v-4zM10 6v2M14 6v2M10 16v2M14 16v2" />
        </svg>
      );
    case "finance":
      // Trending up chart
      return (
        <svg {...props}>
          <path d="M22 7l-8.5 8.5-5-5L2 17" />
          <path d="M16 7h6v6" />
        </svg>
      );
    case "geopolitics":
      // Globe
      return (
        <svg {...props}>
          <circle cx="12" cy="12" r="10" />
          <path d="M2 12h20M12 2a15.3 15.3 0 014 10 15.3 15.3 0 01-4 10 15.3 15.3 0 01-4-10 15.3 15.3 0 014-10z" />
        </svg>
      );
    case "tech":
      // CPU / chip
      return (
        <svg {...props}>
          <rect x="4" y="4" width="16" height="16" rx="2" />
          <rect x="9" y="9" width="6" height="6" />
          <path d="M9 1v3M15 1v3M9 20v3M15 20v3M1 9h3M1 15h3M20 9h3M20 15h3" />
        </svg>
      );
    case "weather":
      // Cloud with sun
      return (
        <svg {...props}>
          <path d="M17.5 19H9a7 7 0 01-1-13.9A4.5 4.5 0 0117.5 8h.5a5 5 0 01-.5 11z" />
        </svg>
      );
    default:
      // Circle dot (generic)
      return (
        <svg {...props}>
          <circle cx="12" cy="12" r="10" />
          <circle cx="12" cy="12" r="3" fill="currentColor" stroke="none" />
        </svg>
      );
  }
}
