import type { PortfolioUnit } from "../data/portfolio";
import type { AnnualPayment, ClientProfile, PaymentDate, SimulationRecord } from "./models";
import { formatBRL, percentOf, roundCents } from "./money";
import {
  compareDates,
  countMonthlyPayments,
  isBeforeKeys,
  isShortOrImmediateDelivery,
  suggestAnnualDates,
} from "./schedule";

export interface ScenarioInput {
  priceCents: number;
  targetCents: number;
  actCents: number;
  monthlyCount: number | null;
  annualPayments: AnnualPayment[];
  annualFactor: number;
  incomeCents: number | null;
  deliveryDate: PaymentDate | null;
  actDate: PaymentDate;
  shortFlowText?: string;
  manualMonthlyCents?: number | null;
  manualAnnualCents?: Record<string, number>;
  manualAct?: boolean;
  minimumActCents?: number;
}

export interface FlowScenario {
  targetCents: number;
  actCents: number;
  actPercent: number | null;
  monthlyCount: number | null;
  regularMonthlyCents: number | null;
  finalMonthlyCents: number | null;
  annualPayments: AnnualPayment[];
  scheduledTotalCents: number | null;
  differenceCents: number | null;
  monthlyIncomePercent: number | null;
  roundingAdjustmentCents: number;
  annualMultiples: Array<{ id: string; multiple: number | null; withinRange: boolean }>;
  timingErrors: string[];
  warnings: string[];
  canCalculate: boolean;
  isBalanced: boolean;
  withinMonthlyLimit50: boolean | null;
}

export interface CalculationInput {
  priceCents: number;
  incomeCents: number | null;
  financingAmountCents: number | null;
  financingManualOverride?: boolean;
  firstPriceInstallmentCents: number | null;
  actDate: PaymentDate;
  deliveryDate: PaymentDate | null;
  readyText?: string;
  monthlyCount: number | null;
  annualPayments: AnnualPayment[];
  annualFactor: number;
  robustActCents: number;
  availableActCents: number | null;
  caixaManualMonthlyCents?: number | null;
  caixaManualAnnualCents?: Record<string, number>;
  directManualMonthlyCents?: number | null;
  directManualAnnualCents?: Record<string, number>;
  directPrePercent: number;
  directMonthlyCount?: number | null;
  directAnnualPayments?: AnnualPayment[];
  includeDirect: boolean;
  actualShortFlowConfirmed: boolean;
}

export interface FullCalculation {
  priceCents: number;
  financingInputCents: number | null;
  financingUsedCents: number | null;
  financingCapped: boolean;
  financingPercent: number | null;
  equityTargetCents: number | null;
  minimumActCents: number;
  robust: FlowScenario | null;
  minimum: FlowScenario | null;
  directRobust: FlowScenario | null;
  directMinimum: FlowScenario | null;
  directPreCents: number;
  directPostCents: number;
  directPrePercent: number;
  directPostPercent: number;
  directPercentValid: boolean;
  directVisible: boolean;
  directReason: string;
  warnings: string[];
}

export const minimumActForPrice = (priceCents: number): number =>
  priceCents > 0 ? roundCents(priceCents * 0.025) : 0;

export const suggestRobustAct = (priceCents: number, availableActCents: number | null): number => {
  const minimum = minimumActForPrice(priceCents);
  const proposal = Math.max(minimum, roundCents(priceCents * 0.05));
  return availableActCents === null ? proposal : Math.min(proposal, availableActCents);
};

