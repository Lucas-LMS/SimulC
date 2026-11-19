const DB_NAME = "cury-fluxo-files";
const STORE_NAME = "originals";
const BACKUP_STORE = "automatic-backups";
const MAX_BACKUPS = 10;

const openDB = (): Promise<IDBDatabase> =>
  new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, 2);
    request.onupgradeneeded = () => {
      if (!request.result.objectStoreNames.contains(STORE_NAME)) request.result.createObjectStore(STORE_NAME);
      if (!request.result.objectStoreNames.contains(BACKUP_STORE)) request.result.createObjectStore(BACKUP_STORE);
    };
    request.onblocked = () => reject(new Error("Armazenamento local bloqueado por outra aba aberta."));
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error ?? new Error("Falha ao abrir o armazenamento de arquivos."));
  });

export const saveOriginalFile = async (id: string, file: File): Promise<void> => {
  const db = await openDB();
  try {
    await new Promise<void>((resolve, reject) => {
      const transaction = db.transaction(STORE_NAME, "readwrite");
      transaction.objectStore(STORE_NAME).put(file, id);
      transaction.oncomplete = () => resolve();
      transaction.onerror = () => reject(transaction.error ?? new Error("Não foi possível guardar o arquivo local."));
    });
  } finally {
    db.close();
  }
};

export const getOriginalFile = async (id: string): Promise<Blob | null> => {
  const db = await openDB();
  try {
    return await new Promise<Blob | null>((resolve, reject) => {
      const request = db.transaction(STORE_NAME, "readonly").objectStore(STORE_NAME).get(id);
      request.onsuccess = () => resolve((request.result as Blob | undefined) ?? null);
      request.onerror = () => reject(request.error ?? new Error("Não foi possível ler o arquivo."));
    });
  } finally {
    db.close();
  }
};

export const deleteOriginalFile = async (id: string): Promise<void> => {
  const db = await openDB();
  try {
    await new Promise<void>((resolve, reject) => {
      const transaction = db.transaction(STORE_NAME, "readwrite");
      transaction.objectStore(STORE_NAME).delete(id);
      transaction.oncomplete = () => resolve();
      transaction.onerror = () => reject(transaction.error ?? new Error("Não foi possível remover o arquivo."));
    });
  } finally {
    db.close();
  }
};

export interface AutomaticBackup {
  key: string;
  createdAt: string;
  workspaceJson: string;
}

export const saveAutomaticBackup = async (workspaceJson: string): Promise<void> => {
  const db = await openDB();
  try {
    await new Promise<void>((resolve, reject) => {
      const transaction = db.transaction(BACKUP_STORE, "readwrite");
      const store = transaction.objectStore(BACKUP_STORE);
      const now = Date.now();
      const createdAt = new Date(now).toISOString();
      const key = new Date(Math.floor(now / (15 * 60 * 1000)) * (15 * 60 * 1000)).toISOString();
      store.put({ key, createdAt, workspaceJson } satisfies AutomaticBackup, key);
      const keys: IDBValidKey[] = [];
      const cursorRequest = store.openKeyCursor(null, "prev");
      cursorRequest.onsuccess = () => {
        const cursor = cursorRequest.result;
        if (cursor) {
          keys.push(cursor.primaryKey);
          cursor.continue();
        } else {
          keys.slice(MAX_BACKUPS).forEach((oldKey) => store.delete(oldKey));
        }
      };
      transaction.oncomplete = () => resolve();
      transaction.onerror = () => reject(transaction.error ?? new Error("Não foi possível criar o backup automático."));
    });
  } finally {
    db.close();
  }
};

export const listAutomaticBackups = async (): Promise<AutomaticBackup[]> => {
  const db = await openDB();
  try {
    return await new Promise<AutomaticBackup[]>((resolve, reject) => {
      const request = db.transaction(BACKUP_STORE, "readonly").objectStore(BACKUP_STORE).getAll();
      request.onsuccess = () =>
        resolve((request.result as AutomaticBackup[]).sort((a, b) => b.createdAt.localeCompare(a.createdAt)));
      request.onerror = () => reject(request.error ?? new Error("Não foi possível ler os backups automáticos."));
    });
  } finally {
    db.close();
  }
};
