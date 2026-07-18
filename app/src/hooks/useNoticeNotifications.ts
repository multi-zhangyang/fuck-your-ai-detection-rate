import { useEffect, type Dispatch, type MutableRefObject, type SetStateAction } from "react";

import {
  createNotification,
  getNotificationKey,
  saveNotificationHistory,
} from "@/lib/notificationHelpers";
import { isRawHtmlErrorText } from "@/lib/errorText";
import type { AppNotification, NotificationKind } from "@/lib/uiTypes";

type UseNoticeNotificationsInput = {
  error: string;
  notice: string;
  notificationMessageKeyRef: MutableRefObject<string>;
  setError: (message: string) => void;
  setNotifications: Dispatch<SetStateAction<AppNotification[]>>;
};

export function useNoticeNotifications(input: UseNoticeNotificationsInput) {
  const {
    error,
    notice,
    notificationMessageKeyRef,
    setError,
    setNotifications,
  } = input;

  useEffect(() => {
    const text = error || notice;
    if (!text) {
      notificationMessageKeyRef.current = "";
      return;
    }
    if (error && isRawHtmlErrorText(error)) {
      setError("");
      notificationMessageKeyRef.current = "";
      return;
    }
    const kind: NotificationKind = error ? "error" : "success";
    const key = `${kind}:${text}`;
    if (notificationMessageKeyRef.current === key) {
      return;
    }
    notificationMessageKeyRef.current = key;
    setNotifications((current) => {
      const fresh = createNotification(kind, text);
      const next = [
        fresh,
        ...current.filter((item) => getNotificationKey(item) !== getNotificationKey(fresh)),
      ].slice(0, 80);
      saveNotificationHistory(next);
      return next;
    });
  }, [error, notice, notificationMessageKeyRef, setError, setNotifications]);
}
