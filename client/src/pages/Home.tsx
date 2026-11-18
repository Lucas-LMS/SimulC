import { useEffect, useMemo, useState } from "react";
import {
  ArrowDownToLine,
  ArrowLeftRight,
  ArrowUpRight,
  Calculator,
  Check,
  ChevronRight,
  CircleHelp,
  FileImage,
  FileSpreadsheet,
  Home as HomeIcon,
  Landmark,
  Menu,
  MessageCircle,
  Moon,
  Sun,
  Plus,
  RefreshCw,
  Settings2,
  ShieldCheck,
  Users,
  WalletCards,
  X,
} from "lucide-react";
import type { WorkspaceData, SimulationRecord, ClientProfile } from "../lib/models";
import { loadWorkspace, saveWorkspace, downloadBackup, parseBackupFile, createId } from "../lib/storage";
import { formatBRL } from "../lib/money";
import Dashboard from "../components/Dashboard";
import ClientsPage from "../components/ClientsPage";
import CatalogPage from "../components/CatalogPage";
import ImportPage from "../components/ImportPage";
import SimulatorPage, { makeNewSimulation } from "../components/SimulatorPage";
import ComparePage from "../components/ComparePage";
import RecommendationsPage from "../components/RecommendationsPage";
import { listAutomaticBackups, saveAutomaticBackup, type AutomaticBackup } from "../lib/fileStore";

export type PageKey = "inicio" | "simulador" | "clientes" | "catalogo" | "importar" | "comparar" | "recomendacoes" | "configuracoes";

const NAVIGATION = [
  { id: "inicio" as const, title: "Visão geral", icon: HomeIcon },
  { id: "simulador" as const, title: "Simular fluxo", icon: Calculator },
  { id: "clientes" as const, title: "Clientes", icon: Users },
  { id: "catalogo" as const, title: "Empreendimentos", icon: Landmark },
  { id: "importar" as const, title: "Importar tabela", icon: FileSpreadsheet },
  { id: "recomendacoes" as const, title: "Recomendações", icon: WalletCards },
  { id: "comparar" as const, title: "Comparar simulações", icon: ArrowLeftRight },
];

const currentMonth = () => ({ year: new Date().getFullYear(), month: new Date().getMonth() + 1 });

function Logo() {
  return (
    <div className="brand-lockup" aria-label="Cury Fluxo">
      <span className="brand-symbol" aria-hidden="true"><span /><i /></span>
      <span className="brand-wordmark">CURY<span>FLUXO</span><small>MESA DE SIMULAÇÃO</small></span>
    </div>
  );
}

function AppSidebar({ page, setPage, compact, onClose }: { page: PageKey; setPage: (page: PageKey) => void; compact?: boolean; onClose?: () => void }) {
  return (
    <aside className={`app-sidebar ${compact ? "compact" : ""}`}>
      <div className="sidebar-top"><Logo /><button className="icon-button sidebar-close" aria-label="Fechar menu" onClick={onClose}><X size={18} /></button></div>
      <div className="sidebar-caption">ESPAÇO DE TRABALHO</div>
      <nav className="sidebar-nav" aria-label="Navegação principal">
        {NAVIGATION.map(({ id, title, icon: Icon }) => (
          <button key={id} className={`nav-item ${page === id ? "active" : ""}`} onClick={() => setPage(id)}>
            <Icon size={18} strokeWidth={1.8} /><span>{title}</span>{page === id && <span className="nav-current" />}
          </button>
        ))}
      </nav>
      <div className="sidebar-bottom">
        <div className="local-status"><ShieldCheck size={16} /><span>Dados salvos neste dispositivo</span></div>
        <button className={`nav-item ${page === "configuracoes" ? "active" : ""}`} onClick={() => setPage("configuracoes")}>
          <Settings2 size={18} /><span>Dados e backup</span>
        </button>
        <div className="consultant-card">
          <div className="consultant-avatar">LS</div>
          <div><strong>Lucas Silva</strong><small>Consultoria imobiliária</small></div>
          <span className="online-dot" />
        </div>
      </div>
    </aside>
  );
}

