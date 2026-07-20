import { clearAuthenticationRequiredNotification, setAuthCsrfToken } from "@/lib/authSession";
import { requestJson } from "@/lib/webServiceHttp";

export type AuthStatus = {
  ok: true;
  enabled: boolean;
  authenticated: boolean;
  username: string;
  csrfToken: string;
  sessionExpiresAt: string;
};

function adoptAuthStatus(status: AuthStatus): AuthStatus {
  setAuthCsrfToken(status.enabled ? status.csrfToken : "");
  if (!status.enabled || status.authenticated) {
    clearAuthenticationRequiredNotification();
  }
  return status;
}

export async function getAuthStatus(): Promise<AuthStatus> {
  return adoptAuthStatus(await requestJson<AuthStatus>("/api/auth/status", { timeoutMs: 5_000 }));
}

export async function loginToWorkspace(username: string, password: string): Promise<AuthStatus> {
  return adoptAuthStatus(await requestJson<AuthStatus>("/api/auth/login", {
    method: "POST",
    body: JSON.stringify({ username, password }),
    timeoutMs: 10_000,
  }));
}

export async function logoutFromWorkspace(): Promise<AuthStatus> {
  return adoptAuthStatus(await requestJson<AuthStatus>("/api/auth/logout", { method: "POST", timeoutMs: 5_000 }));
}
