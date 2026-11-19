import type { PaymentDate } from "./models";

const shortMonthFormatter = new Intl.DateTimeFormat("pt-BR", { month: "short" });
const longMonthFormatter = new Intl.DateTimeFormat("pt-BR", { month: "long" });

export const currentPaymentDate = (): PaymentDate => {
  const now = new Date();
  return { year: now.getFullYear(), month: now.getMonth() + 1 };
};

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
  const name = (short ? shortMonthFormatter : longMonthFormatter).format(date);
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
 * O ano do ato nunca recebe anual; entregas curtas (<= 3 meses) não recebem anuais sugeridas;
 * ano da entrega Jan/Fev não recebe anual; horizontes >= 4 anos à frente não incluem anual
 * no próprio ano de entrega. Toda sugestão vence após o ato e antes das chaves.
 */
export const suggestAnnualDates = (
  actDate: PaymentDate,
  deliveryDate: PaymentDate,
): PaymentDate[] => {
  if (isShortOrImmediateDelivery(deliveryDate, "", actDate)) return [];

  const dates: PaymentDate[] = [];
  const firstYear = actDate.year + 1;
  const farHorizonYear = actDate.year + 4;
  for (let year = firstYear; year <= deliveryDate.year; year += 1) {
    let dueMonth = 12;
    if (year === deliveryDate.year) {
      if (deliveryDate.month <= 2 || deliveryDate.year >= farHorizonYear) continue;
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

/**
 * Entrega pronta ou de curtíssimo prazo: até 3 meses após a data de referência (por padrão o mês atual).
 * Em nov/2026 isso corresponde exatamente a entregas até fev/2027, mas continua funcionando nos anos seguintes.
 */
export const isShortOrImmediateDelivery = (
  delivery: PaymentDate | null,
  readyText = "",
  referenceDate: PaymentDate = currentPaymentDate(),
): boolean => {
  if (delivery) return compareDates(delivery, referenceDate) <= 3;
  return /pronto|imediata/i.test(readyText);
};

export const listMonthlyDates = (actDate: PaymentDate, count: number): PaymentDate[] =>
  Array.from({ length: Math.max(0, count) }, (_, index) => dateFromIndex(monthIndex(actDate) + index + 1));

export const daysInMonth = (year: number, month: number): number =>
  new Date(year, month, 0).getDate();
