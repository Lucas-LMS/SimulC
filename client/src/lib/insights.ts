import type { ClientProfile, SimulationStatus } from "./models";
import type { FlowScenario } from "./calculator";
import { percentOf, roundCents } from "./money";

export const SIMULATION_STATUS_META: Record<
  SimulationStatus,
  { label: string; shortLabel: string; tone: "neutral" | "info" | "amber" | "teal" | "green" | "muted" }
> = {
  rascunho: { label: "Rascunho", shortLabel: "Rascunho", tone: "neutral" },
  enviada: { label: "Proposta enviada", shortLabel: "Enviada", tone: "info" },
  negociacao: { label: "Em negociação", shortLabel: "Negociação", tone: "amber" },
  pasta: { label: "Pasta / crédito", shortLabel: "Pasta", tone: "teal" },
  fechada: { label: "Fechada", shortLabel: "Fechada", tone: "green" },
  perdida: { label: "Encerrada", shortLabel: "Encerrada", tone: "muted" },
};

export const SIMULATION_STATUS_ORDER: SimulationStatus[] = [
  "rascunho",
  "enviada",
  "negociacao",
  "pasta",
  "fechada",
  "perdida",
];

export const normalizeSimulationStatus = (status?: SimulationStatus): SimulationStatus =>
  status && status in SIMULATION_STATUS_META ? status : "rascunho";

export interface PocketCheckItem {
  id: "act" | "monthly" | "annual" | "price_income";
  label: string;
  plannedCents: number | null;
  limitCents: number | null;
  deltaCents: number | null;
  ratioPercent: number | null;
  status: "ok" | "attention" | "over" | "missing";
  detail: string;
}

export interface PocketThermometer {
  items: PocketCheckItem[];
  hasAnyClientBudget: boolean;
  priceIncomePercent: number | null;
}

/**
 * Compara o cenário calculado com os limites informados no perfil do cliente
 * (ato disponível, capacidade mensal e capacidade anual) e calcula o peso da 1ª PRICE na renda.
 */
export const evaluatePocketThermometer = (
  client: ClientProfile | null,
  robust: FlowScenario | null,
  firstPriceInstallmentCents: number | null,
): PocketThermometer => {
  const items: PocketCheckItem[] = [];

  if (robust) {
    // 1. Ato vs disponível
    const actLimit = client?.availableActCents ?? null;
    if (actLimit !== null && actLimit >= 0) {
      const delta = robust.actCents - actLimit;
      items.push({
        id: "act",
        label: "Ato",
        plannedCents: robust.actCents,
        limitCents: actLimit,
        deltaCents: delta,
        ratioPercent: actLimit > 0 ? percentOf(robust.actCents, actLimit) : null,
        status: delta <= 0 ? "ok" : "over",
        detail: delta <= 0 ? "Dentro do ato informado" : "Acima do ato disponível",
      });
    }

    // 2. Mensal Cury vs capacidade mensal
    const monthlyLimit = client?.monthlyCapacityCents ?? null;
    if (monthlyLimit !== null && monthlyLimit > 0 && robust.regularMonthlyCents !== null) {
      const delta = robust.regularMonthlyCents - monthlyLimit;
      const ratio = percentOf(robust.regularMonthlyCents, monthlyLimit);
      items.push({
        id: "monthly",
        label: "Mensal obra",
        plannedCents: robust.regularMonthlyCents,
        limitCents: monthlyLimit,
        deltaCents: delta,
        ratioPercent: ratio,
        status: delta <= 0 ? "ok" : ratio !== null && ratio <= 115 ? "attention" : "over",
        detail: delta <= 0 ? "Cabe na capacidade mensal" : "Acima da capacidade mensal",
      });
    }

    // 3. Anual Cury vs capacidade anual
    const annualLimit = client?.annualCapacityCents ?? null;
    const maxAnnual = robust.annualPayments.reduce<number | null>(
      (max, p) => (p.amountCents !== null ? Math.max(max ?? 0, p.amountCents) : max),
      null,
    );
    if (annualLimit !== null && annualLimit > 0 && maxAnnual !== null) {
      const delta = maxAnnual - annualLimit;
      const ratio = percentOf(maxAnnual, annualLimit);
      items.push({
        id: "annual",
        label: "Anual máxima",
        plannedCents: maxAnnual,
        limitCents: annualLimit,
        deltaCents: delta,
        ratioPercent: ratio,
        status: delta <= 0 ? "ok" : ratio !== null && ratio <= 115 ? "attention" : "over",
        detail: delta <= 0 ? "Dentro da capacidade anual" : "Acima da capacidade anual",
      });
    }
  }

  // 4. 1ª parcela PRICE vs renda familiar (referência indicativa de 30%)
  const income = client?.incomeFamilyCents ?? null;
  const priceIncomePercent =
    income !== null && income > 0 && firstPriceInstallmentCents !== null
      ? percentOf(firstPriceInstallmentCents, income)
      : null;

  if (priceIncomePercent !== null && income !== null && firstPriceInstallmentCents !== null) {
    const ref30 = roundCents(income * 0.3);
    items.push({
      id: "price_income",
      label: "1ª PRICE / renda",
      plannedCents: firstPriceInstallmentCents,
      limitCents: ref30,
      deltaCents: firstPriceInstallmentCents - ref30,
      ratioPercent: priceIncomePercent,
      status: priceIncomePercent <= 30 ? "ok" : priceIncomePercent <= 35 ? "attention" : "over",
      detail:
        priceIncomePercent <= 30
          ? "Dentro da referência de 30% da renda"
          : "Acima de 30% da renda (confirmar no GPM/Caixa)",
    });
  }

  return {
    items,
    hasAnyClientBudget: items.length > 0,
    priceIncomePercent,
  };
};

