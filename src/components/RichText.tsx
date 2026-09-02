import { Fragment } from "react";

/**
 * Models write light markdown in their analysis (**bold**, ## headings).
 * Rendering just those two keeps the panel readable without pulling in a
 * markdown dependency or letting raw asterisks leak into the UI.
 */
function inline(text: string, keyBase: string) {
  return text.split(/(\*\*[^*]+\*\*|\*[^*\n]+\*)/g).map((chunk, i) => {
    if (chunk.startsWith("**") && chunk.endsWith("**") && chunk.length > 4) {
      return (
        <strong key={`${keyBase}-${i}`} className="font-semibold text-arena-text">
          {chunk.slice(2, -2)}
        </strong>
      );
    }
    if (chunk.startsWith("*") && chunk.endsWith("*") && chunk.length > 2) {
      return <em key={`${keyBase}-${i}`}>{chunk.slice(1, -1)}</em>;
    }
    return <Fragment key={`${keyBase}-${i}`}>{chunk}</Fragment>;
  });
}

export function RichText({ text }: { text: string }) {
  const paragraphs = text
    .replace(/^\s*#{1,6}\s*/gm, "")
    .split(/\n{2,}/)
    .map((p) => p.trim())
    .filter(Boolean);

  return (
    <>
      {paragraphs.map((p, i) => (
        <p key={i} className={i > 0 ? "mt-2.5" : undefined}>
          {inline(p, String(i))}
        </p>
      ))}
    </>
  );
}
