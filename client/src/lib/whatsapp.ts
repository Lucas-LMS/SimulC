import type { ClientProfile, PaymentDate } from "./models";
import type { FlowScenario, FullCalculation } from "./calculator";
import type { PortfolioUnit } from "../data/portfolio";
import { formatBRL, formatNumber } from "./money";
import { listMonthlyDates, monthLabelCapitalized } from "./schedule";

export interface MessageContext {
  client: ClientProfile | null;
  property: PortfolioUnit;
  priceCents: number;
  deliveryDate: PaymentDate | null;
  deliveryIsPremise: boolean;
  priceIsPremise: boolean;
  actDate: PaymentDate;
  deliveryText: string;
  monthsCount: number | null;
  calculation: FullCalculation;
  financingTermMonths: number | null;
  financingLine: string;
  financingSystem: string;
  financingRate: string;
  firstPriceInstallmentCents: number | null;
  incomeCents: number | null;
  includeFGTSNote: boolean;
  mode: "caixa" | "direta" | "ambas";
  gpmReportedSubsidyCents?: number | null;
  gpmReportedFees?: string;
  gpmReportedQuotaPercent?: number | null;
  gpmReportedIncomeCommitmentPercent?: number | null;
}

const formatTerm = (months: number | null): string | null => {
  if (!months || months <= 0) return null;
  const years = Math.floor(months / 12);
  const rest = months % 12;
  if (years && rest) return `${years} anos e ${rest} meses`;
  if (years) return `${years} ${years === 1 ? "ano" : "anos"}`;
  return `${months} ${months === 1 ? "mês" : "meses"}`;
};

const installmentLine = (scenario: FlowScenario, prefix: string): string[] => {
  const lines: string[] = [];
  lines.push(`• *${prefix}:* Ato de *${formatBRL(scenario.actCents)}*${scenario.actPercent !== null ? ` (${formatNumber(scenario.actPercent, 1)}% do preço total)` : ""}`);
  if (scenario.monthlyCount && scenario.regularMonthlyCents !== null) {
    const ratio = scenario.monthlyIncomePercent !== null ? ` _(${formatNumber(scenario.monthlyIncomePercent, 1)}% da renda)_` : "";
    lines.push(`  + ${scenario.monthlyCount} ${scenario.monthlyCount === 1 ? "mensal" : "mensais"} de *${formatBRL(scenario.regularMonthlyCents)}*${ratio}`);
    if (scenario.finalMonthlyCents !== null && scenario.finalMonthlyCents !== scenario.regularMonthlyCents) {
      lines.push(`  _Última mensal com ajuste de arredondamento: ${formatBRL(scenario.finalMonthlyCents)}._`);
    }
  }
  if (scenario.annualPayments.length) {
    const annuals = scenario.annualPayments
      .map((payment) => `${payment.year} de *${formatBRL(payment.amountCents)}*`)
      .join("; ");
    lines.push(`  + ${scenario.annualPayments.length} anuais: ${annuals}`);
  }
  return lines;
};

