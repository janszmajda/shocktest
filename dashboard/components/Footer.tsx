export default function Footer() {
  return (
    <footer className="mt-auto bg-surface-1" style={{ borderTop: "2px solid var(--st-accent)" }}>
      <div className="mx-auto max-w-7xl px-4 py-4 sm:px-6 lg:px-8">
        <p className="text-center text-xs text-text-muted">
          Powered by Polymarket &middot; Data stored in MongoDB Atlas &middot;
          Categories by K2-Think &middot; Built at YHack 2026
        </p>
      </div>
    </footer>
  );
}
