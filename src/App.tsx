
import {
  useEffect,
  useMemo,
  useRef,
  useState,
  type FormEvent,
  type ChangeEvent
} from "react";

import {
  Wallet, Clock, Plus, Eye, EyeOff,
  LayoutDashboard, ArrowDownLeft, ArrowUpRight, Pencil, Trash2,
  Search, X, Tags, BarChart3, Download, Users
} from "lucide-react";

import { loadData, saveData } from "./services/storage";
import type {
  AppData, Transaction, PendingPayment, PaymentReceipt, TransactionType
} from "./types";

import PendingPayments from "./components/PendingPayments";
import CategoryManager from "./components/CategoryManager";
import BudgetManager, { type Budget } from "./components/BudgetManager";
import Analytics from "./components/Analytics";
import CustomDashboard from "./components/CustomDashboard";
import BackupManager from "./components/BackupManager";
import CashDistribution from "./components/CashDistribution";

import { exportTransactionsCSV } from "./services/export";
import { exportBackup } from "./services/backup";
import { importBackup } from "./services/restore";
import { printFinancialReport } from "./services/report";
import {
  exportTransactionsExcel,
  exportFinancialReportExcel,
  exportPendingPaymentsExcel,
  exportBudgetsExcel,
  exportFullDataExcel
} from "./services/excel";

const EMPTY_DATA: AppData = {
  transactions: [],
  pendingPayments: [],
  categories: [],
  accounts: [],
  budgets: [],
  teamMembers: [],
  cashDistributions: []
};
function withDeleted<T extends { id: string }>(
  current: AppData,
  before: T[] | undefined,
  after: T[]
): string[] {
  const kept = new Set(after.map(item => item.id));

  const removed = (before || [])
    .filter(item => !kept.has(item.id))
    .map(item => item.id);

  return Array.from(
    new Set([...(current.deletedTransactionIds || []), ...removed])
  );
}
type Filter = "all" | "income" | "expense";

type Tab =
  | "home"
  | "pending"
  | "categories"
  | "budgets"
  | "analytics"
  | "distribution"
  | "backups";

