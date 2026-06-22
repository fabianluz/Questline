"use client";

import {
  createContext,
  useCallback,
  useContext,
  useRef,
  useState,
} from "react";
import { Check, Info, TriangleAlert, X } from "lucide-react";
import { cn } from "@/lib/utils";

/**
 * Minimal app-wide toast system. `useToast()` returns a `toast()` you can call
 * from anywhere under <ToastProvider>. Supports an optional action button
 * (used for Undo). Auto-dismisses; action toasts linger longer.
 */
type Variant = "default" | "success" | "error";
type Toast = {
  id: number;
  title: string;
  description?: string;
  variant: Variant;
  action?: { label: string; onClick: () => void };
};
type ToastInput = Omit<Toast, "id" | "variant"> & { variant?: Variant };

const ToastCtx = createContext<(t: ToastInput) => void>(() => {});

export function useToast() {
  return useContext(ToastCtx);
}

const ICON: Record<Variant, typeof Info> = {
  default: Info,
  success: Check,
  error: TriangleAlert,
};
const TONE: Record<Variant, string> = {
  default: "border-trails-trim/60",
  success: "border-trails-good/60",
  error: "border-trails-bad/60",
};
const ICON_TONE: Record<Variant, string> = {
  default: "text-trails-accent",
  success: "text-trails-good",
  error: "text-trails-bad",
};

export function ToastProvider({ children }: { children: React.ReactNode }) {
  const [items, setItems] = useState<Toast[]>([]);
  const seq = useRef(0);

  const dismiss = useCallback(
    (id: number) => setItems((xs) => xs.filter((t) => t.id !== id)),
    [],
  );

  const toast = useCallback(
    (t: ToastInput) => {
      const id = ++seq.current;
      const item: Toast = { id, variant: "default", ...t };
      setItems((xs) => [...xs, item]);
      setTimeout(() => dismiss(id), t.action ? 9000 : 4500);
    },
    [dismiss],
  );

  return (
    <ToastCtx.Provider value={toast}>
      {children}
      <div
        aria-live="polite"
        aria-label="Notifications"
        className="pointer-events-none fixed bottom-4 right-4 z-[100] flex w-[min(92vw,22rem)] flex-col gap-2"
      >
        {items.map((t) => {
          const Icon = ICON[t.variant];
          return (
            <div
              key={t.id}
              role={t.variant === "error" ? "alert" : "status"}
              className={cn(
                "pointer-events-auto flex items-start gap-2 rounded-md border-2 bg-trails-panel/95 p-3 shadow-xl backdrop-blur",
                TONE[t.variant],
              )}
            >
              <Icon className={cn("mt-0.5 h-4 w-4 shrink-0", ICON_TONE[t.variant])} />
              <div className="min-w-0 flex-1">
                <p className="text-sm font-semibold text-trails-fg">{t.title}</p>
                {t.description && (
                  <p className="mt-0.5 text-xs text-trails-fg-dim">{t.description}</p>
                )}
                {t.action && (
                  <button
                    onClick={() => {
                      t.action!.onClick();
                      dismiss(t.id);
                    }}
                    className="mt-1.5 rounded-md border border-trails-accent/60 bg-trails-accent/10 px-2 py-0.5 font-display text-[10px] uppercase tracking-widest text-trails-accent hover:bg-trails-accent/20"
                  >
                    {t.action.label}
                  </button>
                )}
              </div>
              <button
                onClick={() => dismiss(t.id)}
                aria-label="Dismiss notification"
                className="shrink-0 rounded p-0.5 text-trails-fg-dim hover:text-trails-fg"
              >
                <X className="h-3.5 w-3.5" />
              </button>
            </div>
          );
        })}
      </div>
    </ToastCtx.Provider>
  );
}
