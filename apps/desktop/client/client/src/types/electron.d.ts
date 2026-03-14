export type * from "@shared/types/electron";
import type { UnderDeckApi } from "@shared/types/electron";

declare global {
  interface Window {
    underdeck: UnderDeckApi;
  }
}

export {};
