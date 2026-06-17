export interface BrowserLocationLike {
  protocol: string;
  host: string;
  hostname: string;
}

const DEFAULT_DEV_API_PORT = "18177";

export function resolveApiUrl(fromEnv: string | undefined, location: BrowserLocationLike | undefined, isDev: boolean): string {
  if (fromEnv?.trim()) {
    return fromEnv.trim().replace(/\/$/, "");
  }
  if (!location) {
    return `http://127.0.0.1:${DEFAULT_DEV_API_PORT}`;
  }
  if (isDev) {
    return `${location.protocol}//${location.hostname}:${DEFAULT_DEV_API_PORT}`;
  }
  return `${location.protocol}//${location.host}`;
}

