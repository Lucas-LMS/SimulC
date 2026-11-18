import { ArrowRight, Building2, CalendarDays, MapPin, Sparkles, WalletCards } from "lucide-react";
import type { SimulationRecord, WorkspaceData } from "../lib/models";
import { formatBRL, formatNumber } from "../lib/money";

interface Props { workspace: WorkspaceData; onLoadSimulation: (simulation: SimulationRecord) => void; }

export default function RecommendationsPage({ workspace, onLoadSimulation }: Props) {
  const drafts = workspace.simulations
    .filter((simulation) => simulation.origin === "lead_recommendation")
    .sort((a, b) => (b.recommendation?.score ?? 0) - (a.recommendation?.score ?? 0) || b.updatedAt.localeCompare(a.updatedAt));
  const grouped = new Map<string, SimulationRecord[]>();
  for (const simulation of drafts) {
    const key = simulation.clientId || "sem-cliente";
    grouped.set(key, [...(grouped.get(key) ?? []), simulation]);
  }
  const formatDate = (value: string) => {
    const date = new Date(value);
    return Number.isNaN(date.getTime()) ? "data pendente" : new Intl.DateTimeFormat("pt-BR", { dateStyle: "medium" }).format(date);
  };

  return <div className="page-stack recommendations-page">
    <section className="recommendations-hero">
      <div className="recommendations-hero-copy"><span className="eyebrow"><Sparkles size={13} /> SUGESTÕES A PARTIR DO PERFIL</span><h1>Opções para retomar a conversa.</h1><p>Empreendimentos organizados por cliente e aderência às preferências informadas. Cada cartão abre uma simulação editável.</p></div>
      <div className="recommendations-hero-stat"><span><WalletCards size={17} /> RASCUNHOS SALVOS</span><strong>{drafts.length}</strong><small>{grouped.size} cliente(s) com opções</small></div>
    </section>

    {!drafts.length ? <section className="panel recommendations-empty"><span className="recommendation-empty-icon"><Sparkles size={20} /></span><strong>Nenhuma recomendação salva por enquanto.</strong><p>Depois de revisar um formulário de lead, as opções compatíveis ficam reunidas aqui para você comparar e completar.</p></section> : <div className="recommendation-groups">
      {[...grouped.entries()].map(([key, simulations]) => {
        const client = workspace.clients.find((item) => item.id === key);
        return <section className="recommendation-group" key={key}>
          <header className="recommendation-group-head"><div className="recommendation-client-mark">{(client?.name ?? "?").slice(0, 1).toLocaleUpperCase("pt-BR")}</div><div className="recommendation-client-copy"><span className="eyebrow">CLIENTE</span><h2>{client?.name ?? "Cliente sem identificação"}</h2><p>{client?.incomeFamilyCents ? `Renda familiar ${formatBRL(client.incomeFamilyCents)}/mês` : "Renda ainda não informada"}{client?.oldestBuyerAge ? ` · ${client.oldestBuyerAge} anos` : ""}</p></div><span className="recommendation-group-count">{simulations.length} opção(ões)</span></header>
          <div className="recommendation-options">{simulations.map((simulation, index) => {
            const unit = workspace.portfolio.find((item) => item.id === simulation.propertyId);
            const score = Math.max(0, Math.min(100, simulation.recommendation?.score ?? 0));
            const reasons = simulation.recommendation?.reasons ?? [];
            const mismatches = simulation.recommendation?.mismatches ?? [];
            const delivery = unit?.deliveryMonth && unit.deliveryYear
              ? `${String(unit.deliveryMonth).padStart(2, "0")}/${unit.deliveryYear}${unit.deliveryDateSource === "simulation" ? " · simulador; confirmar" : unit.deliveryDateSource === "manual" ? " · manual; confirmar" : ""}`
              : unit?.deliveryYear ? `${unit.deliveryYear} · mês a confirmar` : "A confirmar";
            return <article className="recommendation-option" key={simulation.id}>
              <div className="recommendation-option-top"><span className="recommendation-rank">{String(index + 1).padStart(2, "0")}</span><span className="recommendation-score">{formatNumber(score, 0)}% aderência</span><span className="doc-status draft">PRICE/GPM PENDENTE</span></div>
              <div className="recommendation-score-track" aria-label={`${score}% de aderência`}><span style={{ width: `${score}%` }} /></div>
              <div className="recommendation-property-heading"><span className="recommendation-property-icon"><Building2 size={17} /></span><div><span className="eyebrow">OPÇÃO RECOMENDADA</span><h3>{unit?.project ?? "Unidade removida do catálogo"}</h3></div></div>
              <p className="recommendation-typology">{unit?.typology ?? "Tipologia pendente"}{unit?.bedrooms ? ` · ${unit.bedrooms} quartos` : ""}{unit?.parking ? " · vaga" : ""}</p>
              <div className="recommendation-facts"><span><MapPin size={14} />{unit?.neighborhood || unit?.region || "Região a confirmar"}</span><span><CalendarDays size={14} />Entrega {delivery}</span></div>
              <div className="recommendation-price"><div><small>PREÇO REFERENCIAL</small><strong>{formatBRL(simulation.priceOverrideCents ?? unit?.priceCents ?? unit?.priceLowCents ?? null)}</strong></div><span>{unit?.source ?? "Fonte pendente"}<br />{unit?.sourceDate ?? "data não informada"}</span></div>
              <div className="recommendation-reasons"><strong>Por que entrou na lista</strong>{reasons.length ? <p>{reasons.join(" ")}</p> : <p>Correspondência parcial com as preferências recebidas.</p>}{mismatches.length > 0 && <p className="recommendation-mismatch">A conferir: {mismatches.join(" ")}</p>}</div>
              <div className="recommendation-option-footer"><small>Rascunho atualizado em {formatDate(simulation.updatedAt)}</small><button className="button button-primary" onClick={() => onLoadSimulation(simulation)}>Abrir simulação <ArrowRight size={15} /></button></div>
            </article>;
          })}</div>
        </section>;
      })}
    </div>}
    <div className="recommendation-disclaimer"><Sparkles size={15} /><span>Compatibilidade baseada apenas nas preferências cadastradas (como região, quartos/vaga e entrega). Não é análise financeira, confirmação de disponibilidade ou aprovação de crédito. O GPM/PRICE permanece pendente até ser informado e conferido.</span></div>
  </div>;
}
