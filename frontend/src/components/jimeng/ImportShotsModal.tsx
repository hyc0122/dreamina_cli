"use client";

import clsx from "clsx";
import { Download, FileInput, Loader2, UploadCloud, X } from "lucide-react";
import { type ChangeEvent, useMemo, useState } from "react";
import OperationOverlay from "@/components/jimeng/OperationOverlay";
import { useModalDismiss } from "@/components/jimeng/useModalDismiss";
import { jimengApi, type JimengShotImportFormat } from "@/lib/jimengApi";

const PLAIN_EXAMPLE = `小节1：
场景：黑屏字卡。
人物：无
人物站位：无
时间：一个月后，距离冬至仅剩两天
氛围光影：黑底白字，低沉压迫，时间跳跃，赌约临近

镜号1：【黑屏】画面完全漆黑，风雪声由远及近，像从冰层深处压来；
镜号2：【白字浮现】黑屏中央缓缓出现字卡：一个月后 距离冬至仅剩两天；
镜号3：【音效过渡】远处传来寒风拍打窗纸、柴火微弱爆响、饥饿咀嚼声，黑屏逐渐被昏暗土屋吞没；

小节2：
场景：靠山屯某村民家日。
人物：村民
人物站位：几个村民瑟缩在土炕中央，破木桌位于画面前景，窗户位于背景左侧
时间：白天
氛围光影：昏暗冷灰光，屋内阴冷，饥荒感、寒酸、全村困顿

镜号1：【室内广角缓推】昏暗土炕上，几个穿着破旧棉袄的村民瑟缩成一团，屋内冷气凝在窗纸边缘；
镜号2：【手部特写】村民冻裂的手捧着发黑发酸的烂红薯干，指缝里全是黑泥和冻疮；
镜号3：【咀嚼近景】一个村民艰难啃咬红薯干，牙齿咬得发涩，脸上满是麻木和饥饿；`;

const CSV_EXAMPLE = `场景,人物,道具,分镜提示词
山路悬崖,"沈云禾（年轻时期）,陆怀川,工作人员","白布担架,断裂竹篮","承接：无 -> 当前分镜救援队从山里抬出白布担架
场景：山路悬崖
人物：沈云禾（年轻时期）、陆怀川、工作人员
环境描述：傍晚，暴雨后，山中悬崖边
▲俯拍，缓慢下压，全景，24mm，广角，冷灰色调。"`;

