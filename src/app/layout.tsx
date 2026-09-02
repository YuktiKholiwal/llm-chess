import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "LLM Chess Arena",
  description:
    "Two AI models play chess while you watch them think — every move graded by Stockfish.",
};

export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en">
      <body className="antialiased">{children}</body>
    </html>
  );
}
