import { useEffect, useRef, useState } from "react";
import type { InputHTMLAttributes } from "react";
import { formatMoneyInput, parseMoneyInput } from "../lib/money";

type Props = Omit<InputHTMLAttributes<HTMLInputElement>, "type" | "value" | "onChange"> & {
  value: number | null | undefined;
  onChange: (value: number | null) => void;
};

/** Controlled currency input: raw keystrokes stay untouched until blur, so React never jumps the caret. */
export default function CurrencyInput({ value, onChange, onBlur, onFocus, ...props }: Props) {
  const [text, setText] = useState(() => formatMoneyInput(value));
  const focused = useRef(false);

  useEffect(() => {
    if (!focused.current) setText(formatMoneyInput(value));
  }, [value]);

  return (
    <input
      {...props}
      type="text"
      inputMode="decimal"
      autoComplete="off"
      value={text}
      onFocus={(event) => {
        focused.current = true;
        onFocus?.(event);
      }}
      onChange={(event) => {
        const raw = event.currentTarget.value;
        setText(raw);
        onChange(parseMoneyInput(raw));
      }}
      onBlur={(event) => {
        const parsed = parseMoneyInput(event.currentTarget.value);
        focused.current = false;
        onChange(parsed);
        setText(formatMoneyInput(parsed));
        onBlur?.(event);
      }}
    />
  );
}
