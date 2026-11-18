export const formatBRL = (cents: number | null | undefined): string => {
  if (cents === null || cents === undefined || !Number.isFinite(cents)) return "—";
  return new Intl.NumberFormat("pt-BR", {
    style: "currency",
    currency: "BRL",
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(cents / 100);
};

export const formatNumber = (value: number | null | undefined, digits = 1): string => {
  if (value === null || value === undefined || !Number.isFinite(value)) return "—";
  return new Intl.NumberFormat("pt-BR", {
    minimumFractionDigits: digits,
    maximumFractionDigits: digits,
  }).format(value);
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
    normalized = normalized.replace(/,/g, ".");
  } else if (dot >= 0) {
    const parts = normalized.split(".");
    const isThousandsSeparator = parts.length === 2 && parts[0].length <= 3 && parts[1].length === 3;
    normalized = parts.length > 2 || isThousandsSeparator ? normalized.replace(/\./g, "") : normalized;
  }

  const parsed = Number(`${negative ? "-" : ""}${normalized}`);
  if (!Number.isFinite(parsed)) return null;
  return Math.round((parsed + Number.EPSILON) * 100);
};

export const formatMoneyInput = (cents: number | null | undefined): string =>
  cents === null || cents === undefined || !Number.isFinite(cents)
    ? ""
    : new Intl.NumberFormat("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(cents / 100);

/** Legacy decimal text helper for non-interactive exports; editable fields use CurrencyInput. */
export const moneyInput = (cents: number | null | undefined): string =>
  cents === null || cents === undefined ? "" : (cents / 100).toFixed(2);

export const percentOf = (partCents: number, wholeCents: number): number | null =>
  wholeCents > 0 ? (partCents / wholeCents) * 100 : null;

export const roundCents = (value: number): number =>
  Math.round(value + Number.EPSILON);

export const clamp = (value: number, min: number, max: number): number =>
  Math.min(max, Math.max(min, value));