const calculateFlow = (input: ScenarioInput): FlowScenario => {
  const annuals = input.annualPayments.map((payment) => ({ ...payment }));
  const timingErrors: string[] = [];
  const warnings: string[] = [];

  const validAnnualFactor = Number.isFinite(input.annualFactor) && input.annualFactor > 0;
  if (!validAnnualFactor) {
    warnings.push("Fator das anuais inválido; informe um multiplicador positivo (referência de 3× a 4×).");
  }
  const effectiveAnnualFactor = validAnnualFactor ? input.annualFactor : 3.5;

  if (input.deliveryDate) {
    if (compareDates(input.actDate, input.deliveryDate) >= 0) {
      timingErrors.push("O ato deve ocorrer antes do mês das chaves.");
    }
    for (const payment of annuals) {
      if (payment.year <= input.actDate.year) {
        timingErrors.push(`Intermediária em ${payment.year} não permitida pela regra operacional (ano do ato ou anterior).`);
      }
      if (!isBeforeKeys(payment, input.deliveryDate)) {
        timingErrors.push(`Intermediária de ${payment.year} não vence antes das chaves.`);
      }
      if (compareDates(payment, input.actDate) <= 0) {
        timingErrors.push(`Intermediária de ${payment.year} não ocorre após o ato.`);
      }
    }
  } else if (annuals.length > 0) {
    timingErrors.push("Confirme o mês e o ano das chaves antes de validar as intermediárias.");
  }
  if (!input.deliveryDate && annuals.some((payment) => payment.year <= input.actDate.year)) {
    timingErrors.push(`Intermediária no ano do ato (${input.actDate.year}) ou anterior não permitida pela regra operacional.`);
  }
  if (new Set(annuals.map((p) => p.year)).size !== annuals.length) {
    timingErrors.push("Há mais de uma intermediária no mesmo ano; a regra padrão prevê uma anual por ano.");
  }
  if (input.monthlyCount === null) warnings.push("Número de mensais pendente: informe mês e ano de entrega.");
  if (input.monthlyCount !== null && input.monthlyCount < 0) warnings.push("A quantidade de mensais não pode ser negativa.");
  if (input.monthlyCount !== null && input.deliveryDate && input.monthlyCount > countMonthlyPayments(input.actDate, input.deliveryDate)) {
    timingErrors.push("A quantidade de mensais ultrapassa o mês anterior às chaves.");
  }
  if (input.monthlyCount === 0 && input.targetCents > input.actCents && annuals.length === 0) {
    warnings.push("Não há mensal antes das chaves para distribuir o saldo; solicite a condição real da mesa.");
  }
  if (input.actCents < 0 || input.actCents > input.targetCents) {
    warnings.push("O ato precisa ser maior ou igual a zero e não pode exceder o valor pré-chaves.");
  }
  const belowMinimumAct = input.minimumActCents !== undefined && input.actCents < input.minimumActCents;
  if (belowMinimumAct) {
    warnings.push(`Ato abaixo da premissa mínima de ${formatBRL(input.minimumActCents)} (2,5% do preço total).`);
  }
  if (
    (input.manualMonthlyCents ?? 0) < 0 ||
    annuals.some((payment) => (input.manualAnnualCents?.[payment.id] ?? payment.amountCents ?? 0) < 0)
  ) {
    warnings.push("Valor de parcela negativo: corrija os campos manuais.");
  }
  if (input.incomeCents === null || input.incomeCents <= 0) {
    warnings.push("Renda familiar não informada; percentual de comprometimento indisponível.");
  }

  const count = input.monthlyCount;
  const availableForInstallments = input.targetCents - input.actCents;
  const annualCount = annuals.length;
  const denominator = (count ?? 0) + annualCount * effectiveAnnualFactor;
  let regularMonthlyCents: number | null = null;
  let finalMonthlyCents: number | null = null;
  let roundingAdjustmentCents = 0;
  let scenarioAnnuals = annuals;
  let total: number | null = null;

  const canAttempt =
    input.priceCents > 0 &&
    count !== null &&
    count >= 0 &&
    input.actCents >= 0 &&
    availableForInstallments >= 0;

  const hasManualMonthly = input.manualMonthlyCents !== null && input.manualMonthlyCents !== undefined;
  const hasAnyManualAnnual =
    annuals.length > 0 &&
    Boolean(input.manualAnnualCents) &&
    annuals.some((payment) => input.manualAnnualCents?.[payment.id] !== undefined);

  if (canAttempt && hasManualMonthly) {
    regularMonthlyCents = input.manualMonthlyCents!;
    finalMonthlyCents = regularMonthlyCents;
    scenarioAnnuals = annuals.map((payment) => ({
      ...payment,
      amountCents: input.manualAnnualCents?.[payment.id] ?? payment.amountCents ?? null,
    }));
    if (scenarioAnnuals.some((payment) => payment.amountCents === null)) {
      warnings.push("Informe o valor de todas as intermediárias para completar a conferência.");
    } else {
      total =
        input.actCents +
        (count ?? 0) * regularMonthlyCents +
        scenarioAnnuals.reduce((sum, p) => sum + (p.amountCents ?? 0), 0);
    }
  } else if (canAttempt && hasAnyManualAnnual) {
    // Usuário editou manualmente uma ou mais anuais sem fixar a mensal:
    // respeita as anuais manuais e distribui o saldo restante nas demais parcelas.
    const manualSum = annuals.reduce((sum, p) => {
      const manual = input.manualAnnualCents?.[p.id];
      return manual !== undefined ? sum + manual : sum;
    }, 0);
    const autoAnnualCount = annuals.filter((p) => input.manualAnnualCents?.[p.id] === undefined).length;
    const remainingForAuto = availableForInstallments - manualSum;
    const autoDenominator = (count ?? 0) + autoAnnualCount * effectiveAnnualFactor;

    if (remainingForAuto < 0) {
      scenarioAnnuals = annuals.map((p) => ({
        ...p,
        amountCents: input.manualAnnualCents?.[p.id] ?? 0,
      }));
      regularMonthlyCents = 0;
      finalMonthlyCents = 0;
      total = input.actCents + scenarioAnnuals.reduce((sum, p) => sum + (p.amountCents ?? 0), 0);
      warnings.push("A soma das intermediárias manuais ultrapassa o saldo pré-chaves disponível.");
    } else if (autoDenominator > 0) {
      regularMonthlyCents = Math.max(0, roundCents(remainingForAuto / autoDenominator));
      scenarioAnnuals = annuals.map((p) => ({
        ...p,
        amountCents:
          input.manualAnnualCents?.[p.id] !== undefined
            ? input.manualAnnualCents[p.id]
            : roundCents(regularMonthlyCents! * effectiveAnnualFactor),
      }));
      const installmentsTotal =
        (count ?? 0) * regularMonthlyCents +
        scenarioAnnuals.reduce((sum, p) => sum + (p.amountCents ?? 0), 0);
      const residual = availableForInstallments - installmentsTotal;
      if ((count ?? 0) > 0) {
        finalMonthlyCents = regularMonthlyCents + residual;
        roundingAdjustmentCents = residual;
        total =
          input.actCents +
          Math.max(0, count! - 1) * regularMonthlyCents +
          finalMonthlyCents +
          scenarioAnnuals.reduce((sum, p) => sum + (p.amountCents ?? 0), 0);
      } else {
        total = input.actCents + scenarioAnnuals.reduce((sum, p) => sum + (p.amountCents ?? 0), 0);
      }
      if (roundingAdjustmentCents !== 0) {
        warnings.push(
          `Ajuste residual de arredondamento de R$ ${(roundingAdjustmentCents / 100).toFixed(2).replace(".", ",")} incorporado na última parcela; conferir com o espelho.`,
        );
      }
    } else {
      regularMonthlyCents = 0;
      finalMonthlyCents = 0;
      scenarioAnnuals = annuals.map((p) => ({
        ...p,
        amountCents: input.manualAnnualCents?.[p.id] ?? 0,
      }));
      total = input.actCents + scenarioAnnuals.reduce((sum, p) => sum + (p.amountCents ?? 0), 0);
    }
  } else if (canAttempt && denominator > 0) {
    regularMonthlyCents = Math.max(0, roundCents(availableForInstallments / denominator));
    scenarioAnnuals = annuals.map((payment) => ({
      ...payment,
      amountCents: roundCents(regularMonthlyCents! * effectiveAnnualFactor),
    }));
    const installmentsTotal =
      (count ?? 0) * regularMonthlyCents +
      scenarioAnnuals.reduce((sum, p) => sum + (p.amountCents ?? 0), 0);
    const residual = availableForInstallments - installmentsTotal;
    if ((count ?? 0) > 0) {
      finalMonthlyCents = regularMonthlyCents + residual;
      roundingAdjustmentCents = residual;
      total =
        input.actCents +
        Math.max(0, count! - 1) * regularMonthlyCents +
        finalMonthlyCents +
        scenarioAnnuals.reduce((sum, p) => sum + (p.amountCents ?? 0), 0);
    } else if (scenarioAnnuals.length > 0) {
      const lastIndex = scenarioAnnuals.length - 1;
      const previousTotal = scenarioAnnuals
        .slice(0, lastIndex)
        .reduce((sum, p) => sum + (p.amountCents ?? 0), 0);
      scenarioAnnuals[lastIndex] = {
        ...scenarioAnnuals[lastIndex],
        amountCents: availableForInstallments - previousTotal,
      };
      roundingAdjustmentCents = residual;
      total = input.actCents + scenarioAnnuals.reduce((sum, p) => sum + (p.amountCents ?? 0), 0);
    } else {
      total = input.actCents;
    }
    if (roundingAdjustmentCents !== 0) {
      warnings.push(
        `Ajuste residual de arredondamento de R$ ${(roundingAdjustmentCents / 100).toFixed(2).replace(".", ",")} incorporado na última parcela; conferir com o espelho.`,
      );
    }
  } else if (canAttempt && denominator === 0 && availableForInstallments === 0) {
    regularMonthlyCents = 0;
    finalMonthlyCents = 0;
    scenarioAnnuals = annuals.map((payment) => ({ ...payment, amountCents: 0 }));
    total = input.actCents;
  }

  if (finalMonthlyCents !== null && finalMonthlyCents < 0) {
    warnings.push("A última mensal ficou negativa devido ao saldo muito baixo em relação às parcelas/anuais; ajuste o ato ou as intermediárias.");
  }

  if (
    input.monthlyCount === 0 &&
    input.deliveryDate &&
    isShortOrImmediateDelivery(input.deliveryDate, input.shortFlowText, input.actDate) &&
    !input.manualAct
  ) {
    warnings.push("Entrega pronta/curta: não presumir fluxo. Cadastre a condição real da mesa antes de apresentar parcelas.");
  }

  const targetDifference = total === null ? null : targetCentsDifference(total, input.targetCents);
  const percent =
    regularMonthlyCents === null || input.incomeCents === null || input.incomeCents <= 0
      ? null
      : percentOf(regularMonthlyCents, input.incomeCents);

  const annualMultiples = scenarioAnnuals.map((payment) => {
    const multiple =
      regularMonthlyCents && payment.amountCents !== null ? payment.amountCents / regularMonthlyCents : null;
    const withinRange = multiple !== null && multiple >= 3 - 0.001 && multiple <= 4 + 0.001;
    if (multiple !== null && !withinRange) {
      warnings.push(
        `A anual de ${payment.year} equivale a ${multiple.toFixed(2)}× a mensal; a referência operacional é de 3× a 4×.`,
      );
    }
    return { id: payment.id, multiple, withinRange };
  });

  if (
    input.monthlyCount !== null &&
    regularMonthlyCents !== null &&
    input.incomeCents &&
    percent !== null &&
    percent > 30 &&
    percent <= 50
  ) {
    warnings.push(`Mensal compromete ${percent.toFixed(1)}% da renda familiar: acima da referência de conforto de 30%.`);
  }
  if (percent !== null && percent > 50) {
    warnings.push(`Mensal compromete ${percent.toFixed(1)}% da renda familiar: acima do limite operacional de 50%.`);
  }
  if (scenarioAnnuals.some((p) => p.amountCents !== null && p.amountCents > 1_500_000)) {
    warnings.push("Há anual acima da referência histórica de R$ 15.000,00; confirme a capacidade com o consultor.");
  }

  const amountsValid =
    validAnnualFactor &&
    input.priceCents > 0 &&
    (regularMonthlyCents ?? 0) >= 0 &&
    (finalMonthlyCents ?? 0) >= 0 &&
    scenarioAnnuals.every((payment) => payment.amountCents === null || payment.amountCents >= 0);

  const canCalculate =
    total !== null &&
    count !== null &&
    count >= 0 &&
    timingErrors.length === 0 &&
    input.actCents >= 0 &&
    input.actCents <= input.targetCents &&
    !belowMinimumAct &&
    amountsValid;

  return {
    targetCents: input.targetCents,
    actCents: input.actCents,
    actPercent: input.priceCents > 0 ? percentOf(input.actCents, input.priceCents) : null,
    monthlyCount: count,
    regularMonthlyCents,
    finalMonthlyCents,
    annualPayments: scenarioAnnuals,
    scheduledTotalCents: total,
    differenceCents: targetDifference,
    monthlyIncomePercent: percent,
    roundingAdjustmentCents,
    annualMultiples,
    timingErrors,
    warnings: [...new Set(warnings)],
    canCalculate,
    isBalanced: targetDifference === 0 && timingErrors.length === 0 && !belowMinimumAct && amountsValid,
    withinMonthlyLimit50: percent === null ? null : percent <= 50,
  };
};

