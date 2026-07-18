export type NotificationKind = "success" | "error";

export type AppNotification = {
  id: string;
  kind: NotificationKind;
  title: string;
  text: string;
  time: string;
  read: boolean;
};

export type RuntimeTaskTone = "blue" | "amber" | "red" | "emerald" | "slate";

export type RuntimeTaskCenterItem = {
  id: string;
  title: string;
  status: string;
  tone: RuntimeTaskTone;
  running: boolean;
  percent?: number;
  actionLabel?: string;
  onAction?: () => void;
  cancelLabel?: string;
  onCancel?: () => void;
};

export type ConfirmDialogTone = "neutral" | "info" | "warning" | "danger";

export type ConfirmDialogOptions = {
  title: string;
  description?: string;
  details?: string[];
  confirmLabel?: string;
  cancelLabel?: string;
  tone?: ConfirmDialogTone;
};

export type ConfirmDialogState = ConfirmDialogOptions & {
  id: number;
};
