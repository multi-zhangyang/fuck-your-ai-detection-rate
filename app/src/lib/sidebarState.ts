export const SIDEBAR_COOKIE_NAME = "sidebar_state";
export const SIDEBAR_COOKIE_MAX_AGE = 60 * 60 * 24 * 7;

export function readSidebarOpenCookie(cookie: string, fallback: boolean): boolean {
  const value = cookie
    .split(";")
    .map((part) => part.trim().split("=", 2))
    .find(([name]) => name === SIDEBAR_COOKIE_NAME)?.[1];
  if (value === "true") return true;
  if (value === "false") return false;
  return fallback;
}

export function createSidebarCookie(open: boolean): string {
  return `${SIDEBAR_COOKIE_NAME}=${open}; path=/; max-age=${SIDEBAR_COOKIE_MAX_AGE}`;
}
