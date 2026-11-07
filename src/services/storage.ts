
import { Preferences } from "@capacitor/preferences";
import type { AppData, Category } from "../types";
import { showToast } from "./toast";

import {
  auth,
  getCloudData,
  saveCloudData,
  createAutomaticCloudBackup
} from "./firebase";

const CLOUD_SIZE_WARNING_BYTES = 800_000;

export const DEFAULT_CATEGORIES: Category[] = [
  { id: "income-salary", name: "Salary", type: "income", color: "#34d399", icon: "wallet" },
  { id: "income-freelance", name: "Freelance", type: "income", color: "#60a5fa", icon: "laptop" },
  { id: "income-business", name: "Business", type: "income", color: "#a78bfa", icon: "briefcase" },
  { id: "income-event", name: "Event Work", type: "income", color: "#fbbf24", icon: "calendar" },
  { id: "income-other", name: "Other Income", type: "income", color: "#94a3b8", icon: "plus-circle" },
  { id: "expense-food", name: "Food", type: "expense", color: "#fb923c", icon: "utensils" },
  { id: "expense-transport", name: "Transport", type: "expense", color: "#38bdf8", icon: "bike" },
  { id: "expense-shopping", name: "Shopping", type: "expense", color: "#f472b6", icon: "shopping-bag" },
  { id: "expense-education", name: "Education", type: "expense", color: "#818cf8", icon: "book" },
  { id: "expense-bills", name: "Bills", type: "expense", color: "#facc15", icon: "receipt" },
  { id: "expense-entertainment", name: "Entertainment", type: "expense", color: "#c084fc", icon: "gamepad-2" },
  { id: "expense-health", name: "Health", type: "expense", color: "#4ade80", icon: "heart-pulse" },
  { id: "expense-other", name: "Other Expense", type: "expense", color: "#94a3b8", icon: "circle-help" }
];

const EMPTY_DATA: AppData = {
  transactions: [],
  pendingPayments: [],
  categories: DEFAULT_CATEGORIES,
  accounts: [],
  budgets: [],
  teamMembers: [],
  cashDistributions: [],
  deletedTransactionIds: []
};

function getStorageKey(): string {
  const user = auth.currentUser;
  return user
    ? `maxledger_data_v1_${user.uid}`
    : "maxledger_data_v1_guest";
}

function isValidData(value: unknown): value is AppData {
  if (!value || typeof value !== "object") return false;

  const data = value as Record<string, unknown>;

  return (
    Array.isArray(data.transactions) &&
    Array.isArray(data.pendingPayments) &&
    Array.isArray(data.categories) &&
    Array.isArray(data.accounts)
  );
}

function migrateData(data: AppData): AppData {
    const existingIds = new Set(data.categories.map(category => category.id));
  const deletedIds = new Set(data.deletedTransactionIds || []);

  return {
    ...data,
    categories: [
      ...data.categories,
      ...DEFAULT_CATEGORIES.filter(
        category =>
          !existingIds.has(category.id) && !deletedIds.has(category.id)
      )
    ],
    budgets: Array.isArray(data.budgets) ? data.budgets : [],
    teamMembers: Array.isArray(data.teamMembers)
      ? data.teamMembers
      : [],
    cashDistributions: Array.isArray(data.cashDistributions)
      ? data.cashDistributions
      : [],
    deletedTransactionIds: Array.isArray(data.deletedTransactionIds)
      ? data.deletedTransactionIds
      : []
  };
}

function mergeRecords<T extends {
  id: string;
  updatedAt?: number;
  createdAt?: number;
}>(local: T[], cloud: T[]): T[] {
  const records = new Map<string, T>();

  for (const item of local) {
    records.set(item.id, item);
  }

  for (const item of cloud) {
    const existing = records.get(item.id);
    const existingTime = existing?.updatedAt ?? existing?.createdAt ?? 0;
    const cloudTime = item.updatedAt ?? item.createdAt ?? 0;

    if (!existing || cloudTime > existingTime) {
      records.set(item.id, item);
    }
  }

  return Array.from(records.values());
}

