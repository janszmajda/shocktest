import Link from "next/link";

export default function Header() {
  return (
    <header className="border-b border-gray-200 bg-white">
      <div className="mx-auto max-w-7xl px-4 py-6 sm:px-6 lg:px-8">
        <Link href="/" className="block">
          <h1 className="text-3xl font-bold tracking-tight text-gray-900">
            ShockTest
          </h1>
          <p className="mt-1 text-sm text-gray-500">
            Do Prediction Markets Overreact?
          </p>
        </Link>
      </div>
    </header>
  );
}
