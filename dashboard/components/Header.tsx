import Link from "next/link";

export default function Header() {
  return (
    <header className="border-b border-gray-200 bg-white">
      <div className="mx-auto max-w-7xl px-4 py-4 sm:px-6 lg:px-8">
        <div className="flex items-center justify-between">
          <Link href="/" className="block">
            <h1 className="text-2xl font-bold tracking-tight text-gray-900">
              ShockTest
            </h1>
            <p className="text-xs text-gray-400">
              Detect overreactions. Visualize the edge. Size the trade.
            </p>
          </Link>
          <nav className="flex items-center gap-1">
            <Link
              href="/"
              className="rounded-md px-3 py-2 text-sm font-medium text-gray-600 hover:bg-gray-100 hover:text-gray-900"
            >
              Dashboard
            </Link>
            <Link
              href="/portfolio"
              className="rounded-md px-3 py-2 text-sm font-medium text-gray-600 hover:bg-gray-100 hover:text-gray-900"
            >
              Portfolio Builder
            </Link>
          </nav>
        </div>
      </div>
    </header>
  );
}