export interface DocumentationEstimate {
  priceCents: number;
  itbiPercent: number;
  rgiPercent: number;
  totalPercent: number;
  itbiCents: number;
  rgiCents: number;
  totalCents: number;
  isExemptCampaign: boolean;
}

/** Estimativa ilustrativa de documentação RJ (ITBI + RGI/Cartório), totalmente separada do preço da unidade. */
export const calculateDocumentationEstimate = (
  priceCents: number,
  itbiPercent = 3,
  rgiPercent = 1.5,
): DocumentationEstimate => {
  const safePrice = Number.isFinite(priceCents) && priceCents > 0 ? priceCents : 0;
  const safeItbi = Number.isFinite(itbiPercent) && itbiPercent >= 0 ? itbiPercent : 0;
  const safeRgi = Number.isFinite(rgiPercent) && rgiPercent >= 0 ? rgiPercent : 0;
  const itbiCents = roundCents((safePrice * safeItbi) / 100);
  const rgiCents = roundCents((safePrice * safeRgi) / 100);
  return {
    priceCents: safePrice,
    itbiPercent: safeItbi,
    rgiPercent: safeRgi,
    totalPercent: Number((safeItbi + safeRgi).toFixed(2)),
    itbiCents,
    rgiCents,
    totalCents: itbiCents + rgiCents,
    isExemptCampaign: safeItbi === 0 && safeRgi === 0,
  };
};

export interface InccSensitivityResult {
  monthlyRatePercent: number;
  monthsCount: number;
  firstMonthlyCents: number;
  midMonthlyCents: number;
  lastMonthlyCents: number;
  nominalPreTotalCents: number;
  projectedPreTotalCents: number;
  estimatedDeltaCents: number;
}

/**
 * Projeção puramente ilustrativa do impacto de uma taxa fixa mensal hipotética de INCC
 * sobre as mensais e anuais pré-chaves (sem alterar o fluxo nominal auditado).
 */
export const simulateInccSensitivity = (
  scenario: FlowScenario | null,
  monthlyRatePercent: number,
): InccSensitivityResult | null => {
  if (
    !scenario ||
    !scenario.canCalculate ||
    !scenario.monthlyCount ||
    scenario.monthlyCount <= 0 ||
    scenario.regularMonthlyCents === null
  ) {
    return null;
  }
  const rate = Number.isFinite(monthlyRatePercent) && monthlyRatePercent >= 0 ? monthlyRatePercent / 100 : 0;
  const n = scenario.monthlyCount;
  const regular = scenario.regularMonthlyCents;
  const finalMonthly = scenario.finalMonthlyCents ?? regular;

  let nominalMonthlySum = 0;
  let projectedMonthlySum = 0;
  let midMonthlyCents = regular;
  let lastMonthlyCents = regular;
  const midIndex = Math.max(1, Math.ceil(n / 2));

  for (let m = 1; m <= n; m += 1) {
    const base = m === n ? finalMonthly : regular;
    const factor = Math.pow(1 + rate, m);
    const projected = roundCents(base * factor);
    nominalMonthlySum += base;
    projectedMonthlySum += projected;
    if (m === midIndex) midMonthlyCents = projected;
    if (m === n) lastMonthlyCents = projected;
  }

  // Anuais aproximadas proporcionalmente ao horizonte (metade do prazo em média se não houver data exata)
  let nominalAnnualSum = 0;
  let projectedAnnualSum = 0;
  scenario.annualPayments.forEach((annual, idx) => {
    const amount = annual.amountCents ?? 0;
    nominalAnnualSum += amount;
    const approxMonth = Math.min(n, Math.max(1, Math.round(((idx + 1) / (scenario.annualPayments.length + 1)) * n)));
    projectedAnnualSum += roundCents(amount * Math.pow(1 + rate, approxMonth));
  });

  const nominalPreTotalCents = scenario.actCents + nominalMonthlySum + nominalAnnualSum;
  const projectedPreTotalCents = scenario.actCents + projectedMonthlySum + projectedAnnualSum;

  return {
    monthlyRatePercent: Number((rate * 100).toFixed(2)),
    monthsCount: n,
    firstMonthlyCents: roundCents(regular * (1 + rate)),
    midMonthlyCents,
    lastMonthlyCents,
    nominalPreTotalCents,
    projectedPreTotalCents,
    estimatedDeltaCents: projectedPreTotalCents - nominalPreTotalCents,
  };
};