export const generateWhatsAppMessage = (ctx: MessageContext): string => {
  const unit = ctx.property;
  const lines: string[] = [
    `Olá${ctx.client?.name ? `, ${ctx.client.name}` : ""}! Aqui é o *Lucas Silva*, da consultoria da *Cury Construtora* no Rio de Janeiro. 😊`,
    "",
    "Preparei uma pré-simulação ilustrativa. _Valores sujeitos à disponibilidade de unidades, à tabela vigente, ao cronograma oficial e à análise da Caixa/mesa comercial. Esta simulação não representa aprovação ou condição definitiva._",
    "",
    "━━━━━━━━━━━━━━━",
  ];

  if (ctx.mode !== "direta") {
    lines.push("💰 *Pré-simulação Caixa (PRICE/GPM)*");
    if (ctx.incomeCents !== null && ctx.incomeCents > 0) lines.push(`• Renda familiar: *${formatBRL(ctx.incomeCents)}*`);
    if (ctx.calculation.financingUsedCents !== null) {
      lines.push(`• Financiamento estimado: *${formatBRL(ctx.calculation.financingUsedCents)}* (cota máxima operacional de 80% do imóvel, sujeita à avaliação e análise)`);
    }
    if (ctx.firstPriceInstallmentCents !== null) lines.push(`• 1ª parcela PRICE estimada: *${formatBRL(ctx.firstPriceInstallmentCents)}*`);
    const term = formatTerm(ctx.financingTermMonths);
    if (term || ctx.financingLine || ctx.financingSystem) {
      lines.push(`• Prazo/linha informados: ${[term, ctx.financingLine, ctx.financingSystem].filter(Boolean).join(" · ") || "a confirmar"}`);
    }
    lines.push("");
  }

  const deliveryBase = ctx.deliveryDate
    ? `${monthLabelCapitalized(ctx.deliveryDate)}${ctx.monthsCount !== null ? ` (${ctx.monthsCount} ${ctx.monthsCount === 1 ? "mensal" : "mensais"} até as chaves)` : ""}`
    : `${ctx.deliveryText || "Prazo de entrega a confirmar"} _[A CONFIRMAR]_`;
  const delivery = ctx.deliveryIsPremise
    ? `${deliveryBase} _[A CONFIRMAR${ctx.deliveryDate ? " — MÊS HIPOTÉTICO" : ""}]_`
    : deliveryBase;
  const neighborhood = unit.neighborhood ? ` — ${unit.neighborhood}` : "";
  const area = unit.areaM2 ? ` · ${formatNumber(unit.areaM2, 0)} m²` : "";
  lines.push(`🏢 *${unit.project}*${neighborhood}`);
  lines.push(`${unit.typology}${unit.parking === true ? " · com vaga" : unit.parking === false ? " · sem vaga" : ""}${area}`);
  lines.push(`Preço: *A partir de ${formatBRL(ctx.priceCents)}*${ctx.priceIsPremise ? " _[PREMISSA — confirme valor e unidade na tabela vigente]_" : ""}`);
  lines.push(`Entrega prevista: ${delivery}`);
  lines.push("");

  if (ctx.mode !== "direta") {
    lines.push("*Opção A — Financiamento Caixa*");
    const robust = ctx.calculation.robust;
    const minimum = ctx.calculation.minimum;
    if (robust && robust.canCalculate) lines.push(...installmentLine(robust, "Com Ato Robusto"));
    else lines.push("• Condição das parcelas de entrada pendente de confirmação do cronograma/mesa.");
    if (minimum && minimum.canCalculate) {
      lines.push("• 💡 *Com Ato Mínimo (2,5%):*");
      lines.push(...installmentLine(minimum, "Comparativo" ).slice(0).map((line) => line.replace("• *Comparativo:* ", "  ").replace(/^  \+/, "  +")));
    }
    lines.push("");
  }

  if (ctx.mode !== "caixa") {
    const direct = ctx.calculation.directRobust;
    if (ctx.calculation.directVisible && direct) {
      lines.push(`*Opção B — Tabela Direta Cury (${formatNumber(ctx.calculation.directPrePercent, 1)}% pré-chaves / ${formatNumber(ctx.calculation.directPostPercent, 1)}% pós-chaves)*`);
      lines.push(`• Pré-chaves (${formatNumber(ctx.calculation.directPrePercent, 0)}% — *${formatBRL(ctx.calculation.directPreCents)}*):`);
      lines.push(...installmentLine(direct, "Com Ato Robusto").slice(0).map((line) => line.replace("• *Com Ato Robusto:*", "  •")));
      lines.push(`• Pós-chaves direto com a Cury (${formatNumber(ctx.calculation.directPostPercent, 0)}%): *${formatBRL(ctx.calculation.directPostCents)}*`);
      lines.push("");
    }
  }

  if (ctx.includeFGTSNote) {
    lines.push("📌 O FGTS não foi abatido da entrada e poderá ser avaliado na etapa bancária para amortização, conforme os requisitos vigentes.");
    lines.push("");
  }
  lines.push("Qual região ou planta faz mais sentido para você? 🙂");
  return lines.join("\n");
};

