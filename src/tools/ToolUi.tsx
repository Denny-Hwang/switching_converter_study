/**
 * Building blocks shared by the tool islands: symbols with subscripts, input
 * labels that say what a symbol means, number fields, and groups of
 * equal-size buttons.
 */
import type { InputHTMLAttributes } from 'react';
import { parseSI } from '../lib/siparse';
import { symParts } from '../lib/sym';

/** Single letters (Latin or Greek, after an optional Δ) are variables: italic, as in the equations. */
function Base({ text }: { text: string }) {
  const m = /^(Δ?)([A-Za-zα-ω])$/.exec(text);
  if (!m) return <>{text}</>;
  return (
    <>
      {m[1]}
      <i>{m[2]}</i>
    </>
  );
}

/** Plain text around the symbols: a lone letter ("n = ", "(D)") is a variable too. */
function Plain({ text }: { text: string }) {
  const bits = text.split(/(?<![A-Za-zα-ω])([A-Za-zα-ω])(?![A-Za-zα-ω])/);
  return <>{bits.map((b, i) => (i % 2 === 1 ? <i key={i}>{b}</i> : b))}</>;
}

/** A symbol such as "V_g,min" or "Δi_L / I_L", with its subscripts. */
export function Sym({ text }: { text: string }) {
  return (
    <span className="pe-sym">
      {symParts(text).map((p, i) =>
        typeof p === 'string' ? (
          <Plain key={i} text={p} />
        ) : (
          <span key={i}>
            <Base text={p.base} />
            <sub>{p.sub}</sub>
          </span>
        ),
      )}
    </span>
  );
}

/** Words with symbols in them ("Conduction (R_on, R_L)"): the symbols get their subscripts, the words stay. */
export function Rich({ text }: { text: string }) {
  return (
    <>
      {symParts(text).map((p, i) =>
        typeof p === 'string' ? (
          p
        ) : (
          <span key={i} className="pe-sym-inline">
            <Base text={p.base} />
            <sub>{p.sub}</sub>
          </span>
        ),
      )}
    </>
  );
}

interface FieldLabelProps {
  htmlFor: string;
  /** The symbol as the equations write it, e.g. "V_g,min". */
  sym: string;
  /** The symbol already rendered (KaTeX HTML), shown instead of `sym`. */
  symHtml?: string;
  /** What the value is, in a few words (TOOL_SYMBOLS or the catalogue). */
  meaning?: string;
  unit?: string;
  /** Anything after the unit, e.g. "(optional)". */
  note?: string;
}

/** An input's label: the symbol, what it means, and its unit. */
export function FieldLabel({ htmlFor, sym, symHtml, meaning, unit, note }: FieldLabelProps) {
  return (
    <label htmlFor={htmlFor} className="pe-field">
      {symHtml ? <span className="pe-sym pe-sym--tex" dangerouslySetInnerHTML={{ __html: symHtml }} /> : <Sym text={sym} />}
      {meaning && (
        <span className="pe-field__meaning">
          <Rich text={meaning} />
        </span>
      )}
      {unit && unit !== '1' && <span className="pe-field__unit">[{unit}]</span>}
      {note && (
        <span className="pe-field__note">
          (<Rich text={note} />)
        </span>
      )}
    </label>
  );
}

interface ChoicesProps<T extends string> {
  legend: string;
  items: readonly { id: T; label: string }[];
  /** The chosen item: the buttons are toggles (aria-pressed). Without it they are actions (presets). */
  selected?: T;
  onPick: (id: T) => void;
  /** Wider cells, for long labels. */
  wide?: boolean;
  /** Name the group itself (false inside a fieldset whose legend names it). */
  named?: boolean;
}

/** Equal-size buttons in a grid, named by `legend` for assistive technology. */
export function ChoiceButtons<T extends string>({ legend, items, selected, onPick, wide, named = true }: ChoicesProps<T>) {
  const select = selected !== undefined;
  const name = named ? { role: 'group', 'aria-label': legend } : {};
  return (
    <div className={`pe-choices${wide ? ' pe-choices--wide' : ''}`} {...name} data-choice={select ? 'select' : 'action'}>
      {items.map((it) => (
        <button key={it.id} type="button" aria-pressed={select ? selected === it.id : undefined} onClick={() => onPick(it.id)}>
          <Rich text={it.label} />
        </button>
      ))}
    </div>
  );
}

/** A group of equal-size buttons with its legend. */
export function Choices<T extends string>(props: ChoicesProps<T>) {
  return (
    <fieldset className="pe-choices-set">
      <legend>{props.legend}</legend>
      <ChoiceButtons {...props} named={false} />
    </fieldset>
  );
}

/**
 * A number field. A text field, not type="number": a browser's number field refuses an SI prefix
 * ("100u", "200 kHz"), which lib/siparse.ts reads. Text that is not a number is marked invalid
 * (aria-invalid) as it is typed; an empty field is not.
 */
export function NumInput({ value, ...rest }: Omit<InputHTMLAttributes<HTMLInputElement>, 'type' | 'value'> & { value: string }) {
  const bad = value.trim() !== '' && Number.isNaN(parseSI(value));
  return <input {...rest} type="text" autoComplete="off" spellCheck={false} value={value} aria-invalid={bad || undefined} />;
}
