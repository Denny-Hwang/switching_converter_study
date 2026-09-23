/**
 * Symbol labels such as "V_g,min", "Δi_L / I_L" or "n = N_s/N_p" split into
 * parts with subscripts, for input labels (JSX, see tools/ToolUi.tsx) and for
 * chart text (Plotly's HTML subset).
 */

/** A run of plain text, or a base letter(s) with a subscript. */
export type SymPart = string | { base: string; sub: string };

// a subscript may hold commas or dots between its parts (g,min; DS,max), never at its end ("R_on, R_L")
const TOKEN = /([A-Za-zΔδεαβφμρθωητ]+)_([A-Za-z0-9]+(?:[,.][A-Za-z0-9]+)*)/g;

export function symParts(label: string): SymPart[] {
  const out: SymPart[] = [];
  let last = 0;
  for (const m of label.matchAll(TOKEN)) {
    const at = m.index ?? 0;
    if (at > last) out.push(label.slice(last, at));
    out.push({ base: m[1]!, sub: m[2]! });
    last = at + m[0].length;
  }
  if (last < label.length) out.push(label.slice(last));
  return out;
}

const ESC: Record<string, string> = { '&': '&amp;', '<': '&lt;', '>': '&gt;' };
const esc = (s: string) => s.replace(/[&<>]/g, (c) => ESC[c]!);

/** Chart text for Plotly: "i_L" -> "i<sub>L</sub>". */
export function symHtml(label: string): string {
  return symParts(label)
    .map((p) => (typeof p === 'string' ? esc(p) : `${esc(p.base)}<sub>${esc(p.sub)}</sub>`))
    .join('');
}

const COMMANDS: Record<string, string> = {
  alpha: 'α',
  beta: 'β',
  gamma: 'γ',
  delta: 'δ',
  Delta: 'Δ',
  epsilon: 'ε',
  varepsilon: 'ε',
  eta: 'η',
  theta: 'θ',
  mu: 'μ',
  rho: 'ρ',
  sigma: 'σ',
  tau: 'τ',
  phi: 'φ',
  varphi: 'φ',
  omega: 'ω',
  Omega: 'Ω',
  pi: 'π',
  ell: 'ℓ',
  langle: '⟨',
  rangle: '⟩',
};

const TEXT = /\\(?:mathrm|text|operatorname|mathit)\{([^{}]*)\}/g;

/**
 * A catalogue symbol's LaTeX (`V_\mathrm{OUT}`, `V_{g,\mathrm{crit}}`,
 * `\Delta i_L`) as chart text: Greek letters and brackets, sub- and
 * superscripts. A text command right after `_` or `^` is that script's whole
 * group; inside a group it is just its letters. Other commands keep their
 * name (`\max` reads "max").
 */
export function latexHtml(tex: string): string {
  let s = tex.replace(/([_^])\\(?:mathrm|text|operatorname|mathit)\{([^{}]*)\}/g, '$1{$2}').replace(TEXT, '$1');
  s = s.replace(/\\[,;: ]/g, ' ');
  s = s.replace(/\\([A-Za-z]+)/g, (_, name: string) => COMMANDS[name] ?? name);
  s = s.replace(/_\{([^{}]*)\}/g, '<sub>$1</sub>').replace(/_([^\s{}\\<])/g, '<sub>$1</sub>');
  s = s.replace(/\^\{([^{}]*)\}/g, '<sup>$1</sup>').replace(/\^([^\s{}\\<])/g, '<sup>$1</sup>');
  return s.replace(/[{}]/g, '').replace(/\s+/g, ' ').replace(/⟨ /g, '⟨').replace(/ ⟩/g, '⟩').trim();
}
