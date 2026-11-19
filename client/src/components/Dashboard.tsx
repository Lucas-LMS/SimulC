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
import type { SimulationRecord, WorkspaceData } from "../lib/models";
import type { PageKey } from "../pages/Home";
import { formatBRL } from "../lib/money";

interface Props {
  workspace: WorkspaceData;
  onNavigate: (page: PageKey) => void;
  onNewSimulation: () => void;
  onLoadSimulation: (simulation: SimulationRecord) => void;
  onDuplicateSimulation: (simulation: SimulationRecord) => void;
  onDeleteSimulation: (simulationId: string) => void;
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
}: Props) {
  const [showDrafts, setShowDrafts] = useState(false);
  const [simSearch, setSimSearch] = useState("");
  const [showAll, setShowAll] = useState(false);

  const recommendedDrafts = useMemo(
    () => workspace.simulations.filter((item) => item.origin === "lead_recommendation").length,
    [workspace.simulations],
  );
  const manualSimulationsCount = workspace.simulations.length - recommendedDrafts;

  const clientById = useMemo(() => new Map(workspace.clients.map((c) => [c.id, c])), [workspace.clients]);
  const unitById = useMemo(() => new Map(workspace.portfolio.map((u) => [u.id, u])), [workspace.portfolio]);

  const filteredSimulations = useMemo(() => {
    const term = simSearch.trim().toLocaleLowerCase("pt-BR");
    return [...workspace.simulations]
      .filter((item) => {
        if (!showDrafts && item.origin === "lead_recommendation") return false;
        if (!term) return true;
        const client = clientById.get(item.clientId);
        const unit = unitById.get(item.propertyId);
        return `${client?.name ?? ""} ${unit?.project ?? ""} ${unit?.typology ?? ""} ${unit?.neighborhood ?? ""}`
          .toLocaleLowerCase("pt-BR")
          .includes(term);
      })
      .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
  }, [workspace.simulations, showDrafts, simSearch, clientById, unitById]);

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
          <p>Simule o fluxo, confira cada parcela e deixe a proposta pronta para o cliente.</p>
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
          <div className="art-number">
            {manualSimulationsCount.toString().padStart(2, "0")}
          </div>
          <div className="art-label">PROPOSTAS SALVAS</div>
          <div className="art-bottom">
            CONTAS CLARAS <i>·</i> DECISÕES SEGURAS
          </div>
        </div>
      </section>

      <section className="metric-strip" aria-label="Resumo do espaço de trabalho">
        <button className="metric-card" onClick={() => onNavigate("clientes")}>
          <span className="metric-icon ink">
            <Users size={17} />
          </span>
          <span className="metric-label">CLIENTES</span>
          <strong>{workspace.clients.length.toString().padStart(2, "0")}</strong>
          <small>
            perfis cadastrados <ArrowUpRight size={13} />
          </small>
        </button>
        <button className="metric-card" onClick={() => onNavigate("simulador")}>
          <span className="metric-icon teal">
            <Calculator size={17} />
          </span>
          <span className="metric-label">SIMULAÇÕES</span>
          <strong>{manualSimulationsCount.toString().padStart(2, "0")}</strong>
          <small>
            {recommendedDrafts > 0 ? `+ ${recommendedDrafts} rascunhos de lead` : "fluxos salvos"}{" "}
            <ArrowUpRight size={13} />
          </small>
        </button>
        <button className="metric-card" onClick={() => onNavigate("catalogo")}>
          <span className="metric-icon sand">
            <Landmark size={17} />
          </span>
          <span className="metric-label">UNIDADES NO CATÁLOGO</span>
          <strong>{workspace.portfolio.length.toString().padStart(2, "0")}</strong>
          <small>
            referências editáveis <ArrowUpRight size={13} />
          </small>
        </button>
        <button className="metric-card" onClick={() => onNavigate("importar")}>
          <span className="metric-icon amber">
            <FileImage size={17} />
          </span>
          <span className="metric-label">ARQUIVOS</span>
          <strong>{workspace.documents.length.toString().padStart(2, "0")}</strong>
          <small>
            arquivos no navegador <ArrowUpRight size={13} />
          </small>
        </button>
      </section>

      <div className="dashboard-lower">
        <section className="panel recent-panel">
          <div className="section-heading">
            <div>
              <div className="eyebrow">ACOMPANHAMENTO</div>
              <h2>Minhas simulações</h2>
            </div>
            <button className="text-button" onClick={onNewSimulation}>
              Nova simulação <ArrowRight size={15} />
            </button>
          </div>

          {workspace.simulations.length > 0 && (
            <div className="recent-controls">
              <div className="search-field">
                <Search size={15} />
                <input
                  value={simSearch}
                  onChange={(event) => setSimSearch(event.target.value)}
                  placeholder="Buscar por cliente ou empreendimento…"
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
          )}

          {visibleSimulations.length ? (
            <>
              <div className="recent-list">
                {visibleSimulations.map((item) => {
                  const price = simulationPrice(item);
                  return (
                    <div className="recent-row-wrap" key={item.id}>
                      <button className="recent-row" onClick={() => onLoadSimulation(item)}>
                        <span className="recent-symbol">
                          <Calculator size={17} />
                        </span>
                        <span className="recent-main">
                          <strong>
                            {clientName(item.clientId)}{" "}
                            {item.origin === "lead_recommendation" && (
                              <span className="doc-status draft">RASCUNHO</span>
                            )}
                          </strong>
                          <small>{propertyLabel(item.propertyId)}</small>
                        </span>
                        <span className="recent-meta-right">
                          <strong>{price !== null ? formatBRL(price) : "Preço a informar"}</strong>
                          <span className="recent-date">{dateLabel(item.updatedAt)}</span>
                        </span>
                      </button>
                      <div className="recent-row-actions">
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
                            if (window.confirm(`Excluir a simulação de ${clientName(item.clientId)} (${propertyLabel(item.propertyId)})?`)) {
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
                {workspace.simulations.length > 0 && !showDrafts && !simSearch
                  ? "Nenhuma simulação manual salva ainda."
                  : simSearch
                    ? "Nenhuma simulação encontrada."
                    : "Seu histórico começa aqui."}
              </strong>
              <p>
                {workspace.simulations.length > 0 && !showDrafts && !simSearch
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
