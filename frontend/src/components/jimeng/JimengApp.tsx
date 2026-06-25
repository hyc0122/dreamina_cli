"use client";

import clsx from "clsx";
import {
  BadgeDollarSign,
  BookOpen,
  Bot,
  Clapperboard,
  ExternalLink,
  Film,
  FolderOpen,
  History,
  Image as ImageIcon,
  KeyRound,
  ListChecks,
  MessageSquare,
  Moon,
  CircleHelp,
  Settings,
  Sun,
  type LucideIcon,
} from "lucide-react";
import { useCallback, useEffect, useState } from "react";
import UpdateRequiredScreen from "@/components/jimeng/UpdateRequiredScreen";
import JimengOnboardingGuide from "@/components/jimeng/onboarding/JimengOnboardingGuide";
import JimengLauncherPage from "@/components/jimeng/pages/JimengLauncherPage";
import JimengAssetManagerPage from "@/components/jimeng/pages/JimengAssetManagerPage";
import JimengGenerationHistoryPage from "@/components/jimeng/pages/JimengGenerationHistoryPage";
import JimengProjectListPage from "@/components/jimeng/pages/JimengProjectListPage";
import JimengQueuePage from "@/components/jimeng/pages/JimengQueuePage";
import JimengSettingsPage from "@/components/jimeng/pages/JimengSettingsPage";
import JimengApiPage from "@/components/jimeng/pages/JimengApiPage";
import JimengWorkbenchPage from "@/components/jimeng/pages/JimengWorkbenchPage";
import LlmSettingsPage from "@/components/jimeng/llm/LlmSettingsPage";
import { jimengApi } from "@/lib/jimengApi";
import type { JimengCliResult, JimengPageMode, JimengRuntimeInfo, JimengVersionStatus } from "@/lib/jimengApi";
import { useJimengStore } from "@/store/jimengStore";

type ThemeMode = "dark" | "light";

interface JimengPageConfig {
  id: JimengPageMode;
  label: string;
  placeholderTitle: string;
  placeholderText: string;
  icon: LucideIcon;
}

const THEME_STORAGE_KEY = "dreamina_cli_theme";
const LOGIN_CACHE_KEY = "dreamina_cli_login_snapshot";
const ONBOARDING_STORAGE_KEY = "dreamina_cli_onboarding_seen_v1";
const APP_DISPLAY_NAME = "即梦cli自动排队助手";
const HELP_URL = "https://my.feishu.cn/docx/AfO9d2Gd0ovLpLxpeN2cjm1xnF2?from=from_copylink";
const FEEDBACK_URL = "https://my.feishu.cn/share/base/form/shrcneH6UB1riprQBXtvMLycffc";

const JIMENG_PAGES: JimengPageConfig[] = [
  {
    id: "projects",
    label: "剧本列表",
    placeholderTitle: "剧本列表",
    placeholderText: "管理即梦批量项目。",
    icon: FolderOpen,
  },
  {
    id: "workbench",
    label: "分镜工作台",
    placeholderTitle: "分镜工作台",
    placeholderText: "编辑分镜、绑定资产并提交生成。",
    icon: Film,
  },
  {
    id: "assets",
    label: "资产管理",
    placeholderTitle: "资产管理",
    placeholderText: "管理角色、场景、道具和角色音色。",
    icon: ImageIcon,
  },
  {
    id: "queue",
    label: "即梦排队",
    placeholderTitle: "即梦排队",
    placeholderText: "查看自动提交排队、暂停、重试和下载状态。",
    icon: ListChecks,
  },
  {
    id: "history",
    label: "生成记录",
    placeholderTitle: "生成记录",
    placeholderText: "管理候选视频、默认视频和锁定结果。",
    icon: History,
  },
  {
    id: "llm",
    label: "大模型设置",
    placeholderTitle: "大模型设置",
    placeholderText: "配置资产图片纯文本生图使用的大模型供应商。",
    icon: Bot,
  },
  {
    id: "jimeng_api",
    label: "即梦 API",
    placeholderTitle: "即梦 API",
    placeholderText: "配置 jimeng-api 服务、SessionID 账号和 API 模型。",
    icon: KeyRound,
  },
  {
    id: "settings",
    label: "官方CLI",
    placeholderTitle: "官方CLI",
    placeholderText: "配置官方 CLI 登录、路径和提交默认参数。",
    icon: Settings,
  },
];

