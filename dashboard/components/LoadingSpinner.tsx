export default function LoadingSpinner() {
  return (
    <div className="flex items-center justify-center py-12">
      <div
        className="h-8 w-8 animate-spin rounded-full"
        style={{
          border: "4px solid var(--st-border)",
          borderTopColor: "var(--st-accent)",
        }}
      />
    </div>
  );
}
