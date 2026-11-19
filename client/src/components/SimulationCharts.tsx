import { useMemo, useState } from "react";
import type { PaymentDate } from "../lib/models";
import type { FlowScenario } from "../lib/calculator";
import { formatBRL, formatNumber } from "../lib/money";
import { listMonthlyDates, monthLabel, monthLabelCapitalized } from "../lib/schedule";

export interface PriceCompositionProps {
  priceCents: number;
  actCents: number;
  monthlyTotalCents: number;
  annualTotalCents: number;
  postOrFinancingCents: number;
  postLabel: string;
}

export function PriceCompositionBar({
  priceCents,
  actCents,
  monthlyTotalCents,
  annualTotalCents,
  postOrFinancingCents,
  postLabel,
}: PriceCompositionProps) {
  const [hovered, setHovered] = useState<string | null>(null);
  if (priceCents <= 0) return null;

  const segments = [
    { id: "act", label: "Ato", cents: Math.max(0, actCents), color: "var(--chart-act)" },
    { id: "monthly", label: "Mensais", cents: Math.max(0, monthlyTotalCents), color: "var(--chart-monthly)" },
    { id: "annual", label: "Anuais", cents: Math.max(0, annualTotalCents), color: "var(--chart-annual)" },
    { id: "post", label: postLabel, cents: Math.max(0, postOrFinancingCents), color: "var(--chart-post)" },
  ].filter((s) => s.cents > 0);

  const sum = segments.reduce((acc, s) => acc + s.cents, 0) || priceCents;

  return (
    <div className="chart-card composition-card">
      <div className="chart-head">
        <div>
          <span className="eyebrow">COMPOSIÇÃO DO PREÇO</span>
          <h4>Como o valor total se divide</h4>
        </div>
        <strong className="chart-total-tag">{formatBRL(priceCents)}</strong>
      </div>

      <div className="composition-track" role="img" aria-label="Barra proporcional de composição do preço">
        {segments.map((seg) => {
          const pct = (seg.cents / sum) * 100;
          const dimmed = hovered !== null && hovered !== seg.id;
          return (
            <div
              key={seg.id}
              className={`composition-segment ${dimmed ? "dimmed" : ""}`}
              style={{ width: `${Math.max(1.5, pct)}%`, background: seg.color }}
              onMouseEnter={() => setHovered(seg.id)}
              onMouseLeave={() => setHovered(null)}
              title={`${seg.label}: ${formatBRL(seg.cents)} (${formatNumber((seg.cents / priceCents) * 100, 1)}%)`}
            />
          );
        })}
      </div>

      <div className="composition-legend">
        {segments.map((seg) => {
          const pct = (seg.cents / priceCents) * 100;
          const active = hovered === seg.id;
          return (
            <div
              key={seg.id}
              className={`composition-legend-item ${active ? "active" : ""}`}
              onMouseEnter={() => setHovered(seg.id)}
              onMouseLeave={() => setHovered(null)}
            >
              <span className="legend-swatch" style={{ background: seg.color }} />
              <div>
                <small>{seg.label}</small>
                <strong>{formatBRL(seg.cents)}</strong>
              </div>
              <span className="legend-pct">{formatNumber(pct, 1)}%</span>
            </div>
          );
        })}
      </div>
    </div>
  );
}

export interface IncomeGaugeProps {
  percent: number | null;
  monthlyCents: number | null;
  incomeCents: number | null;
  priceInstallmentPercent?: number | null;
}

const polarToCartesian = (cx: number, cy: number, r: number, angleDeg: number) => {
  const rad = ((angleDeg - 180) * Math.PI) / 180;
  return { x: cx + r * Math.cos(rad), y: cy + r * Math.sin(rad) };
};

const describeArc = (cx: number, cy: number, r: number, startAngle: number, endAngle: number) => {
  const start = polarToCartesian(cx, cy, r, endAngle);
  const end = polarToCartesian(cx, cy, r, startAngle);
  const largeArcFlag = endAngle - startAngle <= 180 ? "0" : "1";
  return `M ${start.x.toFixed(2)} ${start.y.toFixed(2)} A ${r} ${r} 0 ${largeArcFlag} 0 ${end.x.toFixed(2)} ${end.y.toFixed(2)}`;
};

