import type { PortfolioUnit } from "../data/portfolio";

export interface ClientProfile {
  id: string;
  name: string;
  phone: string;
  incomeIndividualCents: number | null;
  incomeFamilyCents: number | null;
  incomeComposition: string;
  oldestBuyerAge: number | null;
  availableActCents: number | null;
  monthlyCapacityCents: number | null;
  annualCapacityCents: number | null;
  desiredTermMonths: number | null;
  fgtsBalanceCents: number | null;
  fgtsTimeYears: number | null;
  employmentRegime?: string;
  threeYearsWorkHistory?: boolean | null;
  preferences?: {
    desiredAreas: string;
    bedrooms: number | null;
    parking: boolean | null;
    deliveryYear: number | null;
  };
  notes: string;
  updatedAt: string;
  priceProfile?: ClientPriceProfile;
}

export interface ClientPriceProfile {
  priceReferenceCents: number | null;
  financingAmountCents: number | null;
  /** Original financing value reported by the source, before an automatic 80% cap. */
  gpmReportedFinancingAmountCents?: number | null;
  firstPriceInstallmentCents: number | null;
  /** Original first installment reported by the source, separate from any proportional estimate. */
  gpmReportedFirstPriceInstallmentCents?: number | null;
  financingTermMonths: number | null;
  financingLine?: string;
  financingSystem?: string;
  financingRate?: string;
  financingNotes?: string;
  source?: string;
  sourceDate?: string;
  gpmReportedSubsidyCents?: number | null;
  gpmReportedFees?: string;
  gpmReportedQuotaPercent?: number | null;
  gpmReportedIncomeCommitmentPercent?: number | null;
  updatedAt: string;
}

export interface PaymentDate {
  year: number;
  month: number;
}

export interface AnnualPayment extends PaymentDate {
  id: string;
  amountCents: number | null;
}

export interface SimulationRecord {
  id: string;
  createdAt: string;
  updatedAt: string;
  clientId: string;
  propertyId: string;
  comparisonGroupId?: string | null;
  priceOverrideCents: number | null;
  actDate: PaymentDate;
  deliveryOverride: PaymentDate | null;
  financingAmountCents: number | null;
  /** Original GPM value and source price, preserved when the simulation uses an 80% cap/projection. */
  gpmReportedFinancingAmountCents?: number | null;
  gpmReportedPriceReferenceCents?: number | null;
  /** True only when the consultant intentionally edits this scenario above the indicative 80% cap. */
  financingManualOverride?: boolean;
  firstPriceInstallmentCents: number | null;
  /** Original GPM first installment and source price, separate from proportional estimates. */
  gpmReportedFirstPriceInstallmentCents?: number | null;
  financingTermMonths: number | null;
  financingLine: string;
  financingSystem: string;
  financingRate: string;
  financingNotes: string;
  gpmReportedSubsidyCents?: number | null;
  gpmReportedFees?: string;
  gpmReportedQuotaPercent?: number | null;
  gpmReportedIncomeCommitmentPercent?: number | null;
  annualFactor: number;
  monthlyCountOverride: number | null;
  annualDatesOverride: AnnualPayment[] | null;
  robustActCents: number | null;
  directPrePercent: number;
  directMonthlyCountOverride: number | null;
  directAnnualDatesOverride: AnnualPayment[] | null;
  manualAmounts: {
    caixaMonthlyCents?: number;
    caixaAnnualCents?: Record<string, number>;
    directMonthlyCents?: number;
    directAnnualCents?: Record<string, number>;
  };
  includeDirect: boolean;
  fgtsUseAuthorized: boolean;
  actualShortFlowConfirmed: boolean;
  internalNotes: string;
  origin?: "lead_recommendation";
  recommendation?: { score: number; reasons: string[]; mismatches: string[] };
}

export interface ImportedDocument {
  id: string;
  name: string;
  mimeType: string;
  sizeBytes: number;
  importedAt: string;
  tableDate: string;
  source: string;
  rawText: string;
  note: string;
  status: "draft" | "reviewed";
  candidatePrices: Array<{
    label: string;
    priceCents: number | null;
    deliveryText: string;
    confirmed: boolean;
    project?: string;
    typology?: string;
    neighborhood?: string;
    region?: "Zona Norte" | "Zona Sudoeste" | "Zona Oeste" | "Niterói" | "Porto/Centro" | "Porto Maravilha/Centro" | "Sudoeste/Oeste";
    bedrooms?: number;
    parking?: boolean | "unknown";
    areaM2?: number;
    deliveryMonth?: number;
    deliveryYear?: number;
    addedUnitId?: string;
  }>;
  pagesProcessed?: number;
  pagesTotal?: number;
}

export interface BrokerProfile {
  name: string;
  phone?: string;
  creci?: string;
}

export interface WorkspaceData {
  clients: ClientProfile[];
  portfolio: PortfolioUnit[];
  simulations: SimulationRecord[];
  documents: ImportedDocument[];
  brokerProfile?: BrokerProfile;
}
