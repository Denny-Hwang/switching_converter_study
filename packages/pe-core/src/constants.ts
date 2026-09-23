/** Physical constants (SI). Checked against equations.yaml `value_expr` by vitest. */

/** Permeability of free space, 4π·10⁻⁷ H/m (the value used in equations.yaml). */
export const MU_0 = 4 * Math.PI * 1e-7;

export const constants: Readonly<Record<string, number>> = { mu_0: MU_0 };
