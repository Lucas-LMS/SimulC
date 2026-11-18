import type { PaymentDate } from "./models";

export const monthIndex = ({ year, month }: PaymentDate): number => year * 12 + month - 1;

export const dateFromIndex = (index: number): PaymentDate => ({
  year: Math.floor(index / 12),
  month: (index % 12) + 1,
});

export const monthKey = ({ year, month }: PaymentDate): string =>
  `${year}-${String(month).padStart(2, "0")}`;

export const parseMonthKey = (value: string): PaymentDate | null => {
  const match = /^(\d{4})-(\d{2})$/.exec(value);
  if (!match) return null;
  const year = Number(match[1]);
  const month = Number(match[2]);
  return month >= 1 && month <= 12 ? { year, month } : null;
};

export const compareDates = (a: PaymentDate, b: PaymentDate): number =>
  monthIndex(a) - monthIndex(b);

export const monthLabel = ({ year, month }: PaymentDate, short = false): string => {
  const date = new Date(year, month - 1, 1);
  const name = new Intl.DateTimeFormat("pt-BR", { month: short ? "short" : "long" }).format(date);
  return `${name.replace(/\.$/, "")}/${year}`;
};

export const monthLabelCapitalized = (date: PaymentDate): string => {
  const text = monthLabel(date);
  return text.charAt(0).toLocaleUpperCase("pt-BR") + text.slice(1);
};

/** Mensais começam no mês seguinte ao ato e terminam no mês anterior às chaves. */
export const countMonthlyPayments = (
  actDate: PaymentDate,
  deliveryDate: PaymentDate,
): number => Math.max(0, monthIndex(deliveryDate) - monthIndex(actDate) - 1);

/**
 * Produz uma sugestão de anuais com base nas regras do consultor.
 * O ano corrente 2026 nunca entra; ano da entrega Jan/Fev não recebe anual.
 * Para entrega 2030+, a sugestão não inclui anual no próprio ano de entrega.
 * Toda sugestão precisa vencer após o ato e antes das chaves.
 */
export const suggestAnnualDates = (
  actDate: PaymentDate,
  deliveryDate: PaymentDate,
): PaymentDate[] => {
  const ready = deliveryDate.year < 2027 || (deliveryDate.year === 2027 && deliveryDate.month <= 2);
  if (ready) return [];

  const dates: PaymentDate[] = [];
  const firstYear = Math.max(2027, actDate.year);
  for (let year = firstYear; year <= deliveryDate.year; year += 1) {
    let dueMonth = 12;
    if (year === deliveryDate.year) {
      if (deliveryDate.month <= 2 || deliveryDate.year >= 2030) continue;
      if (deliveryDate.year === 2029 && deliveryDate.month < 12) continue;
      dueMonth = deliveryDate.month - 1;
    }
    const candidate = { year, month: dueMonth };
    if (candidate.month >= 1 && compareDates(candidate, actDate) > 0 && compareDates(candidate, deliveryDate) < 0) {
      dates.push(candidate);
    }
  }
  return dates;
};

export const isBeforeKeys = (date: PaymentDate, delivery: PaymentDate | null): boolean =>
  delivery !== null && compareDates(date, delivery) < 0;

export const isShortOrImmediateDelivery = (
  delivery: PaymentDate | null,
  readyText = "",
): boolean => {
  if (delivery) return delivery.year < 2027 || (delivery.year === 2027 && delivery.month <= 2);
  return /pronto|imediata/i.test(readyText);
};

export const listMonthlyDates = (actDate: PaymentDate, count: number): PaymentDate[] =>
  Array.from({ length: Math.max(0, count) }, (_, index) => dateFromIndex(monthIndex(actDate) + index + 1));

export const daysInMonth = (year: number, month: number): number =>
  new Date(year, month, 0).getDate();
