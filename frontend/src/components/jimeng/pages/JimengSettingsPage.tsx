"use client";

import clsx from "clsx";
import {
  CheckCircle2,
  Copy,
  CreditCard,
  DownloadCloud,
  ExternalLink,
  KeyRound,
  Link2,
  Loader2,
  LogIn,
  LogOut,
  RefreshCw,
  Save,
  ServerCog,
  TerminalSquare,
  XCircle,
  type LucideIcon,
} from "lucide-react";
import { useCallback, useEffect, useMemo, useState } from "react";
import PromptPresetManager from "@/components/jimeng/PromptPresetManager";
import { buildLlmModelOptions, type LlmModelOption } from "@/components/jimeng/llm/modelOptions";
import {
  JIMENG_VIDEO_DURATION_OPTIONS,
  JIMENG_VIDEO_MODELS,
  JIMENG_VIDEO_RATIOS,
  clampJimengVideoDuration,
  jimengApi,
  type JimengCheckLoginResponse,
  type JimengCliCapabilities,
  type JimengCliInstallResult,
  type JimengCliResult,
  type JimengLoginAuth,
  type JimengLoginMode,
  type JimengLoginSession,
  type JimengSettings,
} from "@/lib/jimengApi";
import { useJimengStore } from "@/store/jimengStore";

type CliPaths = { config: string | null; tasks: string | null; logs: string | null };
type LoginStatus = "unknown" | "logged_in" | "auth_required" | "logged_out" | "error";
type CliActionKind = "check_cli" | "check_login" | "install_cli" | "login_session" | "login_json" | "logout" | "query_credit";

interface CreditInfo {
  totalCredit: string;
  userId?: string;
  userName?: string;
  vipLevel?: string;
  vipExpireAt?: string;
}

interface AuthInfo {
  url: string;
  userCode?: string;
  deviceCode?: string;
  pollInterval?: string;
  expiresAt?: string;
}

interface CliActionSnapshot {
  label: string;
  kind: CliActionKind;
  response: unknown;
  cliResult: JimengCliResult | null;
  ranAt: string;
}

interface LoginCacheSnapshot {
  status: LoginStatus;
  creditInfo: CreditInfo | null;
  savedAt: string;
}

const LOGIN_CACHE_KEY = "dreamina_cli_login_snapshot";
const MANUAL_LOGIN_JSON_URL = "https://jimeng.jianying.com/dreamina/cli/v1/dreamina_cli_login";
const VIDEO_RESOLUTIONS = ["720p", "1080p"] as const;

const DEFAULT_SETTINGS: Required<JimengSettings> = {
  dreamina_executable: "dreamina",
  generation_provider: "dreamina_cli",
  model_version: "seedance2.0fast",
  poll_seconds: 30,
  duration: 5,
  ratio: "9:16",
  video_resolution: "720p",
  submit_interval_seconds: 3,
  max_in_flight: 10,
  result_poll_interval_seconds: 30,
  max_retry_attempts: 5,
  retry_base_seconds: 30,
  jimeng_api_base_url: "http://localhost:5100",
  jimeng_api_model: "jimeng-video-seedance-2.0-fast",
  jimeng_api_generation_mode: "omni_reference",
  jimeng_api_ratio: "16:9",
  jimeng_api_duration: 5,
  jimeng_api_concurrency: 1,
  jimeng_api_sessions: [],
};

const normalizeSettings = (value: JimengSettings = {}): Required<JimengSettings> => ({
  ...DEFAULT_SETTINGS,
  ...value,
  generation_provider: "dreamina_cli",
  duration: clampJimengVideoDuration(value.duration ?? DEFAULT_SETTINGS.duration),
});

const statusMeta: Record<LoginStatus, { label: string; className: string; icon: LucideIcon }> = {
  unknown: { label: "未检测", className: "border-glass-border bg-surface-inset text-text-secondary", icon: KeyRound },
  logged_in: { label: "已登录", className: "border-emerald-500/30 bg-emerald-500/10 text-emerald-300", icon: CheckCircle2 },
  auth_required: { label: "待授权", className: "border-blue-500/30 bg-blue-500/10 text-blue-300", icon: Link2 },
  logged_out: { label: "未登录", className: "border-amber-500/30 bg-amber-500/10 text-amber-300", icon: XCircle },
  error: { label: "异常", className: "border-red-500/30 bg-red-500/10 text-red-300", icon: XCircle },
};

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null && !Array.isArray(value);

const valueToString = (value: unknown): string | undefined => {
  if (value === null || value === undefined || value === "") {
    return undefined;
  }
  return String(value);
};

const parseJsonObject = (text?: string | null): Record<string, unknown> | null => {
  if (!text) {
    return null;
  }
  try {
    const parsed = JSON.parse(text.trim());
    return isRecord(parsed) ? parsed : null;
  } catch {
    return null;
  }
};

const stringifyResult = (value: unknown): string => {
  if (typeof value === "string") {
    return value;
  }
  try {
    return JSON.stringify(value, null, 2);
  } catch {
    return String(value);
  }
};

const extractLineValue = (rawOutput: string, key: string): string | undefined => {
  const pattern = new RegExp(`^${key}:\\s*(.+)$`, "im");
  return rawOutput.match(pattern)?.[1]?.trim();
};

const asCliResult = (value: unknown): JimengCliResult | null => {
  if (!isRecord(value) || !("raw_output" in value)) {
    return null;
  }
  return {
    submit_id: valueToString(value.submit_id) ?? null,
    gen_status: valueToString(value.gen_status) ?? null,
    result_url: valueToString(value.result_url) ?? null,
    local_paths: Array.isArray(value.local_paths) ? value.local_paths.map(String) : [],
    raw_output: valueToString(value.raw_output) ?? "",
    error_message: valueToString(value.error_message) ?? null,
  };
};

