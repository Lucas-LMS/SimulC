import { describe, expect, it } from "vitest";
import { calculateAll } from "../calculator";
import {
  calculateDocumentationEstimate,
  evaluatePocketThermometer,
  normalizeSimulationStatus,
  simulateInccSensitivity,
} from "../insights";
import type { ClientProfile } from "../models";

const sampleClient: ClientProfile = {
  id: "cli-1",
  name: "Carlos",
  phone: "21999990000",
  incomeIndividualCents: 9_000_00,
  incomeFamilyCents: 10_000_00,
  incomeComposition: "",
  oldestBuyerAge: 34,
  availableActCents: 12_000_00,
  monthlyCapacityCents: 1_800_00,
  annualCapacityCents: 5_000_00,
  desiredTermMonths: 360,
  fgtsBalanceCents: 10_000_00,
  fgtsTimeYears: 5,
  notes: "",
  updatedAt: "2026-11-18T00:00:00Z",
};

const sampleCalc = calculateAll({
  priceCents: 300_000_00,
  incomeCents: 10_000_00,
  financingAmountCents: 240_000_00,
  firstPriceInstallmentCents: 2_500_00,
  actDate: { year: 2026, month: 11 },
  deliveryDate: { year: 2029, month: 6 },
  monthlyCount: 30,
  annualPayments: [
    { id: "a1", year: 2027, month: 12, amountCents: null },
    { id: "a2", year: 2028, month: 12, amountCents: null },
  ],
  annualFactor: 3.5,
  robustActCents: 15_000_00,
  availableActCents: 12_000_00,
  directPrePercent: 55,
  includeDirect: true,
  actualShortFlowConfirmed: false,
});

describe("insights v2", () => {
  it("normalizes missing or unknown simulation status safely", () => {
    expect(normalizeSimulationStatus(undefined)).toBe("rascunho");
    expect(normalizeSimulationStatus("negociacao")).toBe("negociacao");
  });

  it("evaluates pocket thermometer against client act, monthly, annual and 30% PRICE reference", () => {
    const result = evaluatePocketThermometer(sampleClient, sampleCalc.robust, 2_500_00);
    expect(result.hasAnyClientBudget).toBe(true);
    expect(result.priceIncomePercent).toBe(25);
    const actItem = result.items.find((i) => i.id === "act");
    expect(actItem?.status).toBe("over"); // 15k > 12k
    const monthlyItem = result.items.find((i) => i.id === "monthly");
    expect(monthlyItem?.status).toBe("ok"); // ~1.216 <= 1.800
    const priceItem = result.items.find((i) => i.id === "price_income");
    expect(priceItem?.status).toBe("ok"); // 25% <= 30%
  });

  it("calculates RJ documentation estimate (ITBI + RGI) and campaign exemption", () => {
    const standard = calculateDocumentationEstimate(300_000_00, 3, 1.5);
    expect(standard.itbiCents).toBe(9_000_00);
    expect(standard.rgiCents).toBe(4_500_00);
    expect(standard.totalCents).toBe(13_500_00);
    expect(standard.isExemptCampaign).toBe(false);

    const exempt = calculateDocumentationEstimate(300_000_00, 0, 0);
    expect(exempt.totalCents).toBe(0);
    expect(exempt.isExemptCampaign).toBe(true);
  });

  it("simulates illustrative INCC growth without mutating the nominal scenario", () => {
    const incc = simulateInccSensitivity(sampleCalc.robust, 0.5);
    expect(incc).not.toBeNull();
    expect(incc!.firstMonthlyCents).toBeGreaterThan(sampleCalc.robust!.regularMonthlyCents!);
    expect(incc!.lastMonthlyCents).toBeGreaterThan(incc!.midMonthlyCents);
    expect(incc!.estimatedDeltaCents).toBeGreaterThan(0);
    expect(incc!.nominalPreTotalCents).toBe(60_000_00);
  });
});
