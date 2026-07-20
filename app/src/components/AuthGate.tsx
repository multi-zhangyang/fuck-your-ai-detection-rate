import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from "react";

import { AuthLoadingScreen, LoginPage } from "@/components/LoginPage";
import { AUTH_REQUIRED_EVENT, notifyAuthenticationRequired, setAuthCsrfToken } from "@/lib/authSession";
import { getAuthStatus, loginToWorkspace, logoutFromWorkspace, type AuthStatus } from "@/lib/webServiceAuth";

type AuthContextValue = {
  enabled: boolean;
  username: string;
  busy: boolean;
  error: string;
  logout: () => Promise<void>;
};

const AuthContext = createContext<AuthContextValue>({
  enabled: false,
  username: "",
  busy: false,
  error: "",
  logout: async () => undefined,
});

function errorMessage(error: unknown, fallback: string): string {
  return error instanceof Error && error.message ? error.message : fallback;
}

export function useAuthSession(): AuthContextValue {
  return useContext(AuthContext);
}

export function AuthGate({ children }: { children: ReactNode }) {
  const [status, setStatus] = useState<AuthStatus | null>(null);
  const [checking, setChecking] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");
  const [connectionError, setConnectionError] = useState(false);
  const statusRefreshRef = useRef<Promise<void> | null>(null);

  const refreshStatus = useCallback((sessionMessage = ""): Promise<void> => {
    if (statusRefreshRef.current) return statusRefreshRef.current;
    setChecking(true);
    setConnectionError(false);
    setError(sessionMessage);
    const request = getAuthStatus()
      .then((nextStatus) => setStatus(nextStatus))
      .catch((requestError) => {
        setStatus(null);
        setConnectionError(true);
        setError(errorMessage(requestError, "无法检查登录状态，请确认后端服务可用。"));
      })
      .finally(() => {
        statusRefreshRef.current = null;
        setChecking(false);
      });
    statusRefreshRef.current = request;
    return request;
  }, []);

  useEffect(() => {
    void refreshStatus();
  }, [refreshStatus]);

  useEffect(() => {
    const handleAuthenticationRequired = () => {
      setAuthCsrfToken("");
      void refreshStatus("会话已过期，请重新登录。");
    };
    window.addEventListener(AUTH_REQUIRED_EVENT, handleAuthenticationRequired);
    return () => window.removeEventListener(AUTH_REQUIRED_EVENT, handleAuthenticationRequired);
  }, [refreshStatus]);

  useEffect(() => {
    if (!status?.enabled || !status.authenticated || !status.sessionExpiresAt) return undefined;
    const expiresAt = Date.parse(status.sessionExpiresAt);
    if (!Number.isFinite(expiresAt)) return undefined;
    const remainingMs = Math.max(0, expiresAt - Date.now());
    const timeoutId = window.setTimeout(() => {
      notifyAuthenticationRequired();
    }, Math.min(remainingMs, 2_147_483_647));
    return () => window.clearTimeout(timeoutId);
  }, [status?.authenticated, status?.enabled, status?.sessionExpiresAt]);

  const login = useCallback(async (username: string, password: string) => {
    setSubmitting(true);
    setConnectionError(false);
    setError("");
    try {
      setStatus(await loginToWorkspace(username, password));
    } catch (requestError) {
      setError(errorMessage(requestError, "用户名或密码错误。"));
    } finally {
      setSubmitting(false);
    }
  }, []);

  const logout = useCallback(async () => {
    setSubmitting(true);
    setError("");
    try {
      setStatus(await logoutFromWorkspace());
    } catch (requestError) {
      setError(errorMessage(requestError, "退出登录失败，当前会话仍保持登录状态。"));
    } finally {
      setSubmitting(false);
    }
  }, []);

  const contextValue = useMemo<AuthContextValue>(() => ({
    enabled: Boolean(status?.enabled),
    username: status?.username ?? "",
    busy: submitting,
    error,
    logout,
  }), [error, logout, status?.enabled, status?.username, submitting]);

  if (checking) return <AuthLoadingScreen />;
  if (!status || (status.enabled && !status.authenticated)) {
    return (
      <LoginPage
        busy={submitting || checking}
        error={error}
        connectionError={connectionError}
        onLogin={login}
        onRetry={() => { void refreshStatus(); }}
      />
    );
  }

  return <AuthContext.Provider value={contextValue}>{children}</AuthContext.Provider>;
}
