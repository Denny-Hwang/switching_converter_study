/**
 * Runs the source matcher's envelope simulation off the main thread: the
 * flyback is simulated cycle by cycle while the bus settles, then over one
 * envelope period.
 */
import { envelopeRun, type Envelope, type EnvelopeRun, type MatchSpec } from 'pe-core';

export interface EnvelopeRequest {
  id: number;
  spec: MatchSpec;
  Cbus: number;
  envelope: Envelope;
}

export type EnvelopeReply = { id: number; result: EnvelopeRun } | { id: number; error: string };

const ctx = self as unknown as {
  onmessage: ((e: MessageEvent<EnvelopeRequest>) => void) | null;
  postMessage(reply: EnvelopeReply): void;
};

ctx.onmessage = (e) => {
  const { id, spec, Cbus, envelope } = e.data;
  try {
    ctx.postMessage({ id, result: envelopeRun(spec, Cbus, envelope) });
  } catch (err) {
    ctx.postMessage({ id, error: err instanceof Error ? err.message : String(err) });
  }
};
