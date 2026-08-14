"use client";

import type { CSSProperties } from "react";
import { normalizeDecimal } from "@/lib/training";

/**
 * "int"      — whole numbers (W, bpm, m, rpm, renditja)  → numeric keypad
 * "decimal"  — fractions (km, kg, IF, €)                 → decimal keypad
 * "duration" — seconds, typed as bare minutes or pasted as "1:25:37"
 */
export type NumericKind = "int" | "decimal" | "duration";

/**
 * Duration is deliberately absent: "1:25:37" and a bare "90" are both valid
 * there, and that field autosaves instead of submitting a form.
 */
const PATTERNS: Partial<Record<NumericKind, { pattern: string; title: string }>> = {
  int: { pattern: "-?[0-9]*", title: "Shkruaj vetëm numra të plotë, p.sh. 100." },
  decimal: { pattern: "-?[0-9]*([.,][0-9]*)?", title: "Shkruaj një numër, p.sh. 40 ose 40,5." },
};

type BaseProps = {
  kind: NumericKind;
  /** Set it whenever a <label htmlFor> points here — otherwise the label is inert. */
  id?: string;
  /** Uncontrolled forms only: the FormData key the server action reads. */
  name?: string;
  placeholder?: string;
  hint?: string;
  ariaLabel?: string;
  disabled?: boolean;
  required?: boolean;
  style?: CSSProperties;
};

type ControlledProps = BaseProps & {
  value: string;
  onChange: (v: string) => void;
  defaultValue?: never;
};

type UncontrolledProps = BaseProps & {
  /** `<form action={serverAction}>` screens: the DOM keeps the value. */
  defaultValue?: string | number;
  value?: never;
  onChange?: never;
};

/**
 * The one numeric input in the app — coach forms, finance, the registry and
 * every `<form action={…}>` admin screen.
 *
 * type="text" + inputMode, never type="number":
 *  - type="number" REJECTS the "," decimal separator Albanian phone keyboards
 *    produce — Chrome/Safari hand back an empty string, so "42,5" silently
 *    stores nothing;
 *  - it also changes value on desktop scroll-wheel and grows spinner buttons.
 * min/max are therefore no longer enforced by the browser; they never really
 * were outside a native form submit, and every write path validates them
 * server-side (parseNumField in lib/numeric.ts, coerceMetric in lib/training.ts,
 * intField in app/admin/training/actions.ts), surfacing an Albanian error.
 *
 * Commas are normalised on the server on every path; the decimal variant also
 * tidies "42,5" → "42.5" on blur so the field shows what was stored — never
 * mid-keystroke, which would fight the caret. The uncontrolled variant writes
 * that straight back onto the DOM node, which is what the form then submits.
 */
export function NumericInput(props: ControlledProps | UncontrolledProps) {
  const { kind, id, name, placeholder, hint, ariaLabel, disabled, required, style } = props;
  const controlled = props.value !== undefined;
  const rules = PATTERNS[kind];

  return (
    <>
      <input
        className="num"
        type="text"
        inputMode={kind === "decimal" ? "decimal" : "numeric"}
        // Native constraint validation, which type="number" used to give us for
        // free: it runs before the submit event, so an uncontrolled
        // `<form action={serverAction}>` (sections, sponsors, races, events…)
        // still cannot post letters. `title` is what the browser shows in the
        // bubble. The server re-checks every one of these anyway.
        pattern={rules?.pattern}
        title={rules?.title}
        autoComplete="off"
        autoCorrect="off"
        autoCapitalize="none"
        spellCheck={false}
        id={id}
        name={name}
        disabled={disabled}
        required={required}
        aria-label={ariaLabel}
        {...(controlled
          ? { value: props.value, onChange: (e) => props.onChange?.(e.target.value) }
          : { defaultValue: props.defaultValue == null ? "" : String(props.defaultValue) })}
        onBlur={
          kind === "decimal"
            ? (e) => {
                const clean = normalizeDecimal(e.target.value);
                if (clean === e.target.value) return;
                if (controlled) props.onChange?.(clean);
                else e.target.value = clean;
              }
            : undefined
        }
        placeholder={placeholder}
        style={style}
      />
      {hint && <span className="num-hint">{hint}</span>}
    </>
  );
}
