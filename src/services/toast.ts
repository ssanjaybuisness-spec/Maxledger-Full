/**
 * Tiny dependency-free toast used for short confirmations such as
 * "Saved to Downloads". It lives outside React so any service can call it.
 * A toast can carry action buttons (for example "Open" and "Share").
 */
export interface ToastAction {
  label: string;
  onClick: () => void | Promise<void>;
}

export interface ToastOptions {
  duration?: number;
  actions?: ToastAction[];
}

let activeToast: HTMLDivElement | null = null;
let hideTimer: ReturnType<typeof setTimeout> | undefined;

function dismiss(toast: HTMLDivElement) {
  toast.remove();

  if (activeToast === toast) activeToast = null;
}

export function showToast(
  message: string,
  options: number | ToastOptions = {}
): void {
  if (typeof document === "undefined") return;

  const config: ToastOptions =
    typeof options === "number" ? { duration: options } : options;

  const actions = config.actions || [];
  const duration = config.duration ?? (actions.length ? 10000 : 4000);

  if (activeToast) {
    activeToast.remove();
    activeToast = null;
  }

  if (hideTimer) clearTimeout(hideTimer);

  const toast = document.createElement("div");

  toast.setAttribute("role", "status");

  Object.assign(toast.style, {
    position: "fixed",
    left: "50%",
    bottom: "calc(110px + env(safe-area-inset-bottom, 0px))",
    transform: "translateX(-50%)",
    width: "min(92vw, 420px)",
    padding: "14px 16px",
    borderRadius: "16px",
    background: "#17261d",
    color: "#e8f1ec",
    border: "1px solid #34d399",
    boxShadow: "0 12px 30px rgba(0,0,0,0.45)",
    fontSize: "13px",
    fontWeight: "600",
    lineHeight: "1.45",
    textAlign: "center",
    zIndex: "100000",
    wordBreak: "break-word",
    boxSizing: "border-box"
  });

  const text = document.createElement("div");

  text.textContent = message;
  toast.appendChild(text);

  if (actions.length) {
    const row = document.createElement("div");

    Object.assign(row.style, {
      display: "flex",
      gap: "8px",
      marginTop: "12px"
    });

    actions.forEach((action, index) => {
      const button = document.createElement("button");

      button.type = "button";
      button.textContent = action.label;

      Object.assign(button.style, {
        flex: "1",
        minHeight: "40px",
        border: index === 0 ? "0" : "1px solid #34d399",
        borderRadius: "10px",
        background: index === 0 ? "#34d399" : "transparent",
        color: index === 0 ? "#08140e" : "#34d399",
        fontSize: "13px",
        fontWeight: "800",
        cursor: "pointer"
      });

      button.addEventListener("click", () => {
        dismiss(toast);
        void Promise.resolve(action.onClick());
      });

      row.appendChild(button);
    });

    const close = document.createElement("button");

    close.type = "button";
    close.setAttribute("aria-label", "Dismiss");
    close.textContent = "✕";

    Object.assign(close.style, {
      flex: "0 0 40px",
      minHeight: "40px",
      border: "1px solid #26352f",
      borderRadius: "10px",
      background: "transparent",
      color: "#9aa9a0",
      fontSize: "14px",
      cursor: "pointer"
    });

    close.addEventListener("click", () => dismiss(toast));
    row.appendChild(close);
    toast.appendChild(row);
  }

  document.body.appendChild(toast);
  activeToast = toast;

  hideTimer = setTimeout(() => dismiss(toast), duration);
}
