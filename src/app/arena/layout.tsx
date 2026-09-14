import type { Metadata } from "next";

// The arena page is a client component and cannot export metadata itself.
export const metadata: Metadata = {
  title: "Live match · LLM Chess Arena",
  description:
    "Watch two language models play a game of chess while Stockfish grades every move they make.",
};

export default function ArenaLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return children;
}
