import { describe, expect, it } from 'vitest';
import { evaluate } from '../src/equations';
import { COPPER, frCurve, magnetics, type MagSpec } from '../src/magnetics';
import { MU_0 } from '../src/constants';

const rel = (a: number, b: number) => Math.abs(a - b) / Math.abs(b);

/** A round-number core and winding (not a catalogue core): 50 mm² area, 48 mm² at its narrowest, 60 mm path, A_L 2 µH ungapped. */
const core = { Ae: 50e-6, Amin: 48e-6, le: 0.06, AL0: 2e-6, WA: 60e-6, MLT: 0.05, gapped: [{ g: 2e-4, AL: 4e-7 }, { g: 1e-3, AL: 1e-7 }] };
const inductor: MagSpec = {
  device: 'inductor',
  L: 1e-4,
  Ipk: 2,
  Irms: 1.5,
  fs: 1e5,
  Bmax: 0.25,
  core,
  primary: { d: 5e-4, ks: 1, layers: 2, dOuter: 5.5e-4 },
  bw: 0.012,
  Tw: 100,
  KuMax: 0.4,
};

describe('magnetics: an inductor', () => {
  const r = magnetics(inductor);

  it('takes the fewest whole turns that keep the flux density at the smallest cross-section at B_max', () => {
    const Nmin = (1e-4 * 2) / (0.25 * 48e-6);
    expect(r.Nmin).toBeCloseTo(Nmin, 12);
    expect(r.N).toBe(Math.ceil(Nmin));
    expect(r.BpkMin).toBeLessThanOrEqual(0.25);
    expect(rel(r.BpkMin, (1e-4 * 2) / (r.N * 48e-6))).toBeLessThan(1e-12);
    expect(rel(r.Bpk, (1e-4 * 2) / (r.N * 50e-6))).toBeLessThan(1e-12);
  });

  it('finds the gap from the ungapped set, without fringing: mu0 A_e (N^2/L - 1/A_L0)', () => {
    expect(rel(r.ALreq, 1e-4 / r.N ** 2)).toBeLessThan(1e-9);
    expect(rel(r.mue, (2e-6 * 0.06) / (MU_0 * 50e-6))).toBeLessThan(1e-9);
    expect(rel(r.gap, MU_0 * 50e-6 * (r.N ** 2 / 1e-4 - 1 / 2e-6))).toBeLessThan(1e-9);
    expect(r.warnings).not.toContain('needTurns');
  });

  it('winding: area, hot resistance, porosity, Dowell factor and dc loss from the catalogue', () => {
    const rho = COPPER.rho20 * (1 + COPPER.alpha20 * 80);
    expect(rel(r.rho, rho)).toBeLessThan(1e-12);
    const Aw = (Math.PI * 5e-4 ** 2) / 4;
    expect(rel(r.primary.Aw, Aw)).toBeLessThan(1e-12);
    expect(rel(r.primary.Rdc, (rho * r.N * 0.05) / Aw)).toBeLessThan(1e-12);
    expect(r.primary.Nl).toBe(Math.ceil(r.N / 2));
    expect(rel(r.primary.eta, (r.primary.Nl * Math.sqrt(Math.PI / 4) * 5e-4) / 0.012)).toBeLessThan(1e-12);
    const delta = Math.sqrt(rho / (Math.PI * MU_0 * 1e5));
    expect(rel(r.delta, delta)).toBeLessThan(1e-12);
    expect(rel(r.primary.phi, (Math.sqrt(r.primary.eta) * Math.sqrt(Math.PI / 4) * 5e-4) / delta)).toBeLessThan(1e-12);
    expect(rel(r.primary.FR, evaluate('wind.dowell', { phi_l: r.primary.phi, M_l: 2 }))).toBeLessThan(1e-12);
    expect(r.primary.FR).toBeGreaterThan(1);
    expect(rel(r.Pdc, 1.5 ** 2 * r.primary.Rdc)).toBeLessThan(1e-12);
    expect(rel(r.Ku, (r.N * Aw) / 60e-6)).toBeLessThan(1e-12);
    expect(r.primary.height).toBeCloseTo(2 * 5.5e-4, 15);
  });

  it('checks the data-sheet gapped sets: turns for the inductance, and their flux density', () => {
    expect(r.options).toHaveLength(2);
    for (const o of r.options) {
      expect(o.N).toBe(Math.ceil(Math.sqrt(1e-4 / o.AL) - 1e-9));
      expect(o.L).toBeGreaterThanOrEqual(1e-4 * (1 - 1e-12));
      expect(rel(o.Bpk, (o.L * 2) / (o.N * 48e-6))).toBeLessThan(1e-12);
      expect(o.ok).toBe(o.Bpk <= 0.25);
    }
    // the smaller A_L needs more turns and so gives the lower flux density
    expect(r.options[1]!.N).toBeGreaterThan(r.options[0]!.N);
    expect(r.options[1]!.Bpk).toBeLessThan(r.options[0]!.Bpk);
  });

  it('gives the ac flux amplitude from the ripple at A_e, only when the ripple is given', () => {
    expect(r.Bac).toBeUndefined();
    const withRipple = magnetics({ ...inductor, dI: 0.3 });
    expect(rel(withRipple.Bac!, (1e-4 * 0.3) / (withRipple.N * 50e-6))).toBeLessThan(1e-12);
    // the swing is to the peak as the half ripple is to the peak current
    expect(rel(withRipple.Bac! / withRipple.Bpk, 0.3 / 2)).toBeLessThan(1e-12);
  });

  it('gives the resistance at the switching frequency as F_R times R_dc', () => {
    expect(rel(r.primary.Rac, r.primary.FR * r.primary.Rdc)).toBeLessThan(1e-12);
  });

  it('warns when the ungapped core cannot reach the inductance at the given turns, or saturates', () => {
    const few = magnetics({ ...inductor, N: 5 });
    expect(few.gap).toBeLessThan(0);
    expect(few.warnings).toEqual(expect.arrayContaining(['needTurns', 'saturation']));
  });

  it('warns when the windings overfill the window or a layer', () => {
    expect(magnetics({ ...inductor, KuMax: 0.05 }).warnings).toContain('window');
    expect(magnetics({ ...inductor, primary: { ...inductor.primary, layers: 1 }, bw: 0.005 }).warnings).toContain('layerFull');
  });

  it("Dowell's factor tends to 1 at low frequency and grows with it", () => {
    const fr = frCurve(inductor.primary, 16, 2, inductor, [1e2, 1e4, 1e5, 1e6]);
    expect(fr[0]!).toBeCloseTo(1, 4);
    for (let i = 1; i < fr.length; i++) expect(fr[i]!).toBeGreaterThan(fr[i - 1]!);
  });
});