const asCheckLoginResponse = (value: unknown): JimengCheckLoginResponse | null => {
  if (!isRecord(value) || typeof value.logged_in !== "boolean") {
    return null;
  }
  const result = asCliResult(value.result);
  return result ? { logged_in: value.logged_in, result } : null;
};

const readLoginCache = (): LoginCacheSnapshot | null => {
  if (typeof window === "undefined") {
    return null;
  }
  try {
    const raw = window.localStorage.getItem(LOGIN_CACHE_KEY);
    if (!raw) {
      return null;
    }
    const parsed = JSON.parse(raw) as Partial<LoginCacheSnapshot>;
    return parsed.status ? { status: parsed.status, creditInfo: parsed.creditInfo ?? null, savedAt: parsed.savedAt ?? "" } : null;
  } catch {
    return null;
  }
};

const writeLoginCache = (status: LoginStatus, creditInfo: CreditInfo | null) => {
  if (typeof window === "undefined") {
    return;
  }
  window.localStorage.setItem(LOGIN_CACHE_KEY, JSON.stringify({ status, creditInfo, savedAt: new Date().toISOString() }));
};

const clearLoginCache = () => {
  if (typeof window !== "undefined") {
    window.localStorage.removeItem(LOGIN_CACHE_KEY);
  }
};

const parseCreditInfo = (result: JimengCliResult | null): CreditInfo | null => {
  const data = parseJsonObject(result?.raw_output);
  const rawOutput = result?.raw_output || result?.error_message || "";
  const totalCredit = data
    ? valueToString(data.total_credit) ??
      valueToString(data.credit) ??
      valueToString(data.balance) ??
      valueToString(data.remaining_credit)
    : extractLineValue(rawOutput, "total_credit") ??
      extractLineValue(rawOutput, "credit") ??
      extractLineValue(rawOutput, "balance") ??
      extractLineValue(rawOutput, "remaining_credit");

  if (!totalCredit) {
    return null;
  }

  return {
    totalCredit,
    userId: data ? valueToString(data.user_id) ?? valueToString(data.uid) : extractLineValue(rawOutput, "user_id") ?? extractLineValue(rawOutput, "uid"),
    userName: data
      ? valueToString(data.user_name) ?? valueToString(data.username) ?? valueToString(data.nickname) ?? valueToString(data.name)
      : extractLineValue(rawOutput, "user_name") ??
        extractLineValue(rawOutput, "username") ??
        extractLineValue(rawOutput, "nickname") ??
        extractLineValue(rawOutput, "name"),
    vipLevel: data ? valueToString(data.vip_level) ?? valueToString(data.vip) : extractLineValue(rawOutput, "vip_level") ?? extractLineValue(rawOutput, "vip"),
    vipExpireAt: data
      ? valueToString(data.vip_expire_at) ??
        valueToString(data.vip_expired_at) ??
        valueToString(data.vip_end_time) ??
        valueToString(data.vip_expire_time)
      : extractLineValue(rawOutput, "vip_expire_at") ??
        extractLineValue(rawOutput, "vip_expired_at") ??
        extractLineValue(rawOutput, "vip_end_time") ??
        extractLineValue(rawOutput, "vip_expire_time"),
  };
};

const parseAuthInfoFromResult = (result: JimengCliResult | null): AuthInfo | null => {
  if (!result) {
    return null;
  }
  const rawOutput = result.raw_output || result.error_message || "";
  const url = result.result_url ?? extractLineValue(rawOutput, "verification_uri");
  if (!url) {
    return null;
  }
  return {
    url,
    userCode: extractLineValue(rawOutput, "user_code"),
    deviceCode: extractLineValue(rawOutput, "device_code"),
    pollInterval: extractLineValue(rawOutput, "poll_interval"),
    expiresAt: extractLineValue(rawOutput, "expires_at"),
  };
};

const normalizeAuthInfo = (auth: JimengLoginAuth | null | undefined, result: JimengCliResult | null): AuthInfo | null => {
  if (auth?.url) {
    return {
      url: auth.url,
      userCode: valueToString(auth.user_code),
      deviceCode: valueToString(auth.device_code),
      pollInterval: valueToString(auth.poll_interval),
      expiresAt: valueToString(auth.expires_at),
    };
  }
  return parseAuthInfoFromResult(result);
};

