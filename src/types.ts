
export type TransactionType = "income" | "expense";

export interface Transaction {
  id: string;
  title: string;
  amount: number;
  category: string;
  type: TransactionType;
  date: string;
  /** Date the event/work was attended (income entries). */
  eventAttendedDate?: string;
  /** Date the money was actually received (income entries). */
  paymentDate?: string;
  notes?: string;
  accountId?: string;
  paymentId?: string;
  receiptId?: string;
  createdAt: number;
  updatedAt: number;
}

export type PaymentStatus =
  | "pending"
  | "partially_paid"
  | "paid"
  | "cancelled";

export interface PaymentReceipt {
  id: string;
  amount: number;
  receivedDate: string;
  method: string;
  notes?: string;
}

export interface PendingPayment {
  id: string;
  customerName: string;
  expectedAmount: number;
  /** Optional. An empty string means no expected date was set. */
  expectedDate: string;
  eventAttendedDate?: string;
  status: PaymentStatus;
  receipts: PaymentReceipt[];
  notes?: string;
  createdAt: number;
  updatedAt: number;
}

export interface Category {
  id: string;
  name: string;
  type: TransactionType;
  color: string;
  icon: string;
}

export interface UpiAccount {
  id: string;
  name: string;
  upiId: string;
  isDefault: boolean;
}

export interface Budget {
  id: string;
  category: string;
  amount: number;
  month: string;
}

export interface TeamMember {
  id: string;
  name: string;
  createdAt: number;
  updatedAt: number;
}

export interface DistributionPayment {
  id: string;
  amount: number;
  paidDate: string;
  referenceNote?: string;
  createdAt: number;
}

export interface DistributionMember {
  id: string;
  teamMemberId: string;
  memberName: string;
  allocatedAmount: number;
  payments: DistributionPayment[];
  notes?: string;
}

export interface CashDistribution {
  id: string;
  eventName: string;
  eventAttendedDate: string;
  location?: string;
  inTime?: string;
  outTime?: string;
  members: DistributionMember[];
  notes?: string;
  createdAt: number;
  updatedAt: number;
}

export interface AppData {
  transactions: Transaction[];
  pendingPayments: PendingPayment[];
  categories: Category[];
  accounts: UpiAccount[];
  budgets: Budget[];
  teamMembers?: TeamMember[];
  cashDistributions?: CashDistribution[];
  deletedTransactionIds?: string[];
  /** Set when a backup is restored. The side with the newer value wins the sync outright, so deleted items cannot come back from another device. */
  restoreEpoch?: number;
}
