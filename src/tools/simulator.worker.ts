/**
 * Runs pe-core's simulator off the main thread, so the page stays responsive
 * while a run takes long: a converter without a periodic steady state runs
 * the full two thousand periods before the simulator says so.
 */
import { sim } from 'pe-core';

export interface SimRequest {
  id: number;
  params: sim.SimParams;
}

export type SimReply = { id: number; result: sim.SimResult } | { id: number; error: string };

const ctx = self as unknown as {
  onmessage: ((e: MessageEvent<SimRequest>) => void) | null;
  postMessage(reply: SimReply): void;
};

ctx.onmessage = (e) => {
  const { id, params } = e.data;
  try {
    ctx.postMessage({ id, result: sim.simulate(params) });
  } catch (err) {
    ctx.postMessage({ id, error: err instanceof Error ? err.message : String(err) });
  }
};
