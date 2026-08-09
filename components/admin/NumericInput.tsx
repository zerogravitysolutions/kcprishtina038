"use client";

import type { CSSProperties } from "react";
import { normalizeDecimal } from "@/lib/training";

/**
 * "int"      — whole numbers (W, bpm, m, rpm)   → numeric keypad
 * "decimal"  — fractions (km, kg, IF)           → decimal keypad
 * "duration" — seconds, typed as bare minutes or pasted as "1:25:37"
 */
export type NumericKind = "int" | "decimal" | "duration";

/**
 * The one numeric input for every coach-facing form (training + athletes).
 *
 * type="text" + inputMode, never type="number":
 *  - type="number" REJECTS the "," decimal separator Albanian phone keyboards
 *    produce — Chrome/Safari hand back an empty string, so "42,5" silently
 *    stores nothing;
 *  - it also changes value on desktop scroll-wheel and grows spinner buttons.
 * min/max are therefore no longer enforced by the browser; they never really
 * were outside a native form submit, and both write paths validate them
 * server-side (coerceMetric in lib/training.ts, intField in
 * app/admin/training/actions.ts), surfacing an Albanian error in the card.
 *
 * Commas are normalised on the server on every path; the decimal variant also
 * tidies "42,5" → "42.5" on blur so the field shows what was stored — never
 * mid-keystroke, which would fight the caret.
 */
export function NumericInput({
  kind,
  value,
  onChange,
  placeholder,
  hint,
  ariaLabel,
  style,
}: {
  kind: NumericKind;
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
  hint?: string;
  ariaLabel?: string;
  style?: CSSProperties;
}) {
  return (
    <>
      <input
        className="num"
        type="text"
        inputMode={kind === "decimal" ? "decimal" : "numeric"}
        autoComplete="off"
        autoCorrect="off"
        autoCapitalize="none"
        spellCheck={false}
        aria-label={ariaLabel}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        onBlur={
          kind === "decimal"
            ? (e) => {
                const clean = normalizeDecimal(e.target.value);
                if (clean !== e.target.value) onChange(clean);
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