describe('magnetics: a flyback transformer', () => {
  const spec: MagSpec = {
    ...inductor,
    device: 'flyback',
    L: 5e-4,
    Ipk: 1,
    Irms: 0.5,
    n: 0.25,
    IrmsS: 1.8,
    secondary: { d: 8e-4, ks: 2, layers: 1, dOuter: 8.6e-4 },
    arrangement: 'ps',
    hg: 2e-4,
  };
  const r = magnetics(spec);

  it('rounds the secondary to whole turns and reports the turns ratio it gives', () => {
    expect(r.Ns).toBe(Math.max(1, Math.round(0.25 * r.N)));
    expect(r.nActual).toBeCloseTo(r.Ns! / r.N, 15);
  });

  it('sums both windings in the window and in the dc loss', () => {
    const Awp = (Math.PI * 5e-4 ** 2) / 4;
    const Aws = (2 * Math.PI * 8e-4 ** 2) / 4;
    expect(rel(r.Ku, (r.N * Awp + r.Ns! * Aws) / 60e-6)).toBeLessThan(1e-12);
    expect(rel(r.Pdc, 0.5 ** 2 * r.primary.Rdc + 1.8 ** 2 * r.secondary!.Rdc)).toBeLessThan(1e-12);
  });

  it('gives the leakage of the arrangement, and splitting the primary lowers it', () => {
    const args = { N: r.N, MLT: 0.05, h_p: r.primary.height, h_g: 2e-4, h_s: r.secondary!.height, b_w: 0.012 };
    expect(rel(r.Llk!, evaluate('xfmr.leakage.ps', args))).toBeLessThan(1e-12);
    const psp = magnetics({ ...spec, arrangement: 'psp' });
    expect(rel(psp.Llk!, evaluate('xfmr.leakage.psp', args))).toBeLessThan(1e-12);
    expect(psp.Llk!).toBeLessThan(r.Llk!);
  });

  it('needs the secondary and the turns ratio', () => {
    expect(() => magnetics({ ...spec, secondary: undefined })).toThrow();
  });
});
