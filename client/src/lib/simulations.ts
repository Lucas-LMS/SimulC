import type { PaymentDate, SimulationRecord } from "./models";
import { createId } from "./storage";

const todayMonth = (): PaymentDate => ({
  year: new Date().getFullYear(),
  month: new Date().getMonth() + 1,
});

export const makeNewSimulation = (
  clientId: string,
  propertyId: string,
  comparisonGroupId?: string | null,
): SimulationRecord => ({
  id: createId("sim"),
  createdAt: new Date().toISOString(),
  updatedAt: new Date().toISOString(),
  clientId,
  propertyId,
  comparisonGroupId: comparisonGroupId ?? null,
  priceOverrideCents: null,
  actDate: todayMonth(),
  deliveryOverride: null,
  financingAmountCents: null,
  gpmReportedFinancingAmountCents: null,
  gpmReportedPriceReferenceCents: null,
  financingManualOverride: false,
  firstPriceInstallmentCents: null,
  financingTermMonths: null,
  financingLine: "",
  financingSystem: "PRICE",
  financingRate: "",
  financingNotes: "",
  gpmReportedSubsidyCents: null,
  gpmReportedFees: "",
  gpmReportedQuotaPercent: null,
  gpmReportedIncomeCommitmentPercent: null,
  annualFactor: 3,
  monthlyCountOverride: null,
  annualDatesOverride: null,
  robustActCents: null,
  directPrePercent: 55,
  directMonthlyCountOverride: null,
  directAnnualDatesOverride: null,
  manualAmounts: {},
  includeDirect: true,
  fgtsUseAuthorized: false,
  actualShortFlowConfirmed: false,
  internalNotes: "",
});

export const duplicateSimulationRecord = (source: SimulationRecord): SimulationRecord => {
  const now = new Date().toISOString();
  return {
    ...source,
    id: createId("sim"),
    createdAt: now,
    updatedAt: now,
    origin: undefined,
    manualAmounts: {
      ...source.manualAmounts,
      caixaAnnualCents: source.manualAmounts.caixaAnnualCents
        ? { ...source.manualAmounts.caixaAnnualCents }
        : undefined,
      directAnnualCents: source.manualAmounts.directAnnualCents
        ? { ...source.manualAmounts.directAnnualCents }
        : undefined,
    },
    annualDatesOverride: source.annualDatesOverride ? source.annualDatesOverride.map((item) => ({ ...item })) : null,
    directAnnualDatesOverride: source.directAnnualDatesOverride
      ? source.directAnnualDatesOverride.map((item) => ({ ...item }))
      : null,
  };
};
