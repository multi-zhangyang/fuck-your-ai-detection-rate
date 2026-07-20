export const AUTH_REQUIRED_EVENT = "fyadr:auth-required";

let csrfToken = "";
let authenticationRequiredNotified = false;

export function setAuthCsrfToken(value: string | null | undefined): void {
  csrfToken = String(value ?? "").trim();
}

export function getAuthCsrfToken(): string {
  return csrfToken;
}

export function notifyAuthenticationRequired(): void {
  if (authenticationRequiredNotified) return;
  authenticationRequiredNotified = true;
  setAuthCsrfToken("");
  if (typeof window !== "undefined") {
    window.dispatchEvent(new CustomEvent(AUTH_REQUIRED_EVENT));
  }
}

export function clearAuthenticationRequiredNotification(): void {
  authenticationRequiredNotified = false;
}

export function withAuthRequestInit(init?: RequestInit): RequestInit {
  const headers = new Headers(init?.headers ?? {});
  const method = String(init?.method ?? "GET").toUpperCase();
  if (!["GET", "HEAD", "OPTIONS"].includes(method) && csrfToken) {
    headers.set("X-FYADR-CSRF", csrfToken);
  }
  return {
    ...init,
    credentials: "include",
    headers,
  };
}
