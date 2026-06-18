"use client";

import clsx from "clsx";
import { AlertCircle, MapPin, Package, UploadCloud, User, X, type LucideIcon } from "lucide-react";
import { useMemo, useState } from "react";
import { jimengApi, type JimengAssetType } from "@/lib/jimengApi";
import { JIMENG_ASSET_TYPE_LABELS } from "@/components/jimeng/AssetMiniCard";
import OperationOverlay from "@/components/jimeng/OperationOverlay";
import { useModalDismiss } from "@/components/jimeng/useModalDismiss";

const ASSET_TYPES: Array<{ type: JimengAssetType; icon: LucideIcon }> = [
  { type: "character", icon: User },
  { type: "scene", icon: MapPin },
  { type: "prop", icon: Package },
];

const IMAGE_ACCEPT = ".png,.jpg,.jpeg,.webp,image/png,image/jpeg,image/webp";
const AUDIO_ACCEPT = ".mp3,.wav,.m4a,.aac,.ogg,audio/mpeg,audio/mp3,audio/wav,audio/x-wav,audio/mp4,audio/aac,audio/ogg,application/ogg";

interface BatchUploadAssetsModalProps {
  projectId: string;
  open: boolean;
  defaultImageRatio?: "16:9" | "9:16";
  onClose: () => void;
  onUploaded: () => Promise<void> | void;
}

