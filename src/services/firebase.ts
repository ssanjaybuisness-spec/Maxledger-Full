import { initializeApp } from "firebase/app";

import {
  getAuth,
  initializeAuth,
  indexedDBLocalPersistence,
  GoogleAuthProvider,
  signInWithPopup,
  signInWithCredential,
  signOut,
  onAuthStateChanged
} from "firebase/auth";

import { Capacitor } from "@capacitor/core";
import { FirebaseAuthentication } from "@capacitor-firebase/authentication";

import {
  getFirestore,
  doc,
  getDoc,
  setDoc,
  serverTimestamp,
  collection,
  addDoc,
  getDocs,
  query,
  orderBy,
  limit,
  deleteDoc
} from "firebase/firestore";

const firebaseConfig = {
  apiKey: "AIzaSyBNPEjzQ9Q4D8Xx4c3hs1sCCgn9V7dySHk",
  authDomain: "maxledger-full.firebaseapp.com",
  projectId: "maxledger-full",
  storageBucket: "maxledger-full.firebasestorage.app",
  messagingSenderId: "848437171884",
  appId: "1:848437171884:web:e80289768d1c0f357d3109",
  measurementId: "G-4D925NZPM4"
};

/**
 * Recursively removes undefined values before sending data to Firestore.
 * Undefined object properties are omitted; undefined array entries become null.
 */
function removeUndefined(value: unknown): unknown {
  if (value === undefined) {
    return null;
  }

  if (value === null || typeof value !== "object") {
    return value;
  }

  if (value instanceof Date) {
    return value;
  }

  if (Array.isArray(value)) {
    return value.map(item =>
      item === undefined ? null : removeUndefined(item)
    );
  }

  const cleaned: Record<string, unknown> = {};

  for (const [key, item] of Object.entries(value)) {
    if (item !== undefined) {
      cleaned[key] = removeUndefined(item);
    }
  }

  return cleaned;
}

const FIRESTORE_DOC_LIMIT_BYTES = 1_000_000;

const app = initializeApp(firebaseConfig);

export const auth = Capacitor.isNativePlatform()
  ? initializeAuth(app, {
      persistence: indexedDBLocalPersistence
    })
  : getAuth(app);

export const db = getFirestore(app);

const googleProvider = new GoogleAuthProvider();

googleProvider.setCustomParameters({
  prompt: "select_account"
});

export async function signInWithGoogle() {
  if (Capacitor.isNativePlatform()) {
    const result = await FirebaseAuthentication.signInWithGoogle({
      skipNativeAuth: true,
      useCredentialManager: false
    });

    const idToken = result.credential?.idToken;

    if (!idToken) {
      throw new Error("Google sign-in did not return an ID token.");
    }

    const credential = GoogleAuthProvider.credential(idToken);

    return signInWithCredential(auth, credential);
  }

  return signInWithPopup(auth, googleProvider);
}

export async function logout() {
  if (Capacitor.isNativePlatform()) {
    await FirebaseAuthentication.signOut();
  }

  return signOut(auth);
}

export { onAuthStateChanged };

export async function getCloudData(userId: string) {
  const userRef = doc(db, "users", userId);
  const snapshot = await getDoc(userRef);

  return snapshot.exists() ? snapshot.data() : null;
}

export async function saveCloudData(
  userId: string,
  data: unknown
) {
  const userRef = doc(db, "users", userId);
  const cleaned = removeUndefined(data);
  const bytes = new Blob([JSON.stringify(cleaned)]).size;

  if (bytes > FIRESTORE_DOC_LIMIT_BYTES) {
    throw new Error(
      `Your ledger (${Math.round(bytes / 1024)} KB) is over the 1 MB cloud limit. Export a backup and archive old entries.`
    );
  }

  await setDoc(userRef, {
    data: cleaned,
    updatedAt: serverTimestamp()
  });

  return bytes;
}
function stableStringify(value: unknown): string {
  if (value === null || typeof value !== "object") {
    return JSON.stringify(value) ?? "null";
  }

  if (Array.isArray(value)) {
    return "[" + value.map(stableStringify).join(",") + "]";
  }

  const record = value as Record<string, unknown>;

  return (
    "{" +
    Object.keys(record)
      .sort()
      .map(key => JSON.stringify(key) + ":" + stableStringify(record[key]))
      .join(",") +
    "}"
  );
}
async function trimCloudBackups(userId: string) {
  const backupsRef = collection(db, "users", userId, "backups");

  const backupsQuery = query(
    backupsRef,
    orderBy("createdAt", "desc"),
    limit(100)
  );

  const snapshot = await getDocs(backupsQuery);
  const oldBackups = snapshot.docs.slice(30);

  await Promise.all(
    oldBackups.map(item => deleteDoc(item.ref))
  );
}

export async function createCloudBackup(
  userId: string,
  data: unknown
) {
  const backupsRef = collection(db, "users", userId, "backups");

  await addDoc(backupsRef, {
    data: removeUndefined(data),
    createdAt: serverTimestamp(),
    kind: "manual"
  });

  await trimCloudBackups(userId);
}

async function runAutomaticCloudBackup(
  userId: string,
  data: unknown
) {
  const backupsRef = collection(db, "users", userId, "backups");

  const latestQuery = query(
    backupsRef,
    orderBy("createdAt", "desc"),
    limit(1)
  );

  const snapshot = await getDocs(latestQuery);

    if (!snapshot.empty) {
    const latestData = snapshot.docs[0].data().data;

    if (
      stableStringify(removeUndefined(data)) ===
      stableStringify(latestData)
    ) {
      return false;
    }
    }

  await addDoc(backupsRef, {
    data: removeUndefined(data),
    createdAt: serverTimestamp(),
    kind: "automatic"
  });

  await trimCloudBackups(userId);

  return true;
}
let automaticBackupQueue: Promise<unknown> = Promise.resolve();

export function createAutomaticCloudBackup(
  userId: string,
  data: unknown
): Promise<boolean> {
  const run = automaticBackupQueue
    .catch(() => undefined)
    .then(() => runAutomaticCloudBackup(userId, data));

  automaticBackupQueue = run;

  return run;
}

export async function getCloudBackups(userId: string) {
  const backupsRef = collection(db, "users", userId, "backups");

  const backupsQuery = query(
    backupsRef,
    orderBy("createdAt", "desc"),
    limit(30)
  );

  const snapshot = await getDocs(backupsQuery);

  return snapshot.docs.map(item => ({
    id: item.id,
    data: item.data().data,
    createdAt: item.data().createdAt,
    kind: item.data().kind ?? "manual"
  }));
}

export async function restoreCloudBackup(
  userId: string,
  backupId: string
) {
  const userRef = doc(db, "users", userId);
  const backupRef = doc(db, "users", userId, "backups", backupId);

  const backupSnapshot = await getDoc(backupRef);

  if (!backupSnapshot.exists()) {
    throw new Error("Backup not found.");
  }

  const backupData = backupSnapshot.data().data;

  if (!backupData) {
    throw new Error("Backup data is empty.");
  }

  const currentSnapshot = await getDoc(userRef);

  if (currentSnapshot.exists() && currentSnapshot.data().data) {
    await createCloudBackup(
      userId,
      currentSnapshot.data().data
    );
  }

  const restoredData = {
    ...(backupData as Record<string, unknown>),
    restoreEpoch: Date.now()
  };

  await setDoc(userRef, {
    data: removeUndefined(restoredData),
    updatedAt: serverTimestamp()
  });

  return restoredData;
}