export function IncomeCommitmentGauge({
  percent,
  monthlyCents,
  incomeCents,
  priceInstallmentPercent,
}: IncomeGaugeProps) {
  const maxScale = 70;
  const clamped = percent === null ? 0 : Math.max(0, Math.min(percent, maxScale));
  const angle = (clamped / maxScale) * 180;
  const pointer = polarToCartesian(110, 102, 78, angle);

  const zone =
    percent === null
      ? { label: "Informe a renda familiar", tone: "neutral" }
      : percent <= 30
        ? { label: "Faixa confortável (≤ 30%)", tone: "ok" }
        : percent <= 50
          ? { label: "Faixa de atenção (30%–50%)", tone: "attention" }
          : { label: "Acima do limite (> 50%)", tone: "over" };

  return (
    <div className="chart-card gauge-card">
      <div className="chart-head">
        <div>
          <span className="eyebrow">COMPROMETIMENTO DE RENDA</span>
          <h4>Peso da mensal na obra</h4>
        </div>
      </div>

      <div className="gauge-svg-wrap">
        <svg viewBox="0 0 220 120" className="gauge-svg" role="img" aria-label={`Comprometimento de renda: ${percent !== null ? `${formatNumber(percent, 1)}%` : "não informado"}`}>
          {/* 0% - 30% */}
          <path d={describeArc(110, 102, 78, 0, (30 / maxScale) * 180)} fill="none" stroke="var(--chart-zone-ok)" strokeWidth="13" strokeLinecap="round" />
          {/* 30% - 50% */}
          <path d={describeArc(110, 102, 78, (30 / maxScale) * 180 + 3, (50 / maxScale) * 180)} fill="none" stroke="var(--chart-zone-warn)" strokeWidth="13" strokeLinecap="round" />
          {/* 50% - 70% */}
          <path d={describeArc(110, 102, 78, (50 / maxScale) * 180 + 3, 180)} fill="none" stroke="var(--chart-zone-over)" strokeWidth="13" strokeLinecap="round" />

          {percent !== null && (
            <>
              <circle cx={pointer.x} cy={pointer.y} r="9" fill="var(--bg-surface, #fff)" stroke="var(--ink)" strokeWidth="3.5" />
            </>
          )}

          <text x="110" y="84" textAnchor="middle" className="gauge-value-text">
            {percent !== null ? `${formatNumber(percent, 1)}%` : "—%"}
          </text>
          <text x="110" y="102" textAnchor="middle" className="gauge-sub-text">
            {monthlyCents !== null && incomeCents ? `${formatBRL(monthlyCents)} / ${formatBRL(incomeCents)}` : "sem renda informada"}
          </text>
        </svg>
      </div>

      <div className="gauge-footer">
        <span className={`gauge-pill gauge-${zone.tone}`}>{zone.label}</span>
        {priceInstallmentPercent !== null && priceInstallmentPercent !== undefined && (
          <small className="gauge-price-note">
            1ª PRICE pós-chaves: <strong>{formatNumber(priceInstallmentPercent, 1)}%</strong> da renda
          </small>
        )}
      </div>
    </div>
  );
}

export interface CashflowTimelineProps {
  actDate: PaymentDate;
  scenario: FlowScenario | null;
}

