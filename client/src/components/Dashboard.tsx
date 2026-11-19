import { useMemo, useState } from "react";
import {
  ArrowRight,
  ArrowUpRight,
  Calculator,
  Clock3,
  Copy,
  FileImage,
  Landmark,
  Plus,
  Search,
  Trash2,
  Users,
} from "lucide-react";
import type { SimulationRecord, SimulationStatus, WorkspaceData } from "../lib/models";
import type { PageKey } from "../pages/Home";
import {
  normalizeSimulationStatus,
  SIMULATION_STATUS_META,
  SIMULATION_STATUS_ORDER,
} from "../lib/insights";
import { formatBRL } from "../lib/money";

interface Props {
  workspace: WorkspaceData;
  onNavigate: (page: PageKey) => void;
  onNewSimulation: () => void;
  onLoadSimulation: (simulation: SimulationRecord) => void;
  onDuplicateSimulation: (simulation: SimulationRecord) => void;
  onDeleteSimulation: (simulationId: string) => void;
  onUpdateSimulationStatus?: (simulationId: string, status: SimulationStatus) => void;
}

const dateFormatter = new Intl.DateTimeFormat("pt-BR", { dateStyle: "medium" });
const weekdayFormatter = new Intl.DateTimeFormat("pt-BR", { weekday: "long", day: "numeric", month: "long" });

