import { resolveApiUrl } from "@/lib/apiUrl";

const getApiUrl = (): string => {
  const fromEnv = import.meta.env.VITE_DREAMINA_API_URL as string | undefined;
  return resolveApiUrl(fromEnv, typeof window !== "undefined" ? window.location : undefined, import.meta.env.DEV);
};

export const API_URL = getApiUrl();
