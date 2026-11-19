import type { BrokerProfile, ClientProfile, ImportedDocument, SimulationRecord, WorkspaceData } from "./models";
import { initialPortfolio, type PortfolioUnit } from "../data/portfolio";

const STORAGE_KEY = "cury-fluxo-workspace-v1";
const CORRUPTED_KEY_PREFIX = "cury-fluxo-workspace-corrupted-";
const EXPORT_KIND = "cury-fluxo-backup";
const EXPORT_VERSION = 1;

export const emptyWorkspace = (): WorkspaceData => ({
  clients: [],
  portfolio: [...initialPortfolio],
  simulations: [],
  documents: [],
});

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null && !Array.isArray(value);

const isValidClient = (value: unknown): value is ClientProfile =>
  isRecord(value) && typeof value.id === "string" && typeof value.name === "string";

const isValidUnit = (value: unknown): value is PortfolioUnit =>
  isRecord(value) && typeof value.id === "string" && typeof value.project === "string";

const isValidSimulation = (value: unknown): value is SimulationRecord =>
  isRecord(value) &&
  typeof value.id === "string" &&
  isRecord(value.actDate) &&
  typeof value.actDate.year === "number" &&
  typeof value.actDate.month === "number";

const isValidDocument = (value: unknown): value is ImportedDocument =>
  isRecord(value) && typeof value.id === "string" && typeof value.name === "string";

const sanitizeBrokerProfile = (value: unknown): BrokerProfile | undefined => {
  if (!isRecord(value) || typeof value.name !== "string") return undefined;
  return {
    name: value.name,
    phone: typeof value.phone === "string" ? value.phone : undefined,
    creci: typeof value.creci === "string" ? value.creci : undefined,
  };
};

/** Valida e higieniza um objeto parcial de WorkspaceData, descartando itens corrompidos. */
export const sanitizeWorkspace = (value: unknown): WorkspaceData => {
  if (!isRecord(value)) return emptyWorkspace();
  const clients = Array.isArray(value.clients) ? value.clients.filter(isValidClient) : [];
  const rawPortfolio = Array.isArray(value.portfolio) ? value.portfolio.filter(isValidUnit) : [];
  const simulations = Array.isArray(value.simulations) ? value.simulations.filter(isValidSimulation) : [];
  const documents = Array.isArray(value.documents) ? value.documents.filter(isValidDocument) : [];
  const brokerProfile = sanitizeBrokerProfile(value.brokerProfile);
  return {
    clients,
    portfolio: rawPortfolio.length ? rawPortfolio : [...initialPortfolio],
    simulations,
    documents,
    ...(brokerProfile ? { brokerProfile } : {}),
  };
};

let lastLoadRecoveryWarning = "";
export const consumeLoadRecoveryWarning = (): string => {
  const warning = lastLoadRecoveryWarning;
  lastLoadRecoveryWarning = "";
  return warning;
};

export const loadWorkspace = (): WorkspaceData => {
  if (typeof window === "undefined") return emptyWorkspace();
  const raw = window.localStorage.getItem(STORAGE_KEY);
  if (!raw) return emptyWorkspace();
  try {
    const parsed: unknown = JSON.parse(raw);
    return sanitizeWorkspace(parsed);
  } catch (error) {
    console.error("Dados locais corrompidos ao carregar workspace; preservando cópia em quarentena.", error);
    try {
      window.localStorage.setItem(`${CORRUPTED_KEY_PREFIX}${Date.now()}`, raw);
    } catch {
      // Sem espaço para quarentena; segue com fallback seguro.
    }
    lastLoadRecoveryWarning =
      "Os dados locais estavam corrompidos e foram preservados em quarentena no navegador. Restaure um backup JSON ou automático em Dados e backup.";
    return emptyWorkspace();
  }
};

export const saveWorkspace = (workspace: WorkspaceData): boolean => {
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(workspace));
    return true;
  } catch (error) {
    console.error("Não foi possível salvar o espaço de trabalho local.", error);
    return false;
  }
};

export const createId = (prefix: string): string => {
  const uuid = globalThis.crypto?.randomUUID?.() ?? `${Date.now()}-${Math.random().toString(16).slice(2)}`;
  return `${prefix}-${uuid}`;
};

export const downloadBackup = (workspace: WorkspaceData): void => {
  const backup = {
    kind: EXPORT_KIND,
    version: EXPORT_VERSION,
    exportedAt: new Date().toISOString(),
    note: "Backup local Cury Fluxo. Arquivos binários originais não são incluídos; mantenha os originais separados.",
    workspace,
  };
  const blob = new Blob([JSON.stringify(backup, null, 2)], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = `cury-fluxo-backup-${new Date().toISOString().slice(0, 10)}.json`;
  anchor.click();
  window.setTimeout(() => URL.revokeObjectURL(url), 10_000);
};

export const parseBackupFile = async (file: File): Promise<WorkspaceData> => {
  let content: unknown;
  try {
    content = JSON.parse(await file.text());
  } catch {
    throw new Error("O arquivo selecionado não é um JSON válido.");
  }
  if (!isRecord(content) || content.kind !== EXPORT_KIND || content.version !== EXPORT_VERSION || !isRecord(content.workspace)) {
    throw new Error("Este arquivo não parece ser um backup válido do Cury Fluxo.");
  }
  const value = content.workspace;
  if (
    !Array.isArray(value.clients) ||
    !Array.isArray(value.portfolio) ||
    !Array.isArray(value.simulations) ||
    !Array.isArray(value.documents)
  ) {
    throw new Error("Backup incompleto: confira os dados antes de restaurar.");
  }
  return sanitizeWorkspace(value);
};
