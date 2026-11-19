import type { BrokerProfile, ClientProfile, PaymentDate } from "./models";
import type { FullCalculation } from "./calculator";
import type { PortfolioUnit } from "../data/portfolio";
import { formatBRL, formatNumber } from "./money";
import { monthLabelCapitalized } from "./schedule";

export interface ProposalCardData {
  client: ClientProfile | null;
  property: PortfolioUnit;
  priceCents: number;
  deliveryDate: PaymentDate | null;
  deliveryIsPremise: boolean;
  deliveryText: string;
  calculation: FullCalculation;
  firstPriceInstallmentCents: number | null;
  financingTermMonths: number | null;
  mode: "caixa" | "direta" | "ambas";
  brokerProfile?: BrokerProfile;
  documentationTotalCents?: number | null;
}

const drawRoundedRect = (
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  w: number,
  h: number,
  r: number,
) => {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
};

const truncateText = (ctx: CanvasRenderingContext2D, text: string, maxWidth: number): string => {
  if (ctx.measureText(text).width <= maxWidth) return text;
  let cut = text;
  while (cut.length > 3 && ctx.measureText(`${cut}…`).width > maxWidth) {
    cut = cut.slice(0, -1);
  }
  return `${cut}…`;
};

/**
 * Gera um card visual 1080x1350 (formato retrato ideal para WhatsApp) usando Canvas 2D nativo,
 * sem dependências externas.
 */
