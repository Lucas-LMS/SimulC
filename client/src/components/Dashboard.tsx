import { ArrowRight, ArrowUpRight, Calculator, Clock3, FileImage, Landmark, Plus, Users } from "lucide-react";
import type { WorkspaceData, SimulationRecord } from "../lib/models";
import type { PageKey } from "../pages/Home";
import { formatBRL } from "../lib/money";

interface Props {
  workspace: WorkspaceData;
  onNavigate: (page: PageKey) => void;
  onNewSimulation: () => void;
  onLoadSimulation: (simulation: SimulationRecord) => void;
}

export default function Dashboard({ workspace, onNavigate, onNewSimulation, onLoadSimulation }: Props) {
  const recent = [...workspace.simulations].sort((a, b) => b.updatedAt.localeCompare(a.updatedAt)).slice(0, 5);
  const recommendedDrafts = workspace.simulations.filter((item) => item.origin === "lead_recommendation").length;
  const currentDate = new Intl.DateTimeFormat("pt-BR", { weekday: "long", day: "numeric", month: "long" }).format(new Date());
  const clientName = (id: string) => workspace.clients.find((client) => client.id === id)?.name || "Cliente sem identificação";
  const propertyName = (id: string) => {
    const property = workspace.portfolio.find((item) => item.id === id);
    return property ? `${property.project} · ${property.typology}` : "Imóvel removido do catálogo";
  };
  const dateLabel = (value: string) => new Intl.DateTimeFormat("pt-BR", { dateStyle: "medium" }).format(new Date(value));

  return (
    <div className="page-stack dashboard-page">
      <section className="dashboard-welcome">
        <div className="welcome-copy"><div className="eyebrow">SUA MESA DE TRABALHO <span className="eyebrow-dot" /> {currentDate}</div><h1>Feche as contas.<br /><em>Abra a conversa.</em></h1><p>Simule o fluxo, confira cada parcela e deixe a mensagem pronta para o cliente.</p><button className="button button-light" onClick={onNewSimulation}><Plus size={17} /> Nova simulação</button></div>
        <div className="welcome-art" aria-hidden="true"><div className="art-line art-line-one" /><div className="art-line art-line-two" /><div className="art-orbit"><span className="orbit-dot" /><span className="orbit-mark">CHAVES</span></div><div className="art-number">55<span>%</span></div><div className="art-label">PRÉ-CHAVES</div><div className="art-bottom">CONTAS CLARAS <i>·</i> DECISÕES SEGURAS</div></div>
      </section>

      <section className="metric-strip" aria-label="Resumo do espaço de trabalho">
        <button className="metric-card" onClick={() => onNavigate("clientes")}><span className="metric-icon ink"><Users size={17} /></span><span className="metric-label">CLIENTES</span><strong>{workspace.clients.length.toString().padStart(2, "0")}</strong><small>perfis cadastrados <ArrowUpRight size={13} /></small></button>
        <button className="metric-card" onClick={() => onNavigate("simulador")}><span className="metric-icon teal"><Calculator size={17} /></span><span className="metric-label">SIMULAÇÕES</span><strong>{workspace.simulations.length.toString().padStart(2, "0")}</strong><small>fluxos salvos <ArrowUpRight size={13} /></small></button>
        <button className="metric-card" onClick={() => onNavigate("catalogo")}><span className="metric-icon sand"><Landmark size={17} /></span><span className="metric-label">UNIDADES NO CATÁLOGO</span><strong>{workspace.portfolio.length.toString().padStart(2, "0")}</strong><small>referências editáveis <ArrowUpRight size={13} /></small></button>
        <button className="metric-card" onClick={() => onNavigate("importar")}><span className="metric-icon amber"><FileImage size={17} /></span><span className="metric-label">ARQUIVOS</span><strong>{workspace.documents.length.toString().padStart(2, "0")}</strong><small>arquivos no navegador <ArrowUpRight size={13} /></small></button>
      </section>

      <div className="dashboard-lower">
        <section className="panel recent-panel">
          <div className="section-heading"><div><div className="eyebrow">ACOMPANHAMENTO</div><h2>Atividade recente</h2></div><button className="text-button" onClick={() => onNavigate("simulador")}>Ver simulador <ArrowRight size={15} /></button></div>
          {recommendedDrafts > 0 && <div className="field-note"><Clock3 size={14} /><span>{recommendedDrafts} rascunho(s) recomendado(s) por preferências de lead. Não incluem GPM/PRICE nem análise financeira; abra e revise antes de apresentar.</span></div>}
          {recent.length ? <div className="recent-list">{recent.map((item) => <button className="recent-row" key={item.id} onClick={() => onLoadSimulation(item)}><span className="recent-symbol"><Calculator size={17} /></span><span className="recent-main"><strong>{clientName(item.clientId)} {item.origin === "lead_recommendation" && <span className="doc-status draft">RASCUNHO RECOMENDADO</span>}</strong><small>{propertyName(item.propertyId)}</small></span><span className="recent-date">{dateLabel(item.updatedAt)}</span><ArrowRight size={15} /></button>)}</div> : <div className="empty-state"><div className="empty-illustration"><Clock3 size={26} /></div><strong>Seu histórico começa aqui.</strong><p>Monte um primeiro fluxo para acompanhar a proposta e voltar a ela depois.</p><button className="button button-quiet" onClick={onNewSimulation}><Plus size={16} /> Criar simulação</button></div>}
        </section>
        <aside className="dashboard-side">
          <section className="side-note-panel"><span className="side-note-icon"><Landmark size={17} /></span><div className="eyebrow">REFERÊNCIA DO CATÁLOGO</div><h3>Confirme antes de apresentar.</h3><p>Os empreendimentos e valores iniciais vêm do arquivo enviado, com referência de nov/2026. Disponibilidade, tabela e cronograma precisam ser confirmados.</p><button className="text-button" onClick={() => onNavigate("catalogo")}>Revisar catálogo <ArrowRight size={15} /></button></section>
          <section className="quick-card"><div className="quick-card-top"><span className="quick-icon"><MessageIcon /></span><span className="eyebrow">PRÓXIMO PASSO</span></div><h3>Já tem a tabela?<br /><em>Importe e revise.</em></h3><p>Envie PDF ou imagem. O texto detectado fica como rascunho até sua conferência.</p><button className="button button-quiet" onClick={() => onNavigate("importar")}>Importar arquivo <ArrowRight size={15} /></button></section>
        </aside>
      </div>
      <div className="dashboard-disclaimer"><span className="disclaimer-lock">i</span><p>Simulação ilustrativa. Não representa aprovação, subsídio, uso de FGTS ou condição definitiva da Cury/Caixa.</p><span>Fonte local · confira sempre o espelho oficial</span></div>
    </div>
  );
}

function MessageIcon() { return <span className="message-glyph">WA</span>; }
