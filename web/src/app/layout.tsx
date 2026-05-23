import "./globals.css";
import type { Metadata } from "next";
import { Inter } from "next/font/google";
import Link from "next/link";

const inter = Inter({
  subsets: ["latin"],
  variable: "--font-sans",
  display: "swap",
});

export const metadata: Metadata = {
  title: "MIND24 — Memory + 24 Card Puzzle",
  description: "A calm, minimalist card-game table for memory and 24.",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={inter.variable}>
      <body>
        <nav className="nav">
          <Link href="/" className="brand">MIND24</Link>
          <Link href="/twenty-four">24</Link>
          <Link href="/memory">Memory</Link>
        </nav>
        {children}
      </body>
    </html>
  );
}