export function CashflowTimelineChart({ actDate, scenario }: CashflowTimelineProps) {
  const [hoveredIdx, setHoveredIdx] = useState<number | null>(null);
  const [includeAct, setIncludeAct] = useState(false);

  const bars = useMemo(() => {
    if (!scenario || !scenario.canCalculate || !scenario.monthlyCount || scenario.regularMonthlyCents === null) {
      return [];
    }
    const dates = listMonthlyDates(actDate, scenario.monthlyCount);
    const annualByKey = new Map<string, number>();
    scenario.annualPayments.forEach((p) => {
      if (p.amountCents) {
        const key = `${p.year}-${p.month}`;
        annualByKey.set(key, (annualByKey.get(key) ?? 0) + p.amountCents);
      }
    });

    const items: Array<{
      key: string;
      label: string;
      shortLabel: string;
      actCents: number;
      monthlyCents: number;
      annualCents: number;
      totalCents: number;
    }> = [];

    if (includeAct && scenario.actCents > 0) {
      items.push({
        key: "act",
        label: `Ato · ${monthLabelCapitalized(actDate)}`,
        shortLabel: "Ato",
        actCents: scenario.actCents,
        monthlyCents: 0,
        annualCents: 0,
        totalCents: scenario.actCents,
      });
    }

    dates.forEach((d, idx) => {
      const mCents =
        idx === dates.length - 1 && scenario.finalMonthlyCents !== null
          ? scenario.finalMonthlyCents
          : scenario.regularMonthlyCents!;
      const aCents = annualByKey.get(`${d.year}-${d.month}`) ?? 0;
      items.push({
        key: `${d.year}-${d.month}-${idx}`,
        label: monthLabelCapitalized(d),
        shortLabel: monthLabel(d, true),
        actCents: 0,
        monthlyCents: mCents,
        annualCents: aCents,
        totalCents: mCents + aCents,
      });
    });

    return items;
  }, [actDate, scenario, includeAct]);

  if (!bars.length || !scenario) return null;

  const maxTotal = Math.max(...bars.map((b) => b.totalCents), 1);
  const chartW = 540;
  const chartH = 152;
  const padL = 48;
  const padR = 12;
  const padT = 14;
  const padB = 26;
  const plotW = chartW - padL - padR;
  const plotH = chartH - padT - padB;
  const step = plotW / bars.length;
  const barW = Math.max(3, Math.min(18, step * 0.72));

  const regularY =
    scenario.regularMonthlyCents !== null
      ? padT + plotH - (scenario.regularMonthlyCents / maxTotal) * plotH
      : null;

  const activeBar = hoveredIdx !== null ? bars[hoveredIdx] : null;
  const labelInterval = Math.max(1, Math.ceil(bars.length / 5));

  const formatAxisK = (cents: number) => {
    const reais = cents / 100;
    if (reais >= 1000) return `${(reais / 1000).toFixed(reais >= 10_000 ? 0 : 1).replace(".", ",")}k`;
    return `${Math.round(reais)}`;
  };

  return (
    <div className="chart-card timeline-card">
      <div className="chart-head">
        <div>
          <span className="eyebrow">DESEMBOLSO MÊS A MÊS ATÉ AS CHAVES</span>
          <h4>
            {activeBar
              ? `${activeBar.label} · Total ${formatBRL(activeBar.totalCents)}`
              : `${scenario.monthlyCount} mensais${scenario.annualPayments.length ? ` + ${scenario.annualPayments.length} anuais` : ""}`}
          </h4>
        </div>
        <button
          type="button"
          className="text-button chart-scale-toggle no-print"
          onClick={() => setIncludeAct((current) => !current)}
        >
          {includeAct ? "Ocultar Ato" : "Incluir Ato"}
        </button>
      </div>

      {activeBar && (
        <div className="timeline-inspect-bar">
          {activeBar.actCents > 0 && <span>Ato: <strong>{formatBRL(activeBar.actCents)}</strong></span>}
          {activeBar.monthlyCents > 0 && <span>Mensal: <strong>{formatBRL(activeBar.monthlyCents)}</strong></span>}
          {activeBar.annualCents > 0 && <span>Anual: <strong>{formatBRL(activeBar.annualCents)}</strong></span>}
        </div>
      )}

      <svg viewBox={`0 0 ${chartW} ${chartH}`} className="timeline-svg" role="img" aria-label="Gráfico de fluxo de desembolso mês a mês até as chaves">
        {/* Linhas de grade horizontais */}
        {[0, 0.5, 1].map((frac) => {
          const y = padT + plotH * (1 - frac);
          return (
            <g key={frac}>
              <line x1={padL} y1={y} x2={chartW - padR} y2={y} className="timeline-grid-line" />
              <text x={padL - 6} y={y + 3.5} textAnchor="end" className="timeline-axis-label">
                {formatAxisK(maxTotal * frac)}
              </text>
            </g>
          );
        })}

        {/* Linha de referência da mensal regular */}
        {regularY !== null && (
          <line
            x1={padL}
            y1={regularY}
            x2={chartW - padR}
            y2={regularY}
            className="timeline-ref-line"
          />
        )}

        {/* Barras */}
        {bars.map((bar, idx) => {
          const cx = padL + idx * step + step / 2;
          const x = cx - barW / 2;
          const isHovered = hoveredIdx === idx;
          const actH = (bar.actCents / maxTotal) * plotH;
          const monthlyH = (bar.monthlyCents / maxTotal) * plotH;
          const annualH = (bar.annualCents / maxTotal) * plotH;

          const baseBottom = padT + plotH;
          const actY = baseBottom - actH;
          const monthlyY = baseBottom - monthlyH;
          const annualY = monthlyY - annualH;

          const showXLabel = idx === 0 || idx === bars.length - 1 || idx % labelInterval === 0;

          return (
            <g
              key={bar.key}
              className={`timeline-bar-group ${isHovered ? "hovered" : ""}`}
              onMouseEnter={() => setHoveredIdx(idx)}
              onMouseLeave={() => setHoveredIdx(null)}
            >
              {bar.actCents > 0 && (
                <rect x={x} y={actY} width={barW} height={Math.max(1, actH)} rx="2.5" fill="var(--chart-act)" />
              )}
              {bar.monthlyCents > 0 && (
                <rect x={x} y={monthlyY} width={barW} height={Math.max(1, monthlyH)} rx="2" fill="var(--chart-monthly)" />
              )}
              {bar.annualCents > 0 && (
                <rect x={x} y={annualY} width={barW} height={Math.max(2, annualH)} rx="2" fill="var(--chart-annual)" />
              )}
              {/* Hit area invisível */}
              <rect x={padL + idx * step} y={padT} width={step} height={plotH} fill="transparent" />
              {showXLabel && (
                <text x={cx} y={chartH - 7} textAnchor="middle" className="timeline-axis-label">
                  {bar.shortLabel}
                </text>
              )}
            </g>
          );
        })}
      </svg>

      <div className="timeline-legend">
        <span><i style={{ background: "var(--chart-monthly)" }} /> Mensal</span>
        <span><i style={{ background: "var(--chart-annual)" }} /> Pico anual</span>
        {includeAct && <span><i style={{ background: "var(--chart-act)" }} /> Ato</span>}
      </div>
    </div>
  );
}
