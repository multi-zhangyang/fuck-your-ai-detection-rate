import { createContext, useCallback, useContext, useMemo, type ReactNode } from "react";
import { toast } from "sonner";

import { Toaster } from "@/components/ui/sonner";

export type NotificationKind = "success" | "error" | "info" | "warning";

export interface NotificationInput {
  kind: NotificationKind;
  title: string;
  text?: string;
}

interface NotificationContextValue {
  notify: (value: NotificationInput) => void;
}

const NotificationContext = createContext<NotificationContextValue | null>(null);

function showToast(value: NotificationInput) {
  const options = {
    id: "fyadr-operation-feedback",
    description: value.text?.trim() || undefined,
  };

  if (value.kind === "error") toast.error(value.title, options);
  else if (value.kind === "warning") toast.warning(value.title, options);
  else if (value.kind === "info") toast.info(value.title, options);
  else toast.success(value.title, options);
}

export function AppNotificationProvider({ children }: { children: ReactNode }) {
  const notify = useCallback((value: NotificationInput) => {
    const title = value.title.trim();
    if (!title) return;
    showToast({ ...value, title });
  }, []);

  const context = useMemo(() => ({ notify }), [notify]);

  return (
    <NotificationContext.Provider value={context}>
      {children}
      <Toaster position="top-right" />
    </NotificationContext.Provider>
  );
}

export function useAppNotifications(): NotificationContextValue {
  const value = useContext(NotificationContext);
  if (!value) throw new Error("useAppNotifications must be used inside AppNotificationProvider");
  return value;
}