function SettingsPage({ workspace, setWorkspace }: { workspace: WorkspaceData; setWorkspace: React.Dispatch<React.SetStateAction<WorkspaceData>> }) {
  const [status, setStatus] = useState("");
  const [restoreBusy, setRestoreBusy] = useState(false);
  const [backups, setBackups] = useState<AutomaticBackup[]>([]);
  const restoreRef = useState<HTMLInputElement | null>(null);
  const inputRef = restoreRef[0];
  const setInputRef = restoreRef[1];
  useEffect(() => { void listAutomaticBackups().then(setBackups).catch(() => setBackups([])); }, []);
  const restoreAutomatic = (backup: AutomaticBackup) => {
    try {
      const incoming = JSON.parse(backup.workspaceJson) as WorkspaceData;
      if (!Array.isArray(incoming.clients) || !Array.isArray(incoming.portfolio) || !Array.isArray(incoming.simulations) || !Array.isArray(incoming.documents)) throw new Error("Snapshot incompleto.");
      if (!window.confirm(`Restaurar snapshot de ${new Date(backup.createdAt).toLocaleString("pt-BR")} e substituir os dados atuais?`)) return;
      setWorkspace(incoming); setStatus("Snapshot automático restaurado neste navegador.");
    } catch { setStatus("Não foi possível restaurar este snapshot automático."); }
  };

  const restore = async (file: File | undefined) => {
    if (!file) return;
    setRestoreBusy(true);
    try {
      const incoming = await parseBackupFile(file);
      const proceed = window.confirm(`Este backup tem ${incoming.clients.length} clientes, ${incoming.portfolio.length} unidades e ${incoming.simulations.length} simulações. Substituir os dados atuais deste navegador?`);
      if (!proceed) return;
      setWorkspace(incoming);
      setStatus("Backup restaurado neste navegador.");
    } catch (error) {
      setStatus(error instanceof Error ? error.message : "Não foi possível ler o backup.");
    } finally {
      setRestoreBusy(false);
      if (inputRef) inputRef.value = "";
    }
  };

  return (
    <div className="page-stack settings-page">
      <div className="page-heading"><div><div className="eyebrow">PREFERÊNCIAS E PORTABILIDADE</div><h1>Seus dados, sob seu controle.</h1><p>O Cury Fluxo guarda informações somente neste navegador. Não há conta nem sincronização entre dispositivos.</p></div></div>
      <section className="panel settings-panel">
        <div className="settings-icon"><ShieldCheck size={20} /></div>
        <div className="settings-copy"><h2>Armazenamento local</h2><p>Clientes, unidades, simulações e rascunhos importados ficam no armazenamento deste dispositivo. Limpar os dados do navegador pode removê-los.</p><span className="privacy-note">Nenhum dado é enviado a um servidor pelo simulador.</span></div>
      </section>
      <section className="panel settings-panel">
        <div className="settings-icon amber"><ArrowDownToLine size={20} /></div>
        <div className="settings-copy"><h2>Exportar um backup</h2><p>Salve um arquivo JSON com clientes, catálogo, simulações e texto extraído dos documentos.</p><p className="small-note">O backup não incorpora os arquivos PDF ou imagens originais; guarde-os separadamente.</p></div>
        <button className="button button-primary" onClick={() => { downloadBackup(workspace); setStatus("Backup baixado."); }}><ArrowDownToLine size={16} /> Exportar backup</button>
      </section>
      <section className="panel settings-panel"><div className="settings-icon"><RefreshCw size={20} /></div><div className="settings-copy"><h2>Snapshots automáticos neste navegador</h2><p>Até 10 cópias rotativas do espaço de trabalho são guardadas no IndexedDB após alterações. Isso ajuda em recuperação acidental, mas não protege contra limpeza do navegador, falha/perda do dispositivo, perfil removido ou cota/evicção do armazenamento.</p><small>Não inclui PDFs/imagens originais. Exporte um backup JSON para outro local. Google Drive não está conectado: integração exigiria OAuth com consentimento e armazenamento seguro de tokens; não há credenciais embutidas.</small>{backups.map((backup) => <div className="backup-row" key={backup.key}><span>{new Date(backup.createdAt).toLocaleString("pt-BR")}</span><button className="text-button" onClick={() => restoreAutomatic(backup)}>Restaurar</button></div>)}</div></section>
      <section className="panel settings-panel">
        <div className="settings-icon"><RefreshCw size={20} /></div>
        <div className="settings-copy"><h2>Restaurar um backup</h2><p>Importar substitui os dados atuais deste navegador. Você verá uma confirmação com o resumo antes de aplicar.</p></div>
        <input ref={(node) => setInputRef(node)} type="file" accept="application/json,.json" hidden onChange={(event) => void restore(event.target.files?.[0])} />
        <button className="button button-quiet" disabled={restoreBusy} onClick={() => inputRef?.click()}>{restoreBusy ? "Lendo…" : "Escolher backup"}</button>
      </section>
      <section className="reference-alert"><CircleHelp size={18} /><div><strong>Sobre a base Cury</strong><p>O catálogo inicial vem do prompt recebido e está marcado como referência de nov/2026. Confirme preço, unidade, tabela e entrega no espelho oficial antes de usar com o cliente. Este aplicativo não consulta disponibilidade ao vivo nem substitui contrato ou aprovação.</p></div></section>
      {status && <div className="inline-status"><Check size={15} />{status}</div>}
    </div>
  );
}

