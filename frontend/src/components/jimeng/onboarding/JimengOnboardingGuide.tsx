"use client";

import clsx from "clsx";
import { ArrowRight, CheckCircle2, ChevronLeft, ChevronRight, X, type LucideIcon } from "lucide-react";
import { useMemo, useState } from "react";
import type { JimengPageMode } from "@/lib/jimengApi";

interface OnboardingStep {
  title: string;
  body: string;
  targetPage?: JimengPageMode;
}

interface JimengOnboardingGuideProps {
  open: boolean;
  onClose: () => void;
  onNavigate: (page: JimengPageMode) => void;
}

const STEPS: OnboardingStep[] = [
  {
    title: "新建剧本",
    body: "在剧本列表输入项目名称，选择风格和横竖屏，必要时选择继承某个旧分镜的资产。",
    targetPage: "projects",
  },
  {
    title: "配置即梦 CLI 和大模型设置",
    body: "先在即梦设置确认 CLI 登录、worker 和队列参数，再到大模型设置配置资产生图模型。",
    targetPage: "settings",
  },
  {
    title: "手动添加资产描述",
    body: "进入资产管理，新建角色、场景或道具，填写名称、别名、分类和描述。",
    targetPage: "assets",
  },
  {
    title: "批量添加资产描述",
    body: "用导入资产描述批量粘贴 JSON 或 CSV，角色分类使用单人或群演。",
    targetPage: "assets",
  },
  {
    title: "手动生图",
    body: "选中单个资产，确认全局生图模型、画幅、质量和风格参考图后点击 AI 生图。",
    targetPage: "assets",
  },
  {
    title: "批量生图",
    body: "使用批量生图弹窗，先全选未生图资产，再统一提交资产生图任务。",
    targetPage: "assets",
  },
  {
    title: "手动添加分镜",
    body: "进入分镜工作台，点击添加分镜，逐条编辑分镜提示词。",
    targetPage: "workbench",
  },
  {
    title: "批量添加分镜",
    body: "使用导入分镜，并参考格式示例填写推荐时长、场景、人物、环境描述和分镜正文。",
    targetPage: "workbench",
  },
  {
    title: "全选并匹配资产",
    body: "全选分镜后点击匹配选中资产，只按资产列表里的完整名称匹配角色、场景和道具。",
    targetPage: "workbench",
  },
  {
    title: "批量检测时长",
    body: "批量检测会读取推荐时长或总时长约等规则，没有识别到的分镜会在提示里列出来。",
    targetPage: "workbench",
  },
  {
    title: "批量设置模型",
    body: "点击批量提交打开参数弹窗，选择生成模式、视频模型、画幅、分辨率、时长来源和提交间隔。",
    targetPage: "workbench",
  },
  {
    title: "单个分镜提交和批量分镜提交",
    body: "单个分镜在右侧提交，批量分镜先全选未制作视频，再在批量提交弹窗确认参数后自动进入即梦排队。",
    targetPage: "workbench",
  },
];

function GuideButton({
  icon: Icon,
  children,
  onClick,
  disabled = false,
  tone = "default",
}: {
  icon: LucideIcon;
  children: string;
  onClick: () => void;
  disabled?: boolean;
  tone?: "default" | "primary";
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className={clsx(
        "inline-flex h-10 items-center justify-center gap-2 rounded-lg border px-4 text-sm font-semibold transition-colors disabled:cursor-not-allowed disabled:opacity-45",
        tone === "primary"
          ? "border-primary/40 bg-primary text-white hover:bg-primary/90"
          : "border-glass-border bg-surface-inset text-text-secondary hover:bg-hover-bg hover:text-foreground",
      )}
    >
      <Icon size={16} />
      {children}
    </button>
  );
}

export default function JimengOnboardingGuide({ open, onClose, onNavigate }: JimengOnboardingGuideProps) {
  const [activeIndex, setActiveIndex] = useState(0);
  const active = STEPS[activeIndex];
  const progressText = useMemo(() => `${activeIndex + 1}/${STEPS.length}`, [activeIndex]);

  if (!open) {
    return null;
  }

  const goToPage = () => {
    if (active.targetPage) {
      onNavigate(active.targetPage);
    }
  };

  return (
    <div className="fixed inset-0 z-[80] flex items-center justify-center bg-overlay px-4 py-6 backdrop-blur-sm">
      <section className="w-full max-w-3xl rounded-xl border border-glass-border bg-elevated p-5 shadow-2xl">
        <div className="flex items-start justify-between gap-3">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.24em] text-primary">New User Guide</p>
            <h2 className="mt-2 font-display text-2xl font-semibold text-foreground">新手引导</h2>
            <p className="mt-2 max-w-2xl text-sm leading-6 text-text-secondary">
              按顺序模拟完整流程：先建剧本和配置环境，再准备资产、生成图片、导入分镜、匹配资产并提交视频。
            </p>
          </div>
          <button type="button" onClick={onClose} className="grid h-10 w-10 place-items-center rounded-lg border border-glass-border text-text-secondary hover:bg-hover-bg hover:text-foreground">
            <X size={18} />
          </button>
        </div>

        <div className="mt-5 grid gap-4 lg:grid-cols-[220px_minmax(0,1fr)]">
          <ol className="max-h-[420px] space-y-2 overflow-y-auto pr-1">
            {STEPS.map((step, index) => {
              const selected = index === activeIndex;
              return (
                <li key={step.title}>
                  <button
                    type="button"
                    onClick={() => setActiveIndex(index)}
                    className={clsx(
                      "flex w-full items-center gap-2 rounded-lg border px-3 py-2 text-left text-sm transition-colors",
                      selected ? "border-primary/45 bg-primary/12 text-foreground" : "border-glass-border bg-surface-inset text-text-secondary hover:bg-hover-bg hover:text-foreground",
                    )}
                  >
                    <span className="grid h-6 w-6 shrink-0 place-items-center rounded-full border border-current text-xs font-mono">{index + 1}</span>
                    <span className="min-w-0 flex-1 truncate">{step.title}</span>
                  </button>
                </li>
              );
            })}
          </ol>

          <div className="rounded-xl border border-glass-border bg-surface-inset p-5">
            <div className="flex items-center justify-between gap-3">
              <span className="rounded-md border border-primary/30 bg-primary/10 px-2 py-1 font-mono text-xs text-primary">{progressText}</span>
              <span className="inline-flex items-center gap-1.5 rounded-md border border-emerald-400/25 bg-emerald-500/10 px-2 py-1 text-xs text-emerald-200">
                <CheckCircle2 size={13} />
                可随时关闭
              </span>
            </div>
            <h3 className="mt-4 font-display text-xl font-semibold text-foreground">{active.title}</h3>
            <p className="mt-3 min-h-[84px] text-sm leading-7 text-text-secondary">{active.body}</p>
            <div className="mt-6 flex flex-wrap items-center justify-between gap-2">
              <GuideButton icon={ChevronLeft} onClick={() => setActiveIndex((value) => Math.max(0, value - 1))} disabled={activeIndex === 0}>
                上一步
              </GuideButton>
              <div className="flex flex-wrap gap-2">
                {active.targetPage ? (
                  <GuideButton icon={ArrowRight} onClick={goToPage}>
                    进入对应页面
                  </GuideButton>
                ) : null}
                <GuideButton icon={ChevronRight} onClick={() => setActiveIndex((value) => Math.min(STEPS.length - 1, value + 1))} disabled={activeIndex === STEPS.length - 1} tone="primary">
                  下一步
                </GuideButton>
              </div>
            </div>
          </div>
        </div>
      </section>
    </div>
  );
}
