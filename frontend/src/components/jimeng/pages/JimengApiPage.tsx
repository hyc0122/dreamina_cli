"use client";

import clsx from "clsx";
import { CheckCircle2, Plus, Save, ServerCog, Trash2 } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import {
  JIMENG_API_VIDEO_MODELS,
  JIMENG_VIDEO_DURATION_OPTIONS,
  JIMENG_VIDEO_RATIOS,
  clampJimengVideoDuration,
  jimengApi,
  type JimengApiSessionSetting,
  type JimengSettings,
} from "@/lib/jimengApi";

const VIDEO_RESOLUTIONS = ["720p", "1080p"] as const;

const DEFAULT_API_SETTINGS = {
  jimeng_api_base_url: "http://localhost:5100",
  jimeng_api_model: "api-seedance2.0-fast",
  jimeng_api_generation_mode: "omni_reference",
  jimeng_api_ratio: "9:16",
  jimeng_api_duration: 5,
  jimeng_api_concurrency: 1,
  jimeng_api_sessions: [] as JimengApiSessionSetting[],
  video_resolution: "720p",
};

const normalizeSettings = (value: JimengSettings = {}) => ({
  ...DEFAULT_API_SETTINGS,
  ...value,
  jimeng_api_model: JIMENG_API_VIDEO_MODELS.some((model) => model.value === value.jimeng_api_model)
    ? value.jimeng_api_model
    : DEFAULT_API_SETTINGS.jimeng_api_model,
  jimeng_api_duration: clampJimengVideoDuration(value.jimeng_api_duration ?? DEFAULT_API_SETTINGS.jimeng_api_duration),
  jimeng_api_sessions: Array.isArray(value.jimeng_api_sessions) ? value.jimeng_api_sessions : [],
  video_resolution: value.video_resolution || DEFAULT_API_SETTINGS.video_resolution,
});

