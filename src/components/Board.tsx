"use client";

import type { CSSProperties } from "react";
import { Chessboard } from "react-chessboard";
import type { Arrow } from "react-chessboard";

export function Board({
  fen,
  arrows,
  /** Per-square overlays. The reasoning pages use them to light up the square
   * a hovered claim is about, so a sentence and the board agree on what is
   * being discussed. */
  squareStyles,
  /** Puzzles are read from the side to move; a live match is always White-up. */
  orientation = "white",
}: {
  fen: string;
  arrows: Arrow[];
  squareStyles?: Record<string, CSSProperties>;
  orientation?: "white" | "black";
}) {
  return (
    <div className="w-full">
      <Chessboard
        options={{
          position: fen,
          allowDragging: false,
          showNotation: true,
          animationDurationInMs: 220,
          arrows,
          squareStyles,
          boardOrientation: orientation,
          boardStyle: {
            borderRadius: "8px",
            overflow: "hidden",
            boxShadow: "0 16px 56px rgba(0,0,0,0.6)",
          },
          darkSquareStyle: { backgroundColor: "#585858" },
          lightSquareStyle: { backgroundColor: "#d9d9d9" },
          darkSquareNotationStyle: { color: "#d9d9d9" },
          lightSquareNotationStyle: { color: "#585858" },
        }}
      />
    </div>
  );
}
