import type { WorkspaceData } from "./models";
import { initialPortfolio } from "../data/portfolio";

const STORAGE_KEY = "cury-fluxo-workspace-v1";
const EXPORT_KIND = "cury-fluxo-backup";
const EXPORT_VERSION = 1;

export const emptyWorkspace = (): WorkspaceData => ({
  clients: [],
  portfolio: [...initialPortfolio],
  simulations: [],
  documents: [],
});

export const loadWorkspace = (): WorkspaceData => {
  if (typeof window === "undefined") return emptyWorkspace();
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return emptyWorkspace();
    const parsed = JSON.parse(raw) as Partial<WorkspaceData>;
    return {
      clients: Array.isArray(parsed.clients) ? parsed.clients : [],
      portfolio: Array.isArray(parsed.portfolio) && parsed.portfolio.length ? parsed.portfolio : [...initialPortfolio],
      simulations: Array.isArray(parsed.simulations) ? parsed.simulations : [],
      documents: Array.isArray(parsed.documents) ? parsed.documents : [],
    };
  } catch {
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
  URL.revokeObjectURL(url);
};

export const parseBackupFile = async (file: File): Promise<WorkspaceData> => {
  const content = JSON.parse(await file.text()) as {
    kind?: string;
    version?: number;
    workspace?: Partial<WorkspaceData>;
  };
  if (content.kind !== EXPORT_KIND || content.version !== EXPORT_VERSION || !content.workspace) {
    throw new Error("Este arquivo não parece ser um backup válido do Cury Fluxo.");
  }
  const value = content.workspace;
  if (!Array.isArray(value.clients) || !Array.isArray(value.portfolio) || !Array.isArray(value.simulations) || !Array.isArray(value.documents)) {
    throw new Error("Backup incompleto: confira os dados antes de restaurar.");
  }
  return value as WorkspaceData;
};
