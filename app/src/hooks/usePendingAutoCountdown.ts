import { useEffect, useRef, type Dispatch, type SetStateAction } from "react";

import {
  isCountdownAutoAction,
  type PendingAutoAction,
  type PendingAutoNextRoundAction,
  type PendingAutoRetryAction,
} from "@/lib/autoRun";

type UsePendingAutoCountdownInput = {
  pendingAutoAction: PendingAutoAction | null;
  setPendingAutoAction: Dispatch<SetStateAction<PendingAutoAction | null>>;
  performPendingAutoAction: (
    action: PendingAutoRetryAction | PendingAutoNextRoundAction,
  ) => void | Promise<void>;
};

export function usePendingAutoCountdown(input: UsePendingAutoCountdownInput) {
  const { pendingAutoAction, setPendingAutoAction, performPendingAutoAction } = input;
  const performRef = useRef(performPendingAutoAction);
  performRef.current = performPendingAutoAction;

  useEffect(() => {
    const action = pendingAutoAction;
    if (!isCountdownAutoAction(action)) {
      return undefined;
    }
    if (action.secondsRemaining <= 0) {
      void performRef.current(action);
      return undefined;
    }
    const timer = window.setTimeout(() => {
      setPendingAutoAction((current) => {
        if (!isCountdownAutoAction(current) || current.id !== action.id) {
          return current;
        }
        return { ...current, secondsRemaining: Math.max(0, current.secondsRemaining - 1) };
      });
    }, 1000);
    return () => window.clearTimeout(timer);
  }, [pendingAutoAction, setPendingAutoAction]);
}
