import { getApp, getApps, initializeApp } from "firebase/app";
import { GoogleAuthProvider, getAuth, onAuthStateChanged, signInWithPopup, signOut, type User } from "firebase/auth";
import { doc, getDoc, getFirestore, setDoc } from "firebase/firestore";
import type { WorkspaceData } from "./models";
import { sanitizeWorkspace } from "./storage";

const config = {
  apiKey: import.meta.env.VITE_FIREBASE_API_KEY || "AIzaSyCYPUusBYbenK_S6reyA0v_0cfBpyaqvUI",
  authDomain: import.meta.env.VITE_FIREBASE_AUTH_DOMAIN || "simulc.firebaseapp.com",
  projectId: import.meta.env.VITE_FIREBASE_PROJECT_ID || "simulc",
  appId: import.meta.env.VITE_FIREBASE_APP_ID || "1:675965001111:web:7ba01e0fc3aab23f1bb8d2",
};

export const firebaseConfigured = Object.values(config).every(Boolean);
const app = firebaseConfigured ? (getApps().length ? getApp() : initializeApp(config)) : null;
export const firebaseAuth = app ? getAuth(app) : null;
const firestore = app ? getFirestore(app) : null;

const MAX_DOC_RAW_TEXT_CHARS = 12_000;
const MAX_CLOUD_BYTES = 900_000;

export const watchCloudAuth = (callback: (user: User | null) => void) =>
  firebaseAuth ? onAuthStateChanged(firebaseAuth, callback) : () => undefined;

export const loginWithGoogle = async () => {
  if (!firebaseAuth) throw new Error("Firebase ainda não foi configurado para este site.");
  await signInWithPopup(firebaseAuth, new GoogleAuthProvider());
};

export const logoutCloud = async () => {
  if (firebaseAuth) await signOut(firebaseAuth);
};

export const readCloudWorkspace = async (uid: string): Promise<WorkspaceData | null> => {
  if (!firestore) return null;
  const snapshot = await getDoc(doc(firestore, "users", uid, "workspaces", "main"));
  if (!snapshot.exists()) return null;
  return sanitizeWorkspace(snapshot.data().workspace);
};

const prepareWorkspaceForCloud = (workspace: WorkspaceData): WorkspaceData => ({
  ...workspace,
  documents: workspace.documents.map((item) =>
    item.rawText.length > MAX_DOC_RAW_TEXT_CHARS
      ? { ...item, rawText: `${item.rawText.slice(0, MAX_DOC_RAW_TEXT_CHARS)}\n[...texto truncado na sincronização na nuvem]` }
      : item,
  ),
});

export const writeCloudWorkspace = async (uid: string, workspace: WorkspaceData) => {
  if (!firestore) throw new Error("Firebase não configurado.");
  const payload = prepareWorkspaceForCloud(workspace);
  const bytes = new TextEncoder().encode(JSON.stringify(payload)).length;
  if (bytes > MAX_CLOUD_BYTES) {
    throw new Error(
      "Espaço de trabalho passou do limite seguro de 900 KB para um documento. Exporte um backup JSON antes de remover documentos antigos.",
    );
  }
  await setDoc(doc(firestore, "users", uid, "workspaces", "main"), {
    workspace: payload,
    updatedAt: new Date().toISOString(),
  });
};
