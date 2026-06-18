"use client";

import clsx from "clsx";
import {
  DEFAULT_JIMENG_VIDEO_GENERATION_SETTINGS,
  JIMENG_VIDEO_MODELS,
  JIMENG_VIDEO_RATIOS,
  type JimengVideoGenerationSettings,
} from "@/lib/jimengApi";

interface GenerationSettingsControlProps {
  value: JimengVideoGenerationSettings;
  onChange: (value: JimengVideoGenerationSettings) => void;
  compact?: boolean;
}

const RESOLUTIONS = ["720p", "1080p"] as const;
const GENERATION_MODES: Array<{
  value: JimengVideoGenerationSettings["generation_mode"];
  label: string;
}> = [
  { value: "auto", label: "自动判断" },
  { value: "multimodal2video", label: "全能参考" },
  { value: "text2video", label: "纯文本生成" },
];

const MODE_HELP: Record<JimengVideoGenerationSettings["generation_mode"], string> = {
  auto: "有绑定图片或视频时自动使用全能参考，否则使用纯文本生成。",
  multimodal2video: "强制上传已绑定的角色、场景、道具图片及已开启的角色音色。",
  text2video: "只发送视频模板和分镜提示词，不上传任何绑定素材。",
};

export function normalizeGenerationSettings(
  value?: Partial<JimengVideoGenerationSettings>,
): JimengVideoGenerationSettings {
  return {
    ...DEFAULT_JIMENG_VIDEO_GENERATION_SETTINGS,
    ...value,
    provider: "dreamina_cli",
    account_id: "",
    duration: Math.max(1, Number(value?.duration ?? DEFAULT_JIMENG_VIDEO_GENERATION_SETTINGS.duration) || 5),
    poll_seconds: Math.max(5, Number(value?.poll_seconds ?? DEFAULT_JIMENG_VIDEO_GENERATION_SETTINGS.poll_seconds) || 30),
  };
}

export default function GenerationSettingsControl({
  value,
  onChange,
  compact = false,
}: GenerationSettingsControlProps) {
  const normalizedValue = normalizeGenerationSettings(value);
  const update = <K extends keyof JimengVideoGenerationSettings>(key: K, nextValue: JimengVideoGenerationSettings[K]) => {
    onChange(normalizeGenerationSettings({ ...normalizedValue, [key]: nextValue }));
  };

  return (
    <div className={clsx("grid gap-3", compact ? "sm:grid-cols-2" : "sm:grid-cols-2")}>
      <label className="space-y-1.5 sm:col-span-2">
        <span className="text-xs font-medium text-text-muted">生成模式</span>
        <select
          value={normalizedValue.generation_mode}
          onChange={(event) =>
            update("generation_mode", event.target.value as JimengVideoGenerationSettings["generation_mode"])
          }
          className="glass-input h-10 w-full text-sm text-foreground"
        >
          {GENERATION_MODES.map((mode) => (
            <option key={mode.value} value={mode.value}>
              {mode.label}
            </option>
          ))}
        </select>
        <span className="block text-xs leading-5 text-text-muted">{MODE_HELP[normalizedValue.generation_mode]}</span>
      </label>
      <label className="space-y-1.5">
        <span className="text-xs font-medium text-text-muted">视频模型</span>
        <select
          value={normalizedValue.model_version}
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
          value={normalizedValue.ratio}
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
          value={normalizedValue.video_resolution}
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
            value={normalizedValue.duration}
            onChange={(event) => update("duration", Number(event.target.value) || 5)}
            className="glass-input h-10 w-full text-sm text-foreground"
          />
        </label>
        <label className="space-y-1.5">
          <span className="text-xs font-medium text-text-muted">轮询秒</span>
          <input
            type="number"
            min={5}
            value={normalizedValue.poll_seconds}
            onChange={(event) => update("poll_seconds", Number(event.target.value) || 30)}
            className="glass-input h-10 w-full text-sm text-foreground"
          />
        </label>
      </div>
    </div>
  );
}
