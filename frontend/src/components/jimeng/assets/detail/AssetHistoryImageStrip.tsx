import { CheckSquare, Image as ImageIcon, Loader2 } from "lucide-react";
import { jimengMediaUrl } from "@/components/jimeng/assets/AssetMiniCard";
import { formatUpdatedAt } from "@/components/jimeng/assets/assetManagerShared";
import type { JimengAsset, JimengLlmAssetImageRecord } from "@/lib/jimengApi";

export default function AssetHistoryImageStrip({
  asset,
  records,
  applyingRecordId,
  onApply,
}: {
  asset: JimengAsset;
  records: JimengLlmAssetImageRecord[];
  applyingRecordId: string | null;
  onApply: (record: JimengLlmAssetImageRecord) => void;
}) {
  return (
    <div className="mt-3 rounded-lg border border-glass-border bg-surface-inset p-2">
      <div className="flex items-center justify-between gap-2">
        <span className="text-xs font-semibold text-foreground">历史生成图对比</span>
        <span className="rounded border border-glass-border bg-panel-bg px-1.5 py-0.5 font-mono text-[11px] text-text-muted">{records.length}</span>
      </div>
      {records.length > 0 ? (
        <div className="mt-2 flex gap-2 overflow-x-auto pb-1">
          {records.map((record) => {
            const historyImageUrl = jimengMediaUrl(record.asset_image_path || record.source_path, record.updated_at);
            const applying = applyingRecordId === record.id;
            return (
              <div key={record.id} className="w-28 shrink-0 rounded-lg border border-glass-border bg-panel-bg p-1.5">
                <button
                  type="button"
                  onClick={() => historyImageUrl && window.open(historyImageUrl, "_blank", "noopener,noreferrer")}
                  className="aspect-video w-full overflow-hidden rounded-md border border-glass-border bg-surface-inset text-text-muted"
                  title="打开历史图对比"
                >
                  {historyImageUrl ? (
                    <img src={historyImageUrl} alt={`${asset.name} 历史生成图`} className="h-full w-full object-cover" />
                  ) : (
                    <div className="grid h-full place-items-center">
                      <ImageIcon size={14} />
                    </div>
                  )}
                </button>
                <p className="mt-1 truncate text-[10px] text-text-muted" title={formatUpdatedAt(record.created_at || record.updated_at)}>
                  {formatUpdatedAt(record.created_at || record.updated_at)}
                </p>
                <button
                  type="button"
                  onClick={() => onApply(record)}
                  disabled={applying}
                  className="mt-1 inline-flex h-7 w-full items-center justify-center gap-1 rounded-md border border-primary/30 bg-primary/10 text-[11px] font-medium text-primary hover:bg-primary/15 disabled:cursor-wait disabled:opacity-60"
                >
                  {applying ? <Loader2 size={12} className="animate-spin" /> : <CheckSquare size={12} />}
                  使用此图
                </button>
              </div>
            );
          })}
        </div>
      ) : (
        <p className="mt-2 rounded-md border border-dashed border-glass-border px-2 py-2 text-xs text-text-muted">暂无历史生成图，后续 AI 生图成功后会保留在这里用于对比。</p>
      )}
    </div>
  );
}
