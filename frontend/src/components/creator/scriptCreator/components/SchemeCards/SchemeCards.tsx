import { useEffect, useMemo, useState } from 'react';
import { useApp } from '../../contexts/AppContext';
import { Scheme } from '../../types';

function EmptyPreview() {
  return (
    <section className="rounded-2xl border border-[#1d2a3e] bg-[#0a1421]/90">
      <div className="border-b border-[#1d2a3e] px-6 py-5">
        <h2 className="text-xl font-black text-white">方案区</h2>
      </div>
      <div className="flex min-h-72 flex-col items-center justify-center px-6 text-center">
        <h3 className="text-2xl font-black text-white">正在等待故事方案</h3>
        <p className="mt-3 max-w-xl text-sm leading-6 text-slate-400">
          这里只承载方案选择。系统会生成3套差异化轻量方案，并自动融合成第4套推荐方案。
        </p>
      </div>
    </section>
  );
}

function SchemeTextField({
  label,
  value,
  onChange,
  rows = 3,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  rows?: number;
}) {
  return (
    <label className="block">
      <span className="mb-2 block text-xs font-bold text-slate-500">{label}</span>
      <textarea
        value={value}
        onClick={(event) => event.stopPropagation()}
        onChange={(event) => onChange(event.target.value)}
        rows={rows}
        className="w-full resize-y rounded-xl border border-[#26354d] bg-[#081321] px-3 py-2 text-sm leading-6 text-slate-200 outline-none transition focus:border-blue-400"
      />
    </label>
  );
}

function SchemeCard({ scheme, index, isRecommended }: { scheme: Scheme; index: number; isRecommended: boolean }) {
  const { config, selectedScheme, setSelectedScheme, updateScheme, generateScript, isGenerating, episodes } = useApp();
  const isSelected = selectedScheme?.id === scheme.id;
  const hasStarted = episodes.length > 0;
  const update = (patch: Partial<Scheme>) => updateScheme(scheme.id, patch);

  return (
    <article
      onClick={() => setSelectedScheme(scheme)}
      className={`rounded-2xl border bg-[#0b1725]/90 p-5 transition ${
        isSelected ? 'border-blue-400 shadow-[0_0_0_1px_rgba(96,165,250,0.25)]' : 'border-slate-700 hover:border-slate-500'
      }`}
    >
      <div className="mb-5 flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0 flex-1">
          <div className="mb-3 flex flex-wrap items-center gap-2">
            <span className="rounded-full bg-blue-500/10 px-3 py-1 text-xs font-bold text-blue-300">
              {scheme.id === 'scheme-hybrid-recommended' ? '方案 4 · 融合推荐' : `方案 ${index + 1}`}
            </span>
            {isRecommended && (
              <span className="rounded-full border border-emerald-400/30 bg-emerald-400/10 px-3 py-1 text-xs font-bold text-emerald-300">
                默认推荐
              </span>
            )}
            <span className="rounded-full border border-slate-700 px-3 py-1 text-xs font-bold text-slate-400">
              {scheme.recommendationScore ?? 0} 分
            </span>
          </div>
          <div className="grid gap-3 lg:grid-cols-[minmax(220px,0.45fr)_minmax(0,1fr)]">
            <label className="block">
              <span className="mb-2 block text-xs font-bold text-slate-500">短剧名</span>
              <input
                value={scheme.name}
                onClick={(event) => event.stopPropagation()}
                onChange={(event) => update({ name: event.target.value })}
                className="h-12 w-full rounded-xl border border-blue-400/30 bg-[#081321] px-4 text-lg font-black text-white outline-none transition focus:border-blue-300 focus:bg-[#0c1a2b]"
              />
            </label>
            <label className="block">
              <span className="mb-2 block text-xs font-bold text-slate-500">一句话简介</span>
              <input
                value={scheme.tagline}
                onClick={(event) => event.stopPropagation()}
                onChange={(event) => update({ tagline: event.target.value })}
                className="h-12 w-full rounded-xl border border-blue-400/30 bg-[#081321] px-4 text-sm font-bold text-blue-200 outline-none transition focus:border-blue-300 focus:bg-[#0c1a2b]"
              />
            </label>
          </div>
        </div>
        {isSelected && <span className="rounded-full bg-blue-500 px-3 py-1 text-xs font-bold text-white">已选</span>}
      </div>

      <div className="space-y-4">
        <SchemeTextField label="故事简介" value={scheme.storyIntroduction} onChange={(value) => update({ storyIntroduction: value })} rows={4} />
        <SchemeTextField label="核心冲突" value={scheme.coreConflict} onChange={(value) => update({ coreConflict: value })} />
        <SchemeTextField label="世界观 / 人物关系" value={scheme.characterDesign} onChange={(value) => update({ characterDesign: value })} rows={4} />
        <div className="grid gap-4 lg:grid-cols-2">
          <SchemeTextField label="主角设定和缺陷" value={scheme.protagonistArc} onChange={(value) => update({ protagonistArc: value })} />
          <SchemeTextField label="反派设定" value={scheme.antagonistProfile} onChange={(value) => update({ antagonistProfile: value })} />
        </div>
        <SchemeTextField
          label="视觉钩子 / 高光场景（一行一个）"
          value={scheme.highlightScenes.join('\n')}
          onChange={(value) => update({ highlightScenes: value.split('\n').map((item) => item.trim()).filter(Boolean) })}
        />
        <SchemeTextField
          label="系统推荐理由 / 不足"
          value={scheme.recommendationReason || ''}
          onChange={(value) => update({ recommendationReason: value })}
          rows={2}
        />
      </div>

      {config.hongguoReviewEnabled && scheme.hongguoAdaptationNote && (
        <div className="mt-4 rounded-lg border border-amber-400/30 bg-amber-400/10 px-4 py-3 text-sm text-amber-200">
          已按红果优先做风险适配，详细规则后台处理。
        </div>
      )}

      <button
        onClick={(event) => {
          event.stopPropagation();
          setSelectedScheme(scheme);
          generateScript(scheme);
        }}
        disabled={isGenerating || hasStarted}
        className={`mt-5 h-12 w-full rounded-xl font-black transition ${
          isSelected && !isGenerating && !hasStarted
            ? 'bg-gradient-to-r from-blue-500 to-fuchsia-500 text-white'
            : 'border border-slate-700 bg-slate-900/40 text-slate-400'
        } ${isGenerating || hasStarted ? 'cursor-not-allowed opacity-60' : ''}`}
      >
        {hasStarted ? '已进入生成阶段' : isSelected ? '确认方案，生成前3集' : '选择并确认方案'}
      </button>
    </article>
  );
}