const PAGE_GROUPS: Array<{ title: string; pages: JimengPageConfig[] }> = [
  { title: "创作", pages: JIMENG_PAGES.filter((page) => ["projects", "workbench", "assets"].includes(page.id)) },
  { title: "生产", pages: JIMENG_PAGES.filter((page) => ["queue", "history"].includes(page.id)) },
  { title: "配置", pages: JIMENG_PAGES.filter((page) => ["llm", "jimeng_api", "settings"].includes(page.id)) },
];

const getInitialTheme = (): ThemeMode => {
  if (typeof window === "undefined") {
    return "dark";
  }
  const stored = window.localStorage.getItem(THEME_STORAGE_KEY);
  return stored === "light" ? "light" : "dark";
};

const getShellRoute = (): "launcher" | "app" => {
  if (typeof window === "undefined") {
    return "app";
  }
  return window.location.hash === "#/launcher" ? "launcher" : "app";
};

const readCachedTotalCredit = (): string | null => {
  if (typeof window === "undefined") {
    return null;
  }
  try {
    const parsed = JSON.parse(window.localStorage.getItem(LOGIN_CACHE_KEY) || "null") as { creditInfo?: { totalCredit?: string } } | null;
    return parsed?.creditInfo?.totalCredit ?? null;
  } catch {
    return null;
  }
};

const parseJsonObject = (text: string | null | undefined): Record<string, unknown> | null => {
  if (!text) {
    return null;
  }
  try {
    const value = JSON.parse(text);
    return typeof value === "object" && value !== null && !Array.isArray(value) ? (value as Record<string, unknown>) : null;
  } catch {
    return null;
  }
};

const valueToString = (value: unknown): string | null => {
  if (value === null || value === undefined || value === "") {
    return null;
  }
  return String(value);
};

const extractLineValue = (text: string, key: string): string | null => {
  const match = text.match(new RegExp(`${key}\\s*[:=]\\s*([^\\n\\r]+)`, "i"));
  return match?.[1]?.trim() || null;
};

const readCreditFromCliResult = (result: JimengCliResult): string | null => {
  const data = parseJsonObject(result.raw_output);
  const rawOutput = result.raw_output || result.error_message || "";
  return data
    ? valueToString(data.total_credit) ?? valueToString(data.credit) ?? valueToString(data.balance) ?? valueToString(data.remaining_credit)
    : extractLineValue(rawOutput, "total_credit") ??
        extractLineValue(rawOutput, "credit") ??
        extractLineValue(rawOutput, "balance") ??
        extractLineValue(rawOutput, "remaining_credit");
};

function PlaceholderPage({ page }: { page: JimengPageConfig }) {
  const Icon = page.icon;
  return (
    <section className="glass-panel flex min-h-[420px] flex-col items-center justify-center rounded-xl p-8 text-center">
      <div className="flex h-12 w-12 items-center justify-center rounded-lg border border-glass-border bg-surface-inset text-primary">
        <Icon size={22} />
      </div>
      <h2 className="mt-4 font-display text-xl font-semibold text-foreground">{page.placeholderTitle}</h2>
      <p className="mt-2 max-w-md text-sm leading-6 text-text-secondary">{page.placeholderText}</p>
    </section>
  );
}