export default function Home() {
  const [workspace, setWorkspace] = useState<WorkspaceData>(() => loadWorkspace());
  const [page, setPage] = useState<PageKey>("inicio");
  const [activeClientId, setActiveClientId] = useState("");
  const [activeSimulation, setActiveSimulation] = useState<SimulationRecord | null>(null);
  const [mobileNav, setMobileNav] = useState(false);
  const [saveState, setSaveState] = useState<"saved" | "saving" | "error">("saved");
  const [dark, setDark] = useState(() => window.localStorage.getItem("cury-fluxo-theme") === "dark");
  useEffect(() => { document.documentElement.dataset.theme = dark ? "dark" : "light"; window.localStorage.setItem("cury-fluxo-theme", dark ? "dark" : "light"); }, [dark]);

  useEffect(() => {
    setSaveState("saving");
    const timer = window.setTimeout(() => {
      const saved = saveWorkspace(workspace);
      setSaveState(saved ? "saved" : "error");
      if (saved) void saveAutomaticBackup(JSON.stringify(workspace)).catch((error) => console.warn("Snapshot automático indisponível", error));
    }, 180);
    return () => window.clearTimeout(timer);
  }, [workspace]);

  const updateClient = (client: ClientProfile) => {
    setWorkspace((current) => {
      const exists = current.clients.some((item) => item.id === client.id);
      return { ...current, clients: exists ? current.clients.map((item) => item.id === client.id ? client : item) : [client, ...current.clients] };
    });
  };

  const startSimulation = (clientId = activeClientId, propertyId = workspace.portfolio[0]?.id ?? "") => {
    const simulation = makeNewSimulation(clientId, propertyId);
    setActiveSimulation(simulation);
    setActiveClientId(clientId);
    setPage("simulador");
  };

  const addSimulationToComparison = (clientId: string, propertyId: string, comparisonGroupId?: string) => {
    const simulation = makeNewSimulation(clientId, propertyId, comparisonGroupId);
    setActiveSimulation(simulation);
    setActiveClientId(clientId);
    setPage("simulador");
  };

  const loadSimulation = (simulation: SimulationRecord) => {
    setActiveSimulation(simulation);
    setActiveClientId(simulation.clientId);
    setPage("simulador");
  };

  const saveSimulation = (simulation: SimulationRecord) => {
    setWorkspace((current) => {
      const exists = current.simulations.some((item) => item.id === simulation.id);
      return { ...current, simulations: exists ? current.simulations.map((item) => item.id === simulation.id ? simulation : item) : [simulation, ...current.simulations] };
    });
    setActiveSimulation(simulation);
  };

  const pageTitle = NAVIGATION.find((item) => item.id === page)?.title ?? "Dados e backup";
  const latestUpdate = useMemo(() => {
    const date = new Date();
    return new Intl.DateTimeFormat("pt-BR", { dateStyle: "medium" }).format(date);
  }, []);

  return (
    <div className="app-shell">
      <AppSidebar page={page} setPage={(next) => { setPage(next); setMobileNav(false); }} />
      {mobileNav && <div className="mobile-scrim" onClick={() => setMobileNav(false)}><AppSidebar page={page} setPage={(next) => { setPage(next); setMobileNav(false); }} onClose={() => setMobileNav(false)} compact /></div>}
      <main className="app-main">
        <header className="topbar">
          <div className="topbar-left"><button className="icon-button mobile-menu" aria-label="Abrir menu" onClick={() => setMobileNav(true)}><Menu size={20} /></button><span className="breadcrumb-root">Cury Fluxo</span><ChevronRight size={14} /><span>{pageTitle}</span></div>
          <div className="topbar-right"><span className="save-indicator"><span className={`save-dot ${saveState === "saving" ? "saving" : saveState === "error" ? "error" : ""}`} />{saveState === "saved" ? "Salvo no dispositivo" : saveState === "error" ? "Falha ao salvar · exporte backup" : "Salvando…"}</span><button className="icon-button theme-toggle" title={dark ? "Ativar tema claro" : "Ativar tema escuro"} aria-label={dark ? "Ativar tema claro" : "Ativar tema escuro"} onClick={() => setDark((current) => !current)}>{dark ? <Sun size={17} /> : <Moon size={17} />}</button><span className="topbar-date">{latestUpdate}</span></div>
        </header>
        <div className="main-content">
          {page === "inicio" && <Dashboard workspace={workspace} onNavigate={setPage} onNewSimulation={() => startSimulation()} onLoadSimulation={loadSimulation} />}
          {page === "simulador" && <SimulatorPage workspace={workspace} setWorkspace={setWorkspace} activeSimulation={activeSimulation} setActiveSimulation={setActiveSimulation} onSave={saveSimulation} onAddSimulation={addSimulationToComparison} onCreateClient={(client) => { updateClient(client); setActiveClientId(client.id); }} />}
          {page === "clientes" && <ClientsPage workspace={workspace} setWorkspace={setWorkspace} onSimulate={(clientId) => startSimulation(clientId)} />}
          {page === "catalogo" && <CatalogPage workspace={workspace} setWorkspace={setWorkspace} onSimulate={(propertyId) => startSimulation(activeClientId, propertyId)} />}
          {page === "importar" && <ImportPage workspace={workspace} setWorkspace={setWorkspace} />}
          {page === "recomendacoes" && <RecommendationsPage workspace={workspace} onLoadSimulation={loadSimulation} />}
          {page === "comparar" && <ComparePage workspace={workspace} onLoadSimulation={loadSimulation} />}
          {page === "configuracoes" && <SettingsPage workspace={workspace} setWorkspace={setWorkspace} />}
        </div>
        <footer className="app-footer"><span>CURY FLUXO <i>·</i> Ferramenta de apoio à simulação</span><span>Base de catálogo: referência fornecida em nov/2026</span></footer>
      </main>
    </div>
  );
}
