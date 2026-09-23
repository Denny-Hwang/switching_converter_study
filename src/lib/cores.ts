/**
 * The magnetics designer's core table: two ferrite core sets in TDK's N87
 * material, with the values their manufacturer publishes (docs/BUILD_SPEC.md
 * section 5: manufacturer-published A_L, entered with a citation). Each entry
 * cites its data sheet in references.bib, whose `urlquotes` the CI URL check
 * finds in the data sheet's own text. SI units.
 *
 * A gapped set is one gapped core with one ungapped core, as the data sheets
 * specify their A_L; `g` is the gap of the gapped core.
 */
import type { MagCore } from 'pe-core';

export type CoreId = 'e25' | 'etd29';

export interface CoreEntry {
  id: CoreId;
  /** The core's name in its data sheet, and the material. */
  name: string;
  material: string;
  /** The data sheet (references.bib key). */
  cite: string;
  /** Effective volume, for core-loss data per volume (loss.core). */
  Ve: number;
  core: MagCore;
}

export const CORES: readonly CoreEntry[] = [
  {
    id: 'e25',
    name: 'E 25/13/7 (EF 25)',
    material: 'N87',
    cite: 'tdk_e25',
    Ve: 3020e-9,
    core: {
      Ae: 52.5e-6,
      Amin: 51.5e-6,
      le: 57.5e-3,
      AL0: 1850e-9,
      gapped: [
        { g: 0.1e-3, AL: 489e-9 },
        { g: 0.16e-3, AL: 347e-9 },
        { g: 0.25e-3, AL: 250e-9 },
        { g: 0.5e-3, AL: 151e-9 },
        { g: 1.0e-3, AL: 91e-9 },
      ],
      // the coil former's winding cross-section A_N and average length of turn l_N
      WA: 61e-6,
      MLT: 50e-3,
    },
  },
  {
    id: 'etd29',
    name: 'ETD 29/16/10',
    material: 'N87',
    cite: 'tdk_etd29',
    Ve: 5350e-9,
    core: {
      Ae: 76.0e-6,
      Amin: 71.0e-6,
      le: 70.4e-3,
      AL0: 2200e-9,
      gapped: [
        { g: 0.1e-3, AL: 621e-9 },
        { g: 0.2e-3, AL: 383e-9 },
        { g: 0.5e-3, AL: 201e-9 },
        { g: 1.0e-3, AL: 124e-9 },
      ],
      WA: 97e-6,
      MLT: 52.8e-3,
    },
  },
];

export function coreById(id: string): CoreEntry | undefined {
  return CORES.find((c) => c.id === id);
}
