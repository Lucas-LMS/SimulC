import { describe, expect, it } from "vitest";
import { calculateAll, calculateSimulationEntry, minimumActForPrice, suggestRobustAct } from "../calculator";
import { initialPortfolio } from "../../data/portfolio";
import type { ClientProfile, SimulationRecord } from "../models";

const baseInput = () => ({
  priceCents: 300_000_00, // R$ 300.000,00
  incomeCents: 10_000_00, // R$ 10.000,00
  financingAmountCents: 240_000_00, // 80%
  firstPriceInstallmentCents: 2_100_00,
  actDate: { year: 2026, month: 11 },
  deliveryDate: { year: 2029, month: 6 },
  monthlyCount: 30,
  annualPayments: [
    { id: "a1", year: 2027, month: 12, amountCents: null },
    { id: "a2", year: 2028, month: 12, amountCents: null },
  ],
  annualFactor: 3.5,
  robustActCents: 15_000_00, // 5%
  availableActCents: 20_000_00,
  directPrePercent: 55,
  includeDirect: true,
  actualShortFlowConfirmed: false,
});

describe("calculator", () => {
  it("calculates balanced Caixa robust and minimum flows within 80% cap", () => {
    const result = calculateAll(baseInput());
    expect(result.financingUsedCents).toBe(240_000_00);
    expect(result.financingCapped).toBe(false);
    expect(result.equityTargetCents).toBe(60_000_00);
    expect(result.minimumActCents).toBe(minimumActForPrice(300_000_00));
    expect(result.robust?.canCalculate).toBe(true);
    expect(result.robust?.isBalanced).toBe(true);
    expect(result.robust?.scheduledTotalCents).toBe(60_000_00);
    expect(result.minimum?.canCalculate).toBe(true);
    expect(result.minimum?.isBalanced).toBe(true);
  });

  it("caps financing at 80% unless manual override is active, and rejects > 100%", () => {
    const capped = calculateAll({ ...baseInput(), financingAmountCents: 270_000_00 });
    expect(capped.financingCapped).toBe(true);
    expect(capped.financingUsedCents).toBe(240_000_00);

    const overridden = calculateAll({
      ...baseInput(),
      financingAmountCents: 270_000_00,
      financingManualOverride: true,
    });
    expect(overridden.financingCapped).toBe(false);
    expect(overridden.financingUsedCents).toBe(270_000_00);

    const over100 = calculateAll({
      ...baseInput(),
      financingAmountCents: 350_000_00,
      financingManualOverride: true,
    });
    expect(over100.financingUsedCents).toBeNull();
    expect(over100.warnings.some((w) => w.includes("supera 100%"))).toBe(true);
  });

  it("fires the > R$ 15.000 annual warning on calculated scenarioAnnuals", () => {
    const result = calculateAll({
      ...baseInput(),
      priceCents: 900_000_00,
      financingAmountCents: 500_000_00,
      robustActCents: 45_000_00,
      monthlyCount: 12,
      annualPayments: [{ id: "a1", year: 2027, month: 12, amountCents: null }],
    });
    expect(result.robust?.warnings.some((w) => w.includes("R$ 15.000,00"))).toBe(true);
  });

  it("blocks negative finalMonthlyCents from being treated as valid/balanced", () => {
    const result = calculateAll({
      ...baseInput(),
      priceCents: 100_000_00,
      financingAmountCents: 80_000_00,
      robustActCents: 19_999_85, // availableForInstallments = 15 cents
      monthlyCount: 1,
      annualPayments: [
        { id: "a1", year: 2027, month: 12, amountCents: null },
        { id: "a2", year: 2028, month: 12, amountCents: null },
        { id: "a3", year: 2029, month: 5, amountCents: null },
      ],
      annualFactor: 3,
    });
    expect(result.robust?.finalMonthlyCents).toBeLessThan(0);
    expect(result.robust?.canCalculate).toBe(false);
    expect(result.robust?.isBalanced).toBe(false);
  });

  it("respects manual annual amounts even when manualMonthlyCents is not set", () => {
    const result = calculateAll({
      ...baseInput(),
      caixaManualAnnualCents: { a1: 5_000_00, a2: 5_000_00 },
    });
    expect(result.robust?.annualPayments.map((a) => a.amountCents)).toEqual([5_000_00, 5_000_00]);
    expect(result.robust?.scheduledTotalCents).toBe(60_000_00);
    expect(result.robust?.isBalanced).toBe(true);
  });

  it("blocks Tabela Direta overrides when delivery is shortFlow and not confirmed", () => {
    const result = calculateAll({
      ...baseInput(),
      deliveryDate: { year: 2027, month: 1 },
      directMonthlyCount: 10,
      actualShortFlowConfirmed: false,
    });
    expect(result.directRobust?.monthlyCount).toBeNull();
    expect(result.directVisible).toBe(false);
  });

  it("rejects annuals in actDate year or earlier dynamically", () => {
    const result = calculateAll({
      ...baseInput(),
      actDate: { year: 2027, month: 3 },
      deliveryDate: { year: 2029, month: 6 },
      annualPayments: [{ id: "a1", year: 2027, month: 12, amountCents: null }],
    });
    expect(result.robust?.timingErrors.some((e) => e.includes("2027"))).toBe(true);
    expect(result.robust?.canCalculate).toBe(false);
  });

  it("computes unified simulation entry via calculateSimulationEntry", () => {
    const unit = initialPortfolio.find((u) => u.priceCents && u.deliveryYear && u.deliveryMonth)!;
    const client: ClientProfile = {
      id: "cli-1",
      name: "Maria",
      phone: "21999999999",
      incomeIndividualCents: 8_000_00,
      incomeFamilyCents: 12_000_00,
      incomeComposition: "",
      oldestBuyerAge: 32,
      availableActCents: 25_000_00,
      monthlyCapacityCents: 2_500_00,
      annualCapacityCents: 8_000_00,
      desiredTermMonths: 360,
      fgtsBalanceCents: 15_000_00,
      fgtsTimeYears: 4,
      notes: "",
      updatedAt: "2026-11-18T00:00:00Z",
    };
    const sim: SimulationRecord = {
      id: "sim-1",
      createdAt: "2026-11-18T00:00:00Z",
      updatedAt: "2026-11-18T00:00:00Z",
      clientId: client.id,
      propertyId: unit.id,
      priceOverrideCents: null,
      actDate: { year: 2026, month: 11 },
      deliveryOverride: null,
      financingAmountCents: Math.floor((unit.priceCents ?? 0) * 0.8),
      firstPriceInstallmentCents: 2_000_00,
      financingTermMonths: 360,
      financingLine: "MCMV",
      financingSystem: "PRICE",
      financingRate: "8%",
      financingNotes: "",
      annualFactor: 3.5,
      monthlyCountOverride: null,
      annualDatesOverride: null,
      robustActCents: suggestRobustAct(unit.priceCents ?? 0, client.availableActCents),
      directPrePercent: 55,
      directMonthlyCountOverride: null,
      directAnnualDatesOverride: null,
      manualAmounts: {},
      includeDirect: true,
      fgtsUseAuthorized: true,
      actualShortFlowConfirmed: false,
      internalNotes: "",
    };

    const entry = calculateSimulationEntry(sim, client, unit);
    expect(entry.priceCents).toBe(unit.priceCents);
    expect(entry.calculation.financingUsedCents).toBeGreaterThan(0);
  });
});
