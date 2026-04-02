import type { Metadata } from "next";
import { Inter, JetBrains_Mono } from "next/font/google";
import { Analytics } from "@vercel/analytics/next";
import "./globals.css";

const inter = Inter({
  variable: "--font-sans",
  subsets: ["latin"],
});

const jetbrainsMono = JetBrains_Mono({
  variable: "--font-mono",
  subsets: ["latin"],
  weight: ["400", "500", "600"],
});

export const metadata: Metadata = {
  title: "ShockTest",
  description:
    "Analyzing probability shocks in prediction markets to detect systematic mean reversion.",
  icons: {
    icon: "/BrowserLogo.svg",
  },
  openGraph: {
    title: "ShockTest",
    description:
      "Analyzing probability shocks in prediction markets to detect systematic mean reversion.",
    images: [
      {
        url: "/og-image.png",
        width: 480,
        height: 480,
        alt: "ShockTest logo",
      },
    ],
    type: "website",
  },
  twitter: {
    card: "summary",
    title: "ShockTest",
    description:
      "Analyzing probability shocks in prediction markets to detect systematic mean reversion.",
    images: ["/og-image.png"],
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html
      lang="en"
      data-theme="light"
      className={`${inter.variable} ${jetbrainsMono.variable} h-full antialiased`}
    >
      <body suppressHydrationWarning className="min-h-full flex flex-col" style={{ backgroundColor: 'var(--st-bg)', color: 'var(--st-txt)' }}>
        {children}
        <Analytics />
      </body>
    </html>
  );
}