export default function SchemeCards() {
  const { config, schemes, selectedScheme, episodes, isGenerating } = useApp();
  const hasStartedProduction = episodes.length > 0;
  const [isExpanded, setIsExpanded] = useState(!hasStartedProduction);

  useEffect(() => {
    if (hasStartedProduction) setIsExpanded(false);
  }, [hasStartedProduction]);

  const recommendedScheme = useMemo(() => schemes.reduce((best, scheme) => {
    if (scheme.id === 'scheme-hybrid-recommended') return scheme;
    if (!best) return scheme;
    return (scheme.recommendationScore || 0) > (best.recommendationScore || 0) ? scheme : best;
  }, null as Scheme | null), [schemes]);
  const recommendedId = recommendedScheme?.id;
  const summaryScheme = selectedScheme || recommendedScheme || schemes[0];

  if (config.workflowMode !== 'create') return null;
  if (schemes.length === 0) return <EmptyPreview />;

  return (
    <section className="rounded-2xl border border-[#1d2a3e] bg-[#0a1421]/90">
      <div className="flex flex-col gap-3 border-b border-[#1d2a3e] px-6 py-5 md:flex-row md:items-center md:justify-between">
        <div className="min-w-0">
          <h2 className="text-xl font-black text-white">选择故事方案</h2>
          <p className="mt-1 text-sm text-slate-400">
            {isExpanded
              ? '可自由编辑方案；系统默认推荐融合版，小白用户直接确认即可。'
              : `已收起方案详情${summaryScheme ? `，当前方案：${summaryScheme.name}` : ''}`}
          </p>
        </div>
        <div className="flex shrink-0 items-center gap-3">
          <span className="rounded-full border border-blue-400/30 bg-blue-500/10 px-3 py-1 text-xs font-bold text-blue-300">
            {schemes.length} 套方案
          </span>
          <button
            type="button"
            onClick={() => setIsExpanded((current) => !current)}
            className="h-9 rounded-xl border border-[#2a3b55] px-4 text-sm font-black text-slate-200 transition hover:border-blue-400 hover:text-blue-200"
          >
            {isExpanded ? '收起' : '展开'}
          </button>
        </div>
      </div>

      {!isExpanded && summaryScheme && (
        <button
          type="button"
          onClick={() => setIsExpanded(true)}
          className="flex w-full flex-col gap-2 px-6 py-4 text-left transition hover:bg-[#0d1928] md:flex-row md:items-center md:justify-between"
        >
          <div className="min-w-0">
            <p className="truncate text-base font-black text-white">{summaryScheme.name}</p>
            <p className="mt-1 truncate text-sm font-bold text-blue-200">{summaryScheme.tagline}</p>
          </div>
          <span className="text-xs font-bold text-slate-500">
            {isGenerating ? '生成中可随时展开查看' : '点击展开编辑方案'}
          </span>
        </button>
      )}

      {isExpanded && (
        <div className="max-h-[52rem] space-y-5 overflow-y-auto p-6 custom-scrollbar">
          {schemes.map((scheme, index) => (
            <SchemeCard key={scheme.id} scheme={scheme} index={index} isRecommended={scheme.id === recommendedId} />
          ))}
        </div>
      )}
    </section>
  );
}