interface ImportShotsModalProps {
  open: boolean;
  projectId: string;
  onClose: () => void;
  onImported: () => Promise<void>;
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

export default function ImportShotsModal({ open, projectId, onClose, onImported }: ImportShotsModalProps) {
  const [format, setFormat] = useState<JimengShotImportFormat>("plain");
  const [text, setText] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [readingFile, setReadingFile] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const sample = useMemo(() => (format === "plain" ? PLAIN_EXAMPLE : CSV_EXAMPLE), [format]);
  const { requestClose, backdropProps } = useModalDismiss({
    open,
    dirty: text.trim().length > 0,
    disabled: submitting || readingFile,
    onClose,
  });

  if (!open) {
    return null;
  }

  const changeFormat = (nextFormat: JimengShotImportFormat) => {
    setFormat(nextFormat);
    setError(null);
  };

  const readFile = (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    event.target.value = "";
    if (!file) {
      return;
    }
    setReadingFile(true);
    const lowerName = file.name.toLowerCase();
    if (lowerName.endsWith(".csv")) {
      setFormat("csv");
    } else {
      setFormat("plain");
    }
    const reader = new FileReader();
    reader.onload = () => {
      setText(String(reader.result ?? ""));
      setError(null);
      setReadingFile(false);
    };
    reader.onerror = () => {
      setError("读取分镜文件失败");
      setReadingFile(false);
    };
    reader.readAsText(file, "utf-8");
  };

  const submit = async () => {
    if (!text.trim()) {
      setError("请先粘贴或导入分镜文本文件");
      return;
    }

    setSubmitting(true);
    setError(null);
    try {
      await jimengApi.importShots(projectId, { text, format });
      await onImported();
      setText("");
      onClose();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "导入分镜失败");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-overlay px-4 py-6 backdrop-blur-sm" {...backdropProps}>
      <OperationOverlay
        open={submitting || readingFile}
        title={submitting ? "导入分镜中，请等待..." : "读取分镜文件中，请等待..."}
        subtitle="正在解析分镜文本并写入项目，分镜较多时会稍微久一点。"
      />
      <div className="modal-panel flex max-h-[92vh] w-full max-w-4xl flex-col overflow-hidden rounded-xl">
        <div className="flex items-center justify-between border-b border-glass-border px-5 py-4">
          <div className="flex items-center gap-2">
            <FileInput size={18} className="text-primary" />
            <h2 className="font-display text-lg font-semibold text-foreground">导入分镜</h2>
          </div>
          <button type="button" title="关闭" onClick={requestClose} disabled={submitting || readingFile} className="grid h-8 w-8 place-items-center rounded-md text-text-secondary transition-colors hover:bg-hover-bg hover:text-foreground disabled:cursor-wait disabled:opacity-50">
            <X size={16} />
          </button>
        </div>

        <div className="min-h-0 flex-1 space-y-4 overflow-y-auto p-5">
          <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
            <div className="inline-flex w-fit rounded-md border border-glass-border bg-surface-inset p-1">
              {(["plain", "csv"] as const).map((item) => (
                <button key={item} type="button" onClick={() => changeFormat(item)} className={clsx("rounded px-3 py-1.5 text-sm transition-colors", format === item ? "bg-primary text-white" : "text-text-secondary hover:bg-hover-bg hover:text-foreground")}>
                  {item === "plain" ? "TXT / Plain" : "CSV"}
                </button>
              ))}
            </div>
            <div className="flex flex-wrap gap-2">
              <label className="inline-flex cursor-pointer items-center justify-center gap-2 rounded-lg border border-glass-border px-3 py-2 text-sm font-medium text-text-secondary transition-colors hover:bg-hover-bg hover:text-foreground">
                {readingFile ? <Loader2 size={16} className="animate-spin" /> : <UploadCloud size={16} />}
                <span>{readingFile ? "读取中..." : "导入本地文件"}</span>
                <input type="file" accept=".txt,.csv,text/plain,text/csv" className="sr-only" onChange={readFile} disabled={readingFile || submitting} />
              </label>
              <button type="button" onClick={() => downloadTextFile(format === "csv" ? "分镜导入示例.csv" : "分镜导入示例.txt", sample)} className="inline-flex items-center justify-center gap-2 rounded-lg border border-glass-border px-3 py-2 text-sm font-medium text-text-secondary transition-colors hover:bg-hover-bg hover:text-foreground">
                <Download size={16} />
                下载格式示例
              </button>
            </div>
          </div>

          <div className="grid gap-4 lg:grid-cols-[1fr_340px]">
            <div>
              <label className="mb-2 block text-sm font-medium text-text-secondary">分镜文本</label>
              <textarea value={text} onChange={(event) => setText(event.target.value)} className="glass-input min-h-[420px] w-full resize-y font-mono text-sm leading-6 text-foreground" placeholder={sample} />
            </div>

            <div>
              <p className="mb-2 text-sm font-medium text-text-secondary">格式示例</p>
              <pre className="max-h-[420px] overflow-auto rounded-md border border-glass-border bg-surface-inset p-3 text-xs leading-5 text-text-secondary">{sample}</pre>
              <div className="mt-3 rounded-md border border-glass-border bg-surface-inset p-3 text-xs leading-5 text-text-muted">
                <p>TXT：支持用 `小节1：`、`小节2：` 或 `# 1`、`# 2` 分隔分镜，场景/人物/道具行会完整保留在提示词里，同时用于关键词绑定。</p>
                <p>CSV：表头建议为 `场景,人物,道具,分镜提示词`，多行分镜提示词请放在同一个单元格中。</p>
              </div>
            </div>
          </div>

          {error ? <p className="rounded-md border border-red-500/20 bg-red-500/10 px-3 py-2 text-sm text-red-200">{error}</p> : null}
        </div>

        <div className="flex flex-col-reverse gap-2 border-t border-glass-border px-5 py-4 sm:flex-row sm:items-center sm:justify-end">
          <button type="button" onClick={requestClose} disabled={submitting || readingFile} className="glass-button text-sm text-text-secondary disabled:cursor-wait disabled:opacity-50">
            关闭
          </button>
          <button type="button" onClick={submit} disabled={submitting || readingFile} className="inline-flex items-center justify-center gap-2 rounded-md bg-primary px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-primary/90 disabled:cursor-wait disabled:opacity-60">
            {submitting ? <Loader2 size={16} className="animate-spin" /> : null}
            {submitting ? "导入中..." : "导入分镜"}
          </button>
        </div>
      </div>
    </div>
  );
}
