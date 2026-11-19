import { describe, expect, it } from "vitest";
import { formatBRL, moneyInput, parseMoneyInput, roundCents } from "../money";
import { countMonthlyPayments, isShortOrImmediateDelivery, suggestAnnualDates } from "../schedule";

describe("money utilities", () => {
  it("parses Brazilian, US, integer, negative, and malformed currency inputs", () => {
    expect(parseMoneyInput("R$ 300.000,00")).toBe(300_000_00);
    expect(parseMoneyInput("1.234,56")).toBe(1_234_56);
    expect(parseMoneyInput("1234.56")).toBe(1_234_56);
    expect(parseMoneyInput("1000.000")).toBe(1_000_000_00);
    expect(parseMoneyInput("1,234,56")).toBe(1_234_56);
    expect(parseMoneyInput("-500,25")).toBe(-500_25);
    expect(parseMoneyInput("")).toBeNull();
    expect(parseMoneyInput("abc")).toBeNull();
  });

  it("handles non-finite values safely", () => {
    expect(formatBRL(Number.NaN)).toBe("—");
    expect(moneyInput(Number.POSITIVE_INFINITY)).toBe("");
    expect(moneyInput(123_45)).toBe("123.45");
    expect(roundCents(100.5)).toBe(101);
    expect(roundCents(Number.NaN)).toBe(0);
  });
});

describe("schedule utilities", () => {
  it("counts monthly payments strictly between actDate and deliveryDate", () => {
    expect(countMonthlyPayments({ year: 2026, month: 11 }, { year: 2027, month: 1 })).toBe(1);
    expect(countMonthlyPayments({ year: 2026, month: 11 }, { year: 2026, month: 12 })).toBe(0);
    expect(countMonthlyPayments({ year: 2026, month: 11 }, { year: 2029, month: 6 })).toBe(30);
  });

  it("evaluates short/immediate deliveries relative to referenceDate without hardcoded years", () => {
    expect(isShortOrImmediateDelivery({ year: 2027, month: 2 }, "", { year: 2026, month: 11 })).toBe(true);
    expect(isShortOrImmediateDelivery({ year: 2027, month: 3 }, "", { year: 2026, month: 11 })).toBe(false);
    // Works identically after 2027 rollover:
    expect(isShortOrImmediateDelivery({ year: 2027, month: 5 }, "", { year: 2027, month: 3 })).toBe(true);
    expect(isShortOrImmediateDelivery({ year: 2027, month: 8 }, "", { year: 2027, month: 3 })).toBe(false);
    expect(isShortOrImmediateDelivery(null, "Pronto para morar")).toBe(true);
  });

  it("suggests annual dates dynamically relative to actDate", () => {
    const dates2026 = suggestAnnualDates({ year: 2026, month: 11 }, { year: 2029, month: 6 });
    expect(dates2026).toEqual([
      { year: 2027, month: 12 },
      { year: 2028, month: 12 },
      { year: 2029, month: 5 },
    ]);

    // Far horizon (>= actDate.year + 4) omits delivery year annual:
    const dates2030 = suggestAnnualDates({ year: 2026, month: 11 }, { year: 2030, month: 8 });
    expect(dates2030).toEqual([
      { year: 2027, month: 12 },
      { year: 2028, month: 12 },
      { year: 2029, month: 12 },
    ]);

    // Jan/Feb delivery year omits delivery year annual:
    const datesJan = suggestAnnualDates({ year: 2026, month: 11 }, { year: 2028, month: 2 });
    expect(datesJan).toEqual([{ year: 2027, month: 12 }]);
  });
});
