import { useMemo, useState } from "react";
import { ArrowRight, CalendarDays, Check, Copy, GitCompareArrows, Info, MapPin, Printer, Search } from "lucide-react";
import type { SimulationRecord, WorkspaceData } from "../lib/models";
import type { PortfolioUnit } from "../data/portfolio";
import type { AppToast } from "../pages/Home";
import { calculateSimulationEntry, type CalculatedSimulationEntry, type FlowScenario, type FullCalculation } from "../lib/calculator";
import { generateComparisonWhatsAppMessage } from "../lib/whatsapp";
import { formatBRL } from "../lib/money";

interface Props {
  workspace: WorkspaceData;
  onLoadSimulation: (simulation: SimulationRecord) => void;
  onNotify?: (toast: AppToast) => void;
}

const shortMonthYearFormatter = new Intl.DateTimeFormat("pt-BR", { month: "short", year: "numeric" });
const dateText = (year?: number, month?: number, fallback?: string) =>
  year && month ? shortMonthYearFormatter.format(new Date(year, month - 1, 1)) : fallback || "A confirmar";

const priceFor = (simulation: SimulationRecord, unit?: PortfolioUnit) =>
  simulation.priceOverrideCents ?? unit?.priceCents ?? unit?.priceLowCents ?? null;
const deliveryFor = (simulation: SimulationRecord, unit?: PortfolioUnit) =>
  simulation.deliveryOverride ?? (unit?.deliveryYear && unit.deliveryMonth ? { year: unit.deliveryYear, month: unit.deliveryMonth } : null);

const financingFor = (simulation: SimulationRecord, price: number | null) => {
  const reported = simulation.gpmReportedFinancingAmountCents ?? null;
  const entered = simulation.financingAmountCents;
  const cap = price === null ? null : Math.floor(price * 0.8);
  const manualOverride = Boolean(simulation.financingManualOverride && entered !== null && cap !== null && entered > cap);
  const validEntered = entered !== null && entered >= 0 ? entered : null;
  const used = validEntered === null ? null : manualOverride || cap === null ? validEntered : Math.min(validEntered, cap);
  const capped = !manualOverride && validEntered !== null && cap !== null && validEntered > cap;
  return { reported, entered, used, cap, manualOverride, capped };
};

const alertsFor = (
  simulation: SimulationRecord,
  unit: PortfolioUnit | undefined,
  price: number | null,
  finance: ReturnType<typeof financingFor>,
  calculation: FullCalculation | null,
) => {
  const alerts = [
    ...(calculation?.warnings ?? []),
    ...(calculation?.robust?.timingErrors ?? []),
    ...(calculation?.robust?.warnings ?? []),
    ...(calculation?.minimum?.timingErrors ?? []),
    ...(calculation?.minimum?.warnings ?? []),
    ...(simulation.includeDirect ? calculation?.directRobust?.timingErrors ?? [] : []),
    ...(simulation.includeDirect ? calculation?.directRobust?.warnings ?? [] : []),
  ];
  if (!unit) alerts.push("Unidade removida do catálogo; valores e condições precisam ser revistos.");
  if (price === null || price <= 0) alerts.push("Preço pendente ou inválido nesta simulação.");
  if (unit && !deliveryFor(simulation, unit)) alerts.push(`Mês/ano de entrega pendente${unit.deliveryText ? ` (${unit.deliveryText})` : ""}.`);
  if (unit && !unit.source) alerts.push("Fonte do preço não informada.");
  if (unit && !unit.sourceDate) alerts.push("Data da fonte não informada.");
  if (simulation.deliveryOverride || unit?.deliveryDateSource === "simulation" || unit?.deliveryDateSource === "manual") {
    alerts.push("Entrega informada como premissa ou manual; confirmar com a fonte oficial.");
  }
  if (finance.used === null) alerts.push("Financiamento Caixa/GPM pendente para calcular o fluxo.");
  if (simulation.firstPriceInstallmentCents === null) alerts.push("1ª parcela PRICE pendente ou não informada.");
  if (finance.manualOverride) alerts.push("Financiamento acima de 80% mantido por override; confirmar com a Caixa.");
  if (simulation.includeDirect && calculation && !calculation.directVisible) alerts.push(calculation.directReason);
  return [...new Set(alerts.filter(Boolean))];
};

