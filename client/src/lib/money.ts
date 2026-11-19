const brlFormatter = new Intl.NumberFormat("pt-BR", {
  style: "currency",
  currency: "BRL",
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
});

const inputFormatter = new Intl.NumberFormat("pt-BR", {
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
});

const numberFormatters = new Map<number, Intl.NumberFormat>();
const getNumberFormatter = (digits: number): Intl.NumberFormat => {
  let formatter = numberFormatters.get(digits);
  if (!formatter) {
    formatter = new Intl.NumberFormat("pt-BR", {
      minimumFractionDigits: digits,
      maximumFractionDigits: digits,
    });
    numberFormatters.set(digits, formatter);
  }
  return formatter;
};

export const formatBRL = (cents: number | null | undefined): string => {
  if (cents === null || cents === undefined || !Number.isFinite(cents)) return "—";
  return brlFormatter.format(cents / 100);
};

export const formatNumber = (value: number | null | undefined, digits = 1): string => {
  if (value === null || value === undefined || !Number.isFinite(value)) return "—";
  return getNumberFormatter(digits).format(value);
};

/** Parse BRL text such as "1.234,56", "1234,56", "1234.56" or "1234" to integer cents. */
export const parseMoneyInput = (value: string): number | null => {
  let normalized = value.trim().replace(/\s/g, "").replace(/R\$/gi, "").replace(/[^\d,.-]/g, "");
  if (!normalized || normalized === "-" || normalized === "," || normalized === ".") return null;

  const negative = normalized.startsWith("-");
  normalized = normalized.replace(/-/g, "");
  const comma = normalized.lastIndexOf(",");
  const dot = normalized.lastIndexOf(".");

  if (comma >= 0 && dot >= 0) {
    normalized = comma > dot
      ? normalized.replace(/\./g, "").replace(",", ".")
      : normalized.replace(/,/g, "");
  } else if (comma >= 0) {
    const parts = normalized.split(",");
    if (parts.length > 2) {
      const last = parts.pop()!;
      normalized = last.length <= 2 ? `${parts.join("")}.${last}` : `${parts.join("")}${last}`;
    } else {
      normalized = normalized.replace(",", ".");
    }
  } else if (dot >= 0) {
    const parts = normalized.split(".");
    const isThousandsSeparator = parts.length === 2 && parts[0].length >= 1 && parts[1].length === 3;
    normalized = parts.length > 2 || isThousandsSeparator ? normalized.replace(/\./g, "") : normalized;
  }

  const parsed = Number(`${negative ? "-" : ""}${normalized}`);
  if (!Number.isFinite(parsed)) return null;
  return roundCents(parsed * 100);
};

export const formatMoneyInput = (cents: number | null | undefined): string =>
  cents === null || cents === undefined || !Number.isFinite(cents)
    ? ""
    : inputFormatter.format(cents / 100);

/** Legacy decimal text helper for non-interactive exports; editable fields use CurrencyInput. */
export const moneyInput = (cents: number | null | undefined): string =>
  cents === null || cents === undefined || !Number.isFinite(cents) ? "" : (cents / 100).toFixed(2);

export const percentOf = (partCents: number, wholeCents: number): number | null =>
  wholeCents > 0 && Number.isFinite(partCents) && Number.isFinite(wholeCents)
    ? (partCents / wholeCents) * 100
    : null;

export const roundCents = (value: number): number => {
  if (!Number.isFinite(value)) return 0;
  return Math.round(value + Math.sign(value) * 1e-9);
};

export const clamp = (value: number, min: number, max: number): number =>
  Math.min(max, Math.max(min, value));