const targetCentsDifference = (actual: number, target: number): number => actual - target;

export const calculateAll = (input: CalculationInput): FullCalculation => {
  const warnings: string[] = [];
  if (input.priceCents <= 0) {
    warnings.push("Informe um preço total maior que zero para calcular a proposta.");
  }

  const cap80 = input.priceCents > 0 ? Math.floor(input.priceCents * 0.8) : 0;
  const financingAboveCap = input.financingAmountCents !== null && input.financingAmountCents > cap80;
  const financingExceedsPrice =
    input.priceCents > 0 && input.financingAmountCents !== null && input.financingAmountCents > input.priceCents;
  const financingManualOverride = Boolean(input.financingManualOverride && financingAboveCap && !financingExceedsPrice);
  const financingCapped = financingAboveCap && !financingManualOverride && !financingExceedsPrice;
  const financingInvalid =
    (input.financingAmountCents !== null && input.financingAmountCents < 0) || financingExceedsPrice;

  const financingUsedCents =
    input.financingAmountCents === null || financingInvalid || input.priceCents <= 0
      ? null
      : financingManualOverride
        ? input.financingAmountCents
        : Math.min(input.financingAmountCents, cap80);

  if (financingExceedsPrice) {
    warnings.push("O financiamento informado supera 100% do preço do imóvel; revise o valor do GPM/PRICE.");
  }
  if (financingCapped) {
    warnings.push("A simulação GPM supera 80% do preço; o cálculo limita o financiamento à cota máxima de 80% até confirmação.");
  }
  if (financingManualOverride) {
    warnings.push("O consultor manteve manualmente um financiamento acima de 80%; valor usado apenas como premissa, confirmar com a Caixa.");
  }
  if (input.financingAmountCents !== null && input.financingAmountCents < 0) {
    warnings.push("O financiamento informado não pode ser negativo; corrija o valor do GPM/PRICE.");
  }
  if (financingUsedCents === null && !financingExceedsPrice) {
    warnings.push("Informe o financiamento estimado da simulação GPM/PRICE para calcular o fluxo Caixa.");
  }

  const financingPercent =
    financingUsedCents === null || input.priceCents <= 0 ? null : percentOf(financingUsedCents, input.priceCents);
  const equityTargetCents = financingUsedCents === null ? null : input.priceCents - financingUsedCents;
  const minimumActCents = minimumActForPrice(input.priceCents);

  const shortFlow = isShortOrImmediateDelivery(input.deliveryDate, input.readyText, input.actDate);
  const scheduleUsable = input.deliveryDate !== null && !shortFlow;
  if (shortFlow && !input.actualShortFlowConfirmed) {
    warnings.push("Entrega pronta ou de curtíssimo prazo (até 3 meses): informe a condição real da mesa; fluxo longo/anuais não foram presumidos.");
  }
  const canUseSchedule = scheduleUsable || input.actualShortFlowConfirmed;
  const monthlyCount = canUseSchedule ? input.monthlyCount : null;
  const annualPayments = canUseSchedule ? input.annualPayments : [];

  const base = {
    priceCents: input.priceCents,
    incomeCents: input.incomeCents,
    monthlyCount,
    annualPayments,
    annualFactor: input.annualFactor,
    deliveryDate: input.deliveryDate,
    actDate: input.actDate,
    shortFlowText: input.readyText,
  };
  const robust =
    equityTargetCents === null
      ? null
      : calculateFlow({
          ...base,
          targetCents: equityTargetCents,
          actCents: input.robustActCents,
          manualMonthlyCents: input.caixaManualMonthlyCents,
          manualAnnualCents: input.caixaManualAnnualCents,
          manualAct: true,
          minimumActCents,
        });
  const minimum =
    equityTargetCents === null
      ? null
      : calculateFlow({
          ...base,
          targetCents: equityTargetCents,
          actCents: minimumActCents,
          minimumActCents,
        });

  const directPrePercent = input.directPrePercent;
  const directPostPercent = 100 - directPrePercent;
  const directPercentValid = Number.isFinite(directPrePercent) && directPrePercent >= 0 && directPrePercent <= 100;
  const directPreCents = input.priceCents > 0 ? roundCents((input.priceCents * directPrePercent) / 100) : 0;
  const directPostCents = Math.max(0, input.priceCents - directPreCents);
  const directMonthlyCount = canUseSchedule ? (input.directMonthlyCount ?? monthlyCount) : null;
  const directDates = canUseSchedule ? (input.directAnnualPayments ?? annualPayments) : [];

  const directBase = {
    priceCents: input.priceCents,
    incomeCents: input.incomeCents,
    monthlyCount: directMonthlyCount,
    annualPayments: directDates,
    annualFactor: input.annualFactor,
    deliveryDate: input.deliveryDate,
    actDate: input.actDate,
    shortFlowText: input.readyText,
  };
  const directRobust = input.includeDirect
    ? calculateFlow({
        ...directBase,
        targetCents: directPreCents,
        actCents: input.robustActCents,
        manualMonthlyCents: input.directManualMonthlyCents,
        manualAnnualCents: input.directManualAnnualCents,
        manualAct: true,
        minimumActCents,
      })
    : null;
  const directMinimum = input.includeDirect
    ? calculateFlow({
        ...directBase,
        targetCents: directPreCents,
        actCents: minimumActCents,
        minimumActCents,
      })
    : null;

  let directReason = "";
  const directRatio = directRobust?.monthlyIncomePercent;
  if (!input.includeDirect) directReason = "Tabela Direta não selecionada.";
  else if (!directPercentValid) directReason = "O percentual pré-chaves deve ficar entre 0% e 100%.";
  else if (shortFlow && !input.actualShortFlowConfirmed) directReason = "Entrega pronta/curta: condição real da mesa necessária.";
  else if (input.incomeCents === null || input.incomeCents <= 0) directReason = "Informe a renda familiar para avaliar o limite de 50%.";
  else if (directRatio === null || directRatio === undefined) directReason = "Informe mês/ano de entrega e condições pré-chaves para calcular as mensais.";
  else if (directRatio > 50) directReason = `Tabela Direta inviável: mensal de ${directRatio.toFixed(1)}% da renda (acima de 50%).`;
  else if (!directRobust?.isBalanced) directReason = "Revise ato, parcelas e datas; a conferência pré-chaves não fecha ou tem pendências.";
  else directReason = "Fluxo dentro do limite indicativo; condições pós-chaves não foram presumidas.";

  const directVisible = Boolean(
    input.includeDirect &&
      directPercentValid &&
      directRobust?.isBalanced &&
      directRatio !== null &&
      directRatio !== undefined &&
      directRatio <= 50 &&
      canUseSchedule,
  );
  if (!directPercentValid) {
    warnings.push("O percentual pré-chaves da Tabela Direta deve ficar entre 0% e 100%; revise o saldo pós-chaves.");
  }
  if (input.availableActCents !== null && input.robustActCents > input.availableActCents) {
    warnings.push("Ato robusto excede o valor disponível informado pelo cliente.");
  }
  if (input.robustActCents < minimumActCents) {
    warnings.push("Ato robusto está abaixo do ato mínimo padrão de 2,5%.");
  }
  if (input.deliveryDate && input.actDate && compareDates(input.actDate, input.deliveryDate) >= 0) {
    warnings.push("O mês do ato deve ser anterior ao mês previsto para as chaves.");
  }

  return {
    priceCents: input.priceCents,
    financingInputCents: input.financingAmountCents,
    financingUsedCents,
    financingCapped,
    financingPercent,
    equityTargetCents,
    minimumActCents,
    robust,
    minimum,
    directRobust,
    directMinimum,
    directPreCents,
    directPostCents,
    directPrePercent,
    directPostPercent,
    directPercentValid,
    directVisible,
    directReason,
    warnings: [...new Set(warnings)],
  };
};

