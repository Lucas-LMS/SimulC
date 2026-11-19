import { useEffect, useState } from "react";
import { Building2, CalendarDays, Eye, EyeOff, MapPin, Printer, ShieldCheck, X } from "lucide-react";
import type { BrokerProfile, ClientProfile, PaymentDate } from "../lib/models";
import type { FullCalculation } from "../lib/calculator";
import type { PortfolioUnit } from "../data/portfolio";
import type { DocumentationEstimate } from "../lib/insights";
import { formatBRL, formatNumber } from "../lib/money";
import { monthLabelCapitalized } from "../lib/schedule";
import { CashflowTimelineChart, IncomeCommitmentGauge, PriceCompositionBar } from "./SimulationCharts";

interface Props {
  open: boolean;
  onClose: () => void;
  client: ClientProfile | null;
  property: PortfolioUnit;
  priceCents: number;
  actDate: PaymentDate;
  deliveryDate: PaymentDate | null;
  deliveryIsPremise: boolean;
  calculation: FullCalculation;
  firstPriceInstallmentCents: number | null;
  financingTermMonths: number | null;
  financingLine: string;
  financingSystem: string;
  brokerProfile?: BrokerProfile;
  documentation?: DocumentationEstimate | null;
  initialMode?: "ambas" | "caixa" | "direta";
}