export default function JimengSettingsPage() {
  const currentProject = useJimengStore((state) => state.currentProject);
  const [settings, setSettings] = useState<Required<JimengSettings>>(() => normalizeSettings());
  const [paths, setPaths] = useState<CliPaths | null>(null);
  const [capabilities, setCapabilities] = useState<JimengCliCapabilities | null>(null);
  const [loginStatus, setLoginStatus] = useState<LoginStatus>("unknown");
  const [creditInfo, setCreditInfo] = useState<CreditInfo | null>(null);
  const [authInfo, setAuthInfo] = useState<AuthInfo | null>(null);
  const [loginSessionId, setLoginSessionId] = useState<string | null>(null);
  const [pollingLogin, setPollingLogin] = useState(false);
  const [lastAction, setLastAction] = useState<CliActionSnapshot | null>(null);
  const [loading, setLoading] = useState(false);
  const [cliAvailable, setCliAvailable] = useState<boolean | null>(null);
  const [autoCheckingLogin, setAutoCheckingLogin] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [videoModelOptions, setVideoModelOptions] = useState<LlmModelOption[]>([]);

  const capabilityText = useMemo(() => {
    if (!capabilities) {
      return "未检测";
    }
    const limits = capabilities.multimodal_limits;
    const multimodalLimits = limits
      ? `全能参考限制：图片最多 ${limits.max_images} 张，视频最多 ${limits.max_videos} 段，音频最多 ${limits.max_audios} 段，音频 ${limits.audio_min_seconds}-${limits.audio_max_seconds} 秒`
      : "全能参考限制：未上报";
    return [
      `text2video：${capabilities.supports_text2video ? "支持" : "不支持"}`,
      `image2video：${capabilities.supports_image2video ? "支持" : "不支持"}`,
      `multimodal2video：${capabilities.supports_multimodal2video ? "支持" : "不支持"}`,
      `模型：${(capabilities.model_versions ?? []).join(", ") || "未上报"}`,
      `画幅：${(capabilities.ratios ?? []).join(", ") || "未上报"}`,
      multimodalLimits,
      `命令：${capabilities.commands.join(", ")}`,
    ].join("\n");
  }, [capabilities]);

  const loadSettings = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [nextSettings, nextPaths, nextCapabilities] = await Promise.all([
        jimengApi.getSettings(),
        jimengApi.cliPaths(),
        jimengApi.capabilities(),
      ]);
      const normalized = normalizeSettings(nextSettings);
      setSettings(normalized);
      setPaths(nextPaths);
      setCapabilities(nextCapabilities);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "即梦设置加载失败");
    } finally {
      setLoading(false);
    }
  }, []);

  const autoCheckLoginState = useCallback(async () => {
    setAutoCheckingLogin(true);
    try {
      const response = await jimengApi.checkLogin();
      let nextCredit = parseCreditInfo(response.result);
      setLastAction({
        label: "自动检测登录",
        kind: "check_login",
        response,
        cliResult: response.result,
        ranAt: new Date().toLocaleString(),
      });
      if (response.logged_in) {
        if (!nextCredit) {
          try {
            const creditResult = await jimengApi.queryCredit();
            nextCredit = parseCreditInfo(creditResult);
          } catch {
            nextCredit = null;
          }
        }
        setLoginStatus("logged_in");
        setCreditInfo((current) => {
          const resolved = nextCredit ?? current;
          writeLoginCache("logged_in", resolved);
          return resolved;
        });
      } else {
        setLoginStatus("logged_out");
        setCreditInfo(null);
        clearLoginCache();
      }
    } catch {
      setLoginStatus((current) => (current === "unknown" ? "error" : current));
    } finally {
      setAutoCheckingLogin(false);
    }
  }, []);

  useEffect(() => {
    void loadSettings();
  }, [loadSettings]);

  useEffect(() => {
    jimengApi
      .getLlmSettings()
      .then((llmSettings) => setVideoModelOptions(buildLlmModelOptions(llmSettings, "video")))
      .catch(() => setVideoModelOptions([]));
  }, []);

  useEffect(() => {
    const cached = readLoginCache();
    if (cached) {
      setLoginStatus(cached.status);
      setCreditInfo(cached.creditInfo);
    }
    void autoCheckLoginState();
  }, [autoCheckLoginState]);

  const saveSettings = async () => {
    setLoading(true);
    setNotice(null);
    setError(null);
    try {
      const saved = await jimengApi.updateSettings({
        ...settings,
        generation_provider: "dreamina_cli",
        duration: clampJimengVideoDuration(settings.duration),
      });
      const normalized = normalizeSettings(saved);
      setSettings(normalized);
      setNotice("即梦设置已保存");
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "保存即梦设置失败");
    } finally {
      setLoading(false);
    }
  };

  const copyText = async (text: string) => {
    await navigator.clipboard.writeText(text);
    setNotice("已复制到剪贴板");
  };

  const applyLoginSession = useCallback((session: JimengLoginSession, label = "登录授权") => {
    const primaryResult = session.credit_result ?? session.result;
    const nextCredit = parseCreditInfo(session.credit_result) ?? parseCreditInfo(session.result);
    const nextAuth = normalizeAuthInfo(session.auth, session.result);

    setLastAction({
      label,
      kind: "login_session",
      response: session,
      cliResult: primaryResult,
      ranAt: new Date().toLocaleString(),
    });

    if (nextCredit) {
      setCreditInfo(nextCredit);
      writeLoginCache("logged_in", nextCredit);
    }
    if (nextAuth) {
      setAuthInfo(nextAuth);
    }

    if (session.status === "completed") {
      setLoginStatus("logged_in");
      setNotice(nextCredit ? `授权完成，当前余额：${nextCredit.totalCredit}` : "授权完成，正在等待积分返回");
      setError(null);
    } else if (session.status === "failed" || session.status === "canceled") {
      setLoginStatus("error");
      setError(session.error_message || "登录授权失败，请查看原始输出");
    } else if (nextAuth) {
      setLoginStatus("auth_required");
      setNotice("已自动打开即梦授权页；确认后本页会自动刷新积分");
    } else {
      setNotice("登录会话已启动，正在等待即梦返回授权链接");
    }
  }, []);

  const refreshCreditAfterLogin = useCallback(async () => {
    try {
      const creditResult = await jimengApi.queryCredit();
      const nextCredit = parseCreditInfo(creditResult);
      setLastAction({
        label: "授权后查询积分",
        kind: "query_credit",
        response: creditResult,
        cliResult: creditResult,
        ranAt: new Date().toLocaleString(),
      });
      if (nextCredit) {
        setCreditInfo(nextCredit);
        setLoginStatus("logged_in");
        writeLoginCache("logged_in", nextCredit);
        setNotice(`授权完成，当前余额：${nextCredit.totalCredit}`);
      }
    } catch {
      setNotice("授权完成，但自动查询积分失败，可手动点击查询积分");
    }
  }, []);

  const pollLoginSession = useCallback(
    async (sessionId: string) => {
      try {
        const session = await jimengApi.getLoginSession(sessionId);
        applyLoginSession(session);
        if (session.status === "completed") {
          setPollingLogin(false);
          if (!parseCreditInfo(session.credit_result)) {
            await refreshCreditAfterLogin();
          }
        } else if (session.status === "failed" || session.status === "canceled") {
          setPollingLogin(false);
        }
      } catch (caught) {
        setPollingLogin(false);
        setLoginStatus("error");
        setError(caught instanceof Error ? caught.message : "查询登录会话失败");
      }
    },
    [applyLoginSession, refreshCreditAfterLogin],
  );

  useEffect(() => {
    if (!pollingLogin || !loginSessionId) {
      return undefined;
    }
    let disposed = false;
    const tick = async () => {
      if (!disposed) {
        await pollLoginSession(loginSessionId);
      }
    };
    void tick();
    const timer = window.setInterval(() => {
      void tick();
    }, 2000);
    return () => {
      disposed = true;
      window.clearInterval(timer);
    };
  }, [loginSessionId, pollingLogin, pollLoginSession]);

  const startLoginFlow = async (mode: JimengLoginMode, label: string) => {
    setLoading(true);
    setNotice(null);
    setError(null);
    try {
      const session = await jimengApi.startLoginSession(mode, true);
      setLoginSessionId(session.session_id);
      applyLoginSession(session, label);
      const nextAuth = normalizeAuthInfo(session.auth, session.result);
      if (nextAuth?.url) {
        setNotice(session.auth_open_error ? "自动打开授权页失败，请点击下方授权链接" : "已自动打开即梦授权页；确认后本页会自动刷新积分");
      }
      if (session.status === "completed") {
        await refreshCreditAfterLogin();
      } else if (session.status !== "failed" && session.status !== "canceled") {
        setPollingLogin(true);
      }
    } catch (caught) {
      setLoginStatus("error");
      setError(caught instanceof Error ? caught.message : `${label}失败`);
    } finally {
      setLoading(false);
    }
  };

  const cancelLoginFlow = async () => {
    if (!loginSessionId) {
      return;
    }
    setLoading(true);
    setError(null);
    try {
      const session = await jimengApi.cancelLoginSession(loginSessionId);
      setPollingLogin(false);
      applyLoginSession(session, "取消登录授权");
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "取消登录会话失败");
    } finally {
      setLoading(false);
    }
  };

  const importGlobalLoginJson = async () => {
    const text = window.prompt(`请先打开 ${MANUAL_LOGIN_JSON_URL}，复制页面返回的 JSON 后粘贴到这里。此操作只写入当前默认 CLI 登录凭证，不会自动读取浏览器 Cookie。`);
    if (!text) {
      return;
    }
    const parsed = parseJsonObject(text);
    if (!parsed) {
      setError("导入失败：请输入有效的 JSON 对象");
      return;
    }
    setLoading(true);
    setError(null);
    setNotice(null);
    try {
      const response = await jimengApi.importLoginJson(parsed);
      const result = response.credit_result ?? response.result;
      const nextCredit = parseCreditInfo(result);
      setLastAction({
        label: "导入浏览器 JSON",
        kind: "login_json",
        response,
        cliResult: result,
        ranAt: new Date().toLocaleString(),
      });
      if (nextCredit) {
        setLoginStatus("logged_in");
        setCreditInfo(nextCredit);
        writeLoginCache("logged_in", nextCredit);
        setNotice(`JSON 导入完成，当前余额：${nextCredit.totalCredit}`);
      } else {
        setNotice("JSON 导入完成，但未识别到积分字段，可点击查询积分确认");
      }
    } catch (caught) {
      setLoginStatus("error");
      setError(caught instanceof Error ? caught.message : "导入浏览器 JSON 失败");
    } finally {
      setLoading(false);
    }
  };

  const runCliAction = async (kind: CliActionKind, label: string, action: () => Promise<unknown>) => {
    setLoading(true);
    setNotice(null);
    setError(null);
    try {
      const response = await action();
      const checkLogin = asCheckLoginResponse(response);
      const cliResult = checkLogin?.result ?? asCliResult(response);
      const nextCredit = parseCreditInfo(cliResult);
      const nextAuth = parseAuthInfoFromResult(cliResult);

      setLastAction({
        label,
        kind,
        response,
        cliResult,
        ranAt: new Date().toLocaleString(),
      });

      if (nextCredit) {
        setCreditInfo(nextCredit);
        writeLoginCache("logged_in", nextCredit);
      }
      if (nextAuth) {
        setAuthInfo(nextAuth);
      }

      if (kind === "check_cli") {
        const available = isRecord(response) && response.available === true;
        setCliAvailable(available);
        setNotice(available ? "CLI 可用" : "未检测到 dreamina CLI，请检查命令路径");
      } else if (kind === "check_login" && checkLogin) {
        setLoginStatus(checkLogin.logged_in ? "logged_in" : "logged_out");
        if (!checkLogin.logged_in) {
          setCreditInfo(null);
          clearLoginCache();
        }
        setNotice(checkLogin.logged_in ? `检测完成：已登录${nextCredit ? `，余额 ${nextCredit.totalCredit}` : ""}` : "检测完成：未登录");
      } else if (kind === "query_credit") {
        if (nextCredit) {
          setLoginStatus("logged_in");
          setNotice(`查询成功：余额 ${nextCredit.totalCredit}`);
        } else if (cliResult?.error_message) {
          setLoginStatus("error");
          setError("查询积分返回错误，请查看原始输出");
        } else {
          setNotice("查询完成，但未在返回值中识别到余额字段");
        }
      } else if (kind === "logout") {
        setLoginStatus(cliResult?.error_message ? "error" : "logged_out");
        if (!cliResult?.error_message) {
          setCreditInfo(null);
          setAuthInfo(null);
          setPollingLogin(false);
          clearLoginCache();
        }
        setNotice(cliResult?.error_message ? "退出登录返回错误，请查看原始输出" : "已退出登录");
      }
    } catch (caught) {
      setLoginStatus(kind === "check_cli" ? loginStatus : "error");
      setError(caught instanceof Error ? caught.message : `${label}失败`);
    } finally {
      setLoading(false);
    }
  };

  const installCli = async () => {
    setLoading(true);
    setNotice(null);
    setError(null);
    try {
      const response: JimengCliInstallResult = await jimengApi.installCli();
      setLastAction({
        label: "一键安装 CLI",
        kind: "install_cli",
        response,
        cliResult: null,
        ranAt: new Date().toLocaleString(),
      });
      if (response.ok) {
        const check = await jimengApi.checkCli();
        setCliAvailable(check.available);
        setNotice(check.available ? "安装完成，CLI 已可用" : "安装命令已执行，但仍未检测到 CLI，请重启软件后再检测");
      } else {
        setCliAvailable(false);
        setError("安装命令返回失败，请查看最近一次 CLI 返回中的 stdout/stderr");
      }
    } catch (caught) {
      setCliAvailable(false);
      setError(caught instanceof Error ? caught.message : "一键安装 CLI 失败");
    } finally {
      setLoading(false);
    }
  };

  const currentStatus = statusMeta[loginStatus];
  const CurrentStatusIcon = currentStatus.icon;

  return (
    <div className="h-full overflow-y-auto pr-1">
      <div className="flex min-h-0 flex-col gap-4 pb-4">
        <section className="glass-panel sticky top-0 z-20 rounded-xl bg-app-bg/95 px-5 py-4 backdrop-blur-xl">
          <div className="flex flex-col gap-4 xl:flex-row xl:items-center xl:justify-between">
            <div>
              <div className="flex items-center gap-2 text-xs font-medium text-primary">
                <TerminalSquare size={14} />
                即梦设置
              </div>
              <h2 className="mt-2 font-display text-xl font-semibold text-foreground sm:text-2xl">CLI 与账号</h2>
              <p className="mt-2 text-sm text-text-secondary">当前项目：{currentProject?.name ?? "未选择项目"}</p>
            </div>
            <div className="flex flex-col gap-2 sm:flex-row sm:flex-wrap">
              <button
                type="button"
                onClick={loadSettings}
                disabled={loading}
                className="inline-flex h-9 w-full items-center justify-center gap-2 rounded-md border border-glass-border bg-surface-inset px-3 text-sm font-medium text-text-secondary hover:bg-hover-bg hover:text-foreground disabled:cursor-wait disabled:opacity-45 sm:w-auto"
              >
                <RefreshCw size={15} className={loading ? "animate-spin" : ""} />
                刷新
              </button>
              <button
                type="button"
                onClick={saveSettings}
                disabled={loading}
                className="inline-flex h-9 w-full items-center justify-center gap-2 rounded-md border border-primary/40 bg-primary/10 px-3 text-sm font-medium text-primary hover:bg-primary/15 disabled:cursor-wait disabled:opacity-45 sm:w-auto"
              >
                <Save size={15} />
                保存设置
              </button>
            </div>
          </div>
          {(notice || error) && (
            <p
              className={clsx(
                "mt-3 rounded-md border px-3 py-2 text-sm",
                error ? "border-red-500/20 bg-red-500/10 text-red-300" : "border-emerald-500/20 bg-emerald-500/10 text-emerald-300",
              )}
            >
              {error ?? notice}
            </p>
          )}
        </section>

        <section className="glass-panel rounded-xl p-5">
          <div className="flex flex-col gap-2 lg:flex-row lg:items-end lg:justify-between">
            <div>
              <div className="flex items-center gap-2 text-xs font-medium text-primary">
                <ServerCog size={14} />
                全局视频提交参数
              </div>
              <h3 className="mt-2 font-display text-lg font-semibold text-foreground">即梦默认生成参数</h3>
              <p className="mt-2 text-sm leading-6 text-text-secondary">
                这里是单个提交和批量提交的默认值；分镜右侧或批量提交弹窗里手动修改时，会优先使用当次提交参数。
              </p>
            </div>
            <span className="rounded-md border border-primary/25 bg-primary/10 px-3 py-1.5 text-xs text-primary">提交默认值</span>
          </div>
          <div className="mt-4 grid gap-3 sm:grid-cols-2 xl:grid-cols-5">
            <label className="space-y-2 xl:col-span-2">
              <span className="text-xs font-medium text-text-muted">视频模型</span>
              <select
                value={settings.model_version}
                onChange={(event) => setSettings((state) => ({ ...state, model_version: event.target.value }))}
                className="glass-input h-10 w-full text-sm text-foreground"
              >
                {JIMENG_VIDEO_MODELS.map((model) => (
                  <option key={model.value} value={model.value}>
                    {model.label}
                  </option>
                ))}
                {videoModelOptions.length > 0 ? (
                  <optgroup label="大模型视频模型（未完全适配）">
                    {videoModelOptions.map((model) => (
                      <option key={model.value} value={model.value}>
                        {model.label}
                      </option>
                    ))}
                  </optgroup>
                ) : null}
              </select>
              <span className="block text-xs leading-5 text-text-muted">
                即梦官方视频模型列表维护在 <code>frontend/src/lib/jimengApi.ts</code> 的 <code>JIMENG_VIDEO_MODELS</code>；
                后端能力列表维护在 <code>backend/app/api/settings.py</code> 的 <code>_JIMENG_VIDEO_MODELS</code>。
                大模型视频模型来自“大模型设置”，当前仅展示选择，接口未完全适配。
              </span>
            </label>
            <label className="space-y-2">
              <span className="text-xs font-medium text-text-muted">画幅</span>
              <select
                value={settings.ratio}
                onChange={(event) => setSettings((state) => ({ ...state, ratio: event.target.value }))}
                className="glass-input h-10 w-full text-sm text-foreground"
              >
                {JIMENG_VIDEO_RATIOS.map((ratio) => (
                  <option key={ratio} value={ratio}>
                    {ratio}
                  </option>
                ))}
              </select>
            </label>
            <label className="space-y-2">
              <span className="text-xs font-medium text-text-muted">分辨率</span>
              <select
                value={settings.video_resolution}
                onChange={(event) => setSettings((state) => ({ ...state, video_resolution: event.target.value }))}
                className="glass-input h-10 w-full text-sm text-foreground"
              >
                {VIDEO_RESOLUTIONS.map((resolution) => (
                  <option key={resolution} value={resolution}>
                    {resolution}
                  </option>
                ))}
              </select>
            </label>
            <label className="space-y-2">
              <span className="text-xs font-medium text-text-muted">默认时长（秒）</span>
              <select
                value={settings.duration}
                onChange={(event) => setSettings((state) => ({ ...state, duration: Number(event.target.value) }))}
                className="glass-input h-10 w-full text-sm text-foreground"
              >
                {JIMENG_VIDEO_DURATION_OPTIONS.map((duration) => (
                  <option key={duration} value={duration}>
                    {duration} 秒
                  </option>
                ))}
              </select>
            </label>
            <label className="space-y-2">
              <span className="text-xs font-medium text-text-muted">回传轮询（秒）</span>
              <input
                type="number"
                min={5}
                max={300}
                value={settings.poll_seconds}
                onChange={(event) => setSettings((state) => ({ ...state, poll_seconds: Number(event.target.value) || 30 }))}
                className="glass-input h-10 w-full text-sm text-foreground"
              />
            </label>
          </div>
        </section>

        <div className="grid gap-4 xl:grid-cols-[minmax(0,0.8fr)_minmax(420px,1fr)]">
          <section className="glass-panel rounded-xl p-5">
            <h3 className="font-display text-lg font-semibold text-foreground">CLI 路径</h3>
            <p className="mt-2 text-sm leading-6 text-text-secondary">
              这里只管理本机 dreamina 命令路径；上方全局视频参数会作为默认值，单次提交时仍可覆盖。
            </p>
            <div className="mt-4 grid gap-4">
              <label className="space-y-2">
                <span className="text-xs font-medium text-text-muted">CLI 命令路径</span>
                <input
                  value={settings.dreamina_executable}
                  onChange={(event) => setSettings((state) => ({ ...state, dreamina_executable: event.target.value }))}
                  className="glass-input w-full"
                />
              </label>
              <div className="rounded-lg border border-glass-border bg-surface-inset p-3 text-xs leading-5 text-text-muted">
                默认命令为 <span className="font-mono text-foreground">dreamina</span>。如果 CLI 不在 PATH 中，可以填写完整路径。
              </div>
              <button
                className="glass-button inline-flex h-10 items-center justify-center gap-2 disabled:cursor-wait disabled:opacity-50"
                type="button"
                disabled={loading}
                onClick={() => runCliAction("check_cli", "检测 CLI", jimengApi.checkCli)}
              >
                {loading ? <Loader2 size={14} className="animate-spin" /> : <TerminalSquare size={14} />}
                检测 CLI
              </button>
              {cliAvailable === false ? (
                <div className="rounded-lg border border-amber-400/30 bg-amber-500/10 p-4">
                  <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                    <div>
                      <div className="flex items-center gap-2 text-sm font-semibold text-amber-200">
                        <TerminalSquare size={16} />
                        未检测到即梦 CLI
                      </div>
                      <p className="mt-2 text-xs leading-5 text-text-secondary">可以先确认命令路径是否正确；如果本机还没安装，可以执行官方安装命令。</p>
                      <code className="mt-2 block overflow-x-auto rounded border border-glass-border bg-surface-inset px-3 py-2 font-mono text-xs text-foreground">
                        curl -s https://jimeng.jianying.com/cli | bash
                      </code>
                    </div>
                    <button
                      type="button"
                      onClick={installCli}
                      disabled={loading}
                      className="inline-flex h-10 shrink-0 items-center justify-center gap-2 rounded-md border border-amber-300/40 bg-amber-400/15 px-4 text-sm font-medium text-amber-100 hover:bg-amber-400/25 disabled:cursor-wait disabled:opacity-50"
                    >
                      {loading ? <Loader2 size={15} className="animate-spin" /> : <DownloadCloud size={15} />}
                      一键安装
                    </button>
                  </div>
                </div>
              ) : null}
            </div>
          </section>

          <section className="glass-panel rounded-xl p-5">
            <div className="flex items-center justify-between gap-3">
              <h3 className="font-display text-lg font-semibold text-foreground">CLI 账号状态</h3>
              <span className={clsx("inline-flex items-center gap-1.5 rounded-full border px-3 py-1 text-xs font-medium", currentStatus.className)}>
                <CurrentStatusIcon size={13} />
                {autoCheckingLogin ? "自动检测中" : currentStatus.label}
              </span>
            </div>
            <div className="mt-4 rounded-xl border border-glass-border bg-surface-inset p-4">
              <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
                <div>
                  <div className="flex items-center gap-2 text-sm font-semibold text-emerald-300">
                    <CreditCard size={16} />
                    积分余额
                  </div>
                  <div className="mt-3 grid gap-2 text-sm text-text-secondary sm:grid-cols-2">
                    <span>用户 ID：{creditInfo?.userId ?? "--"}</span>
                    <span>用户名：{creditInfo?.userName ?? "CLI 未返回"}</span>
                    <span>VIP：{creditInfo?.vipLevel ?? "--"}</span>
                    <span>VIP 到期：{creditInfo?.vipExpireAt ?? "CLI 未返回"}</span>
                    <span className="sm:col-span-2">最近操作：{lastAction?.label ?? "本地缓存登录状态"}</span>
                  </div>
                </div>
                <div className="font-mono text-3xl font-semibold text-emerald-300">{creditInfo?.totalCredit ?? "--"}</div>
              </div>
            </div>
            <div className="mt-4 grid gap-2 sm:grid-cols-2">
              {loginStatus !== "logged_in" ? (
                <>
                  <button
                    type="button"
                    onClick={() => startLoginFlow("login", "登录授权")}
                    disabled={loading || pollingLogin}
                    className="glass-button inline-flex h-10 items-center justify-center gap-2 text-sm font-medium text-primary disabled:cursor-wait disabled:opacity-50"
                  >
                    <LogIn size={15} />
                    登录授权
                  </button>
                  <button
                    type="button"
                    onClick={() => startLoginFlow("login_debug", "手动登录")}
                    disabled={loading || pollingLogin}
                    className="glass-button inline-flex h-10 items-center justify-center gap-2 text-sm font-medium text-blue-300 disabled:cursor-wait disabled:opacity-50"
                  >
                    <ExternalLink size={15} />
                    手动登录
                  </button>
                </>
              ) : null}
              <button
                type="button"
                onClick={importGlobalLoginJson}
                disabled={loading || pollingLogin}
                className="glass-button inline-flex h-10 items-center justify-center gap-2 text-sm font-medium text-blue-300 disabled:cursor-wait disabled:opacity-50"
              >
                <KeyRound size={15} />
                导入浏览器 JSON
              </button>
              <a
                href={MANUAL_LOGIN_JSON_URL}
                target="_blank"
                rel="noreferrer"
                className="inline-flex min-h-10 items-center justify-center gap-2 rounded-md border border-blue-400/30 bg-blue-500/10 px-3 text-center text-xs font-medium text-blue-300 hover:bg-blue-500/15 sm:col-span-2"
              >
                <ExternalLink size={14} />
                手动导入前，打开即梦 CLI 登录接口复制 JSON 数据
              </a>
              <button
                type="button"
                onClick={() => runCliAction("query_credit", "查询积分", jimengApi.queryCredit)}
                disabled={loading}
                className="glass-button inline-flex h-10 items-center justify-center gap-2 text-sm font-medium text-emerald-300 disabled:cursor-wait disabled:opacity-50"
              >
                <CreditCard size={15} />
                查询积分
              </button>
              <button
                type="button"
                onClick={() => runCliAction("check_login", "检测登录", jimengApi.checkLogin)}
                disabled={loading}
                className="glass-button inline-flex h-10 items-center justify-center gap-2 text-sm font-medium text-text-secondary disabled:cursor-wait disabled:opacity-50"
              >
                <CheckCircle2 size={15} />
                检测登录
              </button>
              <button
                type="button"
                onClick={() => runCliAction("logout", "退出登录", jimengApi.logout)}
                disabled={loading}
                className="glass-button inline-flex h-10 items-center justify-center gap-2 text-sm font-medium text-text-secondary disabled:cursor-wait disabled:opacity-50"
              >
                <LogOut size={15} />
                退出登录
              </button>
            </div>
          </section>
        </div>

        <section className="glass-panel rounded-xl p-5">
          <div className="flex flex-col gap-2 lg:flex-row lg:items-end lg:justify-between">
            <div>
              <h3 className="font-display text-lg font-semibold text-foreground">队列调度</h3>
              <p className="mt-2 text-sm leading-6 text-text-secondary">
                控制独立 worker 的提交节奏与在途任务上限。视频提交后不会阻塞后续任务，worker 会按轮询间隔持续取回结果。
              </p>
            </div>
            <span className="rounded-md border border-primary/25 bg-primary/10 px-3 py-1.5 text-xs text-primary">全局生效</span>
          </div>
          <div className="mt-4 grid gap-3 sm:grid-cols-2 xl:grid-cols-5">
            <label className="space-y-2">
              <span className="text-xs font-medium text-text-muted">提交间隔（秒）</span>
              <input
                type="number"
                min={1}
                max={300}
                value={settings.submit_interval_seconds}
                onChange={(event) => setSettings((state) => ({ ...state, submit_interval_seconds: Number(event.target.value) || 1 }))}
                className="glass-input w-full"
              />
            </label>
            <label className="space-y-2">
              <span className="text-xs font-medium text-text-muted">最大在途任务</span>
              <input
                type="number"
                min={1}
                max={50}
                value={settings.max_in_flight}
                onChange={(event) => setSettings((state) => ({ ...state, max_in_flight: Number(event.target.value) || 1 }))}
                className="glass-input w-full"
              />
            </label>
            <label className="space-y-2">
              <span className="text-xs font-medium text-text-muted">结果轮询（秒）</span>
              <input
                type="number"
                min={5}
                max={300}
                value={settings.result_poll_interval_seconds}
                onChange={(event) => setSettings((state) => ({ ...state, result_poll_interval_seconds: Number(event.target.value) || 5 }))}
                className="glass-input w-full"
              />
            </label>
            <label className="space-y-2">
              <span className="text-xs font-medium text-text-muted">最大重试次数</span>
              <input
                type="number"
                min={0}
                max={20}
                value={settings.max_retry_attempts}
                onChange={(event) => setSettings((state) => ({ ...state, max_retry_attempts: Math.max(0, Number(event.target.value) || 0) }))}
                className="glass-input w-full"
              />
            </label>
            <label className="space-y-2">
              <span className="text-xs font-medium text-text-muted">重试基数（秒）</span>
              <input
                type="number"
                min={5}
                max={600}
                value={settings.retry_base_seconds}
                onChange={(event) => setSettings((state) => ({ ...state, retry_base_seconds: Number(event.target.value) || 5 }))}
                className="glass-input w-full"
              />
            </label>
          </div>
        </section>


        {authInfo && loginStatus !== "logged_in" ? (
          <section className="glass-panel rounded-xl border-blue-500/30 bg-blue-500/5 p-5">
            <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
              <div>
                <div className="flex items-center gap-2 text-sm font-semibold text-blue-300">
                  <Link2 size={16} />
                  即梦 OAuth 授权待完成
                </div>
                <p className="mt-2 text-sm leading-6 text-text-secondary">
                  系统已自动打开即梦授权页面。你在即梦页面确认后，这里会持续轮询登录会话并自动刷新积分余额。
                </p>
                {loginSessionId ? <p className="mt-2 font-mono text-xs text-text-muted">session：{loginSessionId}</p> : null}
              </div>
              <div className="flex w-full shrink-0 flex-col gap-2 sm:w-auto sm:flex-row sm:flex-wrap">
                <a
                  href={authInfo.url}
                  target="_blank"
                  rel="noreferrer"
                  className="inline-flex h-10 w-full items-center justify-center gap-2 rounded-md border border-blue-400/40 bg-blue-500/15 px-4 text-sm font-medium text-blue-200 hover:bg-blue-500/25 sm:w-auto"
                >
                  <ExternalLink size={15} />
                  打开授权链接
                </a>
                {pollingLogin ? (
                  <button
                    type="button"
                    onClick={cancelLoginFlow}
                    className="inline-flex h-10 w-full items-center justify-center gap-2 rounded-md border border-red-400/40 bg-red-500/10 px-4 text-sm font-medium text-red-200 hover:bg-red-500/20 sm:w-auto"
                  >
                    <XCircle size={15} />
                    取消等待
                  </button>
                ) : null}
              </div>
            </div>
            <div className="mt-4 grid gap-3 md:grid-cols-2 xl:grid-cols-4">
              <InfoField label="user_code" value={authInfo.userCode} onCopy={copyText} />
              <InfoField label="device_code" value={authInfo.deviceCode} onCopy={copyText} />
              <InfoField label="poll_interval" value={authInfo.pollInterval} />
              <InfoField label="expires_at" value={authInfo.expiresAt} />
            </div>
            <div className="mt-3 rounded-md border border-glass-border bg-surface-inset p-3">
              <div className="mb-1 text-xs font-medium text-text-muted">verification_uri</div>
              <div className="break-all font-mono text-xs leading-5 text-foreground">{authInfo.url}</div>
            </div>
          </section>
        ) : null}

        <section className="glass-panel rounded-xl p-5">
          <h3 className="font-display text-lg font-semibold text-foreground">CLI 路径与能力</h3>
          <div className="mt-4 grid gap-4 lg:grid-cols-2">
            <div className="space-y-2 rounded-lg border border-glass-border bg-surface-inset p-4 text-xs text-text-secondary">
              <p>
                <span className="text-text-muted">config：</span>
                <span className="font-mono text-foreground">{paths?.config ?? "~/.dreamina_cli/config.toml"}</span>
              </p>
              <p>
                <span className="text-text-muted">tasks：</span>
                <span className="font-mono text-foreground">{paths?.tasks ?? "~/.dreamina_cli/tasks.db"}</span>
              </p>
              <p>
                <span className="text-text-muted">logs：</span>
                <span className="font-mono text-foreground">{paths?.logs ?? "~/.dreamina_cli/logs/"}</span>
              </p>
            </div>
            <pre className="min-h-28 whitespace-pre-wrap rounded-lg border border-glass-border bg-surface-inset p-4 text-xs leading-5 text-text-secondary">
              {capabilityText}
            </pre>
          </div>
        </section>

        <section className="glass-panel rounded-xl p-5">
          <div className="flex items-center justify-between gap-3">
            <h3 className="font-display text-lg font-semibold text-foreground">最近一次 CLI 返回</h3>
            <span className="text-xs text-text-muted">{lastAction?.ranAt ?? "尚未执行 CLI 操作"}</span>
          </div>
          <pre className="mt-4 max-h-80 overflow-auto whitespace-pre-wrap rounded-md border border-glass-border bg-surface-inset p-4 text-xs leading-5 text-text-secondary">
            {lastAction ? `${lastAction.label}\n${stringifyResult(lastAction.response)}` : "点击上方 CLI 按钮后，这里会显示完整返回值。"}
          </pre>
        </section>

        <PromptPresetManager />
      </div>
    </div>
  );
}

function InfoField({
  label,
  value,
  onCopy,
}: {
  label: string;
  value?: string;
  onCopy?: (value: string) => void;
}) {
  return (
    <div className="rounded-md border border-glass-border bg-surface-inset p-3">
      <div className="mb-1 text-xs font-medium text-text-muted">{label}</div>
      <div className="flex items-center justify-between gap-2">
        <span className="min-w-0 truncate font-mono text-sm text-foreground">{value ?? "--"}</span>
        {value && onCopy ? (
          <button
            type="button"
            onClick={() => onCopy(value)}
            className="inline-flex h-7 w-7 shrink-0 items-center justify-center rounded border border-glass-border text-text-secondary hover:bg-hover-bg hover:text-foreground"
            title={`复制 ${label}`}
          >
            <Copy size={13} />
          </button>
        ) : null}
      </div>
    </div>
  );
}
