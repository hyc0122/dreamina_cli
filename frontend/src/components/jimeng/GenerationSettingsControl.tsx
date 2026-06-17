"use client";

import clsx from "clsx";
import { useEffect, useState } from "react";
import {
  DEFAULT_JIMENG_VIDEO_GENERATION_SETTINGS,
  JIMENG_VIDEO_MODELS,
  JIMENG_VIDEO_RATIOS,
  jimengApi,
  type JimengCliAccount,
  type JimengVideoGenerationSettings,
} from "@/lib/jimengApi";

interface GenerationSettingsControlProps {
  value: JimengVideoGenerationSettings;
  onChange: (value: JimengVideoGenerationSettings) => void;
  compact?: boolean;
}

const RESOLUTIONS = ["720p", "1080p"] as const;

export function normalizeGenerationSettings(
  value?: Partial<JimengVideoGenerationSettings>,
): JimengVideoGenerationSettings {
  return {
    ...DEFAULT_JIMENG_VIDEO_GENERATION_SETTINGS,
    ...value,
    account_id: value?.account_id ?? DEFAULT_JIMENG_VIDEO_GENERATION_SETTINGS.account_id,
    duration: Math.max(1, Number(value?.duration ?? DEFAULT_JIMENG_VIDEO_GENERATION_SETTINGS.duration) || 5),
    poll_seconds: Math.max(5, Number(value?.poll_seconds ?? DEFAULT_JIMENG_VIDEO_GENERATION_SETTINGS.poll_seconds) || 30),
  };
}

export default function GenerationSettingsControl({
  value,
  onChange,
  compact = false,
}: GenerationSettingsControlProps) {
  const [accounts, setAccounts] = useState<JimengCliAccount[]>([]);

  useEffect(() => {
    let disposed = false;
    jimengApi
      .listCliAccounts()
      .then((response) => {
        if (!disposed) {
          setAccounts(response.accounts);
        }
      })
      .catch(() => {
        if (!disposed) {
          setAccounts([]);
        }
      });
    return () => {
      disposed = true;
    };
  }, []);

  useEffect(() => {
    if (accounts.length === 0 || value.account_id) {
      return;
    }
    const defaultAccount = accounts.find((account) => account.is_default) ?? accounts[0];
    onChange(normalizeGenerationSettings({ ...value, account_id: defaultAccount.id }));
  }, [accounts, onChange, value]);

  const update = <K extends keyof JimengVideoGenerationSettings>(key: K, nextValue: JimengVideoGenerationSettings[K]) => {
    onChange(normalizeGenerationSettings({ ...value, [key]: nextValue }));
  };

  return (
    <div className={clsx("grid gap-3", compact ? "sm:grid-cols-2" : "sm:grid-cols-2")}>
      {accounts.length > 0 ? (
        <label className="space-y-1.5 sm:col-span-2">
          <span className="text-xs font-medium text-text-muted">提交账号</span>
          <select
            value={value.account_id ?? ""}
            onChange={(event) => update("account_id", event.target.value)}
            className="glass-input h-10 w-full text-sm text-foreground"
          >
            <option value="">默认账号 / 自动</option>
            {accounts.map((account) => (
              <option key={account.id} value={account.id}>
                {account.is_default ? "默认 · " : ""}
                {account.label}
                {account.total_credit ? ` · ${account.total_credit} 积分` : ""}
              </option>
            ))}
          </select>
        </label>
      ) : null}
      <label className="space-y-1.5">
        <span className="text-xs font-medium text-text-muted">视频模型</span>
        <select
          value={value.model_version}
          onChange={(event) => update("model_version", event.target.value)}
          className="glass-input h-10 w-full text-sm text-foreground"
        >
          {JIMENG_VIDEO_MODELS.map((model) => (
            <option key={model.value} value={model.value}>
              {model.label}
            </option>
          ))}
        </select>
      </label>
      <label className="space-y-1.5">
        <span className="text-xs font-medium text-text-muted">画幅</span>
        <select
          value={value.ratio}
          onChange={(event) => update("ratio", event.target.value)}
          className="glass-input h-10 w-full text-sm text-foreground"
        >
          {JIMENG_VIDEO_RATIOS.map((ratio) => (
            <option key={ratio} value={ratio}>
              {ratio}
            </option>
          ))}
        </select>
      </label>
      <label className="space-y-1.5">
        <span className="text-xs font-medium text-text-muted">分辨率</span>
        <select
          value={value.video_resolution}
          onChange={(event) => update("video_resolution", event.target.value)}
          className="glass-input h-10 w-full text-sm text-foreground"
        >
          {RESOLUTIONS.map((resolution) => (
            <option key={resolution} value={resolution}>
              {resolution}
            </option>
          ))}
        </select>
      </label>
      <div className="grid grid-cols-2 gap-2">
        <label className="space-y-1.5">
          <span className="text-xs font-medium text-text-muted">时长</span>
          <input
            type="number"
            min={1}
            value={value.duration}
            onChange={(event) => update("duration", Number(event.target.value) || 5)}
            className="glass-input h-10 w-full text-sm text-foreground"
          />
        </label>
        <label className="space-y-1.5">
          <span className="text-xs font-medium text-text-muted">轮询秒</span>
          <input
            type="number"
            min={5}
            value={value.poll_seconds}
            onChange={(event) => update("poll_seconds", Number(event.target.value) || 30)}
            className="glass-input h-10 w-full text-sm text-foreground"
          />
        </label>
      </div>
    </div>
  );
}