export default function ProposalPresentation({
  open,
  onClose,
  client,
  property,
  priceCents,
  actDate,
  deliveryDate,
  deliveryIsPremise,
  calculation,
  firstPriceInstallmentCents,
  financingTermMonths,
  financingLine,
  financingSystem,
  brokerProfile,
  documentation,
  initialMode = "ambas",
}: Props) {
  const [mode, setMode] = useState<"ambas" | "caixa" | "direta">(initialMode);
  const [hideIncome, setHideIncome] = useState(false);

  useEffect(() => {
    setMode(initialMode);
  }, [initialMode, open]);

  useEffect(() => {
    if (!open) return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [open, onClose]);

  if (!open) return null;

  const brokerName = brokerProfile?.name?.trim() || "Lucas Silva";
  const brokerCreci = brokerProfile?.creci?.trim() || "Consultoria Imobiliária · Cury";
  const brokerPhone = brokerProfile?.phone?.trim() || "";
  const deliveryLabel = deliveryDate
    ? `${monthLabelCapitalized(deliveryDate)}${deliveryIsPremise ? " (premissa a confirmar)" : ""}`
    : property.deliveryText || "A confirmar";

  const showCaixa = mode !== "direta" && Boolean(calculation.robust);
  const showDirect = mode !== "caixa" && calculation.directVisible && Boolean(calculation.directRobust);
  const primaryScenario = showCaixa ? calculation.robust : calculation.directRobust;

  const annualSum = (primaryScenario?.annualPayments ?? []).reduce((s, p) => s + (p.amountCents ?? 0), 0);
  const monthlySum =
    primaryScenario?.monthlyCount && primaryScenario.regularMonthlyCents !== null
      ? Math.max(0, primaryScenario.monthlyCount - 1) * primaryScenario.regularMonthlyCents +
        (primaryScenario.finalMonthlyCents ?? primaryScenario.regularMonthlyCents)
      : 0;
  const postValue = showCaixa ? (calculation.financingUsedCents ?? 0) : calculation.directPostCents;
  const postLabel = showCaixa ? "Financiamento Caixa" : "Pós-chaves Cury";

  const priceIncomePercent =
    !hideIncome && client?.incomeFamilyCents && client.incomeFamilyCents > 0 && firstPriceInstallmentCents !== null
      ? (firstPriceInstallmentCents / client.incomeFamilyCents) * 100
      : null;

  const todayStr = new Intl.DateTimeFormat("pt-BR", { dateStyle: "long" }).format(new Date());

  return (
    <div className="presentation-overlay" role="dialog" aria-modal="true" aria-label="Modo Apresentação da Proposta">
      <div className="presentation-toolbar no-print">
        <div className="presentation-toolbar-left">
          <span className="eyebrow">MODO APRESENTAÇÃO · PRONTO PARA PDF</span>
          <div className="whatsapp-mode-pills">
            {(["ambas", "caixa", "direta"] as const).map((m) => (
              <button
                key={m}
                type="button"
                className={`mode-pill ${mode === m ? "active" : ""}`}
                onClick={() => setMode(m)}
              >
                {m === "ambas" ? "Ambas" : m === "caixa" ? "Só Caixa" : "Só Direta"}
              </button>
            ))}
          </div>
        </div>
        <div className="presentation-toolbar-right">
          <button
            type="button"
            className="button button-quiet button-small"
            onClick={() => setHideIncome((v) => !v)}
            title="Oculta a renda familiar do cliente na apresentação e no PDF"
          >
            {hideIncome ? <Eye size={14} /> : <EyeOff size={14} />}
            {hideIncome ? "Mostrar renda" : "Ocultar renda"}
          </button>
          <button type="button" className="button button-primary button-small" onClick={() => window.print()}>
            <Printer size={14} /> Salvar PDF / Imprimir
          </button>
          <button type="button" className="icon-button" aria-label="Fechar apresentação" onClick={onClose}>
            <X size={18} />
          </button>
        </div>
      </div>

      <article className="presentation-sheet">
        <header className="presentation-header">
          <div>
            <span className="presentation-kicker">CURY FLUXO · PROPOSTA ILUSTRATIVA</span>
            <h1>{property.project}</h1>
            <p>
              {property.typology}
              {property.parking === true ? " · com vaga" : property.parking === false ? " · sem vaga" : ""}
              {property.areaM2 ? ` · ${formatNumber(property.areaM2, 0)} m²` : property.areaText ? ` · ${property.areaText}` : ""}
            </p>
          </div>
          <div className="presentation-broker">
            <strong>{brokerName}</strong>
            <span>{brokerCreci}</span>
            {brokerPhone && <span>{brokerPhone}</span>}
            <small>{todayStr}</small>
          </div>
        </header>

        <section className="presentation-meta-grid">
          <div className="presentation-meta-box">
            <span className="eyebrow">EMPREENDIMENTO</span>
            <strong>
              <Building2 size={15} /> {property.project}
            </strong>
            <span>
              <MapPin size={13} /> {property.neighborhood || property.region}
            </span>
            <span>
              <CalendarDays size={13} /> Entrega prevista: {deliveryLabel}
            </span>
          </div>

          <div className="presentation-meta-box">
            <span className="eyebrow">PREPARADO PARA</span>
            <strong>{client?.name || "Proposta ilustrativa"}</strong>
            {!hideIncome && client?.incomeFamilyCents ? (
              <span>Renda familiar informada: {formatBRL(client.incomeFamilyCents)}</span>
            ) : (
              <span>Condição personalizada sujeita à análise</span>
            )}
            {financingTermMonths ? (
              <span>
                Prazo bancário informado: {financingTermMonths} meses
                {financingLine ? ` · ${financingLine}` : ""}
                {financingSystem ? ` · ${financingSystem}` : ""}
              </span>
            ) : null}
          </div>

          <div className="presentation-meta-box presentation-price-highlight">
            <span className="eyebrow">PREÇO REFERENCIAL</span>
            <strong>{formatBRL(priceCents)}</strong>
            <span>Fonte: {property.source} ({property.sourceDate})</span>
          </div>
        </section>

        {primaryScenario && (
          <section className="presentation-charts">
            <PriceCompositionBar
              priceCents={priceCents}
              actCents={primaryScenario.actCents}
              monthlyTotalCents={monthlySum}
              annualTotalCents={annualSum}
              postOrFinancingCents={postValue}
              postLabel={postLabel}
            />
            <div className={`presentation-charts-row ${hideIncome ? "single-col" : ""}`}>
              <CashflowTimelineChart actDate={actDate} scenario={primaryScenario} />
              {!hideIncome && (
                <IncomeCommitmentGauge
                  percent={primaryScenario.monthlyIncomePercent}
                  monthlyCents={primaryScenario.regularMonthlyCents}
                  incomeCents={client?.incomeFamilyCents ?? null}
                  priceInstallmentPercent={priceIncomePercent}
                />
              )}
            </div>
          </section>
        )}

        <section className="presentation-options-grid">
          {showCaixa && calculation.robust && (
            <div className="presentation-option-card">
              <div className="presentation-option-head">
                <span className="eyebrow">MODALIDADE A</span>
                <h2>Financiamento Caixa (Ato Robusto)</h2>
              </div>
              <dl className="presentation-dl">
                <div>
                  <dt>Ato (sinal)</dt>
                  <dd>
                    <strong>{formatBRL(calculation.robust.actCents)}</strong>
                    {calculation.robust.actPercent !== null && (
                      <small>{formatNumber(calculation.robust.actPercent, 1)}% do preço</small>
                    )}
                  </dd>
                </div>
                <div>
                  <dt>{calculation.robust.monthlyCount ?? 0} mensais até as chaves</dt>
                  <dd>
                    <strong>{formatBRL(calculation.robust.regularMonthlyCents)}</strong>
                    {!hideIncome && calculation.robust.monthlyIncomePercent !== null && (
                      <small>{formatNumber(calculation.robust.monthlyIncomePercent, 1)}% da renda</small>
                    )}
                  </dd>
                </div>
                {calculation.robust.annualPayments.length > 0 && (
                  <div>
                    <dt>{calculation.robust.annualPayments.length} intermediária(s) anual(is)</dt>
                    <dd>
                      <strong>
                        {calculation.robust.annualPayments
                          .map((p) => `${p.year}: ${formatBRL(p.amountCents)}`)
                          .join(" · ")}
                      </strong>
                    </dd>
                  </div>
                )}
                <div>
                  <dt>Financiamento Caixa estimado</dt>
                  <dd>
                    <strong>{formatBRL(calculation.financingUsedCents)}</strong>
                    {calculation.financingPercent !== null && (
                      <small>Cota de {formatNumber(calculation.financingPercent, 1)}%</small>
                    )}
                  </dd>
                </div>
                {firstPriceInstallmentCents !== null && (
                  <div>
                    <dt>1ª parcela PRICE estimada</dt>
                    <dd>
                      <strong>{formatBRL(firstPriceInstallmentCents)}</strong>
                      <small>Após assinatura / conforme GPM</small>
                    </dd>
                  </div>
                )}
              </dl>
              {calculation.minimum?.canCalculate && (
                <div className="presentation-min-note">
                  <strong>Comparativo Ato Mínimo (2,5%):</strong> Ato {formatBRL(calculation.minimum.actCents)} +{" "}
                  {calculation.minimum.monthlyCount ?? 0}× {formatBRL(calculation.minimum.regularMonthlyCents)}
                </div>
              )}
            </div>
          )}

          {showDirect && calculation.directRobust && (
            <div className="presentation-option-card direct">
              <div className="presentation-option-head">
                <span className="eyebrow">MODALIDADE B</span>
                <h2>Tabela Direta Cury ({formatNumber(calculation.directPrePercent, 1)}% / {formatNumber(calculation.directPostPercent, 1)}%)</h2>
              </div>
              <dl className="presentation-dl">
                <div>
                  <dt>Ato (pré-chaves)</dt>
                  <dd>
                    <strong>{formatBRL(calculation.directRobust.actCents)}</strong>
                  </dd>
                </div>
                <div>
                  <dt>{calculation.directRobust.monthlyCount ?? 0} mensais pré-chaves</dt>
                  <dd>
                    <strong>{formatBRL(calculation.directRobust.regularMonthlyCents)}</strong>
                  </dd>
                </div>
                <div>
                  <dt>Total pré-chaves ({formatNumber(calculation.directPrePercent, 1)}%)</dt>
                  <dd>
                    <strong>{formatBRL(calculation.directPreCents)}</strong>
                  </dd>
                </div>
                <div>
                  <dt>Saldo pós-chaves ({formatNumber(calculation.directPostPercent, 1)}%)</dt>
                  <dd>
                    <strong>{formatBRL(calculation.directPostCents)}</strong>
                    <small>Direto com a Cury · prazo/condições conforme tabela</small>
                  </dd>
                </div>
              </dl>
            </div>
          )}
        </section>

        {documentation && (
          <section className="presentation-doc-strip">
            <strong>Documentação estimada (ITBI {formatNumber(documentation.itbiPercent, 1)}% + RGI {formatNumber(documentation.rgiPercent, 1)}%):</strong>{" "}
            {documentation.isExemptCampaign
              ? "Isenção/cortesia promocional considerada como premissa (confirmar campanha vigente)."
              : `${formatBRL(documentation.totalCents)} — valor estimado fora do preço do imóvel.`}
          </section>
        )}

        <footer className="presentation-footer">
          <ShieldCheck size={16} />
          <p>
            Simulação ilustrativa. Valores, cronograma, campanhas, uso de FGTS e aprovação de crédito dependem de
            disponibilidade de unidade, tabela vigente e análise oficial da Cury Construtora e da Caixa Econômica Federal.
          </p>
        </footer>
      </article>
    </div>
  );
}
