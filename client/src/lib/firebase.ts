import { getApp, getApps, initializeApp } from "firebase/app";
import { GoogleAuthProvider, getAuth, onAuthStateChanged, signInWithPopup, signOut, type User } from "firebase/auth";
import { doc, getDoc, getFirestore, setDoc } from "firebase/firestore";
import type { WorkspaceData } from "./models";

const config = {
  apiKey: import.meta.env.VITE_FIREBASE_API_KEY,
  authDomain: import.meta.env.VITE_FIREBASE_AUTH_DOMAIN,
  projectId: import.meta.env.VITE_FIREBASE_PROJECT_ID,
  appId: import.meta.env.VITE_FIREBASE_APP_ID,
};
export const firebaseConfigured = Object.values(config).every(Boolean);
const app = firebaseConfigured ? (getApps().length ? getApp() : initializeApp(config)) : null;
export const firebaseAuth = app ? getAuth(app) : null;
const firestore = app ? getFirestore(app) : null;
export type CloudWorkspace = { user: User; workspace: WorkspaceData | null };

export const watchCloudAuth = (callback: (user: User | null) => void) =>
  firebaseAuth ? onAuthStateChanged(firebaseAuth, callback) : () => undefined;
export const loginWithGoogle = async () => {
  if (!firebaseAuth) throw new Error("Firebase ainda não foi configurado para este site.");
  await signInWithPopup(firebaseAuth, new GoogleAuthProvider());
};
export const logoutCloud = async () => { if (firebaseAuth) await signOut(firebaseAuth); };
export const readCloudWorkspace = async (uid: string): Promise<WorkspaceData | null> => {
  if (!firestore) return null;
  const snapshot = await getDoc(doc(firestore, "users", uid, "workspaces", "main"));
  return snapshot.exists() ? snapshot.data().workspace as WorkspaceData : null;
};
export const writeCloudWorkspace = async (uid: string, workspace: WorkspaceData) => {
  if (!firestore) throw new Error("Firebase não configurado.");
  const bytes = new TextEncoder().encode(JSON.stringify(workspace)).length;
  if (bytes > 900_000) throw new Error("Espaço de trabalho passou do limite seguro de 900 KB para um documento. Exporte um backup JSON antes de remover documentos antigos.");
  await setDoc(doc(firestore, "users", uid, "workspaces", "main"), { workspace, updatedAt: new Date().toISOString() });
};