export default function Dashboard({
  workspace,
  onNavigate,
  onNewSimulation,
  onLoadSimulation,
  onDuplicateSimulation,
  onDeleteSimulation,
  onUpdateSimulationStatus,
}: Props) {
  const [showDrafts, setShowDrafts] = useState(false);
  const [statusFilter, setStatusFilter] = useState<SimulationStatus | "all">("all");
  const [simSearch, setSimSearch] = useState("");
  const [showAll, setShowAll] = useState(false);

  const recommendedDrafts = useMemo(
    () => workspace.simulations.filter((item) => item.origin === "lead_recommendation").length,
    [workspace.simulations],
  );
  const manualSimulations = useMemo(
    () => workspace.simulations.filter((item) => item.origin !== "lead_recommendation"),
    [workspace.simulations],
  );
  const activePortfolioCount = useMemo(
    () => workspace.portfolio.filter((u) => u.active !== false).length,
    [workspace.portfolio],
  );

  const statusCounts = useMemo(() => {
    const counts: Record<SimulationStatus, number> = {
      rascunho: 0,
      enviada: 0,
      negociacao: 0,
      pasta: 0,
      fechada: 0,
      perdida: 0,
    };
    const pool = showDrafts ? workspace.simulations : manualSimulations;
    pool.forEach((sim) => {
      counts[normalizeSimulationStatus(sim.status)] += 1;
    });
    return counts;
  }, [workspace.simulations, manualSimulations, showDrafts]);

  const clientById = useMemo(() => new Map(workspace.clients.map((c) => [c.id, c])), [workspace.clients]);
  const unitById = useMemo(() => new Map(workspace.portfolio.map((u) => [u.id, u])), [workspace.portfolio]);

  const filteredSimulations = useMemo(() => {
    const term = simSearch.trim().toLocaleLowerCase("pt-BR");
    return [...workspace.simulations]
      .filter((item) => {
        if (!showDrafts && item.origin === "lead_recommendation") return false;
        if (statusFilter !== "all" && normalizeSimulationStatus(item.status) !== statusFilter) return false;
        if (!term) return true;
        const client = clientById.get(item.clientId);
        const unit = unitById.get(item.propertyId);
        return `${client?.name ?? ""} ${unit?.project ?? ""} ${unit?.typology ?? ""} ${unit?.neighborhood ?? ""} ${item.nextStep ?? ""}`
          .toLocaleLowerCase("pt-BR")
          .includes(term);
      })
      .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
  }, [workspace.simulations, showDrafts, statusFilter, simSearch, clientById, unitById]);

  const visibleSimulations = showAll ? filteredSimulations : filteredSimulations.slice(0, 8);
  const currentDate = useMemo(() => weekdayFormatter.format(new Date()), []);

  const clientName = (id: string) => clientById.get(id)?.name || "Cliente sem identificação";
  const propertyLabel = (id: string) => {
    const property = unitById.get(id);
    return property ? `${property.project} · ${property.typology}` : "Imóvel removido do catálogo";
  };
  const simulationPrice = (item: SimulationRecord) => {
    const unit = unitById.get(item.propertyId);
    return item.priceOverrideCents ?? unit?.priceCents ?? unit?.priceLowCents ?? null;
  };
  const dateLabel = (value: string) => {
    try {
      return dateFormatter.format(new Date(value));
    } catch {
      return value;
    }
  };

  return (
    <div className="page-stack dashboard-page">
      <section className="dashboard-welcome">
        <div className="welcome-copy">
          <div className="eyebrow">
            SUA MESA DE TRABALHO <span className="eyebrow-dot" /> {currentDate}
          </div>
          <h1>
            Feche as contas.
            <br />
            <em>Abra a conversa.</em>
          </h1>
          <p>Simule o fluxo, acompanhe o funil de propostas e apresente cada parcela com clareza.</p>
          <div className="welcome-actions">
            <button className="button button-light" onClick={onNewSimulation}>
              <Plus size={17} /> Nova simulação
            </button>
            <button className="button button-welcome-ghost" onClick={() => onNavigate("comparar")}>
              Comparar cenários <ArrowRight size={15} />
            </button>
          </div>
        </div>
        <div className="welcome-art" aria-hidden="true">
          <div className="art-line art-line-one" />
          <div className="art-line art-line-two" />
          <div className="art-orbit">
            <span className="orbit-dot" />
            <span className="orbit-mark">CHAVES</span>
          </div>
          <div className="art-number">{manualSimulations.length.toString().padStart(2, "0")}</div>
          <div className="art-label">PROPOSTAS SALVAS</div>
          <div className="art-bottom">
            CONTAS CLARAS <i>·</i> DECISÕES SEGURAS
          </div>
        </div>
      </section>

      <section className="metric-strip" aria-label="Resumo do espaço de trabalho">
        <button className="metric-card accent-ink" onClick={() => onNavigate("clientes")}>
          <span className="metric-icon ink">
            <Users size={17} />
          </span>
          <span className="metric-label">CLIENTES</span>
          <strong>{workspace.clients.length.toString().padStart(2, "0")}</strong>
          <small>
            perfis cadastrados <ArrowUpRight size={13} />
          </small>
        </button>
        <button className="metric-card accent-teal" onClick={() => onNavigate("simulador")}>
          <span className="metric-icon teal">
            <Calculator size={17} />
          </span>
          <span className="metric-label">SIMULAÇÕES</span>
          <strong>{manualSimulations.length.toString().padStart(2, "0")}</strong>
          <small>
            {statusCounts.negociacao + statusCounts.pasta > 0
              ? `${statusCounts.negociacao + statusCounts.pasta} em andamento`
              : recommendedDrafts > 0
                ? `+ ${recommendedDrafts} rascunhos de lead`
                : "fluxos salvos"}{" "}
            <ArrowUpRight size={13} />
          </small>
        </button>
        <button className="metric-card accent-sand" onClick={() => onNavigate("catalogo")}>
          <span className="metric-icon sand">
            <Landmark size={17} />
          </span>
          <span className="metric-label">UNIDADES ATIVAS</span>
          <strong>{activePortfolioCount.toString().padStart(2, "0")}</strong>
          <small>
            de {workspace.portfolio.length} no catálogo <ArrowUpRight size={13} />
          </small>
        </button>
        <button className="metric-card accent-amber" onClick={() => onNavigate("importar")}>
          <span className="metric-icon amber">
            <FileImage size={17} />
          </span>
          <span className="metric-label">ARQUIVOS</span>
          <strong>{workspace.documents.length.toString().padStart(2, "0")}</strong>
          <small>
            tabelas no navegador <ArrowUpRight size={13} />
          </small>
        </button>
      </section>

      <div className="dashboard-lower">
        <section className="panel recent-panel">
          <div className="section-heading">
            <div>
              <div className="eyebrow">FUNIL E ACOMPANHAMENTO</div>
              <h2>Minhas simulações</h2>
            </div>
            <button className="text-button" onClick={onNewSimulation}>
              Nova simulação <ArrowRight size={15} />
            </button>
          </div>

          {workspace.simulations.length > 0 && (
            <>
              <div className="status-filter-pills" role="group" aria-label="Filtrar por status comercial">
                <button
                  type="button"
                  className={`status-pill-btn ${statusFilter === "all" ? "active" : ""}`}
                  onClick={() => setStatusFilter("all")}
                >
                  Todas <span>{(showDrafts ? workspace.simulations : manualSimulations).length}</span>
                </button>
                {SIMULATION_STATUS_ORDER.map((status) => {
                  const meta = SIMULATION_STATUS_META[status];
                  const qty = statusCounts[status];
                  if (qty === 0 && statusFilter !== status) return null;
                  return (
                    <button
                      key={status}
                      type="button"
                      className={`status-pill-btn tone-${meta.tone} ${statusFilter === status ? "active" : ""}`}
                      onClick={() => setStatusFilter(status)}
                    >
                      {meta.shortLabel} <span>{qty}</span>
                    </button>
                  );
                })}
              </div>

              <div className="recent-controls">
                <div className="search-field">
                  <Search size={15} />
                  <input
                    value={simSearch}
                    onChange={(event) => setSimSearch(event.target.value)}
                    placeholder="Buscar por cliente, empreendimento ou próximo passo…"
                    aria-label="Buscar simulações salvas"
                  />
                </div>
                {recommendedDrafts > 0 && (
                  <label className="check-field compact-check">
                    <input
                      type="checkbox"
                      checked={showDrafts}
                      onChange={(event) => setShowDrafts(event.target.checked)}
                    />
                    <span>Mostrar rascunhos de lead ({recommendedDrafts})</span>
                  </label>
                )}
              </div>
            </>
          )}

          {visibleSimulations.length ? (
            <>
              <div className="recent-list">
                {visibleSimulations.map((item) => {
                  const price = simulationPrice(item);
                  const status = normalizeSimulationStatus(item.status);
                  const statusMeta = SIMULATION_STATUS_META[status];
                  return (
                    <div className="recent-row-wrap" key={item.id}>
                      <button className="recent-row" onClick={() => onLoadSimulation(item)}>
                        <span className="recent-symbol">
                          <Calculator size={17} />
                        </span>
                        <span className="recent-main">
                          <strong>
                            {clientName(item.clientId)}{" "}
                            <span className={`modality-pill ${item.includeDirect ? "both" : ""}`}>
                              {item.includeDirect ? "Caixa + Direta" : "Caixa"}
                            </span>
                            {item.origin === "lead_recommendation" && (
                              <span className="doc-status draft">LEAD</span>
                            )}
                          </strong>
                          <small>{propertyLabel(item.propertyId)}</small>
                          {item.nextStep?.trim() && (
                            <span className="recent-next-step">Próximo passo: {item.nextStep}</span>
                          )}
                        </span>
                        <span className="recent-meta-right">
                          <strong>{price !== null ? formatBRL(price) : "Preço a informar"}</strong>
                          <span className="recent-date">{dateLabel(item.updatedAt)}</span>
                        </span>
                      </button>
                      <div className="recent-row-actions">
                        {onUpdateSimulationStatus && (
                          <select
                            className={`inline-status-select tone-${statusMeta.tone}`}
                            aria-label={`Status da simulação de ${clientName(item.clientId)}`}
                            value={status}
                            onChange={(event) =>
                              onUpdateSimulationStatus(item.id, event.target.value as SimulationStatus)
                            }
                          >
                            {SIMULATION_STATUS_ORDER.map((key) => (
                              <option key={key} value={key}>
                                {SIMULATION_STATUS_META[key].shortLabel}
                              </option>
                            ))}
                          </select>
                        )}
                        <button
                          type="button"
                          className="icon-button"
                          title="Duplicar simulação como novo cenário"
                          aria-label={`Duplicar simulação de ${clientName(item.clientId)}`}
                          onClick={() => onDuplicateSimulation(item)}
                        >
                          <Copy size={14} />
                        </button>
                        <button
                          type="button"
                          className="icon-button danger-quiet"
                          title="Excluir simulação"
                          aria-label={`Excluir simulação de ${clientName(item.clientId)}`}
                          onClick={() => {
                            if (
                              window.confirm(
                                `Excluir a simulação de ${clientName(item.clientId)} (${propertyLabel(item.propertyId)})?`,
                              )
                            ) {
                              onDeleteSimulation(item.id);
                            }
                          }}
                        >
                          <Trash2 size={14} />
                        </button>
                      </div>
                    </div>
                  );
                })}
              </div>
              {filteredSimulations.length > 8 && (
                <button
                  type="button"
                  className="button button-quiet button-small recent-show-more"
                  onClick={() => setShowAll((current) => !current)}
                >
                  {showAll ? "Mostrar menos" : `Ver todas as ${filteredSimulations.length} simulações`}
                </button>
              )}
            </>
          ) : (
            <div className="empty-state">
              <div className="empty-illustration">
                <Clock3 size={26} />
              </div>
              <strong>
                {workspace.simulations.length > 0 && !showDrafts && !simSearch && statusFilter === "all"
                  ? "Nenhuma simulação manual salva ainda."
                  : simSearch || statusFilter !== "all"
                    ? "Nenhuma simulação encontrada com este filtro."
                    : "Seu histórico começa aqui."}
              </strong>
              <p>
                {workspace.simulations.length > 0 && !showDrafts && !simSearch && statusFilter === "all"
                  ? `Existem ${recommendedDrafts} rascunho(s) de lead ocultos. Marque "Mostrar rascunhos de lead" acima ou crie uma nova simulação.`
                  : "Monte um primeiro fluxo para acompanhar a proposta e voltar a ela depois."}
              </p>
              <button className="button button-quiet" onClick={onNewSimulation}>
                <Plus size={16} /> Criar simulação
              </button>
            </div>
          )}
        </section>

        <aside className="dashboard-side">
          <section className="side-note-panel">
            <span className="side-note-icon">
              <Landmark size={17} />
            </span>
            <div className="eyebrow">REFERÊNCIA DO CATÁLOGO</div>
            <h3>Confirme antes de apresentar.</h3>
            <p>
              Os empreendimentos e valores iniciais têm referência de nov/2026. Disponibilidade, tabela e cronograma
              precisam ser confirmados no espelho oficial.
            </p>
            <button className="text-button" onClick={() => onNavigate("catalogo")}>
              Revisar catálogo <ArrowRight size={15} />
            </button>
          </section>
          <section className="quick-card">
            <div className="quick-card-top">
              <span className="quick-icon">
                <MessageIcon />
              </span>
              <span className="eyebrow">PRÓXIMO PASSO</span>
            </div>
            <h3>
              Já tem a tabela?
              <br />
              <em>Importe e revise.</em>
            </h3>
            <p>Envie PDF ou imagem. O texto detectado fica como rascunho até sua conferência.</p>
            <button className="button button-quiet" onClick={() => onNavigate("importar")}>
              Importar arquivo <ArrowRight size={15} />
            </button>
          </section>
        </aside>
      </div>
      <div className="dashboard-disclaimer">
        <span className="disclaimer-lock">i</span>
        <p>
          Simulação ilustrativa. Não representa aprovação, subsídio, uso de FGTS ou condição definitiva da Cury/Caixa.
        </p>
        <span>Fonte local · confira sempre o espelho oficial</span>
      </div>
    </div>
  );
}

function MessageIcon() {
  return <span className="message-glyph">WA</span>;
}