export default function JimengApp() {
  const activePage = useJimengStore((state) => state.activePage);
  const setActivePage = useJimengStore((state) => state.setActivePage);
  const [theme, setTheme] = useState<ThemeMode>(getInitialTheme);
  const [shellRoute, setShellRoute] = useState<"launcher" | "app">(getShellRoute);
  const [totalCredit, setTotalCredit] = useState<string | null>(null);
  const [runtimeInfo, setRuntimeInfo] = useState<JimengRuntimeInfo | null>(null);
  const [versionStatus, setVersionStatus] = useState<JimengVersionStatus | null>(null);
  const [versionChecked, setVersionChecked] = useState(false);
  const [autoOpenedUpdateVersion, setAutoOpenedUpdateVersion] = useState<string | null>(null);
  const [onboardingOpen, setOnboardingOpen] = useState(false);
  const activeConfig = JIMENG_PAGES.find((page) => page.id === activePage) ?? JIMENG_PAGES[0];
  const activeIndex = JIMENG_PAGES.findIndex((page) => page.id === activeConfig.id) + 1;
  const currentVersion = versionStatus?.current_version ?? runtimeInfo?.version ?? "--";
  const appName = versionStatus?.app_name ?? runtimeInfo?.app_name ?? APP_DISPLAY_NAME;

  useEffect(() => {
    const root = document.documentElement;
    root.classList.remove("dark", "light");
    root.classList.add(theme);
    window.localStorage.setItem(THEME_STORAGE_KEY, theme);
  }, [theme]);

  useEffect(() => {
    const syncRoute = () => setShellRoute(getShellRoute());
    window.addEventListener("hashchange", syncRoute);
    syncRoute();
    return () => window.removeEventListener("hashchange", syncRoute);
  }, []);

  const openMainApp = useCallback(() => {
    if (typeof window !== "undefined") {
      window.location.hash = "#/app";
    }
    setShellRoute("app");
  }, []);

  const refreshTotalCredit = useCallback(async () => {
    try {
      const response = await jimengApi.queryCredit();
      setTotalCredit(readCreditFromCliResult(response) ?? readCachedTotalCredit());
    } catch {
      setTotalCredit(readCachedTotalCredit());
    }
  }, []);

  const refreshVersionStatus = useCallback(async () => {
    setVersionChecked(false);
    try {
      const status = await jimengApi.getAppVersion();
      setVersionStatus(status);
    } catch {
      setVersionStatus(null);
    } finally {
      setVersionChecked(true);
    }
  }, []);

  useEffect(() => {
    void refreshVersionStatus();
  }, [refreshVersionStatus]);

  useEffect(() => {
    if (typeof window === "undefined" || shellRoute !== "app") {
      return;
    }
    if (window.localStorage.getItem(ONBOARDING_STORAGE_KEY) === "done") {
      return;
    }
    const timer = window.setTimeout(() => setOnboardingOpen(true), 500);
    return () => window.clearTimeout(timer);
  }, [shellRoute]);

  const closeOnboarding = useCallback(() => {
    if (typeof window !== "undefined") {
      window.localStorage.setItem(ONBOARDING_STORAGE_KEY, "done");
    }
    setOnboardingOpen(false);
  }, []);

  useEffect(() => {
    if (!versionStatus?.update_required || autoOpenedUpdateVersion === versionStatus.latest_version) {
      return;
    }
    setAutoOpenedUpdateVersion(versionStatus.latest_version);
    const timer = window.setTimeout(() => {
      window.open(versionStatus.update_url, "_blank", "noopener,noreferrer");
    }, 800);
    return () => window.clearTimeout(timer);
  }, [autoOpenedUpdateVersion, versionStatus]);

  useEffect(() => {
    void refreshTotalCredit();
  }, [activePage, refreshTotalCredit]);

  useEffect(() => {
    let mounted = true;
    void jimengApi
      .getRuntimeInfo()
      .then((info) => {
        if (mounted) {
          setRuntimeInfo(info);
        }
      })
      .catch(() => {
        if (mounted) {
          setRuntimeInfo(null);
        }
      });
    return () => {
      mounted = false;
    };
  }, []);

  const renderPage = () => {
    if (activePage === "projects") {
      return <JimengProjectListPage />;
    }
    if (activePage === "workbench") {
      return <JimengWorkbenchPage />;
    }
    if (activePage === "assets") {
      return <JimengAssetManagerPage />;
    }
    if (activePage === "queue") {
      return <JimengQueuePage />;
    }
    if (activePage === "history") {
      return <JimengGenerationHistoryPage />;
    }
    if (activePage === "llm") {
      return <LlmSettingsPage />;
    }
    if (activePage === "jimeng_api") {
      return <JimengApiPage />;
    }
    if (activePage === "settings") {
      return <JimengSettingsPage />;
    }
    return <PlaceholderPage page={activeConfig} />;
  };

  if (!versionChecked) {
    return (
      <div className="flex h-screen w-screen items-center justify-center bg-app-bg px-4 text-center">
        <div className="rounded-xl border border-glass-border bg-panel-bg px-6 py-5 shadow-xl">
          <p className="text-xs font-semibold uppercase tracking-[0.24em] text-primary">Version Check</p>
          <h1 className="mt-2 font-display text-xl font-semibold text-foreground">{APP_DISPLAY_NAME}</h1>
          <p className="mt-2 text-sm text-text-secondary">正在检查云端版本号...</p>
        </div>
      </div>
    );
  }

  if (versionStatus?.update_required) {
    return <UpdateRequiredScreen status={versionStatus} onRetry={refreshVersionStatus} />;
  }

  if (shellRoute === "launcher") {
    return <JimengLauncherPage onOpenApp={openMainApp} versionStatus={versionStatus} />;
  }

  return (
    <div className="h-screen w-screen overflow-hidden p-3 sm:p-4">
      <div className="grid h-full w-full gap-3 lg:grid-cols-[230px_minmax(0,1fr)]">
        <aside className="hidden min-h-0 overflow-hidden rounded-2xl border border-glass-border bg-panel-bg/80 p-4 shadow-xl backdrop-blur-xl lg:flex lg:flex-col">
          <div className="grid h-20 place-items-center rounded-2xl border border-primary/20 bg-primary/10 text-center">
            <div>
              <div className="font-display text-xl font-bold text-foreground">{appName}</div>
              <div className="mt-1 font-mono text-xs text-primary">{currentVersion}</div>
            </div>
          </div>
          <nav className="mt-5 flex min-h-0 flex-1 flex-col gap-4 overflow-auto" aria-label="即梦模块导航">
            {PAGE_GROUPS.map((group) => (
              <div key={group.title}>
                <div className="mb-2 px-2 text-xs font-semibold uppercase tracking-[0.2em] text-text-muted">{group.title}</div>
                <div className="space-y-1.5">
                  {group.pages.map((page) => {
                    const isActive = activePage === page.id;
                    const Icon = page.icon;
                    return (
                      <button
                        key={page.id}
                        type="button"
                        aria-pressed={isActive}
                        onClick={() => setActivePage(page.id)}
                        className={clsx(
                          "flex h-11 w-full items-center gap-3 rounded-xl border px-3 text-left text-sm font-semibold transition-colors",
                          isActive
                            ? "border-primary/30 bg-primary/10 text-foreground"
                            : "border-transparent text-text-secondary hover:border-glass-border hover:bg-hover-bg hover:text-foreground",
                        )}
                      >
                        <Icon size={17} className={isActive ? "text-primary" : ""} />
                        <span>{page.label}</span>
                      </button>
                    );
                  })}
                </div>
              </div>
            ))}
          </nav>
          <div className="mt-4 rounded-xl border border-glass-border bg-surface-inset p-3 text-xs leading-5 text-text-muted">
            <div className="flex items-center gap-2 font-semibold text-foreground">
              <Clapperboard size={14} className="text-primary" />
              当前模块
            </div>
            <div className="mt-1">{activeConfig.label}</div>
          </div>
        </aside>

        <div className="flex min-w-0 flex-col overflow-hidden rounded-2xl border border-glass-border bg-app-bg/70 shadow-xl backdrop-blur-xl">
          <header className="shrink-0 border-b border-glass-border bg-panel-bg/80 p-3">
            <div className="flex flex-col gap-3 xl:flex-row xl:items-center xl:justify-between">
              <div className="flex min-w-0 flex-wrap items-center gap-x-3 gap-y-2">
                <h1 className="font-display text-lg font-bold text-foreground lg:hidden">{appName}</h1>
                <span className="rounded-md border border-glass-border bg-surface-inset px-2 py-1 text-xs text-text-muted">面向分镜批量生成</span>
                <span className="rounded-md border border-primary/25 bg-primary/10 px-2 py-1 text-xs font-mono text-primary">
                  {currentVersion}
                </span>
                {runtimeInfo?.project_dir && (
                  <span
                    className="inline-flex max-w-full items-center gap-1 rounded-md border border-glass-border bg-surface-inset px-2 py-1 text-xs text-text-muted sm:max-w-[520px]"
                    title={`项目根目录：${runtimeInfo.project_dir}\n数据目录：${runtimeInfo.data_dir}\n输出目录：${runtimeInfo.output_dir}`}
                  >
                    <FolderOpen size={13} className="shrink-0 text-primary" />
                    <span className="shrink-0 text-text-secondary">根目录</span>
                    <span className="truncate font-mono text-foreground">{runtimeInfo.project_dir}</span>
                  </span>
                )}
              </div>
              <div className="flex flex-wrap items-center gap-2">
            <button
              type="button"
              onClick={() => setOnboardingOpen(true)}
              className="inline-flex h-9 items-center gap-1.5 rounded-lg border border-primary/30 bg-primary/10 px-3 text-sm font-semibold text-primary transition-colors hover:bg-primary/15"
            >
              <CircleHelp size={15} />
              新手引导
            </button>
            <a
              href={HELP_URL}
              target="_blank"
              rel="noreferrer"
              className="inline-flex h-9 items-center gap-1.5 rounded-lg border border-cyan-300/30 bg-cyan-400/10 px-3 text-sm font-semibold text-cyan-300 transition-colors hover:bg-cyan-400/15"
            >
              <BookOpen size={15} />
              使用说明
              <ExternalLink size={12} />
            </a>
            <a
              href={FEEDBACK_URL}
              target="_blank"
              rel="noreferrer"
              className="inline-flex h-9 items-center gap-1.5 rounded-lg border border-amber-300/30 bg-amber-400/10 px-3 text-sm font-semibold text-amber-200 transition-colors hover:bg-amber-400/15"
            >
              <MessageSquare size={15} />
              问题反馈
              <ExternalLink size={12} />
            </a>
            <div className="flex h-9 items-center gap-2 rounded-lg border border-emerald-400/25 bg-emerald-500/10 px-3 text-sm text-emerald-300">
              <BadgeDollarSign size={15} />
              <span className="text-xs text-emerald-200">积分总额</span>
              <span className="font-mono font-semibold">{totalCredit ?? "--"}</span>
            </div>
            <div className="flex rounded-lg border border-glass-border bg-glass p-1 backdrop-blur-xl" aria-label="主题切换">
              <button
                type="button"
                aria-pressed={theme === "dark"}
                onClick={() => setTheme("dark")}
                className={clsx(
                  "inline-flex h-8 items-center gap-1.5 rounded-md px-3 text-xs font-medium transition-colors",
                  theme === "dark" ? "bg-primary/15 text-primary" : "text-text-secondary hover:bg-hover-bg hover:text-foreground",
                )}
              >
                <Moon size={14} />
                深色
              </button>
              <button
                type="button"
                aria-pressed={theme === "light"}
                onClick={() => setTheme("light")}
                className={clsx(
                  "inline-flex h-8 items-center gap-1.5 rounded-md px-3 text-xs font-medium transition-colors",
                  theme === "light" ? "bg-primary/15 text-primary" : "text-text-secondary hover:bg-hover-bg hover:text-foreground",
                )}
              >
                <Sun size={14} />
                浅色
              </button>
            </div>
            <div className="rounded-lg border border-glass-border bg-glass px-4 py-2 text-sm text-text-secondary backdrop-blur-xl">
              当前页面{" "}
              <span className="font-mono text-primary">
                {activeIndex}/{JIMENG_PAGES.length}
              </span>
            </div>
          </div>
            </div>
            <nav className="mt-3 flex shrink-0 gap-2 overflow-x-auto lg:hidden" aria-label="即梦批量模块导航">
          {JIMENG_PAGES.map((page) => {
            const isActive = activePage === page.id;
            const Icon = page.icon;

            return (
              <button
                key={page.id}
                type="button"
                aria-pressed={isActive}
                onClick={() => setActivePage(page.id)}
                className={clsx(
                  "flex shrink-0 items-center gap-2 rounded-lg border px-3 py-1.5 text-sm font-medium transition-all duration-200",
                  isActive
                    ? "border-primary/40 bg-primary/10 text-foreground"
                    : "border-transparent text-text-secondary hover:border-glass-border hover:bg-hover-bg hover:text-foreground",
                )}
              >
                <Icon size={16} className={isActive ? "text-primary" : ""} />
                <span>{page.label}</span>
              </button>
            );
          })}
        </nav>
          </header>

          <main className="min-h-0 flex-1 overflow-hidden">{renderPage()}</main>
        </div>
        <JimengOnboardingGuide open={onboardingOpen} onClose={closeOnboarding} onNavigate={setActivePage} />
      </div>
    </div>
  );
}
