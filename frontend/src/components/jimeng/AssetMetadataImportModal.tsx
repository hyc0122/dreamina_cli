"use client";

import clsx from "clsx";
import { Download, FileInput, Loader2, UploadCloud, X } from "lucide-react";
import { type ChangeEvent, useMemo, useState } from "react";
import OperationOverlay from "@/components/jimeng/OperationOverlay";
import { useModalDismiss } from "@/components/jimeng/useModalDismiss";
import { jimengApi } from "@/lib/jimengApi";

const JSON_SAMPLE = `[
  {
    "type": "character",
    "name": "许禾",
    "aliases": ["小禾", "女主"],
    "description": "年轻女性，白色衬衫，清冷但坚定，电影感写实风格",
    "character_kind": "单人",
    "image_ratio": "9:16",
    "image_params": "高清，细节稳定，统一角色脸",
    "video_prompt": "许禾站在雨夜街口，轻轻回头，镜头慢推"
  },
  {
    "type": "scene",
    "name": "老许农资",
    "aliases": ["农资店"],
    "description": "县城街边农资店，旧招牌，暖黄色灯光",
    "image_ratio": "16:9",
    "image_params": "横版场景图，空间层次清晰",
    "video_prompt": "夜晚街边店铺灯光微闪，门口雨水反光"
  }
]`;

const CSV_SAMPLE = `type,name,aliases,description,character_kind,image_ratio,image_params,video_prompt
character,许禾,小禾|女主,年轻女性，白色衬衫，清冷但坚定,单人,9:16,高清，统一角色脸,许禾站在雨夜街口，镜头慢推
character,街坊群演,邻居|围观群众,县城街边围观群众，服装朴素，表情各异,群演,9:16,群演角色图，弱化主角感,人群在店门口低声议论
scene,老许农资,农资店,县城街边农资店，旧招牌，暖黄色灯光,,16:9,横版场景图，空间层次清晰,夜晚街边店铺灯光微闪
prop,银色钥匙,钥匙|旧钥匙,磨损的银色钥匙，边缘有划痕,,9:16,单体道具图，白底或简洁背景,钥匙从手心滑落到桌面`;

interface AssetMetadataImportModalProps {
  projectId: string;
  open: boolean;
  onClose: () => void;
  onImported: () => Promise<void> | void;
}