export default function App() {
  const [data, setData] = useState<AppData>(EMPTY_DATA);
  const [loaded, setLoaded] = useState(false);
  const [balanceVisible, setBalanceVisible] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [filter, setFilter] = useState<Filter>("all");
  const [categoryFilter, setCategoryFilter] = useState("all");
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");
  const [amountMin, setAmountMin] = useState("");
  const [amountMax, setAmountMax] = useState("");
  const [sortOrder, setSortOrder] = useState<"newest" | "oldest">("newest");
  const [activeTab, setActiveTab] = useState<Tab>("home");
  const [storageError, setStorageError] = useState("");
  const [formType, setFormType] = useState<TransactionType>("income");
  const [selectedCategory, setSelectedCategory] = useState("");

  const backupInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    let active = true;

    loadData()
      .then(saved => {
        if (active) {
          setData({
            ...saved,
            budgets: saved.budgets || [],
            teamMembers: saved.teamMembers || [],
            cashDistributions: saved.cashDistributions || []
          });
          setLoaded(true);
        }
      })
      .catch(() => {
        if (active) {
          setStorageError("Unable to load saved data.");
          setLoaded(true);
        }
      });

    return () => {
      active = false;
    };
  }, []);

  useEffect(() => {
    if (!loaded) return;

    saveData(data)
      .then(() => {
        setStorageError("");
      })
      .catch(error => {
        setStorageError(
          error instanceof Error
            ? error.message
            : "Unable to save your data. Your local data may still be available."
        );
      });
  }, [data, loaded]);

  const income = data.transactions
    .filter(item => item.type === "income")
    .reduce((sum, item) => sum + item.amount, 0);

  const expenses = data.transactions
    .filter(item => item.type === "expense")
    .reduce((sum, item) => sum + item.amount, 0);

  const balance = income - expenses;

  const availableCategories = data.categories.filter(
    category => category.type === formType
  );

  const visibleTransactions = useMemo(() => {
  const query = search.trim().toLowerCase();
  const min = amountMin === "" ? null : Number(amountMin);
  const max = amountMax === "" ? null : Number(amountMax);

  return data.transactions
    .filter(item => {
      const matchesFilter = filter === "all" || item.type === filter;

      const matchesSearch =
        item.title.toLowerCase().includes(query) ||
        item.category.toLowerCase().includes(query);

      const matchesCategory =
        categoryFilter === "all" || item.category === categoryFilter;

      const matchesDateFrom = !dateFrom || item.date >= dateFrom;
      const matchesDateTo = !dateTo || item.date <= dateTo;

      const matchesMin = min === null || item.amount >= min;
      const matchesMax = max === null || item.amount <= max;

      return (
        matchesFilter &&
        matchesSearch &&
        matchesCategory &&
        matchesDateFrom &&
        matchesDateTo &&
        matchesMin &&
        matchesMax
      );
    })
    .sort((a, b) =>
      sortOrder === "newest"
        ? b.date.localeCompare(a.date) || b.createdAt - a.createdAt
        : a.date.localeCompare(b.date) || a.createdAt - b.createdAt
    );
}, [
  data.transactions,
  search,
  filter,
  categoryFilter,
  dateFrom,
  dateTo,
  amountMin,
  amountMax,
  sortOrder
]);

  const money = (amount: number) =>
    balanceVisible
      ? `₹${amount.toLocaleString("en-IN", {
          maximumFractionDigits: 2
        })}`
      : "₹••••••";

  function openAddForm() {
    const firstCategory = data.categories.find(
      category => category.type === "income"
    );

    setEditingId(null);
    setFormType("income");
    setSelectedCategory(firstCategory?.name || "");
    setShowForm(true);
  }

  function openEditForm(item: Transaction) {
    setEditingId(item.id);
    setFormType(item.type);
    setSelectedCategory(item.category);
    setShowForm(true);
  }

  function closeForm() {
    setEditingId(null);
    setShowForm(false);
  }

  function changeFormType(type: TransactionType) {
    setFormType(type);

    const firstCategory = data.categories.find(
      category => category.type === type
    );

    setSelectedCategory(firstCategory?.name || "");
  }

  function saveTransaction(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    const form = new FormData(event.currentTarget);
    const title = String(form.get("title") || "").trim();
    const category = String(form.get("category") || "").trim();
    const amount = Number(form.get("amount"));
    const type = form.get("type") as TransactionType;
    const date = String(form.get("date") || "");
    const eventAttendedDate =
      type === "income"
        ? String(form.get("eventAttendedDate") || "") || undefined
        : undefined;
    const paymentDate =
      type === "income"
        ? String(form.get("paymentDate") || "") || undefined
        : undefined;

    if (
      !title ||
      !category ||
      !date ||
      !Number.isFinite(amount) ||
      amount <= 0
    ) {
      return;
    }

    const now = Date.now();

    if (editingId) {
      setData(current => ({
        ...current,
        transactions: current.transactions.map(item =>
          item.id === editingId
            ? {
                ...item,
                title,
                category,
                amount,
                type,
                date,
                eventAttendedDate,
                paymentDate,
                updatedAt: now
              }
            : item
        )
      }));
    } else {
      const transaction: Transaction = {
        id: crypto.randomUUID(),
        title,
        category,
        amount,
        type,
        date,
        eventAttendedDate,
        paymentDate,
        createdAt: now,
        updatedAt: now
      };

      setData(current => ({
        ...current,
        transactions: [transaction, ...current.transactions]
      }));
    }

    closeForm();
  }

  function deleteTransaction(id: string) {
    if (!window.confirm("Delete this transaction permanently?")) return;

    setData(current => {
      const removed = current.transactions.find(item => item.id === id);

      return {
        ...current,
        transactions: current.transactions.filter(item => item.id !== id),
        pendingPayments:
          removed?.paymentId && removed.receiptId
            ? current.pendingPayments.map(payment =>
                payment.id === removed.paymentId
                  ? {
                      ...payment,
                      receipts: payment.receipts.filter(
                        receipt => receipt.id !== removed.receiptId
                      ),
                      updatedAt: Date.now()
                    }
                  : payment
              )
            : current.pendingPayments,
        deletedTransactionIds: [
          ...new Set([
            ...(current.deletedTransactionIds || []),
            id
          ])
        ]
      };
    });
  }

  async function handleRestore(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    if (!file) return;

    try {
      const restoredData = await importBackup(file);

      if (
        window.confirm(
          "Restore this backup? Your current data will be replaced."
        )
      ) {
        setData({
          ...restoredData,
          budgets: restoredData.budgets || [],
          teamMembers: restoredData.teamMembers || [],
          cashDistributions: restoredData.cashDistributions || [],
          deletedTransactionIds:
            restoredData.deletedTransactionIds || []
        });

        setActiveTab("home");
        setSearch("");
        setFilter("all");

        window.alert("Backup restored successfully.");
      }
    } catch (error) {
      window.alert(
        error instanceof Error
          ? error.message
          : "Unable to restore this backup."
      );
    } finally {
      event.target.value = "";
    }
  }

  function handlePendingChange(payments: PendingPayment[]) {
    setData(current => ({
      ...current,
      pendingPayments: payments
    }));
  }

    function handleCategoriesChange(
    categories: AppData["categories"],
    transactions: Transaction[]
  ) {
    setData(current => ({
      ...current,
      categories,
      transactions,
      deletedTransactionIds: withDeleted(
        current,
        current.categories,
        categories
      )
    }));
  }

    function handleBudgetsChange(budgets: Budget[]) {
    setData(current => ({
      ...current,
      budgets,
      deletedTransactionIds: withDeleted(current, current.budgets, budgets)
    }));
  }

  function handleReceive(
    paymentId: string,
    receipt: PaymentReceipt
  ) {
    setData(current => {
      const payment = current.pendingPayments.find(
        item => item.id === paymentId
      );

      if (!payment) return current;

      const alreadyReceived = payment.receipts.reduce(
        (sum, item) => sum + item.amount,
        0
      );

      const remaining = payment.expectedAmount - alreadyReceived;

      if (
        !Number.isFinite(receipt.amount) ||
        receipt.amount <= 0 ||
        receipt.amount > remaining
      ) {
        return current;
      }

      const updatedPayment = {
        ...payment,
        receipts: [...payment.receipts, receipt],
        updatedAt: Date.now()
      };

      const now = Date.now();

      const incomeTransaction: Transaction = {
        id: crypto.randomUUID(),
        title: `Payment received - ${payment.customerName}`,
        category: "Pending payment",
        amount: receipt.amount,
        type: "income",
        date: receipt.receivedDate,
        eventAttendedDate: payment.eventAttendedDate || undefined,
        paymentDate: receipt.receivedDate,
        notes: receipt.notes,
        paymentId: payment.id,
        receiptId: receipt.id,
        createdAt: now,
        updatedAt: now
      };

      return {
        ...current,
        pendingPayments: current.pendingPayments.map(item =>
          item.id === paymentId ? updatedPayment : item
        ),
        transactions: [
          incomeTransaction,
          ...current.transactions
        ]
      };
    });
  }

  const editingTransaction = data.transactions.find(
    item => item.id === editingId
  );

  if (!loaded) {
    return (
      <main className="app-shell">
        <h2>Loading...</h2>
      </main>
    );
  }

  return (
    <main className="app-shell">
      <header className="topbar">
        <div className="brand">
          <div className="brand-icon">
            <Wallet />
          </div>

          <div>
            <h1>MaxLedger</h1>
            <small className="brand-credit">Made by Sanjay S</small>
          </div>
        </div>

        <button
          className="icon-button"
          onClick={() => setBalanceVisible(value => !value)}
          aria-label="Toggle balance visibility"
        >
          {balanceVisible ? <Eye /> : <EyeOff />}
        </button>
      </header>

      {storageError && (
        <p role="alert">{storageError}</p>
      )}

      <input
        ref={backupInputRef}
        type="file"
        accept=".json,application/json"
        hidden
        onChange={handleRestore}
      />

      {activeTab === "home" && (
        <>
        

          <CustomDashboard
            balance={balance}
            income={income}
            expenses={expenses}
            transactions={data.transactions}
            pendingPayments={data.pendingPayments}
            money={money}
          />

          <section className="section-heading">
            <div>
              <p>ACTIVITY</p>
              <h2>Transactions</h2>
            </div>

            <button className="add-button" onClick={openAddForm}>
              <Plus size={17} /> Add
            </button>
          </section>

          {showForm && (
            <form className="transaction-form" onSubmit={saveTransaction}>
              <div className="form-heading">
                <h3>{editingId ? "Edit transaction" : "New transaction"}</h3>

                <button
                  type="button"
                  className="icon-button"
                  onClick={closeForm}
                  aria-label="Close form"
                >
                  <X size={18} />
                </button>
              </div>

              <label>Transaction name</label>
              <input
                name="title"
                placeholder="e.g. Event payment"
                defaultValue={editingTransaction?.title || ""}
                maxLength={100}
                required
              />

              <label>Type</label>
              <select
                name="type"
                value={formType}
                onChange={event =>
                  changeFormType(event.target.value as TransactionType)
                }
              >
                <option value="income">Income</option>
                <option value="expense">Expense</option>
              </select>

              <label>Category</label>
              <select
                name="category"
                value={selectedCategory}
                onChange={event => setSelectedCategory(event.target.value)}
                required
              >
                {editingTransaction &&
                  !availableCategories.some(
                    category => category.name === editingTransaction.category
                  ) && (
                    <option value={editingTransaction.category}>
                      {editingTransaction.category}
                    </option>
                  )}

                {availableCategories.map(category => (
                  <option key={category.id} value={category.name}>
                    {category.name}
                  </option>
                ))}
              </select>

              <label>Amount (₹)</label>
              <input
                name="amount"
                type="number"
                min="0.01"
                step="0.01"
                placeholder="Enter amount"
                defaultValue={editingTransaction?.amount ?? ""}
                required
              />

              <label>Date</label>
              <input
                name="date"
                type="date"
                defaultValue={
                  editingTransaction?.date ||
                  new Date(Date.now() - new Date().getTimezoneOffset() * 60000)
                    .toISOString()
                    .slice(0, 10)
                }
                required
              />

              {formType === "income" && (
                <>
                  <label>Event attended date (optional)</label>
                  <input
                    name="eventAttendedDate"
                    type="date"
                    defaultValue={editingTransaction?.eventAttendedDate || ""}
                  />

                  <label>Payment date (optional)</label>
                  <input
                    name="paymentDate"
                    type="date"
                    defaultValue={editingTransaction?.paymentDate || ""}
                  />
                </>
              )}

              <button className="submit-button" type="submit">
                {editingId ? "Update transaction" : "Save transaction"}
              </button>
            </form>
          )}

          <div className="transaction-search">
            <Search size={18} />
            <input
              value={search}
              onChange={event => setSearch(event.target.value)}
              placeholder="Search transactions"
            />
          </div>
          <div className="transaction-advanced-filters">
  <select
    value={categoryFilter}
    onChange={e => setCategoryFilter(e.target.value)}
  >
    <option value="all">All categories</option>
    {[...new Set(data.transactions.map(item => item.category))]
      .sort()
      .map(category => (
        <option key={category} value={category}>
          {category}
        </option>
      ))}
  </select>

  <label className="filter-date-field">
  <span>From</span>
  <input
    type="date"
    aria-label="From date"
    value={dateFrom}
    onChange={e => setDateFrom(e.target.value)}
  />
</label>

  <label className="filter-date-field">
  <span>To</span>
  <input
    type="date"
    aria-label="To date"
    value={dateTo}
    onChange={e => setDateTo(e.target.value)}
  />
</label>

  <input
    type="number"
    min="0"
    placeholder="Min ₹"
    aria-label="Minimum amount"
    value={amountMin}
    onChange={e => setAmountMin(e.target.value)}
  />

  <input
    type="number"
    min="0"
    placeholder="Max ₹"
    aria-label="Maximum amount"
    value={amountMax}
    onChange={e => setAmountMax(e.target.value)}
  />

  <select
    value={sortOrder}
    onChange={e => setSortOrder(e.target.value as "newest" | "oldest")}
  >
    <option value="newest">Newest first</option>
    <option value="oldest">Oldest first</option>
  </select>

  <button
    type="button"
    onClick={() => {
      setCategoryFilter("all");
      setDateFrom("");
      setDateTo("");
      setAmountMin("");
      setAmountMax("");
      setSortOrder("newest");
      setSearch("");
      setFilter("all");
    }}
  >
    Clear filters
  </button>
</div>

          <div className="filter-tabs">
            {(["all", "income", "expense"] as Filter[]).map(option => (
              <button
                key={option}
                className={filter === option ? "filter-active" : ""}
                onClick={() => setFilter(option)}
              >
                {option === "all"
                  ? "All"
                  : option === "income"
                    ? "Income"
                    : "Expenses"}
              </button>
            ))}
          </div>

          <section className="transactions">
            {visibleTransactions.length === 0 ? (
              <div className="empty-state">
                <div className="empty-icon">
                  <Clock />
                </div>

                <h3>No transactions found</h3>
                <p>Try another search or add a transaction.</p>
              </div>
            ) : (
              visibleTransactions.map(item => (
                <article className="transaction-row" key={item.id}>
                  <div className={`transaction-icon ${item.type}`}>
                    {item.type === "income" ? <ArrowDownLeft /> : <ArrowUpRight />}
                  </div>

                  <div className="transaction-info">
                    <h3>{item.title}</h3>
                    <p>{item.category} · {item.date}</p>
                    {item.type === "income" &&
                      (item.eventAttendedDate || item.paymentDate) && (
                        <p className="transaction-dates">
                          {item.eventAttendedDate &&
                            `Event: ${item.eventAttendedDate}`}
                          {item.eventAttendedDate && item.paymentDate && " · "}
                          {item.paymentDate && `Paid: ${item.paymentDate}`}
                        </p>
                      )}
                  </div>

                  <strong className={item.type}>
                    {item.type === "income" ? "+" : "-"}
                    {money(item.amount)}
                  </strong>

                  <button
                    className="row-action"
                    aria-label="Edit transaction"
                    onClick={() => openEditForm(item)}
                  >
                    <Pencil size={16} />
                  </button>

                  <button
                    className="row-action delete-action"
                    aria-label="Delete transaction"
                    onClick={() => deleteTransaction(item.id)}
                  >
                    <Trash2 size={16} />
                  </button>
                </article>
              ))
            )}
          </section>
        </>
      )}

      {activeTab === "pending" && (
        <section className="pending-page">
          <section className="welcome">
            <p>PAYMENTS</p>
            <h2>Pending payments</h2>
          </section>

          <PendingPayments
            payments={data.pendingPayments}
            onChange={handlePendingChange}
            onReceive={handleReceive}
            onExportExcel={() =>
              void exportPendingPaymentsExcel(data.pendingPayments)
            }
          />
        </section>
      )}

      {activeTab === "categories" && (
        <section className="pending-page">
          <section className="welcome">
            <p>SETTINGS</p>
            <h2>Categories</h2>
          </section>

          <CategoryManager
            categories={data.categories}
            transactions={data.transactions}
            onChange={handleCategoriesChange}
          />
        </section>
      )}

      {activeTab === "budgets" && (
        <section className="pending-page">
          <section className="welcome">
            <p>FINANCIAL PLANNING</p>
            <h2>Budgets</h2>
          </section>

          <BudgetManager
            budgets={data.budgets as Budget[]}
            categories={data.categories}
            transactions={data.transactions}
            onChange={handleBudgetsChange}
            onExportExcel={() =>
              void exportBudgetsExcel(
                data.budgets as Budget[],
                data.transactions
              )
            }
          />
        </section>
      )}

      {activeTab === "analytics" && (
        <Analytics
          transactions={data.transactions}
          onExportCSV={() => exportTransactionsCSV(data.transactions)}
          onExportExcel={() =>
            void exportTransactionsExcel(data.transactions)
          }
          onDownloadPDF={() => printFinancialReport(data)}
          onDownloadExcelReport={() =>
            void exportFinancialReportExcel(data.transactions, "All time")
          }
          onBackup={() => exportBackup(data)}
          onRestore={() => backupInputRef.current?.click()}
        />
      )}

      {activeTab === "distribution" && (
        <section className="pending-page">
          <section className="welcome">
            <p>TEAM PAYMENTS</p>
            <h2>Cash distribution</h2>
          </section>

          <CashDistribution
            distributions={data.cashDistributions || []}
            teamMembers={data.teamMembers || []}
                        onDistributionsChange={items =>
              setData(current => ({
                ...current,
                cashDistributions: items,
                deletedTransactionIds: withDeleted(
                  current,
                  current.cashDistributions,
                  items
                )
              }))
            }
                        onTeamMembersChange={items =>
              setData(current => ({
                ...current,
                teamMembers: items,
                deletedTransactionIds: withDeleted(
                  current,
                  current.teamMembers,
                  items
                )
              }))
            }
          />
        </section>
      )}

      {activeTab === "backups" && (
        <section className="pending-page">
          <section className="welcome">
            <p>DATA</p>
            <h2>Backups</h2>
          </section>

          <BackupManager
            currentData={data}
            onExportExcel={() => void exportFullDataExcel(data)}
            onRestore={restoredData => {
              setData({
                ...restoredData,
                budgets: restoredData.budgets || [],
                teamMembers: restoredData.teamMembers || [],
                cashDistributions: restoredData.cashDistributions || [],
                deletedTransactionIds:
                  restoredData.deletedTransactionIds || []
              });

              setSearch("");
              setFilter("all");
              setActiveTab("home");
            }}
          />
        </section>
      )}

      <footer className="app-branding">
        <span>Made by</span>
        <strong>Sanjay S</strong>
      </footer>

      <nav className="bottom-nav">
        <button
          type="button"
          className={`nav-item ${activeTab === "home" ? "active" : ""}`}
          onClick={() => setActiveTab("home")}
        >
          <LayoutDashboard />
          <span>Home</span>
        </button>

        <button
          type="button"
          className={`nav-item ${activeTab === "pending" ? "active" : ""}`}
          onClick={() => setActiveTab("pending")}
        >
          <Clock />
          <span>Pending</span>
        </button>

        <button
          type="button"
          className={`nav-item ${activeTab === "categories" ? "active" : ""}`}
          onClick={() => setActiveTab("categories")}
        >
          <Tags />
          <span>Categories</span>
        </button>

        <button
          type="button"
          className={`nav-item ${activeTab === "budgets" ? "active" : ""}`}
          onClick={() => setActiveTab("budgets")}
        >
          <Wallet />
          <span>Budgets</span>
        </button>

        <button
          type="button"
          className={`nav-item ${activeTab === "analytics" ? "active" : ""}`}
          onClick={() => setActiveTab("analytics")}
        >
          <BarChart3 />
          <span>Analytics</span>
        </button>

        <button
          type="button"
          className={`nav-item ${activeTab === "distribution" ? "active" : ""}`}
          onClick={() => setActiveTab("distribution")}
        >
          <Users />
          <span>Distribution</span>
        </button>

        <button
          type="button"
          className={`nav-item ${activeTab === "backups" ? "active" : ""}`}
          onClick={() => setActiveTab("backups")}
        >
          <Download />
          <span>Backups</span>
        </button>
      </nav>
    </main>
  );
}
