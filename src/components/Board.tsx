"use client";

import { Chessboard } from "react-chessboard";
import type { Arrow } from "react-chessboard";

export function Board({
  fen,
  arrows,
}: {
  fen: string;
  arrows: Arrow[];
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
          boardStyle: {
            borderRadius: "6px",
            overflow: "hidden",
            boxShadow: "0 12px 48px rgba(0,0,0,0.55)",
          },
          darkSquareStyle: { backgroundColor: "#4a5568" },
          lightSquareStyle: { backgroundColor: "#cbd2dc" },
          darkSquareNotationStyle: { color: "#cbd2dc" },
          lightSquareNotationStyle: { color: "#4a5568" },
        }}
      />
    </div>
  );
}