export const buildInternalSummary = (ctx: MessageContext): string => {
  const { calculation: c, property, deliveryDate } = ctx;
  const lines = [
    "CONFERÊNCIA INTERNA — SIMULAÇÃO ILUSTRATIVA",
    `Cliente: ${ctx.client?.name || "não identificado"}${ctx.client?.phone ? ` | Contato: ${ctx.client.phone}` : ""}`,
    `Empreendimento: ${property.project} | ${property.typology} | ${property.areaM2 ? `${property.areaM2} m²` : "metragem não informada"}`,
    `Preço da simulação: ${formatBRL(ctx.priceCents)} | Fonte do catálogo: ${property.source} (${property.sourceDate})`,
    `Entrega: ${deliveryDate ? `${monthLabelCapitalized(deliveryDate)}${ctx.deliveryIsPremise ? " [A CONFIRMAR — MÊS HIPOTÉTICO]" : ""}` : `${ctx.deliveryText || "não informada"} [A CONFIRMAR]`}`,
    `Premissa de preço: ${ctx.priceIsPremise ? "valor alterado/selecionado como referência; confirmar no espelho" : "preço da unidade selecionada; confirmar vigência"}`,
    `Renda familiar: ${ctx.incomeCents !== null ? formatBRL(ctx.incomeCents) : "não informada"}`,
    `Financiamento Caixa usado: ${c.financingUsedCents !== null ? formatBRL(c.financingUsedCents) : "não informado"} | Cota: ${c.financingPercent !== null ? `${formatNumber(c.financingPercent, 1)}%` : "—"}`,
    `Parâmetros PRICE informados: 1ª prestação ${ctx.firstPriceInstallmentCents !== null ? formatBRL(ctx.firstPriceInstallmentCents) : "—"} | prazo ${formatTerm(ctx.financingTermMonths) ?? "—"} | linha ${ctx.financingLine || "—"} | sistema ${ctx.financingSystem || "—"} | taxa ${ctx.financingRate || "—"}`,
    `GPM transcrito (informativo, não aplicado como subsídio/aprovação): subsídio ${ctx.gpmReportedSubsidyCents != null ? formatBRL(ctx.gpmReportedSubsidyCents) : "—"} | cota reportada ${ctx.gpmReportedQuotaPercent != null ? `${formatNumber(ctx.gpmReportedQuotaPercent, 2)}%` : "—"} | comprometimento reportado ${ctx.gpmReportedIncomeCommitmentPercent != null ? `${formatNumber(ctx.gpmReportedIncomeCommitmentPercent, 2)}%` : "—"}`,
    `Taxas/encargos reportados: ${ctx.gpmReportedFees || "não informados"}`,
    `Recursos próprios Caixa: ${c.equityTargetCents !== null ? formatBRL(c.equityTargetCents) : "—"}`,
    "",
    "ATO ROBUSTO",
    ...(c.robust ? [
      `Ato: ${formatBRL(c.robust.actCents)} (${formatNumber(c.robust.actPercent, 1)}% do preço total)`,
      `Mensais: ${c.robust.monthlyCount ?? "a confirmar"} × ${formatBRL(c.robust.regularMonthlyCents)} (${c.robust.monthlyIncomePercent !== null ? `${formatNumber(c.robust.monthlyIncomePercent, 1)}% da renda familiar` : "renda não verificada"})${c.robust.monthlyCount ? ` | vencimentos: ${listMonthlyDates(ctx.actDate, c.robust.monthlyCount).map(monthLabelCapitalized).join(", ")}` : ""}`,
      `Anuais: ${c.robust.annualPayments.length ? c.robust.annualPayments.map((p) => `${p.year}/${String(p.month).padStart(2, "0")} ${formatBRL(p.amountCents)}`).join(" · ") : "nenhuma sugerida"}`,
      `Total previsto: ${formatBRL(c.robust.scheduledTotalCents)} | Diferença vs alvo: ${formatBRL(c.robust.differenceCents)}`,
    ] : ["Pendente de financiamento GPM ou calendário de entrega."]),
    "",
    "COMPARATIVO — ATO MÍNIMO 2,5%",
    ...(c.minimum ? [
      `Ato: ${formatBRL(c.minimum.actCents)} | Mensais: ${c.minimum.monthlyCount ?? "a confirmar"} × ${formatBRL(c.minimum.regularMonthlyCents)} (${c.minimum.monthlyIncomePercent !== null ? `${formatNumber(c.minimum.monthlyIncomePercent, 1)}% da renda` : "renda não verificada"})${c.minimum.monthlyCount ? ` | vencimentos: ${listMonthlyDates(ctx.actDate, c.minimum.monthlyCount).map(monthLabelCapitalized).join(", ")}` : ""}`,
      `Anuais: ${c.minimum.annualPayments.length ? c.minimum.annualPayments.map((p) => `${p.year} ${formatBRL(p.amountCents)}`).join(" · ") : "nenhuma sugerida"}`,
      `Total: ${formatBRL(c.minimum.scheduledTotalCents)} | Diferença: ${formatBRL(c.minimum.differenceCents)}`,
    ] : ["Indisponível sem financiamento informado."]),
    "",
    `Tabela Direta ${c.directPrePercent === 55 ? "padrão" : "personalizada"}: pré ${formatNumber(c.directPrePercent, 1)}% = ${formatBRL(c.directPreCents)}; pós ${formatNumber(c.directPostPercent, 1)}% = ${formatBRL(c.directPostCents)}.`,
    `Tabela Direta: ${c.directReason}`,
    "",
    "ALERTAS / PENDÊNCIAS",
    ...(c.warnings.length ? c.warnings.map((warning) => `• ${warning}`) : ["• Conferência sem alerta estrutural."]),
    ...(c.robust?.warnings ?? []).map((warning) => `• ${warning}`),
    ...(c.robust?.timingErrors ?? []).map((error) => `• ${error}`),
    "[TABELA] Base de portfólio fornecida em nov/2026; confirmar tabela, unidade e cronograma oficial.",
    "[CONDICIONADO] Crédito, PRICE real, avaliação, FGTS, subsídio e aprovação dependem da análise vigente.",
  ];
  return lines.join("\n");
};
