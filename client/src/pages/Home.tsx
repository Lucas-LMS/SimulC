import { lazy, Suspense, useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  AlertCircle,
  ArrowDownToLine,
  ArrowLeftRight,
  Calculator,
  Check,
  ChevronRight,
  CircleHelp,
  Cloud,
  FileSpreadsheet,
  Home as HomeIcon,
  Info,
  Landmark,
  LoaderCircle,
  Menu,
  Moon,
  RefreshCw,
  Settings2,
  ShieldCheck,
  Sun,
  UserRound,
  Users,
  WalletCards,
  X,
} from "lucide-react";
import type { BrokerProfile, ClientProfile, SimulationRecord, SimulationStatus, WorkspaceData } from "../lib/models";
import {
  consumeLoadRecoveryWarning,
  downloadBackup,
  loadWorkspace,
  parseBackupFile,
  sanitizeWorkspace,
  saveWorkspace,
} from "../lib/storage";
import { duplicateSimulationRecord, makeNewSimulation } from "../lib/simulations";
import Dashboard from "../components/Dashboard";
import { listAutomaticBackups, saveAutomaticBackup, type AutomaticBackup } from "../lib/fileStore";
import type { User } from "firebase/auth";

const SimulatorPage = lazy(() => import("../components/SimulatorPage"));
const ClientsPage = lazy(() => import("../components/ClientsPage"));
const CatalogPage = lazy(() => import("../components/CatalogPage"));
const ImportPage = lazy(() => import("../components/ImportPage"));
const ComparePage = lazy(() => import("../components/ComparePage"));
const RecommendationsPage = lazy(() => import("../components/RecommendationsPage"));

export type PageKey =
  | "inicio"
  | "simulador"
  | "clientes"
  | "catalogo"
  | "importar"
  | "comparar"
  | "recomendacoes"
  | "configuracoes";

export interface AppToast {
  kind: "success" | "error" | "info";
  text: string;
}

const VALID_PAGES = new Set<PageKey>([
  "inicio",
  "simulador",
  "clientes",
  "catalogo",
  "importar",
  "comparar",
  "recomendacoes",
  "configuracoes",
]);

const CLOUD_CHOICE_KEY = "cury-cloud-first-choice-v1";
const CLOUD_EVER_CONNECTED_KEY = "cury-cloud-enabled-v1";
const AUTO_BACKUP_INTERVAL_MS = 5 * 60 * 1000;

const NAVIGATION = [
  { id: "inicio" as const, title: "Visão geral", icon: HomeIcon },
  { id: "simulador" as const, title: "Simular fluxo", icon: Calculator },
  { id: "clientes" as const, title: "Clientes", icon: Users },
  { id: "catalogo" as const, title: "Empreendimentos", icon: Landmark },
  { id: "importar" as const, title: "Importar tabela", icon: FileSpreadsheet },
  { id: "recomendacoes" as const, title: "Recomendações", icon: WalletCards },
  { id: "comparar" as const, title: "Comparar simulações", icon: ArrowLeftRight },
];

