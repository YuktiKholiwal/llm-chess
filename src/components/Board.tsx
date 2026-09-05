"use client";

import { Chessboard } from "react-chessboard";
import type { Arrow } from "react-chessboard";

export function Board({ fen, arrows }: { fen: string; arrows: Arrow[] }) {
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