export default function JimengApiPage() {
  const [settings, setSettings] = useState(() => normalizeSettings());
  const [loading, setLoading] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [newLabel, setNewLabel] = useState("");
  const [newSessionid, setNewSessionid] = useState("");

  const enabledSessionCount = useMemo(
    () => settings.jimeng_api_sessions.filter((session) => session.enabled && session.sessionid.trim()).length,
    [settings.jimeng_api_sessions],
  );

  useEffect(() => {
    let mounted = true;
    setLoading(true);
    jimengApi
      .getSettings()
      .then((data) => {
        if (mounted) {
          setSettings(normalizeSettings(data));
        }
      })
      .catch((exc) => {
        if (mounted) {
          setError(exc instanceof Error ? exc.message : "读取即梦 API 设置失败");
        }
      })
      .finally(() => {
        if (mounted) {
          setLoading(false);
        }
      });
    return () => {
      mounted = false;
    };
  }, []);

  const update = <K extends keyof typeof settings>(key: K, value: (typeof settings)[K]) => {
    setSettings((state) => ({ ...state, [key]: value }));
  };

  const save = async (useAsGlobalDefault = false) => {
    setLoading(true);
    setError(null);
    setNotice(null);
    try {
      const payload: JimengSettings = {
        jimeng_api_base_url: settings.jimeng_api_base_url,
        jimeng_api_model: settings.jimeng_api_model,
        jimeng_api_generation_mode: settings.jimeng_api_generation_mode,
        jimeng_api_ratio: settings.jimeng_api_ratio,
        jimeng_api_duration: settings.jimeng_api_duration,
        jimeng_api_concurrency: settings.jimeng_api_concurrency,
        jimeng_api_sessions: settings.jimeng_api_sessions,
        video_resolution: settings.video_resolution,
      };
      if (useAsGlobalDefault) {
        payload.generation_provider = "jimeng_api";
        payload.model_version = settings.jimeng_api_model;
                payload.ratio = settings.jimeng_api_ratio;
                payload.duration = settings.jimeng_api_duration;
        payload.video_resolution = settings.video_resolution;
      }
      const saved = await jimengApi.updateSettings(payload);
      setSettings(normalizeSettings(saved));
      setNotice(useAsGlobalDefault ? "已保存，并设为分镜提交默认通道。" : "即梦 API 设置已保存。");
    } catch (exc) {
      setError(exc instanceof Error ? exc.message : "保存即梦 API 设置失败");
    } finally {
      setLoading(false);
    }
  };

  const addSession = () => {
    const label = newLabel.trim() || `账号 ${settings.jimeng_api_sessions.length + 1}`;
    const sessionid = newSessionid.trim();
    if (!sessionid) {
      setError("请先填写 sessionid。");
      return;
    }
    setSettings((state) => ({
      ...state,
      jimeng_api_sessions: [...state.jimeng_api_sessions, { label, sessionid, enabled: true }],
    }));
    setNewLabel("");
    setNewSessionid("");
    setNotice("账号已加入列表，记得点击保存设置。");
    setError(null);
  };

  const updateSession = (index: number, patch: Partial<JimengApiSessionSetting>) => {
    setSettings((state) => ({
      ...state,
      jimeng_api_sessions: state.jimeng_api_sessions.map((session, itemIndex) => (itemIndex === index ? { ...session, ...patch } : session)),
    }));
  };

  const deleteSession = (index: number) => {
    setSettings((state) => ({
      ...state,
      jimeng_api_sessions: state.jimeng_api_sessions.filter((_, itemIndex) => itemIndex !== index),
    }));
  };

  return (
    <div className="h-full overflow-auto">
      <div className="mx-auto flex w-full max-w-[1500px] flex-col gap-4 p-3 sm:p-4">
        <section className="glass-panel rounded-xl p-5">
          <div className="flex flex-col gap-3 lg:flex-row lg:items-end lg:justify-between">
            <div>
              <div className="text-xs font-semibold uppercase tracking-[0.24em] text-primary">Jimeng API</div>
              <h2 className="mt-2 font-display text-2xl font-semibold text-foreground">即梦 API 通道</h2>
              <p className="mt-2 max-w-3xl text-sm leading-6 text-text-secondary">
                这里接入本地或服务器上的 jimeng-api 服务，和官方 CLI 分开管理。分镜提交时选择 api-* 模型会走这个通道。
              </p>
            </div>
            <div className="grid gap-2 text-sm sm:grid-cols-2">
              <span className="rounded-lg border border-glass-border bg-surface-inset px-3 py-2 text-text-secondary">
                启用账号：<b className="text-foreground">{enabledSessionCount}</b>
              </span>
              <span className="rounded-lg border border-glass-border bg-surface-inset px-3 py-2 text-text-secondary">
                默认模型：<b className="text-foreground">{settings.jimeng_api_model}</b>
              </span>
            </div>
          </div>
          {(notice || error) && (
            <p
              className={clsx(
                "mt-4 rounded-lg border px-3 py-2 text-sm",
                error ? "border-red-500/30 bg-red-500/10 text-red-300" : "border-emerald-500/30 bg-emerald-500/10 text-emerald-300",
              )}
            >
              {error ?? notice}
            </p>
          )}
        </section>

        <section className="glass-panel rounded-xl p-5">
          <div className="flex items-center gap-2 text-sm font-semibold text-primary">
            <ServerCog size={16} />
            服务与默认参数
          </div>
          <div className="mt-4 grid gap-3 xl:grid-cols-5">
            <label className="space-y-2 xl:col-span-2">
              <span className="text-xs font-medium text-text-muted">jimeng-api 服务地址</span>
              <input
                value={settings.jimeng_api_base_url}
                onChange={(event) => update("jimeng_api_base_url", event.target.value)}
                className="glass-input h-10 w-full text-sm text-foreground"
                placeholder="http://localhost:5100"
              />
            </label>
            <label className="space-y-2">
              <span className="text-xs font-medium text-text-muted">默认模型</span>
              <select
                value={settings.jimeng_api_model}
                onChange={(event) => update("jimeng_api_model", event.target.value)}
                className="glass-input h-10 w-full text-sm text-foreground"
              >
                {JIMENG_API_VIDEO_MODELS.map((model) => (
                  <option key={model.value} value={model.value}>
                    {model.label}
                  </option>
                ))}
              </select>
            </label>
            <label className="space-y-2">
              <span className="text-xs font-medium text-text-muted">画幅</span>
              <select
                value={settings.jimeng_api_ratio}
                onChange={(event) => update("jimeng_api_ratio", event.target.value)}
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
              <span className="text-xs font-medium text-text-muted">默认时长</span>
              <select
                value={settings.jimeng_api_duration}
                onChange={(event) => update("jimeng_api_duration", Number(event.target.value))}
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
              <span className="text-xs font-medium text-text-muted">分辨率</span>
              <select
                value={settings.video_resolution}
                onChange={(event) => update("video_resolution", event.target.value)}
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
              <span className="text-xs font-medium text-text-muted">并发账号数</span>
              <input
                type="number"
                min={1}
                max={20}
                value={settings.jimeng_api_concurrency}
                onChange={(event) => update("jimeng_api_concurrency", Math.max(1, Number(event.target.value) || 1))}
                className="glass-input h-10 w-full text-sm text-foreground"
              />
            </label>
          </div>
        </section>

        <section className="glass-panel rounded-xl p-5">
          <div className="flex flex-col gap-3 lg:flex-row lg:items-end lg:justify-between">
            <div>
              <h3 className="font-display text-lg font-semibold text-foreground">SessionID 账号池</h3>
              <p className="mt-2 text-sm leading-6 text-text-secondary">
                jimeng-api 使用 Authorization Bearer sessionid。这里可以配置多个账号，后端提交时按启用账号轮换。
              </p>
            </div>
            <div className="flex gap-2">
              <button type="button" onClick={() => void save(false)} disabled={loading} className="glass-button inline-flex h-10 items-center gap-2 px-4 text-sm font-semibold text-primary disabled:opacity-50">
                <Save size={15} />
                保存设置
              </button>
              <button type="button" onClick={() => void save(true)} disabled={loading} className="inline-flex h-10 items-center gap-2 rounded-lg bg-primary px-4 text-sm font-semibold text-primary-foreground disabled:opacity-50">
                <CheckCircle2 size={15} />
                设为分镜默认
              </button>
            </div>
          </div>

          <div className="mt-4 grid gap-3 lg:grid-cols-[220px_minmax(280px,1fr)_120px]">
            <input value={newLabel} onChange={(event) => setNewLabel(event.target.value)} className="glass-input h-10 text-sm" placeholder="账号名称" />
            <input value={newSessionid} onChange={(event) => setNewSessionid(event.target.value)} className="glass-input h-10 text-sm" placeholder="粘贴 sessionid，支持 us-/hk-/jp-/sg- 前缀" />
            <button type="button" onClick={addSession} className="inline-flex h-10 items-center justify-center gap-2 rounded-lg border border-primary/40 bg-primary/10 text-sm font-semibold text-primary hover:bg-primary/15">
              <Plus size={15} />
              添加
            </button>
          </div>

          <div className="mt-4 overflow-hidden rounded-xl border border-glass-border">
            {settings.jimeng_api_sessions.length === 0 ? (
              <div className="bg-surface-inset p-8 text-center text-sm text-text-muted">还没有即梦 API 账号。添加 sessionid 后保存，再到分镜工作台选择 api-* 模型提交。</div>
            ) : (
              settings.jimeng_api_sessions.map((session, index) => (
                <div key={`${session.label}-${index}`} className="grid gap-3 border-b border-glass-border bg-panel-bg p-3 last:border-b-0 lg:grid-cols-[90px_220px_minmax(280px,1fr)_44px]">
                  <label className="flex items-center gap-2 text-sm text-text-secondary">
                    <input type="checkbox" checked={session.enabled} onChange={(event) => updateSession(index, { enabled: event.target.checked })} />
                    启用
                  </label>
                  <input value={session.label} onChange={(event) => updateSession(index, { label: event.target.value })} className="glass-input h-10 text-sm" />
                  <input value={session.sessionid} onChange={(event) => updateSession(index, { sessionid: event.target.value })} className="glass-input h-10 font-mono text-xs" />
                  <button type="button" onClick={() => deleteSession(index)} className="grid h-10 w-10 place-items-center rounded-lg border border-red-400/30 bg-red-500/10 text-red-300 hover:bg-red-500/15" aria-label="删除账号">
                    <Trash2 size={15} />
                  </button>
                </div>
              ))
            )}
          </div>
        </section>
      </div>
    </div>
  );
}
