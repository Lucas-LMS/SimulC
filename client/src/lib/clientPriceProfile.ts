import type { ClientPriceProfile, SimulationRecord } from "./models";

export interface ClientPriceProjection {
  financingAmountCents: number | null;
  firstPriceInstallmentCents: number | null;
  financingBeforeCapCents: number | null;
  financingCapCents: number | null;
  financingCapped: boolean;
  canProjectAmounts: boolean;
  message: string;
}

/**
 * Projeta valores informados de uma PRICE para outro preço, somente quando a PRICE
 * guarda um preço-base. Isso é uma estimativa proporcional, não um novo cálculo bancário.
 */
export const projectClientPriceProfile = (
  profile: ClientPriceProfile | undefined,
  targetPriceCents: number | null,
): ClientPriceProjection => {
  const canProjectAmounts = Boolean(
    profile &&
      profile.priceReferenceCents !== null &&
      profile.priceReferenceCents > 0 &&
      targetPriceCents !== null &&
      targetPriceCents > 0,
  );

  if (!profile) {
    return {
      financingAmountCents: null,
      firstPriceInstallmentCents: null,
      financingBeforeCapCents: null,
      financingCapCents: null,
      financingCapped: false,
      canProjectAmounts: false,
      message: "PRICE/GPM pendente no perfil do cliente.",
    };
  }

  const termOnly = {
    financingAmountCents: null,
    firstPriceInstallmentCents: null,
    financingBeforeCapCents: null,
    financingCapCents: targetPriceCents !== null && targetPriceCents > 0 ? Math.floor(targetPriceCents * 0.8) : null,
    financingCapped: false,
    canProjectAmounts: false,
  };

  if (!canProjectAmounts || !profile.priceReferenceCents || !targetPriceCents) {
    return {
      ...termOnly,
      message: "Informe preço-base da PRICE e preço da unidade para projetar financiamento e 1ª parcela.",
    };
  }

  const priceFactor = targetPriceCents / profile.priceReferenceCents;
  const reportedFinancingCents = profile.gpmReportedFinancingAmountCents ?? profile.financingAmountCents;
  const financingBeforeCapCents = reportedFinancingCents === null
    ? null
    : Math.round(reportedFinancingCents * priceFactor);
  const financingCapCents = Math.floor(targetPriceCents * 0.8);
  const financingAmountCents = financingBeforeCapCents === null
    ? null
    : Math.min(financingBeforeCapCents, financingCapCents);
  const financingCapped = financingBeforeCapCents !== null && financingBeforeCapCents > financingCapCents;

  // A primeira parcela é uma estimativa proporcional ao preço, não um recálculo bancário.
  // Não a reduza apenas porque o teto mudou o principal: isso fabricaria uma nova prestação.
  const reportedInstallmentCents = profile.gpmReportedFirstPriceInstallmentCents ?? profile.firstPriceInstallmentCents;
  const firstPriceInstallmentCents = reportedInstallmentCents === null
    ? null
    : Math.round(reportedInstallmentCents * priceFactor);

  const message = financingCapped
    ? `Estimativa proporcional ao preço-base ${formatReferencePrice(profile.priceReferenceCents)}; financiamento ajustado automaticamente ao teto indicativo de 80% (${formatReferencePrice(financingCapCents)}). Não é uma nova simulação nem aprovação; revise com novo GPM/PRICE.`
    : `Estimativa proporcional ao preço-base ${formatReferencePrice(profile.priceReferenceCents)}; não é uma nova simulação nem aprovação. Confirme com novo GPM/PRICE.`;

  return {
    financingAmountCents,
    firstPriceInstallmentCents,
    financingBeforeCapCents,
    financingCapCents,
    financingCapped,
    canProjectAmounts: true,
    message,
  };
};

const formatReferencePrice = (cents: number): string =>
  new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(cents / 100);

/** Maps the saved profile into editable simulation fields without altering the profile values. */
export const clientPriceProfileToSimulation = (
  profile: ClientPriceProfile | undefined,
  targetPriceCents: number | null,
): Partial<SimulationRecord> => {
  const projection = projectClientPriceProfile(profile, targetPriceCents);
  const profileNotes = [
    profile?.financingNotes?.trim(),
    profile?.source?.trim() ? `Origem PRICE informada: ${profile.source.trim()}${profile.sourceDate ? ` · ${profile.sourceDate}` : ""}.` : "",
  ].filter(Boolean);

  return {
    financingAmountCents: projection.financingAmountCents,
    financingManualOverride: false,
    gpmReportedFinancingAmountCents: profile?.gpmReportedFinancingAmountCents ?? profile?.financingAmountCents ?? null,
    gpmReportedPriceReferenceCents: profile?.priceReferenceCents ?? null,
    firstPriceInstallmentCents: projection.firstPriceInstallmentCents,
    gpmReportedFirstPriceInstallmentCents: profile?.gpmReportedFirstPriceInstallmentCents ?? profile?.firstPriceInstallmentCents ?? null,
    financingTermMonths: profile?.financingTermMonths ?? null,
    financingLine: profile?.financingLine ?? "",
    financingSystem: profile?.financingSystem ?? "PRICE",
    financingRate: profile?.financingRate ?? "",
    financingNotes: profileNotes.join(" "),
    gpmReportedSubsidyCents: profile?.gpmReportedSubsidyCents ?? null,
    gpmReportedFees: profile?.gpmReportedFees ?? "",
    gpmReportedQuotaPercent: profile?.gpmReportedQuotaPercent ?? null,
    gpmReportedIncomeCommitmentPercent: profile?.gpmReportedIncomeCommitmentPercent ?? null,
  };
};