const downloadTextFile = (filename: string, content: string) => {
  const blob = new Blob([content], { type: "text/plain;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = filename;
  anchor.click();
  URL.revokeObjectURL(url);
};

const requestErrorMessage = (error: unknown): string => {
  const detail = (error as { response?: { data?: { detail?: unknown } } })?.response?.data?.detail;
  if (typeof detail === "string" && detail.trim()) {
    return detail;
  }
  return error instanceof Error ? error.message : "导入资产描述失败";
};

export default function AssetMetadataImportModal({ projectId, open, onClose, onImported }: AssetMetadataImportModalProps) {
  const [format, setFormat] = useState<"json" | "csv">("json");
  const [text, setText] = useState(JSON_SAMPLE);
  const [submitting, setSubmitting] = useState(false);
  const [readingFile, setReadingFile] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const sample = useMemo(() => (format === "json" ? JSON_SAMPLE : CSV_SAMPLE), [format]);
  const { requestClose, backdropProps } = useModalDismiss({
    open,
    dirty: text !== sample,
    disabled: submitting || readingFile,
    onClose,
  });

  if (!open) {
    return null;
  }

  const changeFormat = (nextFormat: "json" | "csv") => {
    setFormat(nextFormat);
    setText(nextFormat === "json" ? JSON_SAMPLE : CSV_SAMPLE);
    setError(null);
  };

  const readFile = (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    event.target.value = "";
    if (!file) {
      return;
    }
    setReadingFile(true);
    const reader = new FileReader();
    reader.onload = () => {
      setText(String(reader.result ?? ""));
      setError(null);
      setReadingFile(false);
    };
    reader.onerror = () => {
      setError("读取文件失败");
      setReadingFile(false);
    };
    reader.readAsText(file, "utf-8");
  };

  const submit = async () => {
    if (!text.trim()) {
      setError("请先粘贴或导入资产描述清单");
      return;
    }
    if (format === "json") {
      try {
        JSON.parse(text);
      } catch (caught) {
        setError(`JSON 格式错误：${caught instanceof Error ? caught.message : "无法解析 JSON"}`);
        return;
      }
    }
    setSubmitting(true);
    setError(null);
    try {
      await jimengApi.importAssetMetadata(projectId, { format, text });
      await onImported();
      onClose();
    } catch (caught) {
      setError(requestErrorMessage(caught));
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-overlay px-4 py-6 backdrop-blur-sm" {...backdropProps}>
      <OperationOverlay
        open={submitting || readingFile}
        title={submitting ? "导入资产描述中，请等待..." : "读取资产文件中，请等待..."}
        subtitle="正在处理资产清单，完成后会自动刷新资产列表。"
      />
      <div className="glass-panel flex max-h-[92vh] w-full max-w-4xl flex-col overflow-hidden rounded-xl bg-elevated shadow-2xl">
        <div className="flex items-center justify-between gap-3 border-b border-glass-border px-5 py-4">
          <div className="flex items-center gap-2">
            <FileInput size={18} className="text-primary" />
            <h2 className="font-display text-lg font-semibold text-foreground">导入资产描述</h2>
          </div>
          <button
            type="button"
            title="关闭"
            onClick={requestClose}
            disabled={submitting || readingFile}
            className="grid h-8 w-8 shrink-0 place-items-center rounded-md text-text-secondary transition-colors hover:bg-hover-bg hover:text-foreground disabled:cursor-wait disabled:opacity-50"
          >
            <X size={16} />
          </button>
        </div>

        <div className="min-h-0 flex-1 space-y-4 overflow-y-auto p-5">
          <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
            <div className="inline-flex w-fit rounded-md border border-glass-border bg-surface-inset p-1">
              {(["json", "csv"] as const).map((item) => (
                <button
                  key={item}
                  type="button"
                  onClick={() => changeFormat(item)}
                  className={clsx(
                    "rounded px-3 py-1.5 text-sm font-medium transition-colors",
                    format === item ? "bg-primary text-white" : "text-text-secondary hover:bg-hover-bg hover:text-foreground",
                  )}
                >
                  {item.toUpperCase()}
                </button>
              ))}
            </div>
            <label className="inline-flex cursor-pointer items-center justify-center gap-2 rounded-lg border border-glass-border px-3 py-2 text-sm font-medium text-text-secondary transition-colors hover:bg-hover-bg hover:text-foreground">
              {submitting || readingFile ? <Loader2 size={16} className="animate-spin" /> : <UploadCloud size={16} />}
              <span>从本地导入清单文件</span>
              <input type="file" accept=".json,.csv,.txt,application/json,text/csv,text/plain" className="sr-only" onChange={readFile} disabled={submitting || readingFile} />
            </label>
            <button
              type="button"
              onClick={() => downloadTextFile(format === "json" ? "资产描述导入示例.json" : "资产描述导入示例.csv", sample)}
              className="inline-flex items-center justify-center gap-2 rounded-lg border border-glass-border px-3 py-2 text-sm font-medium text-text-secondary transition-colors hover:bg-hover-bg hover:text-foreground"
            >
              <Download size={16} />
              下载格式示例
            </button>
          </div>

          <div className="grid gap-4 lg:grid-cols-[1fr_340px]">
            <label className="space-y-2">
              <span className="text-sm font-medium text-text-secondary">资产描述清单</span>
              <textarea
                value={text}
                onChange={(event) => setText(event.target.value)}
                className="glass-input min-h-[420px] w-full resize-y font-mono text-xs leading-5 text-foreground"
              />
            </label>
            <div className="space-y-2">
              <div className="text-sm font-medium text-text-secondary">格式示例</div>
              <pre className="max-h-[420px] overflow-auto rounded-md border border-glass-border bg-surface-inset p-3 text-xs leading-5 text-text-secondary">
                {sample}
              </pre>
              <div className="rounded-md border border-glass-border bg-surface-inset p-3 text-xs leading-5 text-text-muted">
                <p>type 支持：character、scene、prop。</p>
                <p>character_kind 只用于角色：填写“单人”或“群演”；也可以用中文列“角色分类”。</p>
                <p>image_ratio 支持：16:9、9:16。</p>
                <p>description 就是生图提示词；video_prompt 会随资产一起导入导出。</p>
              </div>
            </div>
          </div>

          {error ? <p className="rounded-md border border-red-500/30 bg-red-500/10 px-3 py-2 text-sm text-red-200">{error}</p> : null}
        </div>

        <div className="flex flex-col-reverse gap-2 border-t border-glass-border px-5 py-4 sm:flex-row sm:justify-end">
          <button type="button" onClick={requestClose} disabled={submitting || readingFile} className="glass-button text-sm text-text-secondary disabled:cursor-wait disabled:opacity-50">
            取消
          </button>
          <button
            type="button"
            onClick={submit}
            disabled={submitting || readingFile}
            className="rounded-md bg-primary px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-primary/90 disabled:cursor-wait disabled:opacity-60"
          >
            {submitting ? "导入中..." : "导入资产描述"}
          </button>
        </div>
      </div>
    </div>
  );
}