const readPageFromHash = (): PageKey => {
  const hash = window.location.hash.replace(/^#\/?/, "") as PageKey;
  return VALID_PAGES.has(hash) ? hash : "inicio";
};

const brokerInitials = (name: string): string => {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (!parts.length) return "CF";
  if (parts.length === 1) return parts[0].slice(0, 2).toLocaleUpperCase("pt-BR");
  return `${parts[0][0]}${parts[parts.length - 1][0]}`.toLocaleUpperCase("pt-BR");
};

function Logo() {
  return (
    <div className="brand-lockup" aria-label="Cury Fluxo">
      <span className="brand-symbol" aria-hidden="true">
        <span />
        <i />
      </span>
      <span className="brand-wordmark">
        CURY<span>FLUXO</span>
        <small>MESA DE SIMULAÇÃO</small>
      </span>
    </div>
  );
}

function AppSidebar({
  page,
  setPage,
  compact,
  onClose,
  cloudUser,
  brokerProfile,
  counts,
}: {
  page: PageKey;
  setPage: (page: PageKey) => void;
  compact?: boolean;
  onClose?: () => void;
  cloudUser: User | null;
  brokerProfile?: BrokerProfile;
  counts?: Partial<Record<PageKey, number>>;
}) {
  const brokerName = brokerProfile?.name?.trim() || "Lucas Silva";
  const brokerSubtitle = brokerProfile?.creci?.trim() || "Consultoria imobiliária";

  return (
    <aside
      className={`app-sidebar ${compact ? "compact" : ""}`}
      onClick={(event) => event.stopPropagation()}
    >
      <div className="sidebar-top">
        <Logo />
        <button className="icon-button sidebar-close" aria-label="Fechar menu" onClick={onClose}>
          <X size={18} />
        </button>
      </div>
      <div className="sidebar-caption">ESPAÇO DE TRABALHO</div>
      <nav className="sidebar-nav" aria-label="Navegação principal">
        {NAVIGATION.map(({ id, title, icon: Icon }) => {
          const badge = counts?.[id];
          return (
            <button
              key={id}
              className={`nav-item ${page === id ? "active" : ""}`}
              aria-current={page === id ? "page" : undefined}
              onClick={() => setPage(id)}
            >
              <Icon size={18} strokeWidth={1.8} />
              <span>{title}</span>
              {badge !== undefined && badge > 0 && <span className="nav-badge">{badge}</span>}
              {page === id && <span className="nav-current" />}
            </button>
          );
        })}
      </nav>
      <div className="sidebar-bottom">
        <div className="local-status">
          <ShieldCheck size={16} />
          <span>{cloudUser ? `Conta Google: ${cloudUser.email ?? "conectada"}` : "Dados salvos neste dispositivo"}</span>
        </div>
        <button
          className={`nav-item ${page === "configuracoes" ? "active" : ""}`}
          aria-current={page === "configuracoes" ? "page" : undefined}
          onClick={() => setPage("configuracoes")}
        >
          <Settings2 size={18} />
          <span>Dados e backup</span>
        </button>
        <button
          type="button"
          className="consultant-card consultant-card-button"
          title="Editar perfil do corretor em Dados e backup"
          onClick={() => setPage("configuracoes")}
        >
          <div className="consultant-avatar">{brokerInitials(brokerName)}</div>
          <div>
            <strong>{brokerName}</strong>
            <small>{brokerSubtitle}</small>
          </div>
          <span className="online-dot" />
        </button>
      </div>
    </aside>
  );
}

function SettingsPage({
  workspace,
  setWorkspace,
  onReplaceWorkspace,
  cloudUser,
  cloudStatus,
  cloudError,
  firebaseConfigured,
  onLogin,
  onLogout,
  onNotify,
}: {
  workspace: WorkspaceData;
  setWorkspace: React.Dispatch<React.SetStateAction<WorkspaceData>>;
  onReplaceWorkspace: (incoming: WorkspaceData) => void;
  cloudUser: User | null;
  cloudStatus: "off" | "loading" | "syncing" | "synced" | "error";
  cloudError: string;
  firebaseConfigured: boolean;
  onLogin: () => void;
  onLogout: () => void;
  onNotify: (toast: AppToast) => void;
}) {
  const [restoreBusy, setRestoreBusy] = useState(false);
  const [backups, setBackups] = useState<AutomaticBackup[]>([]);
  const inputRef = useRef<HTMLInputElement>(null);

  const [brokerName, setBrokerName] = useState(workspace.brokerProfile?.name ?? "Lucas Silva");
  const [brokerCreci, setBrokerCreci] = useState(workspace.brokerProfile?.creci ?? "");
  const [brokerPhone, setBrokerPhone] = useState(workspace.brokerProfile?.phone ?? "");

  useEffect(() => {
    void listAutomaticBackups()
      .then(setBackups)
      .catch(() => setBackups([]));
  }, []);

  const saveBrokerProfile = () => {
    const cleanName = brokerName.trim() || "Lucas Silva";
    setWorkspace((current) => ({
      ...current,
      brokerProfile: {
        name: cleanName,
        creci: brokerCreci.trim() || undefined,
        phone: brokerPhone.trim() || undefined,
      },
    }));
    onNotify({ kind: "success", text: "Perfil do corretor atualizado para WhatsApp e propostas." });
  };

  const restoreAutomatic = (backup: AutomaticBackup) => {
    try {
      const incoming = sanitizeWorkspace(JSON.parse(backup.workspaceJson));
      if (
        !window.confirm(
          `Restaurar cópia automática de ${new Date(backup.createdAt).toLocaleString("pt-BR")} e substituir os dados atuais?`,
        )
      ) {
        return;
      }
      onReplaceWorkspace(incoming);
      onNotify({ kind: "success", text: "Cópia automática restaurada neste navegador." });
    } catch {
      onNotify({ kind: "error", text: "Não foi possível restaurar esta cópia automática." });
    }
  };

  const restore = async (file: File | undefined) => {
    if (!file) return;
    setRestoreBusy(true);
    try {
      const incoming = await parseBackupFile(file);
      const proceed = window.confirm(
        `Este backup tem ${incoming.clients.length} clientes, ${incoming.portfolio.length} unidades e ${incoming.simulations.length} simulações. Substituir os dados atuais deste navegador?`,
      );
      if (!proceed) return;
      onReplaceWorkspace(incoming);
      onNotify({ kind: "success", text: "Backup JSON restaurado com sucesso." });
    } catch (error) {
      onNotify({
        kind: "error",
        text: error instanceof Error ? error.message : "Não foi possível ler o backup.",
      });
    } finally {
      setRestoreBusy(false);
      if (inputRef.current) inputRef.current.value = "";
    }
  };

  return (
    <div className="page-stack settings-page">
      <div className="page-heading">
        <div>
          <div className="eyebrow">PREFERÊNCIAS E PORTABILIDADE</div>
          <h1>Seus dados, sob seu controle.</h1>
          <p>
            {cloudUser
              ? "Seu espaço de trabalho está associado à sua conta Google e protegido por regras individuais de acesso."
              : "Personalize sua assinatura, exporte backups JSON ou conecte sua conta Google para sincronizar entre dispositivos."}
          </p>
        </div>
      </div>

      <section className="panel settings-panel settings-broker-panel">
        <div className="settings-icon">
          <UserRound size={20} />
        </div>
        <div className="settings-copy">
          <h2>Perfil do corretor (assinatura)</h2>
          <p>Usado nas mensagens de WhatsApp, na barra lateral e no cabeçalho de impressão/PDF das propostas.</p>
          <div className="form-grid broker-profile-grid">
            <label className="form-field">
              <span>Nome completo</span>
              <input
                value={brokerName}
                onChange={(event) => setBrokerName(event.target.value)}
                placeholder="Ex.: Lucas Silva"
              />
            </label>
            <label className="form-field">
              <span>CRECI (opcional)</span>
              <input
                value={brokerCreci}
                onChange={(event) => setBrokerCreci(event.target.value)}
                placeholder="Ex.: CRECI-RJ 00000"
              />
            </label>
            <label className="form-field">
              <span>Telefone / WhatsApp (opcional)</span>
              <input
                type="tel"
                value={brokerPhone}
                onChange={(event) => setBrokerPhone(event.target.value)}
                placeholder="(21) 99999-0000"
              />
            </label>
          </div>
          <div className="broker-profile-actions">
            <button type="button" className="button button-primary button-small" onClick={saveBrokerProfile}>
              <Check size={14} /> Salvar perfil do corretor
            </button>
          </div>
        </div>
      </section>

      <section className="panel settings-panel">
        <div className="settings-icon">
          <Cloud size={20} />
        </div>
        <div className="settings-copy">
          <h2>Sincronização privada entre dispositivos</h2>
          <p>
            Guarde uma cópia privada na sua conta Google para continuar o trabalho em outro computador ou celular.
            Somente a sua conta autenticada tem acesso.
          </p>
          <span className="privacy-note">
            {!firebaseConfigured
              ? "Aguardando configuração do Firebase do projeto."
              : cloudUser
                ? `Conectado como ${cloudUser.email ?? "conta Google"} · ${
                    cloudStatus === "synced"
                      ? "sincronizado"
                      : cloudStatus === "error"
                        ? "erro de sincronização"
                        : cloudStatus === "loading"
                          ? "carregando dados…"
                          : cloudStatus === "syncing"
                            ? "sincronizando…"
                            : "pronto"
                  }`
                : "Entre com Google para ativar a sincronização privada."}
          </span>
          {cloudError && <div className="inline-status error-status">{cloudError}</div>}
        </div>
        {cloudUser ? (
          <button className="button button-quiet" onClick={onLogout}>
            Sair da conta
          </button>
        ) : (
          <button
            className="button button-primary"
            disabled={!firebaseConfigured}
            title={!firebaseConfigured ? "Configure o Firebase para habilitar esta opção" : "Entrar com Google"}
            onClick={onLogin}
          >
            <Cloud size={16} /> Conectar Google
          </button>
        )}
      </section>

      <section className="panel settings-panel">
        <div className="settings-icon">
          <ShieldCheck size={20} />
        </div>
        <div className="settings-copy">
          <h2>Armazenamento local</h2>
          <p>
            Clientes, unidades, simulações e rascunhos importados ficam salvos neste dispositivo. Limpar os dados do
            navegador pode removê-los.
          </p>
          <span className="privacy-note">Funciona 100% offline sem precisar de conta conectada.</span>
        </div>
      </section>

      <section className="panel settings-panel">
        <div className="settings-icon amber">
          <ArrowDownToLine size={20} />
        </div>
        <div className="settings-copy">
          <h2>Exportar um backup</h2>
          <p>Salve um arquivo JSON com clientes, catálogo, simulações, perfil e textos extraídos.</p>
          <p className="small-note">PDFs e imagens originais não entram no JSON; guarde-os separadamente.</p>
        </div>
        <button
          className="button button-primary"
          onClick={() => {
            downloadBackup(workspace);
            onNotify({ kind: "success", text: "Backup JSON baixado." });
          }}
        >
          <ArrowDownToLine size={16} /> Exportar backup
        </button>
      </section>

      <section className="panel settings-panel">
        <div className="settings-icon">
          <RefreshCw size={20} />
        </div>
        <div className="settings-copy">
          <h2>Cópias automáticas neste navegador</h2>
          <p>
            Até 10 pontos de restauração automáticos são guardados localmente para recuperação rápida em caso de
            alteração acidental. Para segurança definitiva entre aparelhos, use o backup JSON ou a conta Google.
          </p>
          {backups.length === 0 ? (
            <small>Nenhuma cópia automática registrada ainda.</small>
          ) : (
            backups.map((backup) => (
              <div className="backup-row" key={backup.key}>
                <span>{new Date(backup.createdAt).toLocaleString("pt-BR")}</span>
                <button className="text-button" onClick={() => restoreAutomatic(backup)}>
                  Restaurar
                </button>
              </div>
            ))
          )}
        </div>
      </section>

      <section className="panel settings-panel">
        <div className="settings-icon">
          <RefreshCw size={20} />
        </div>
        <div className="settings-copy">
          <h2>Restaurar um backup</h2>
          <p>Importar um arquivo JSON substitui os dados atuais deste navegador após sua confirmação.</p>
        </div>
        <input
          ref={inputRef}
          type="file"
          accept="application/json,.json"
          hidden
          onChange={(event) => void restore(event.target.files?.[0])}
        />
        <button className="button button-quiet" disabled={restoreBusy} onClick={() => inputRef.current?.click()}>
          {restoreBusy ? "Lendo…" : "Escolher backup"}
        </button>
      </section>

      <section className="reference-alert">
        <CircleHelp size={18} />
        <div>
          <strong>Sobre a base Cury</strong>
          <p>
            O catálogo inicial está marcado como referência de nov/2026. Confirme preço, unidade, tabela e entrega no
            espelho oficial antes de usar com o cliente. Este aplicativo não consulta disponibilidade ao vivo nem
            substitui contrato ou aprovação.
          </p>
        </div>
      </section>
    </div>
  );
}

export default function Home() {
  const [workspace, setWorkspace] = useState<WorkspaceData>(() => loadWorkspace());
  const [page, setPageState] = useState<PageKey>(() => readPageFromHash());
  const [activeClientId, setActiveClientId] = useState("");
  const [activeSimulation, setActiveSimulation] = useState<SimulationRecord | null>(null);
  const [mobileNav, setMobileNav] = useState(false);
  const [saveState, setSaveState] = useState<"saved" | "saving" | "error">("saved");
  const [dark, setDark] = useState(() => window.localStorage.getItem("cury-fluxo-theme") === "dark");
  const [cloudUser, setCloudUser] = useState<User | null>(null);
  const [cloudReady, setCloudReady] = useState(false);
  const [cloudWatchEnabled, setCloudWatchEnabled] = useState(
    () => window.localStorage.getItem(CLOUD_EVER_CONNECTED_KEY) === "1",
  );
  const [firebaseConfigured, setFirebaseConfigured] = useState(true);
  const [cloudStatus, setCloudStatus] = useState<"off" | "loading" | "syncing" | "synced" | "error">("off");
  const [cloudError, setCloudError] = useState("");
  const [toast, setToast] = useState<AppToast | null>(null);
  const toastTimerRef = useRef<number | null>(null);
  const lastAutoBackupRef = useRef<number>(0);
  const workspaceRef = useRef(workspace);
  workspaceRef.current = workspace;

  const notify = useCallback((next: AppToast) => {
    setToast(next);
    if (toastTimerRef.current !== null) window.clearTimeout(toastTimerRef.current);
    toastTimerRef.current = window.setTimeout(() => {
      setToast(null);
      toastTimerRef.current = null;
    }, next.kind === "error" ? 6000 : 3500);
  }, []);

  useEffect(() => {
    const recoveryWarning = consumeLoadRecoveryWarning();
    if (recoveryWarning) notify({ kind: "error", text: recoveryWarning });
    return () => {
      if (toastTimerRef.current !== null) window.clearTimeout(toastTimerRef.current);
    };
  }, [notify]);

  const setPage = useCallback((next: PageKey) => {
    setPageState(next);
    const targetHash = `#${next}`;
    if (window.location.hash !== targetHash) {
      window.history.pushState(null, "", targetHash);
    }
    if (next === "configuracoes") setCloudWatchEnabled(true);
  }, []);

  useEffect(() => {
    const onHashChange = () => setPageState(readPageFromHash());
    window.addEventListener("hashchange", onHashChange);
    return () => window.removeEventListener("hashchange", onHashChange);
  }, []);

  useEffect(() => {
    if (!mobileNav) return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") setMobileNav(false);
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [mobileNav]);

  const replaceWorkspaceCleanly = useCallback((incoming: WorkspaceData) => {
    setWorkspace(incoming);
    setActiveClientId("");
    setActiveSimulation(null);
  }, []);

  useEffect(() => {
    if (!cloudWatchEnabled) return;
    let active = true;
    let unsubscribe: (() => void) | undefined;
    let readyTimer: number | null = null;
    void import("../lib/firebase")
      .then((firebase) => {
        if (!active) return;
        setFirebaseConfigured(firebase.firebaseConfigured);
        unsubscribe = firebase.watchCloudAuth((user) => {
          if (!active) return;
          setCloudUser(user);
          setCloudError("");
          if (!user) {
            setCloudReady(false);
            setCloudStatus("off");
            return;
          }
          window.localStorage.setItem(CLOUD_EVER_CONNECTED_KEY, "1");
          setCloudReady(false);
          setCloudStatus("loading");
          void firebase
            .readCloudWorkspace(user.uid)
            .then(async (remote) => {
              if (!active) return;
              const local = workspaceRef.current;
              const hasLocalData =
                local.clients.length > 0 || local.simulations.length > 0 || local.documents.length > 0;
              const choiceKey = `${CLOUD_CHOICE_KEY}:${user.uid}`;
              const hasChosenCloudSource = window.localStorage.getItem(choiceKey) === "done";
              if (remote) {
                if (
                  hasChosenCloudSource ||
                  !hasLocalData ||
                  window.confirm(
                    "Encontramos dados nesta conta Google. Carregar a nuvem e substituir o espaço de trabalho local?",
                  )
                ) {
                  replaceWorkspaceCleanly(remote);
                  readyTimer = window.setTimeout(() => {
                    if (active) setCloudReady(true);
                  }, 250);
                  setCloudStatus("synced");
                  window.localStorage.setItem(choiceKey, "done");
                } else if (
                  window.confirm(
                    "Enviar os dados locais para esta conta Google e substituir os dados que já estão na nuvem?",
                  )
                ) {
                  setCloudReady(true);
                  setCloudStatus("syncing");
                  window.localStorage.setItem(choiceKey, "done");
                } else {
                  setCloudReady(false);
                  setCloudStatus("off");
                  await firebase.logoutCloud();
                }
              } else if (
                hasLocalData &&
                !hasChosenCloudSource &&
                !window.confirm(
                  "Esta conta ainda não tem dados. Enviar o espaço de trabalho deste navegador para a nuvem privada?",
                )
              ) {
                setCloudReady(false);
                setCloudStatus("off");
                await firebase.logoutCloud();
              } else {
                setCloudReady(true);
                setCloudStatus("synced");
                window.localStorage.setItem(choiceKey, "done");
              }
            })
            .catch((error) => {
              if (!active) return;
              console.error("Falha ao carregar dados da nuvem", error);
              const msg = error instanceof Error ? error.message : "Falha ao carregar dados da nuvem.";
              setCloudError(msg);
              setCloudStatus("error");
            });
        });
      })
      .catch((error) => {
        if (!active) return;
        console.error("Firebase indisponível; o app continuará no armazenamento local.", error);
        setCloudStatus("error");
      });
    return () => {
      active = false;
      if (readyTimer !== null) window.clearTimeout(readyTimer);
      unsubscribe?.();
    };
  }, [cloudWatchEnabled, replaceWorkspaceCleanly]);

  useEffect(() => {
    if (!cloudUser || !cloudReady) return;
    let active = true;
    setCloudStatus("syncing");
    const timer = window.setTimeout(() => {
      void import("../lib/firebase")
        .then((firebase) => firebase.writeCloudWorkspace(cloudUser.uid, workspace))
        .then(() => {
          if (!active) return;
          setCloudError("");
          setCloudStatus("synced");
        })
        .catch((error) => {
          if (!active) return;
          console.error("Falha ao sincronizar dados", error);
          const msg = error instanceof Error ? error.message : "Erro ao sincronizar com a nuvem.";
          setCloudError(msg);
          setCloudStatus("error");
          notify({ kind: "error", text: msg });
        });
    }, 900);
    return () => {
      active = false;
      window.clearTimeout(timer);
    };
  }, [workspace, cloudUser, cloudReady, notify]);

  useEffect(() => {
    document.documentElement.dataset.theme = dark ? "dark" : "light";
    window.localStorage.setItem("cury-fluxo-theme", dark ? "dark" : "light");
  }, [dark]);

  useEffect(() => {
    setSaveState("saving");
    const timer = window.setTimeout(() => {
      const saved = saveWorkspace(workspace);
      setSaveState(saved ? "saved" : "error");
      const now = Date.now();
      if (saved && now - lastAutoBackupRef.current >= AUTO_BACKUP_INTERVAL_MS) {
        lastAutoBackupRef.current = now;
        void saveAutomaticBackup(JSON.stringify(workspace)).catch((error) =>
          console.warn("Snapshot automático indisponível", error),
        );
      }
    }, 180);
    return () => window.clearTimeout(timer);
  }, [workspace]);

  const updateClient = (client: ClientProfile) => {
    setWorkspace((current) => {
      const exists = current.clients.some((item) => item.id === client.id);
      return {
        ...current,
        clients: exists ? current.clients.map((item) => (item.id === client.id ? client : item)) : [client, ...current.clients],
      };
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
      return {
        ...current,
        simulations: exists
          ? current.simulations.map((item) => (item.id === simulation.id ? simulation : item))
          : [simulation, ...current.simulations],
      };
    });
    setActiveSimulation(simulation);
    setActiveClientId(simulation.clientId);
  };

  const duplicateSimulation = (simulation: SimulationRecord) => {
    const copy = duplicateSimulationRecord(simulation);
    setWorkspace((current) => ({ ...current, simulations: [copy, ...current.simulations] }));
    setActiveSimulation(copy);
    setActiveClientId(copy.clientId);
    setPage("simulador");
    notify({ kind: "success", text: "Simulação duplicada como novo cenário." });
  };

  const deleteSimulation = (simulationId: string) => {
    setWorkspace((current) => ({
      ...current,
      simulations: current.simulations.filter((item) => item.id !== simulationId),
    }));
    if (activeSimulation?.id === simulationId) setActiveSimulation(null);
    notify({ kind: "info", text: "Simulação excluída." });
  };

  const updateSimulationStatus = (simulationId: string, status: SimulationStatus) => {
    setWorkspace((current) => ({
      ...current,
      simulations: current.simulations.map((item) =>
        item.id === simulationId ? { ...item, status, updatedAt: new Date().toISOString() } : item,
      ),
    }));
    if (activeSimulation?.id === simulationId) {
      setActiveSimulation((current) => (current ? { ...current, status } : current));
    }
  };

  const sidebarCounts = useMemo(
    () => ({
      clientes: workspace.clients.length,
      catalogo: workspace.portfolio.filter((u) => u.active !== false).length,
      comparar: workspace.simulations.filter((s) => s.origin !== "lead_recommendation").length,
    }),
    [workspace.clients.length, workspace.portfolio, workspace.simulations],
  );

  const connectGoogle = () => {
    setCloudWatchEnabled(true);
    void import("../lib/firebase")
      .then((firebase) => firebase.loginWithGoogle())
      .catch((error) =>
        notify({
          kind: "error",
          text: error instanceof Error ? error.message : "Não foi possível entrar com Google.",
        }),
      );
  };

  const disconnectGoogle = () => {
    void import("../lib/firebase").then((firebase) => firebase.logoutCloud());
    window.localStorage.removeItem(CLOUD_EVER_CONNECTED_KEY);
    notify({ kind: "info", text: "Conta Google desconectada. Os dados locais continuam neste navegador." });
  };

  const pageTitle = NAVIGATION.find((item) => item.id === page)?.title ?? "Dados e backup";
  const latestUpdate = useMemo(() => {
    const date = new Date();
    return new Intl.DateTimeFormat("pt-BR", { dateStyle: "medium" }).format(date);
  }, []);

  return (
    <div className="app-shell">
      <AppSidebar
        page={page}
        cloudUser={cloudUser}
        brokerProfile={workspace.brokerProfile}
        counts={sidebarCounts}
        setPage={(next) => {
          setPage(next);
          setMobileNav(false);
        }}
      />
      {mobileNav && (
        <div className="mobile-scrim" onClick={() => setMobileNav(false)}>
          <AppSidebar
            page={page}
            cloudUser={cloudUser}
            brokerProfile={workspace.brokerProfile}
            counts={sidebarCounts}
            setPage={(next) => {
              setPage(next);
              setMobileNav(false);
            }}
            onClose={() => setMobileNav(false)}
            compact
          />
        </div>
      )}
      <main className="app-main">
        <header className="topbar">
          <div className="topbar-left">
            <button className="icon-button mobile-menu" aria-label="Abrir menu" onClick={() => setMobileNav(true)}>
              <Menu size={20} />
            </button>
            <span className="breadcrumb-root">Cury Fluxo</span>
            <ChevronRight size={14} />
            <span>{pageTitle}</span>
          </div>
          <div className="topbar-right">
            <span className="save-indicator">
              <span
                className={`save-dot ${
                  saveState === "saving" || cloudStatus === "syncing"
                    ? "saving"
                    : saveState === "error" || cloudStatus === "error"
                      ? "error"
                      : ""
                }`}
              />
              {cloudUser
                ? cloudStatus === "synced"
                  ? "Sincronizado na nuvem"
                  : cloudStatus === "error"
                    ? "Erro na nuvem · backup local"
                    : cloudStatus === "loading"
                      ? "Carregando nuvem…"
                      : "Sincronizando…"
                : "Salvo no dispositivo"}
            </span>
            <button
              className="icon-button theme-toggle"
              title={dark ? "Ativar tema claro" : "Ativar tema escuro"}
              aria-label={dark ? "Ativar tema claro" : "Ativar tema escuro"}
              onClick={() => setDark((current) => !current)}
            >
              {dark ? <Sun size={17} /> : <Moon size={17} />}
            </button>
            <span className="topbar-date">{latestUpdate}</span>
          </div>
        </header>

        <div className="main-content">
          <Suspense
            fallback={
              <div className="panel page-loading-fallback">
                <LoaderCircle size={20} className="spin" />
                <span>Carregando tela…</span>
              </div>
            }
          >
            {page === "inicio" && (
              <Dashboard
                workspace={workspace}
                onNavigate={setPage}
                onNewSimulation={() => startSimulation()}
                onLoadSimulation={loadSimulation}
                onDuplicateSimulation={duplicateSimulation}
                onDeleteSimulation={deleteSimulation}
                onUpdateSimulationStatus={updateSimulationStatus}
              />
            )}
            {page === "simulador" && (
              <SimulatorPage
                workspace={workspace}
                setWorkspace={setWorkspace}
                activeSimulation={activeSimulation}
                setActiveSimulation={setActiveSimulation}
                onSave={saveSimulation}
                onDuplicate={duplicateSimulation}
                onDelete={deleteSimulation}
                onClientSelected={setActiveClientId}
                onAddSimulation={addSimulationToComparison}
                onCreateClient={(client) => {
                  updateClient(client);
                  setActiveClientId(client.id);
                }}
                onNotify={notify}
              />
            )}
            {page === "clientes" && (
              <ClientsPage
                workspace={workspace}
                setWorkspace={setWorkspace}
                onSimulate={(clientId) => startSimulation(clientId)}
                onLoadSimulation={loadSimulation}
                onNotify={notify}
              />
            )}
            {page === "catalogo" && (
              <CatalogPage
                workspace={workspace}
                setWorkspace={setWorkspace}
                onSimulate={(propertyId) => startSimulation(activeClientId, propertyId)}
                onNotify={notify}
              />
            )}
            {page === "importar" && <ImportPage workspace={workspace} setWorkspace={setWorkspace} />}
            {page === "recomendacoes" && (
              <RecommendationsPage workspace={workspace} onLoadSimulation={loadSimulation} />
            )}
            {page === "comparar" && (
              <ComparePage
                workspace={workspace}
                onLoadSimulation={loadSimulation}
                onNotify={notify}
              />
            )}
            {page === "configuracoes" && (
              <SettingsPage
                workspace={workspace}
                setWorkspace={setWorkspace}
                onReplaceWorkspace={replaceWorkspaceCleanly}
                cloudUser={cloudUser}
                cloudStatus={cloudStatus}
                cloudError={cloudError}
                firebaseConfigured={firebaseConfigured}
                onLogin={connectGoogle}
                onLogout={disconnectGoogle}
                onNotify={notify}
              />
            )}
          </Suspense>
        </div>

        <footer className="app-footer">
          <span>
            CURY FLUXO <i>·</i> Ferramenta de apoio à simulação
          </span>
          <span>Base de catálogo: referência fornecida em nov/2026</span>
        </footer>
      </main>

      {toast && (
        <div
          className={`app-toast app-toast-${toast.kind}`}
          role="status"
          aria-live="polite"
        >
          {toast.kind === "error" ? (
            <AlertCircle size={16} />
          ) : toast.kind === "info" ? (
            <Info size={16} />
          ) : (
            <Check size={16} />
          )}
          <span>{toast.text}</span>
          <button
            type="button"
            className="icon-button"
            aria-label="Fechar notificação"
            onClick={() => setToast(null)}
          >
            <X size={14} />
          </button>
        </div>
      )}
    </div>
  );
}
