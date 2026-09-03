/**
 * The stockfish package ships no types. Only the surface the benchmark uses is
 * declared here rather than pulling in a loose `any`.
 */
declare module "stockfish" {
  export type StockfishEngine = {
    sendCommand: (command: string) => void;
    listener?: (line: unknown) => void;
    terminate?: () => void;
  };
  const initEngine: (enginePath?: string) => Promise<StockfishEngine>;
  export default initEngine;
}