export interface CalculatedSimulationEntry {
  simulation: SimulationRecord;
  client: ClientProfile | null;
  property: PortfolioUnit;
  priceCents: number;
  deliveryDate: PaymentDate | null;
  monthlyCount: number | null;
  calculation: FullCalculation;
}

/** Prepara e calcula uma SimulationRecord de forma unificada para Simulador, Comparador e Dashboard. */
export const calculateSimulationEntry = (
  simulation: SimulationRecord,
  client: ClientProfile | null,
  property: PortfolioUnit,
): CalculatedSimulationEntry => {
  const priceCents = simulation.priceOverrideCents ?? property.priceCents ?? property.priceLowCents ?? 0;
  const deliveryDate =
    simulation.deliveryOverride ??
    (property.deliveryYear && property.deliveryMonth
      ? { year: property.deliveryYear, month: property.deliveryMonth }
      : null);
  const shortFlow = isShortOrImmediateDelivery(deliveryDate, property.deliveryText, simulation.actDate);
  const autoMonthlyCount = deliveryDate && !shortFlow ? countMonthlyPayments(simulation.actDate, deliveryDate) : null;
  const monthlyCount = simulation.monthlyCountOverride ?? autoMonthlyCount;
  const autoAnnuals: AnnualPayment[] =
    deliveryDate && !shortFlow
      ? suggestAnnualDates(simulation.actDate, deliveryDate).map((date, index) => ({
          id: `ann-${date.year}-${index}`,
          year: date.year,
          month: date.month,
          amountCents: null,
        }))
      : [];
  const annualPayments = simulation.annualDatesOverride ?? autoAnnuals;
  const robustActCents = simulation.robustActCents ?? suggestRobustAct(priceCents, client?.availableActCents ?? null);

  const calculation = calculateAll({
    priceCents,
    incomeCents: client?.incomeFamilyCents ?? null,
    financingAmountCents: simulation.financingAmountCents,
    financingManualOverride: simulation.financingManualOverride,
    firstPriceInstallmentCents: simulation.firstPriceInstallmentCents,
    actDate: simulation.actDate,
    deliveryDate,
    readyText: property.deliveryText,
    monthlyCount,
    annualPayments,
    annualFactor: simulation.annualFactor,
    robustActCents,
    availableActCents: client?.availableActCents ?? null,
    caixaManualMonthlyCents: simulation.manualAmounts.caixaMonthlyCents ?? null,
    caixaManualAnnualCents: simulation.manualAmounts.caixaAnnualCents,
    directManualMonthlyCents: simulation.manualAmounts.directMonthlyCents ?? null,
    directManualAnnualCents: simulation.manualAmounts.directAnnualCents,
    directPrePercent: simulation.directPrePercent,
    directMonthlyCount: simulation.directMonthlyCountOverride,
    directAnnualPayments: simulation.directAnnualDatesOverride ?? undefined,
    includeDirect: simulation.includeDirect,
    actualShortFlowConfirmed: simulation.actualShortFlowConfirmed,
  });

  return {
    simulation,
    client,
    property,
    priceCents,
    deliveryDate,
    monthlyCount,
    calculation,
  };
};