function mergeData(local: AppData, cloud: AppData): AppData {
  // A restore on one device must win outright; merging would bring
  // deleted items back from the other device.
  const localEpoch = local.restoreEpoch ?? 0;
  const cloudEpoch = cloud.restoreEpoch ?? 0;

  if (cloudEpoch > localEpoch) return migrateData(cloud);
  if (localEpoch > cloudEpoch) return migrateData(local);

  const deletedIds = new Set([
    ...(local.deletedTransactionIds || []),
    ...(cloud.deletedTransactionIds || [])
  ]);

  const transactions = mergeRecords(
    local.transactions,
    cloud.transactions
  ).filter(transaction => !deletedIds.has(transaction.id));

    const keep = <T extends { id: string }>(items: T[]) =>
    items.filter(item => !deletedIds.has(item.id));

  return migrateData({
    transactions,
    pendingPayments: keep(
      mergeRecords(local.pendingPayments, cloud.pendingPayments)
    ),
    categories: keep(mergeRecords(local.categories, cloud.categories)),
    accounts: keep(mergeRecords(local.accounts, cloud.accounts)),
    budgets: keep(
      mergeRecords(local.budgets || [], cloud.budgets || [])
    ),
    teamMembers: keep(
      mergeRecords(local.teamMembers || [], cloud.teamMembers || [])
    ),
    cashDistributions: keep(
      mergeRecords(
        local.cashDistributions || [],
        cloud.cashDistributions || []
      )
    ),
    deletedTransactionIds: Array.from(deletedIds)
  });
}

async function readFromKey(key: string): Promise<AppData | null> {
  try {
    const result = await Preferences.get({ key });

    if (result.value) {
      const parsed: unknown = JSON.parse(result.value);
      if (isValidData(parsed)) return migrateData(parsed);
    }
  } catch (error) {
    console.warn("Capacitor storage unavailable:", error);
  }

  try {
    const saved = localStorage.getItem(key);

    if (saved) {
      const parsed: unknown = JSON.parse(saved);
      if (isValidData(parsed)) return migrateData(parsed);
    }
  } catch (error) {
    console.error("Unable to load local data:", error);
  }

  return null;
}

async function readLocalData(): Promise<AppData> {
  const accountKey = getStorageKey();
  const accountData = await readFromKey(accountKey);

  if (accountData) return accountData;

  return {
    ...EMPTY_DATA,
    categories: [...DEFAULT_CATEGORIES],
    teamMembers: [],
    cashDistributions: [],
    deletedTransactionIds: []
  };
}

async function writeLocalData(data: AppData): Promise<void> {
  const key = getStorageKey();
  const serialized = JSON.stringify(migrateData(data));

  try {
    await Preferences.set({ key, value: serialized });
    return;
  } catch (error) {
    console.warn("Capacitor storage unavailable:", error);
  }

  try {
    localStorage.setItem(key, serialized);
  } catch (error) {
    throw new Error("Unable to save MaxLedger data: " + String(error));
  }
}

export async function loadData(): Promise<AppData> {
  const localData = await readLocalData();
  const user = auth.currentUser;

  if (!user) return localData;

  try {
    const cloudRecord = await getCloudData(user.uid);

    if (!cloudRecord) {
      await saveCloudData(user.uid, localData);
      return localData;
    }

    const cloudPayload = cloudRecord.data;

    if (!isValidData(cloudPayload)) {
      console.warn("Cloud data format was not recognised. Keeping local data.");
      return localData;
    }

    const merged = mergeData(localData, cloudPayload);

    await writeLocalData(merged);
    await saveCloudData(user.uid, merged);

    return merged;
  } catch (error) {
    console.warn("Cloud sync unavailable. Using local data:", error);
    return localData;
  }
}

export async function saveData(
  data: AppData
): Promise<"synced" | "local-only"> {
  const safeData = migrateData(data);

  await writeLocalData(safeData);

  const user = auth.currentUser;

  if (!user) return "local-only";

  try {
    const cloudBytes = await saveCloudData(user.uid, safeData);

    if (cloudBytes > CLOUD_SIZE_WARNING_BYTES) {
      showToast(
        `Your ledger is ${Math.round(cloudBytes / 1024)} KB. Cloud sync stops at about 1000 KB, so export a backup and archive old entries soon.`,
        9000
      );
    }

    try {
      await createAutomaticCloudBackup(user.uid, safeData);
    } catch (backupError) {
      console.error("Automatic backup failed:", backupError);
    }

    return "synced";
  } catch (error) {
    console.error("Cloud save failed:", error);

    const message =
      error instanceof Error ? error.message : String(error);

    throw new Error(
      "Local data is safe, but cloud sync failed: " + message
    );
  }
}

export async function clearLocalData(): Promise<void> {
  const key = getStorageKey();

  await Preferences.remove({ key });
  localStorage.removeItem(key);
}
