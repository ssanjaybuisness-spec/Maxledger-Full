
import type { AppData } from "../types";

export async function importBackup(file: File): Promise<AppData> {
  const text = await file.text();
  const parsed: unknown = JSON.parse(text);

  if (!parsed || typeof parsed !== "object") {
    throw new Error("Invalid backup file.");
  }

  const backup = parsed as Record<string, unknown>;

  if (
    backup.app !== "MaxLedger" ||
    !backup.data ||
    typeof backup.data !== "object"
  ) {
    throw new Error("This is not a valid MaxLedger backup.");
  }

  const data = backup.data as Record<string, unknown>;

  if (
    !Array.isArray(data.transactions) ||
    !Array.isArray(data.pendingPayments) ||
    !Array.isArray(data.categories) ||
    !Array.isArray(data.accounts)
  ) {
    throw new Error("Backup data is incomplete or invalid.");
  }

    return {
    transactions: data.transactions as AppData["transactions"],
    pendingPayments: data.pendingPayments as AppData["pendingPayments"],
    categories: data.categories as AppData["categories"],
    accounts: data.accounts as AppData["accounts"],
    budgets: Array.isArray(data.budgets)
      ? data.budgets as AppData["budgets"]
      : [],
    teamMembers: Array.isArray(data.teamMembers)
      ? data.teamMembers as AppData["teamMembers"]
      : [],
    cashDistributions: Array.isArray(data.cashDistributions)
      ? data.cashDistributions as AppData["cashDistributions"]
      : [],
    deletedTransactionIds: Array.isArray(data.deletedTransactionIds)
      ? data.deletedTransactionIds as string[]
      : [],
    restoreEpoch: Date.now()
  };
}
