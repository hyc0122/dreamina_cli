"use client";

import clsx from "clsx";
import {
  BadgeDollarSign,
  Film,
  FolderOpen,
  History,
  Image as ImageIcon,
  ListChecks,
  Moon,
  Settings,
  Sun,
  type LucideIcon,
} from "lucide-react";
import { useCallback, useEffect, useState } from "react";
import JimengAssetManagerPage from "@/components/jimeng/JimengAssetManagerPage";
import JimengGenerationHistoryPage from "@/components/jimeng/JimengGenerationHistoryPage";
import JimengProjectListPage from "@/components/jimeng/JimengProjectListPage";
import JimengQueuePage from "@/components/jimeng/JimengQueuePage";
import JimengSettingsPage from "@/components/jimeng/JimengSettingsPage";
import JimengWorkbenchPage from "@/components/jimeng/JimengWorkbenchPage";
import { jimengApi } from "@/lib/jimengApi";
import type { JimengPageMode } from "@/lib/jimengApi";
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
    placeholderText: "查看队列启动、暂停、重试和下载状态。",
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
    id: "settings",
    label: "即梦设置",
    placeholderTitle: "即梦设置",
    placeholderText: "配置 CLI 登录、路径和提示词模板。",
    icon: Settings,
  },
];

const getInitialTheme = (): ThemeMode => {
  if (typeof window === "undefined") {
    return "dark";
  }
  const stored = window.localStorage.getItem(THEME_STORAGE_KEY);
  return stored === "light" ? "light" : "dark";
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
  const [totalCredit, setTotalCredit] = useState<string | null>(null);
  const activeConfig = JIMENG_PAGES.find((page) => page.id === activePage) ?? JIMENG_PAGES[0];
  const activeIndex = JIMENG_PAGES.findIndex((page) => page.id === activeConfig.id) + 1;

  useEffect(() => {
    const root = document.documentElement;
    root.classList.remove("dark", "light");
    root.classList.add(theme);
    window.localStorage.setItem(THEME_STORAGE_KEY, theme);
  }, [theme]);

  const refreshTotalCredit = useCallback(async () => {
    try {
      const response = await jimengApi.listCliAccounts();
      setTotalCredit(response.total_credit ?? readCachedTotalCredit());
    } catch {
      setTotalCredit(readCachedTotalCredit());
    }
  }, []);

  useEffect(() => {
    void refreshTotalCredit();
  }, [activePage, refreshTotalCredit]);

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
    if (activePage === "settings") {
      return <JimengSettingsPage />;
    }
    return <PlaceholderPage page={activeConfig} />;
  };

  return (
    <div className="h-screen w-screen overflow-hidden px-3 py-2 sm:px-4">
      <div className="flex h-full w-full flex-col gap-2">
        <header className="shrink-0 border-b border-glass-border pb-2">
          <div className="flex flex-col gap-2 lg:flex-row lg:items-center lg:justify-between">
          <div className="flex min-w-0 flex-wrap items-center gap-x-3 gap-y-1">
            <h1 className="font-display text-lg font-bold text-foreground">小狼专用-即梦CLI</h1>
            <span className="rounded-md border border-glass-border bg-surface-inset px-2 py-1 text-xs text-text-muted">面向分镜批量生成</span>
          </div>
          <div className="flex flex-wrap items-center gap-2">
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
        </header>

        <nav className="flex shrink-0 gap-2 overflow-x-auto border-b border-glass-border pb-2 sm:flex-wrap" aria-label="即梦批量模块导航">
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

        <main className="min-h-0 flex-1 overflow-hidden">{renderPage()}</main>
      </div>
    </div>
  );
}