const flowText = (flow: FlowScenario | null | undefined) => {
  if (!flow) return "Fluxo pendente de dados para cálculo.";
  const count = flow.monthlyCount === null ? "Mensais pendentes" : `${flow.monthlyCount} mensais`;
  const amount = flow.regularMonthlyCents === null ? "valor mensal pendente" : `${formatBRL(flow.regularMonthlyCents)} cada`;
  const last =
    flow.finalMonthlyCents !== null && flow.regularMonthlyCents !== null && flow.finalMonthlyCents !== flow.regularMonthlyCents
      ? `; última ${formatBRL(flow.finalMonthlyCents)} com ajuste residual`
      : "";
  const annuals = flow.annualPayments.length
    ? flow.annualPayments.map((payment) => `${dateText(payment.year, payment.month)}: ${formatBRL(payment.amountCents)}`).join(" · ")
    : "sem intermediárias calculadas";
  return `${count} · ${amount}${last}; anuais: ${annuals}`;
};

const normalize = (value: string) =>
  value.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLocaleLowerCase("pt-BR");

export default function ComparePage({ workspace, onLoadSimulation, onNotify }: Props) {
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [query, setQuery] = useState("");
  const [clientFilter, setClientFilter] = useState("");
  const [hideDrafts, setHideDrafts] = useState(false);

  const unitById = useMemo(() => new Map(workspace.portfolio.map((u) => [u.id, u])), [workspace.portfolio]);
  const clientById = useMemo(() => new Map(workspace.clients.map((c) => [c.id, c])), [workspace.clients]);

  const simulations = useMemo(
    () => [...workspace.simulations].sort((a, b) => b.updatedAt.localeCompare(a.updatedAt)),
    [workspace.simulations],
  );

  const visibleSimulations = useMemo(() => {
    const term = normalize(query.trim());
    return simulations.filter((simulation) => {
      if (hideDrafts && simulation.origin === "lead_recommendation") return false;
      if (clientFilter && simulation.clientId !== clientFilter) return false;
      if (!term) return true;
      const unit = unitById.get(simulation.propertyId);
      const client = clientById.get(simulation.clientId);
      return normalize(
        `${unit?.project ?? ""} ${unit?.typology ?? ""} ${unit?.neighborhood ?? ""} ${unit?.region ?? ""} ${client?.name ?? ""}`,
      ).includes(term);
    });
  }, [query, clientFilter, hideDrafts, simulations, unitById, clientById]);

  const selected = useMemo(
    () => simulations.filter((simulation) => selectedIds.includes(simulation.id)),
    [simulations, selectedIds],
  );
  const allVisibleSelected =
    visibleSimulations.length > 0 && visibleSimulations.every((simulation) => selectedIds.includes(simulation.id));

  const toggle = (id: string) =>
    setSelectedIds((current) => (current.includes(id) ? current.filter((item) => item !== id) : [...current, id]));
  const toggleVisible = () =>
    setSelectedIds((current) =>
      allVisibleSelected
        ? current.filter((id) => !visibleSimulations.some((simulation) => simulation.id === id))
        : [...new Set([...current, ...visibleSimulations.map((simulation) => simulation.id)])],
    );

  const selectedDetails = useMemo(
    () =>
      selected.map((simulation) => {
        const unit = unitById.get(simulation.propertyId);
        const client = clientById.get(simulation.clientId);
        const price = priceFor(simulation, unit);
        const finance = financingFor(simulation, price);
        const delivery = deliveryFor(simulation, unit);
        const entry: CalculatedSimulationEntry | null =
          unit && price !== null && price > 0 ? calculateSimulationEntry(simulation, client ?? null, unit) : null;
        const calculation = entry?.calculation ?? null;
        const alerts = alertsFor(simulation, unit, price, finance, calculation);
        return { simulation, unit, client, price, finance, delivery, calculation, alerts, entry };
      }),
    [selected, unitById, clientById],
  );

  const copyComparisonWhatsApp = async () => {
    const validEntries = selectedDetails
      .map((item) => item.entry)
      .filter((entry): entry is CalculatedSimulationEntry => entry !== null);
    if (!validEntries.length) {
      onNotify?.({ kind: "error", text: "Selecione ao menos um cenário com unidade e preço válidos." });
      return;
    }
    const text = generateComparisonWhatsAppMessage(validEntries, workspace.brokerProfile);
    try {
      await navigator.clipboard.writeText(text);
      onNotify?.({ kind: "success", text: "Resumo comparativo copiado para WhatsApp!" });
    } catch {
      onNotify?.({ kind: "error", text: "Não foi possível copiar automaticamente." });
    }
  };

  return (
    <div className="page-stack compare-page">
      <header className="compare-hero">
        <div className="compare-hero-mark">
          <GitCompareArrows size={23} />
        </div>
        <div className="compare-hero-copy">
          <span className="eyebrow">PAINEL DE DECISÃO · CENÁRIOS EM PARALELO</span>
          <h1>Comparar simulações</h1>
          <p>
            Reúna propostas do mesmo cliente ou de perfis diferentes e confira preço, financiamento, entrada e
            procedência sem misturar os valores.
          </p>
        </div>
        <div className="compare-hero-stats" aria-label="Resumo da comparação">
          <div>
            <small>SIMULAÇÕES SALVAS</small>
            <strong>{simulations.length}</strong>
          </div>
          <div>
            <small>NESTA COMPARAÇÃO</small>
            <strong>{selected.length}</strong>
          </div>
        </div>
      </header>

      {!simulations.length ? (
        <section className="panel compare-empty-state">
          <span className="compare-empty-mark">
            <GitCompareArrows size={20} />
          </span>
          <strong>Suas simulações salvas aparecem aqui.</strong>
          <p>Salve um cenário no Simular fluxo para montar sua primeira comparação.</p>
        </section>
      ) : (
        <>
          <section className="panel compare-selection-panel no-print" aria-labelledby="compare-selection-title">
            <div className="compare-section-heading">
              <span className="compare-step">01</span>
              <div className="compare-section-copy">
                <span className="eyebrow">MONTE SUA SELEÇÃO</span>
                <h2 id="compare-selection-title">Escolha os cenários</h2>
                <p>Selecione quantas simulações quiser. Filtre por cliente, empreendimento, bairro ou tipologia.</p>
              </div>
              <div className="compare-selection-actions">
                <span className="compare-count-pill">
                  <Check size={13} /> {selected.length} selecionada(s)
                </span>
                <button type="button" className="text-button" onClick={toggleVisible}>
                  {allVisibleSelected ? "Desmarcar visíveis" : "Selecionar visíveis"}
                </button>
                {selected.length > 0 && (
                  <button type="button" className="text-button compare-clear-button" onClick={() => setSelectedIds([])}>
                    Limpar tudo
                  </button>
                )}
              </div>
            </div>
            <div className="compare-filter-bar">
              <label className="compare-search-field">
                <Search size={16} aria-hidden="true" />
                <input
                  type="search"
                  value={query}
                  onChange={(event) => setQuery(event.target.value)}
                  placeholder="Buscar cliente, empreendimento, bairro ou tipologia"
                  aria-label="Buscar simulações"
                />
                <span>
                  {visibleSimulations.length} de {simulations.length}
                </span>
              </label>
              <label className="filter-select">
                <select
                  aria-label="Filtrar por cliente"
                  value={clientFilter}
                  onChange={(event) => setClientFilter(event.target.value)}
                >
                  <option value="">Todos os clientes</option>
                  {workspace.clients.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.name}
                    </option>
                  ))}
                </select>
              </label>
              <label className="check-field compact-check">
                <input
                  type="checkbox"
                  checked={hideDrafts}
                  onChange={(event) => setHideDrafts(event.target.checked)}
                />
                <span>Ocultar rascunhos de lead</span>
              </label>
            </div>
            {!visibleSimulations.length ? (
              <div className="compare-no-results">
                Nenhuma simulação corresponde aos filtros. Tente outro termo ou limpe os filtros.
              </div>
            ) : (
              <div className="compare-select-list">
                {visibleSimulations.map((simulation) => {
                  const unit = unitById.get(simulation.propertyId);
                  const client = clientById.get(simulation.clientId);
                  const checked = selectedIds.includes(simulation.id);
                  const price = priceFor(simulation, unit);
                  return (
                    <article className={`compare-select-card ${checked ? "selected" : ""}`} key={simulation.id}>
                      <label className="compare-card-toggle">
                        <input
                          type="checkbox"
                          checked={checked}
                          onChange={() => toggle(simulation.id)}
                          aria-label={`Selecionar ${unit?.project ?? "unidade removida"} para comparação`}
                        />
                        <span className="compare-select-main">
                          <span className="compare-card-kicker">{unit?.region ?? "REGIÃO NÃO INFORMADA"}</span>
                          <strong>{unit?.project ?? "Unidade removida"}</strong>
                          <small>{unit?.typology || "Tipologia não informada"}</small>
                        </span>
                      </label>
                      <div className="compare-select-card-meta">
                        <span>
                          <MapPin size={12} /> {unit?.neighborhood || unit?.region || "Bairro não informado"}
                        </span>
                        <span>{client?.name || "Sem cliente"}</span>
                      </div>
                      <div className="compare-select-card-footer">
                        <div>
                          <small>PREÇO USADO</small>
                          <strong>{formatBRL(price)}</strong>
                        </div>
                        <button
                          type="button"
                          className="button button-quiet button-small"
                          onClick={() => onLoadSimulation(simulation)}
                        >
                          Abrir ficha <ArrowRight size={13} />
                        </button>
                      </div>
                    </article>
                  );
                })}
              </div>
            )}
          </section>

          <section className="panel comparison-panel" aria-labelledby="compare-results-title">
            <div className="compare-section-heading comparison-results-heading">
              <span className="compare-step">02</span>
              <div className="compare-section-copy">
                <span className="eyebrow">LEITURA LADO A LADO</span>
                <h2 id="compare-results-title">Resumo comparativo</h2>
                <p>
                  Indicadores rápidos acima; a matriz abaixo mantém origem, valores, parcelas, premissas e alertas para
                  conferência.
                </p>
              </div>
              <div className="compare-export-actions no-print">
                <span className="compare-count-pill">{selected.length} cenário(s)</span>
                {selected.length > 0 && (
                  <>
                    <button type="button" className="button button-light-green button-small" onClick={() => void copyComparisonWhatsApp()}>
                      <Copy size={14} /> Copiar WhatsApp
                    </button>
                    <button type="button" className="button button-quiet button-small" onClick={() => window.print()}>
                      <Printer size={14} /> Imprimir / PDF
                    </button>
                  </>
                )}
              </div>
            </div>

            {!selected.length ? (
              <div className="compare-results-empty">
                <span className="compare-empty-mark">
                  <Check size={18} />
                </span>
                <div>
                  <strong>Selecione pelo menos um cenário.</strong>
                  <p>Os dados comparativos serão montados aqui sem alterar as simulações salvas.</p>
                </div>
              </div>
            ) : (
              <>
                <div className="comparison-scenario-grid">
                  {selectedDetails.map(({ simulation, unit, client, price, finance, delivery, calculation, alerts }, index) => (
                    <article className="comparison-scenario-card" key={simulation.id}>
                      <div className="comparison-scenario-top">
                        <span className="comparison-scenario-index">{String(index + 1).padStart(2, "0")}</span>
                        <span className={`comparison-status ${simulation.origin === "lead_recommendation" ? "draft" : "saved"}`}>
                          {simulation.origin === "lead_recommendation" ? "Rascunho recomendado" : "Simulação salva"}
                        </span>
                      </div>
                      <h3>{unit?.project ?? "Unidade removida"}</h3>
                      <p className="comparison-scenario-type">{unit?.typology || "Tipologia não informada"}</p>
                      <div className="comparison-scenario-location">
                        <MapPin size={13} />
                        <span>{unit?.neighborhood || unit?.region || "Bairro não informado"}</span>
                        <span className="comparison-dot">·</span>
                        <span>{client?.name || "Sem cliente"}</span>
                      </div>
                      <div className="comparison-scenario-metrics">
                        <div>
                          <small>PREÇO USADO</small>
                          <strong>{formatBRL(price)}</strong>
                        </div>
                        <div>
                          <small>FINANCIAMENTO USADO</small>
                          <strong>{formatBRL(finance.used)}</strong>
                          <span>
                            {finance.manualOverride
                              ? "Override manual >80%"
                              : finance.capped
                                ? "Teto indicativo de 80%"
                                : finance.used === null
                                  ? "GPM/PRICE pendente"
                                  : "Valor adotado na simulação"}
                          </span>
                        </div>
                        <div>
                          <small>1ª PRICE USADA</small>
                          <strong>{formatBRL(simulation.firstPriceInstallmentCents)}</strong>
                          <span>
                            {simulation.gpmReportedFirstPriceInstallmentCents == null
                              ? "Reportada separadamente: não preservada"
                              : `GPM reportou ${formatBRL(simulation.gpmReportedFirstPriceInstallmentCents)}`}
                          </span>
                        </div>
                        <div>
                          <small>MENSAL CAIXA · ATO ROBUSTO</small>
                          <strong>{formatBRL(calculation?.robust?.regularMonthlyCents)}</strong>
                          <span>
                            {calculation?.robust?.monthlyCount === null || calculation?.robust?.monthlyCount === undefined
                              ? "Quantidade pendente"
                              : `${calculation.robust.monthlyCount} mensais · ${calculation.robust.warnings.length ? "revisar alertas" : "valor calculado"}`}
                          </span>
                        </div>
                      </div>
                      <div className="comparison-scenario-delivery">
                        <CalendarDays size={13} />
                        <span>Entrega: {dateText(delivery?.year ?? unit?.deliveryYear, delivery?.month ?? unit?.deliveryMonth, unit?.deliveryText)}</span>
                      </div>
                      <div
                        className={`comparison-scenario-alerts ${alerts.length ? "has-alerts" : "no-alerts"}`}
                        role="note"
                        aria-label={`Alertas da simulação ${unit?.project ?? "sem unidade"}`}
                      >
                        <strong>{alerts.length ? `${alerts.length} ponto(s) para revisar` : "Sem alerta calculado"}</strong>
                        <p>{alerts.slice(0, 2).join(" ") || "Confirme disponibilidade, tabela e condições vigentes antes de apresentar."}</p>
                      </div>
                    </article>
                  ))}
                </div>

                <div className="comparison-matrix-heading">
                  <div>
                    <span className="eyebrow">CONFERÊNCIA DETALHADA</span>
                    <h3>Dados, parcelas e alertas</h3>
                  </div>
                  <span className="no-print">Role horizontalmente para ver todos os cenários</span>
                </div>
                <div className="comparison-scroll" role="region" aria-label="Matriz detalhada da comparação" tabIndex={0}>
                  <table className="comparison-table">
                    <thead>
                      <tr>
                        <th scope="col">Campo de conferência</th>
                        {selectedDetails.map(({ simulation, unit, client }) => (
                          <th scope="col" key={simulation.id}>
                            {unit?.project ?? "Unidade removida"}
                            <small>{unit?.typology || "Tipologia não informada"}</small>
                            <small>{client?.name || "Sem cliente"}</small>
                          </th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      <tr>
                        <th scope="row">Cliente</th>
                        {selectedDetails.map(({ simulation, client }) => (
                          <td key={simulation.id}>{client?.name || "Sem cliente"}</td>
                        ))}
                      </tr>
                      <tr>
                        <th scope="row">Preço usado</th>
                        {selectedDetails.map(({ simulation, unit, price }) => (
                          <td key={simulation.id}>
                            <strong>{formatBRL(price)}</strong>
                            {simulation.priceOverrideCents !== null && <small>Ajustado nesta simulação</small>}
                            {unit?.source && (
                              <small>
                                Fonte: {unit.source}
                                {unit.sourceDate ? ` · ${unit.sourceDate}` : ""}
                              </small>
                            )}
                          </td>
                        ))}
                      </tr>
                      <tr>
                        <th scope="row">Entrega</th>
                        {selectedDetails.map(({ simulation, unit, delivery }) => {
                          const note =
                            simulation.deliveryOverride || unit?.deliveryDateSource === "simulation"
                              ? "Premissa do simulador; confirmar"
                              : unit?.deliveryDateSource === "manual"
                                ? "Informada manualmente; confirmar"
                                : "";
                          return (
                            <td key={simulation.id}>
                              {dateText(delivery?.year ?? unit?.deliveryYear, delivery?.month ?? unit?.deliveryMonth, unit?.deliveryText)}
                              {note && <small className="comparison-warning">{note}</small>}
                            </td>
                          );
                        })}
                      </tr>
                      <tr>
                        <th scope="row">Fonte / data</th>
                        {selectedDetails.map(({ simulation, unit }) => (
                          <td key={simulation.id}>
                            {unit?.source || "Não informada"}
                            <small>{unit?.sourceDate || "Data não informada"}</small>
                          </td>
                        ))}
                      </tr>
                      <tr>
                        <th scope="row">Modalidade</th>
                        {selectedDetails.map(({ simulation }) => (
                          <td key={simulation.id}>
                            Caixa{simulation.includeDirect ? " + Tabela Direta" : ""}
                            {simulation.origin === "lead_recommendation" && <small>Rascunho recomendado</small>}
                          </td>
                        ))}
                      </tr>
                      <tr>
                        <th scope="row">Financiamento informado / usado</th>
                        {selectedDetails.map(({ simulation, finance }) => (
                          <td key={simulation.id}>
                            {finance.reported === null ? (
                              <strong>GPM reportado: não preservado separadamente</strong>
                            ) : (
                              <strong>GPM reportou: {formatBRL(finance.reported)}</strong>
                            )}
                            {finance.entered === null ? (
                              <small>Valor adotado na simulação: pendente</small>
                            ) : (
                              <small>Valor registrado na simulação: {formatBRL(finance.entered)}</small>
                            )}
                            {finance.manualOverride ? (
                              <small className="comparison-warning">
                                Usado: {formatBRL(finance.used)} · override manual acima de 80%; confirmar com a Caixa
                              </small>
                            ) : finance.capped ? (
                              <small>Usado: {formatBRL(finance.used)} · teto automático de 80%</small>
                            ) : finance.used !== null ? (
                              <small>Valor usado: {formatBRL(finance.used)}</small>
                            ) : null}
                            {simulation.gpmReportedPriceReferenceCents != null && (
                              <small>Base GPM: {formatBRL(simulation.gpmReportedPriceReferenceCents)}</small>
                            )}
                          </td>
                        ))}
                      </tr>
                      <tr>
                        <th scope="row">1ª parcela PRICE usada / reportada</th>
                        {selectedDetails.map(({ simulation }) => (
                          <td key={simulation.id}>
                            <strong>Usada na simulação: {formatBRL(simulation.firstPriceInstallmentCents)}</strong>
                            {simulation.gpmReportedFirstPriceInstallmentCents != null ? (
                              <small>
                                GPM reportou: {formatBRL(simulation.gpmReportedFirstPriceInstallmentCents)}
                                {simulation.gpmReportedPriceReferenceCents
                                  ? ` · base ${formatBRL(simulation.gpmReportedPriceReferenceCents)}`
                                  : ""}
                              </small>
                            ) : (
                              <small>Valor reportado separadamente: não preservado</small>
                            )}
                            {simulation.gpmReportedFirstPriceInstallmentCents != null &&
                              simulation.gpmReportedFirstPriceInstallmentCents !== simulation.firstPriceInstallmentCents && (
                                <small>Diferença: estimativa proporcional/ajuste manual, não novo cálculo bancário</small>
                              )}
                          </td>
                        ))}
                      </tr>
                      <tr>
                        <th scope="row">Ato mínimo comparativo (2,5%)</th>
                        {selectedDetails.map(({ simulation, price, calculation }) => (
                          <td key={simulation.id}>
                            {price !== null ? formatBRL(calculation?.minimumActCents ?? Math.round(price * 0.025)) : "Pendente"}
                            {calculation?.robust && <small>Ato Caixa robusto: {formatBRL(calculation.robust.actCents)}</small>}
                          </td>
                        ))}
                      </tr>
                      <tr>
                        <th scope="row">Mensais Caixa · ato robusto</th>
                        {selectedDetails.map(({ simulation, calculation }) => (
                          <td key={simulation.id}>
                            {flowText(calculation?.robust)}
                            <small>Fluxo separado da prestação PRICE</small>
                          </td>
                        ))}
                      </tr>
                      <tr>
                        <th scope="row">Mensais Caixa · ato mínimo</th>
                        {selectedDetails.map(({ simulation, calculation }) => (
                          <td key={simulation.id}>{flowText(calculation?.minimum)}</td>
                        ))}
                      </tr>
                      <tr>
                        <th scope="row">Tabela Direta · pré-chaves</th>
                        {selectedDetails.map(({ simulation, calculation }) => (
                          <td key={simulation.id}>
                            {simulation.includeDirect && calculation
                              ? `${calculation.directPrePercent}% · ${formatBRL(calculation.directPreCents)}`
                              : "Não incluída"}
                            {simulation.includeDirect && <small>{flowText(calculation?.directRobust)}</small>}
                            {simulation.includeDirect && calculation && !calculation.directVisible && (
                              <small className="comparison-warning">Não apresentar como oferta viável: {calculation.directReason}</small>
                            )}
                          </td>
                        ))}
                      </tr>
                      <tr>
                        <th scope="row">Tabela Direta · pós-chaves</th>
                        {selectedDetails.map(({ simulation, calculation }) => (
                          <td key={simulation.id}>
                            {simulation.includeDirect && calculation
                              ? `${formatBRL(calculation.directPostCents)} · ${calculation.directPostPercent}%`
                              : "Não incluída"}
                            <small>Somente montante, sem prazo presumido</small>
                          </td>
                        ))}
                      </tr>
                      <tr>
                        <th scope="row">Alertas / pendências do cenário</th>
                        {selectedDetails.map(({ simulation, alerts }) => (
                          <td key={simulation.id}>
                            {alerts.length
                              ? alerts.map((alert, index) => (
                                  <small className="comparison-warning" key={`${simulation.id}-${index}`}>
                                    {alert}
                                  </small>
                                ))
                              : "Sem alerta calculado; confirmar tabela e disponibilidade."}
                          </td>
                        ))}
                      </tr>
                    </tbody>
                  </table>
                </div>
                <p className="small-note comparison-footnote">
                  <Info size={14} /> 2,5% é o ato comparativo padrão; os 17,5% são parcela adicional potencialmente
                  parcelada com a Cury (até 20% no total da entrada, conforme a condição vigente). Não constitui
                  condição garantida. Diferenças de fonte/data devem ser confirmadas. Os menores valores são apenas
                  nominais e não significam aprovação, menor custo total ou recomendação de crédito.
                </p>
              </>
            )}
          </section>
        </>
      )}
    </div>
  );
}
