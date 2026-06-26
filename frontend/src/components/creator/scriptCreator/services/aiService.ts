import { jimengApi } from "@/lib/jimengApi";

interface AIOptions {
  apiBaseUrl: string;
  apiKey: string;
  modelName: string;
  signal?: AbortSignal;
  timeoutMs?: number;
}

interface StreamOptions {
  onToken: (token: string) => void;
  signal?: AbortSignal;
}

function modelRef(value: string): string | undefined {
  return value.includes(":") ? value : undefined;
}

function timeoutSeconds(options: AIOptions): number {
  return Math.max(30, Math.ceil((options.timeoutMs || 180000) / 1000));
}

function abortError(): DOMException {
  return new DOMException("Generation stopped", "AbortError");
}

function throwIfAborted(signal?: AbortSignal) {
  if (signal?.aborted) {
    throw abortError();
  }
}

export async function callAI(
  prompt: string,
  maxTokens: number,
  temperature: number,
  options: AIOptions,
): Promise<string> {
  throwIfAborted(options.signal);
  try {
    const response = await jimengApi.creatorChatFallback({
      model_id: modelRef(options.modelName),
      prompt,
      max_tokens: maxTokens,
      temperature,
      timeout_seconds: timeoutSeconds(options),
    });
    throwIfAborted(options.signal);
    return response.content;
  } catch (error) {
    if (error instanceof DOMException && error.name === "AbortError") throw error;
    throw new Error(error instanceof Error ? error.message : "大模型接口请求失败");
  }
}

export async function callAIWithFallback(
  prompt: string,
  maxTokens: number,
  temperature: number,
  options: AIOptions,
  fallbackModels: string[],
): Promise<string> {
  throwIfAborted(options.signal);
  try {
    const response = await jimengApi.creatorChatFallback({
      model_id: modelRef(options.modelName),
      fallback_model_id_1: modelRef(fallbackModels[0] || ""),
      fallback_model_id_2: modelRef(fallbackModels[1] || ""),
      prompt,
      max_tokens: maxTokens,
      temperature,
      timeout_seconds: timeoutSeconds(options),
    });
    throwIfAborted(options.signal);
    return response.content;
  } catch (error) {
    if (error instanceof DOMException && error.name === "AbortError") throw error;
    throw new Error(error instanceof Error ? error.message : "大模型 fallback 请求失败");
  }
}

export async function callAIStream(
  prompt: string,
  streamOptions: StreamOptions,
  maxTokens: number,
  temperature: number,
  options: AIOptions,
): Promise<string> {
  const content = await callAI(prompt, maxTokens, temperature, {
    ...options,
    signal: streamOptions.signal || options.signal,
  });
  streamOptions.onToken(content);
  return content;
}