export default function BatchUploadAssetsModal({ projectId, open, defaultImageRatio = "16:9", onClose, onUploaded }: BatchUploadAssetsModalProps) {
  const [assetType, setAssetType] = useState<JimengAssetType>("character");
  const [files, setFiles] = useState<File[]>([]);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const accept = useMemo(() => (assetType === "character" ? `${IMAGE_ACCEPT},${AUDIO_ACCEPT}` : IMAGE_ACCEPT), [assetType]);
  const closeAfterReset = () => {
    setFiles([]);
    setError(null);
    onClose();
  };
  const { requestClose, backdropProps } = useModalDismiss({
    open,
    dirty: files.length > 0,
    disabled: submitting,
    onClose: closeAfterReset,
  });

  if (!open) {
    return null;
  }

  const submit = async () => {
    if (files.length === 0) {
      setError("请选择至少一个文件");
      return;
    }

    setSubmitting(true);
    setError(null);
    try {
      await jimengApi.batchUploadAssetFiles(projectId, assetType, files, defaultImageRatio);
      await onUploaded();
      setFiles([]);
      onClose();
    } catch (uploadError) {
      setError(uploadError instanceof Error ? uploadError.message : "批量上传失败");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-overlay px-4 py-6 backdrop-blur-sm" {...backdropProps}>
      <OperationOverlay open={submitting} title="上传处理中，请等待..." subtitle="正在保存图片、音色和资产信息，完成后会自动刷新资产库。" />
      <div className="modal-panel max-h-[92vh] w-full max-w-2xl overflow-y-auto rounded-lg p-4 sm:p-5">
        <div className="flex items-start justify-between gap-4">
          <div>
            <p className="text-xs font-medium uppercase tracking-[0.18em] text-primary">Batch Upload</p>
            <h2 className="mt-2 font-display text-xl font-semibold text-foreground">批量上传资产</h2>
          </div>
          <button
            type="button"
            title="关闭"
            onClick={requestClose}
            disabled={submitting}
            className="grid h-9 w-9 place-items-center rounded-lg border border-glass-border text-text-secondary transition-colors hover:bg-hover-bg hover:text-foreground disabled:cursor-wait disabled:opacity-50"
          >
            <X size={18} />
          </button>
        </div>

        <div className="mt-5 grid gap-4">
          <div>
            <p className="mb-2 text-xs font-medium text-text-secondary">资产类型</p>
            <div className="grid grid-cols-1 gap-2 sm:grid-cols-3">
              {ASSET_TYPES.map((item) => {
                const Icon = item.icon;
                const active = assetType === item.type;
                return (
                  <button
                    key={item.type}
                    type="button"
                    onClick={() => {
                      setAssetType(item.type);
                      setFiles([]);
                      setError(null);
                    }}
                    className={clsx(
                      "flex items-center justify-center gap-2 rounded-lg border px-3 py-2 text-sm font-medium transition-colors",
                      active
                        ? "border-primary/50 bg-primary/15 text-foreground"
                        : "border-glass-border bg-surface-inset text-text-secondary hover:bg-hover-bg hover:text-foreground",
                    )}
                  >
                    <Icon size={16} className={active ? "text-primary" : ""} />
                    <span>{JIMENG_ASSET_TYPE_LABELS[item.type]}</span>
                  </button>
                );
              })}
            </div>
          </div>

          <label className="flex min-h-[144px] cursor-pointer flex-col items-center justify-center rounded-lg border border-dashed border-glass-border bg-surface-inset px-4 py-6 text-center transition-colors hover:border-primary/50 hover:bg-primary/5">
            <UploadCloud size={28} className="text-primary" />
            <span className="mt-3 text-sm font-medium text-foreground">选择一个或多个文件</span>
            <span className="mt-1 text-xs text-text-muted">
              {assetType === "character" ? "角色支持图片和音频" : "场景/道具仅上传图片，音频会被后端拒绝"}
            </span>
            <input
              type="file"
              multiple
              accept={accept}
              className="sr-only"
              onChange={(event) => {
                setFiles(Array.from(event.target.files ?? []));
                setError(null);
              }}
            />
          </label>

          <div className="rounded-lg border border-glass-border bg-surface-inset p-3 text-xs leading-6 text-text-secondary">
            <p className="font-medium text-foreground">命名规则</p>
            <p>使用文件名 stem 作为资产名；同项目、同类型、同名最后一次上传会覆盖旧扩展。</p>
            <p>新建资产默认图片画幅：{defaultImageRatio}，可在资产管理的“生图设置”里修改。</p>
            <p className="font-mono text-text-muted">许禾.png、许禾.mp3、老许农资.png</p>
          </div>

          {files.length > 0 ? (
            <div className="max-h-36 overflow-y-auto rounded-lg border border-glass-border bg-surface-inset p-3">
              <p className="mb-2 text-xs font-medium text-text-secondary">已选择 {files.length} 个文件</p>
              <div className="space-y-1">
                {files.map((file) => (
                  <div key={`${file.name}-${file.size}-${file.lastModified}`} className="flex items-center justify-between gap-3 text-xs">
                    <span className="truncate text-foreground">{file.name}</span>
                    <span className="shrink-0 font-mono text-text-muted">{Math.max(1, Math.round(file.size / 1024))} KB</span>
                  </div>
                ))}
              </div>
            </div>
          ) : null}

          {error ? (
            <div className="flex items-start gap-2 rounded-lg border border-red-500/30 bg-red-500/10 px-3 py-2 text-sm text-red-200">
              <AlertCircle size={16} className="mt-0.5 shrink-0" />
              <span>{error}</span>
            </div>
          ) : null}
        </div>

        <div className="mt-5 flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
          <button
            type="button"
            onClick={requestClose}
            disabled={submitting}
            className="rounded-lg border border-glass-border px-4 py-2 text-sm font-medium text-text-secondary transition-colors hover:bg-hover-bg hover:text-foreground disabled:cursor-wait disabled:opacity-50"
          >
            取消
          </button>
          <button
            type="button"
            onClick={submit}
            disabled={submitting}
            className="rounded-lg bg-primary px-4 py-2 text-sm font-semibold text-white transition-colors hover:bg-primary/90 disabled:cursor-wait disabled:opacity-60"
          >
            {submitting ? "上传中" : "开始上传"}
          </button>
        </div>
      </div>
    </div>
  );
}