export const renderProposalCardBlob = async (data: ProposalCardData): Promise<Blob> => {
  const width = 1080;
  const height = 1350;
  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("Canvas 2D indisponível neste navegador.");

  // Fundo editorial quente
  ctx.fillStyle = "#f4f3ee";
  ctx.fillRect(0, 0, width, height);

  // Cabeçalho verde-esmeralda
  const headerGrad = ctx.createLinearGradient(0, 0, width, 280);
  headerGrad.addColorStop(0, "#12322f");
  headerGrad.addColorStop(1, "#1f5651");
  ctx.fillStyle = headerGrad;
  ctx.fillRect(0, 0, width, 285);

  // Linha dourada decorativa
  ctx.fillStyle = "#d5a879";
  ctx.fillRect(64, 281, width - 128, 4);

  // Marca Cury Fluxo
  ctx.fillStyle = "#d5a879";
  ctx.font = "700 20px 'DM Sans', system-ui, sans-serif";
  ctx.fillText("CURY FLUXO · PRÉ-SIMULAÇÃO ILUSTRATIVA", 64, 72);

  // Nome do empreendimento
  ctx.fillStyle = "#ffffff";
  ctx.font = "800 46px Manrope, system-ui, sans-serif";
  ctx.fillText(truncateText(ctx, data.property.project, width - 128), 64, 136);

  // Subtítulo (bairro, tipologia, área)
  const area = data.property.areaM2
    ? `${formatNumber(data.property.areaM2, 0)} m²`
    : data.property.areaText || "";
  const subParts = [
    data.property.neighborhood || data.property.region,
    data.property.typology,
    data.property.parking === true ? "com vaga" : data.property.parking === false ? "sem vaga" : "",
    area,
  ].filter(Boolean);
  ctx.fillStyle = "#cfe0d9";
  ctx.font = "500 24px 'DM Sans', system-ui, sans-serif";
  ctx.fillText(truncateText(ctx, subParts.join("  ·  "), width - 128), 64, 178);

  // Cliente e entrega no header
  const deliveryLabel = data.deliveryDate
    ? `${monthLabelCapitalized(data.deliveryDate)}${data.deliveryIsPremise ? " (a confirmar)" : ""}`
    : data.deliveryText || "Entrega a confirmar";
  ctx.fillStyle = "#b5cec6";
  ctx.font = "600 21px 'DM Sans', system-ui, sans-serif";
  const clientLine = data.client?.name ? `Preparado para ${data.client.name}  ·  ` : "";
  ctx.fillText(truncateText(ctx, `${clientLine}Entrega prevista: ${deliveryLabel}`, width - 128), 64, 232);

  // Card principal de Preço + Financiamento
  let y = 322;
  drawRoundedRect(ctx, 64, y, width - 128, 152, 18);
  ctx.fillStyle = "#ffffff";
  ctx.fill();
  ctx.strokeStyle = "#dfe5e1";
  ctx.lineWidth = 2;
  ctx.stroke();

  ctx.fillStyle = "#55625c";
  ctx.font = "700 18px 'DM Sans', system-ui, sans-serif";
  ctx.fillText("PREÇO REFERENCIAL", 98, y + 48);
  ctx.fillStyle = "#173837";
  ctx.font = "800 44px Manrope, system-ui, sans-serif";
  ctx.fillText(formatBRL(data.priceCents), 98, y + 106);

  if (data.mode !== "direta" && data.calculation.financingUsedCents !== null) {
    const col2X = 560;
    ctx.fillStyle = "#dfe5e1";
    ctx.fillRect(col2X - 28, y + 28, 2, 96);

    ctx.fillStyle = "#286966";
    ctx.font = "700 18px 'DM Sans', system-ui, sans-serif";
    const cota = data.calculation.financingPercent !== null ? ` (${formatNumber(data.calculation.financingPercent, 1)}%)` : "";
    ctx.fillText(`FINANCIAMENTO CAIXA${cota}`, col2X, y + 48);
    ctx.fillStyle = "#173837";
    ctx.font = "800 36px Manrope, system-ui, sans-serif";
    ctx.fillText(formatBRL(data.calculation.financingUsedCents), col2X, y + 98);
    if (data.firstPriceInstallmentCents !== null) {
      ctx.fillStyle = "#55625c";
      ctx.font = "600 19px 'DM Sans', system-ui, sans-serif";
      ctx.fillText(`1ª PRICE estimada: ${formatBRL(data.firstPriceInstallmentCents)}`, col2X, y + 130);
    }
  }

  y += 184;

  const drawFlowBox = (
    title: string,
    accent: string,
    rows: Array<{ label: string; value: string; sub?: string }>,
    boxHeight: number,
  ) => {
    drawRoundedRect(ctx, 64, y, width - 128, boxHeight, 18);
    ctx.fillStyle = "#ffffff";
    ctx.fill();
    ctx.strokeStyle = "#dfe5e1";
    ctx.lineWidth = 2;
    ctx.stroke();

    // Acento esquerdo
    drawRoundedRect(ctx, 64, y, 8, boxHeight, 4);
    ctx.fillStyle = accent;
    ctx.fill();

    ctx.fillStyle = accent;
    ctx.font = "800 22px Manrope, system-ui, sans-serif";
    ctx.fillText(title, 98, y + 44);

    let rowY = y + 86;
    rows.forEach((row) => {
      ctx.fillStyle = "#30423d";
      ctx.font = "600 23px 'DM Sans', system-ui, sans-serif";
      ctx.fillText(row.label, 98, rowY);

      ctx.fillStyle = "#173837";
      ctx.font = "800 26px Manrope, system-ui, sans-serif";
      const valWidth = ctx.measureText(row.value).width;
      ctx.fillText(row.value, width - 98 - valWidth, rowY);

      if (row.sub) {
        ctx.fillStyle = "#55625c";
        ctx.font = "500 18px 'DM Sans', system-ui, sans-serif";
        ctx.fillText(truncateText(ctx, row.sub, width - 220), 98, rowY + 26);
        rowY += 66;
      } else {
        rowY += 46;
      }
    });

    y += boxHeight + 24;
  };

  // Opção A — Financiamento Caixa
  if (data.mode !== "direta" && data.calculation.robust?.canCalculate) {
    const r = data.calculation.robust;
    const rows: Array<{ label: string; value: string; sub?: string }> = [
      {
        label: "Ato (sinal)",
        value: formatBRL(r.actCents),
        sub: r.actPercent !== null ? `${formatNumber(r.actPercent, 1)}% do preço total` : undefined,
      },
      {
        label: `${r.monthlyCount ?? 0} mensais até as chaves`,
        value: formatBRL(r.regularMonthlyCents),
        sub:
          r.monthlyIncomePercent !== null
            ? `${formatNumber(r.monthlyIncomePercent, 1)}% da renda familiar`
            : "Fluxo direto com a Cury até as chaves",
      },
    ];
    if (r.annualPayments.length) {
      const annualDetail = r.annualPayments
        .map((p) => `${p.year}: ${formatBRL(p.amountCents)}`)
        .join("  ·  ");
      const annualSum = r.annualPayments.reduce((s, p) => s + (p.amountCents ?? 0), 0);
      rows.push({
        label: `${r.annualPayments.length} intermediária(s) anual(is)`,
        value: formatBRL(annualSum),
        sub: annualDetail,
      });
    }
    const boxH = 74 + rows.length * 66;
    drawFlowBox("OPÇÃO A · FINANCIAMENTO CAIXA (ATO ROBUSTO)", "#286966", rows, boxH);
  }

  // Opção B — Tabela Direta
  if (data.mode !== "caixa" && data.calculation.directVisible && data.calculation.directRobust) {
    const d = data.calculation.directRobust;
    const rows: Array<{ label: string; value: string; sub?: string }> = [
      {
        label: `Ato + ${d.monthlyCount ?? 0} mensais pré-chaves`,
        value: `${formatBRL(d.actCents)} + ${formatBRL(d.regularMonthlyCents)}/mês`,
        sub: `Pré-chaves (${formatNumber(data.calculation.directPrePercent, 1)}%): ${formatBRL(data.calculation.directPreCents)}`,
      },
      {
        label: `Saldo pós-chaves (${formatNumber(data.calculation.directPostPercent, 1)}%)`,
        value: formatBRL(data.calculation.directPostCents),
        sub: "Direto com a Cury · prazo/condição conforme tabela vigente",
      },
    ];
    const boxH = 74 + rows.length * 66;
    drawFlowBox("OPÇÃO B · TABELA DIRETA CURY", "#b8783e", rows, boxH);
  }

  // Nota opcional de documentação
  if (data.documentationTotalCents && data.documentationTotalCents > 0 && y < 1090) {
    drawRoundedRect(ctx, 64, y, width - 128, 72, 14);
    ctx.fillStyle = "#f9f3e7";
    ctx.fill();
    ctx.strokeStyle = "#e5d3b3";
    ctx.lineWidth = 1.5;
    ctx.stroke();
    ctx.fillStyle = "#7a531e";
    ctx.font = "700 20px 'DM Sans', system-ui, sans-serif";
    ctx.fillText(
      `Reserva estimada de documentação (ITBI + RGI): ${formatBRL(data.documentationTotalCents)} (fora do preço)`,
      92,
      y + 43,
    );
  }

  // Rodapé com assinatura do corretor + compliance
  const footerY = height - 168;
  ctx.fillStyle = "#173837";
  ctx.fillRect(0, footerY, width, 168);

  const brokerName = data.brokerProfile?.name?.trim() || "Lucas Silva";
  const brokerExtra = [data.brokerProfile?.creci?.trim(), data.brokerProfile?.phone?.trim()]
    .filter(Boolean)
    .join("  ·  ");

  ctx.fillStyle = "#ffffff";
  ctx.font = "800 26px Manrope, system-ui, sans-serif";
  ctx.fillText(brokerName, 64, footerY + 52);

  ctx.fillStyle = "#d5a879";
  ctx.font = "600 19px 'DM Sans', system-ui, sans-serif";
  ctx.fillText(brokerExtra || "Consultoria Imobiliária · Cury Construtora", 64, footerY + 84);

  ctx.fillStyle = "#a9c0b8";
  ctx.font = "500 16px 'DM Sans', system-ui, sans-serif";
  ctx.fillText(
    "Simulação ilustrativa. Valores sujeitos à disponibilidade, tabela vigente, cronograma oficial e análise Caixa/Cury.",
    64,
    footerY + 128,
  );
  ctx.fillText(
    "Não representa aprovação bancária ou condição definitiva. Gerado em " +
      new Intl.DateTimeFormat("pt-BR", { dateStyle: "short" }).format(new Date()) +
      ".",
    64,
    footerY + 150,
  );

  return new Promise<Blob>((resolve, reject) => {
    canvas.toBlob((blob) => {
      canvas.width = 0;
      canvas.height = 0;
      if (blob) resolve(blob);
      else reject(new Error("Não foi possível gerar a imagem PNG."));
    }, "image/png");
  });
};

export const downloadProposalCardPng = async (data: ProposalCardData): Promise<void> => {
  const blob = await renderProposalCardBlob(data);
  const url = URL.createObjectURL(blob);
  const slug = data.property.project
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = `proposta-${slug || "cury-fluxo"}.png`;
  anchor.click();
  window.setTimeout(() => URL.revokeObjectURL(url), 10_000);
};

export const copyProposalCardToClipboard = async (data: ProposalCardData): Promise<void> => {
  if (!navigator.clipboard?.write || typeof ClipboardItem === "undefined") {
    throw new Error("Seu navegador não suporta copiar imagem diretamente; use Baixar PNG.");
  }
  const blob = await renderProposalCardBlob(data);
  await navigator.clipboard.write([new ClipboardItem({ "image/png": blob })]);
};
