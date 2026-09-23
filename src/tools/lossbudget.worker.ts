/**
 * Computes the loss budget off the main thread: every point is a simulation
 * whose duty ratio is adjusted until the output is at its set value.
 */
import { lossBudget, type LossBudget, type LossSpec } from 'pe-core';

export interface LossRequest {
  id: number;
  spec: LossSpec;
}

export type LossReply = { id: number; result: LossBudget } | { id: number; error: string };

const ctx = self as unknown as {
  onmessage: ((e: MessageEvent<LossRequest>) => void) | null;
  postMessage(reply: LossReply): void;
};

ctx.onmessage = (e) => {
  const { id, spec } = e.data;
  try {
    ctx.postMessage({ id, result: lossBudget(spec) });
  } catch (err) {
    ctx.postMessage({ id, error: err instanceof Error ? err.message : String(err) });
  }
};
