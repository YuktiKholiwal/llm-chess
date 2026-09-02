// Copies the single-threaded Stockfish build into public/ so it can be loaded
// as a plain Worker. Single-threaded avoids needing COOP/COEP headers.
import { copyFileSync, mkdirSync, existsSync } from "node:fs";

const FILES = ["stockfish-18-lite-single.js", "stockfish-18-lite-single.wasm"];
const src = "node_modules/stockfish/bin";
const dest = "public/stockfish";

if (!existsSync(src)) process.exit(0);
mkdirSync(dest, { recursive: true });
for (const f of FILES) copyFileSync(`${src}/${f}`, `${dest}/${f}`);
console.log(`stockfish: copied ${FILES.length} files to ${dest}`);
