import { ReactNode, useEffect, useMemo, useState } from 'react';
import { useApp } from '../../contexts/AppContext';
import { episodeFromFinalRecord, interruptedNextEpisodeId, leadingUsableEpisodes } from '../../utils/episodeRecovery';
import { getCreationPresetDescription, getCreationPresetLabel } from '../../utils/workspacePreset';
const DEFAULT_EPISODE_COUNT = 60;
const MAX_EPISODE_COUNT = 1000;

function FieldLabel({ children, required }: { children: string; required?: boolean }) {
  return (
    <span className="mb-2 block text-sm font-black text-slate-300">
      {children} {required && <span className="text-red-400">*</span>}
    </span>
  );
}

function Section({
  step,
  title,
  desc,
  children,
}: {
  step: number;
  title: string;
  desc?: string;
  children: ReactNode;
}) {
  return (
    <section className="overflow-hidden rounded-2xl border border-[#1d2a3e] bg-[#0b1725]/92">
      <div className="border-b border-[#1d2a3e] px-5 py-4">
        <div className="flex items-center gap-3">
          <span className="inline-flex h-7 w-7 items-center justify-center rounded-lg bg-blue-500/15 text-xs font-black text-blue-300">
            {step}
          </span>
          <h2 className="text-lg font-black text-white">{title}</h2>
        </div>
        {desc && <p className="mt-2 text-xs leading-5 text-slate-500">{desc}</p>}
      </div>
      <div className="space-y-5 p-5">{children}</div>
    </section>
  );
}

function Segmented<T extends string>({
  value,
  options,
  onChange,
  columns = 2,
}: {
  value: T;
  options: Array<{ value: T; label: string; desc?: string }>;
  onChange: (value: T) => void;
  columns?: 2 | 3 | 4;
}) {
  const gridClass = columns === 4 ? 'grid-cols-2 xl:grid-cols-4' : columns === 3 ? 'grid-cols-3' : 'grid-cols-2';
  return (
    <div className={`grid gap-3 ${gridClass}`}>
      {options.map((option) => {
        const active = value === option.value;
        return (
          <button
            key={option.value}
            type="button"
            onClick={() => onChange(option.value)}
            className={`min-h-12 rounded-xl border px-4 py-3 text-left transition ${
              active
                ? 'border-blue-400 bg-blue-500/12 text-blue-200 shadow-[0_0_0_1px_rgba(96,165,250,0.28)]'
                : 'border-[#26354d] bg-[#081321] text-slate-400 hover:border-slate-500 hover:text-slate-200'
            }`}
          >
            <span className="block text-sm font-black">{option.label}</span>
            {option.desc && <span className="mt-1 block text-xs leading-5 text-slate-500">{option.desc}</span>}
          </button>
        );
      })}
    </div>
  );
}

export default function ConfigPanel() {
  const [episodeCountInput, setEpisodeCountInput] = useState('');
  const [chapterWordCountInput, setChapterWordCountInput] = useState('');
  const [episodeDurationInput, setEpisodeDurationInput] = useState('');
  const {
    config,
    setConfig,
    generateSchemes,
    evaluateUserWork,
    continueGeneration,
    stopGeneration,
    selectedScheme,
    episodes,
    finalEpisodes,
    episodeJobs,
    isGenerating,
  } = useApp();

  const isCreateMode = config.workflowMode === 'create';
  const isScoreMode = config.workflowMode === 'score';
  const totalEpisodes = Math.max(1, Math.min(MAX_EPISODE_COUNT, config.episodeCount || 1));
  const completedEpisodes = finalEpisodes.length > 0
    ? leadingUsableEpisodes(finalEpisodes.map(episodeFromFinalRecord))
    : leadingUsableEpisodes(episodes.filter((episode) => episode.status !== 'generating'));
  const completedCount = completedEpisodes.length;
  const retryEpisodeId = interruptedNextEpisodeId(completedEpisodes, episodeJobs);
  const trialEpisodeCount = Math.min(3, totalEpisodes);
  const isWaitingForTrialDecision = totalEpisodes > trialEpisodeCount
    && completedCount === trialEpisodeCount
    && !retryEpisodeId;
  const canContinue = isCreateMode
    && !isGenerating
    && !!selectedScheme
    && completedCount > 0
    && completedCount < totalEpisodes
    && !isWaitingForTrialDecision;
  const canGenerate = isCreateMode
    ? Boolean(config.userIdea.trim()) && !isGenerating
    : Boolean(config.sourceText.trim()) && !isGenerating;
  const primaryAction = isCreateMode ? generateSchemes : evaluateUserWork;
  const primaryLabel = isCreateMode ? '生成故事方案' : '开始评测';
  const retentionWindows = Math.max(1, Math.ceil((config.episodeDurationSeconds || 70) / 15));

  const modeBadge = useMemo(() => {
    if (isCreateMode) return getCreationPresetLabel(config);
    return '作品评测';
  }, [config, isCreateMode]);

  useEffect(() => {
    setEpisodeCountInput(String(config.episodeCount || ''));
  }, [config.episodeCount]);

  useEffect(() => {
    setChapterWordCountInput(String(config.chapterWordCount || ''));
  }, [config.chapterWordCount]);

  useEffect(() => {
    setEpisodeDurationInput(String(config.episodeDurationSeconds || ''));
  }, [config.episodeDurationSeconds]);

  const updateEpisodeCountInput = (value: string) => {
    setEpisodeCountInput(value);
    if (value.trim() === '') return;
    const next = Number(value);
    if (Number.isFinite(next)) setConfig({ ...config, episodeCount: Math.max(1, Math.min(MAX_EPISODE_COUNT, next)) });
  };

  const updateEpisodeDurationInput = (value: string) => {
    const digitsOnly = value.replace(/[^\d]/g, '');
    setEpisodeDurationInput(digitsOnly);
    if (digitsOnly.trim() === '') return;
    const next = Number(digitsOnly);
    if (Number.isFinite(next)) setConfig({ ...config, episodeDurationSeconds: Math.max(15, Math.min(180, next)) });
  };

  const updateChapterWordCountInput = (value: string) => {
    setChapterWordCountInput(value);
    if (value.trim() === '') return;
    const next = Number(value);
    if (Number.isFinite(next)) setConfig({ ...config, chapterWordCount: Math.max(300, Math.min(8000, next)) });
  };

  const normalizeEpisodeCountInput = () => {
    const next = episodeCountInput.trim() === ''
      ? config.episodeCount || DEFAULT_EPISODE_COUNT
      : Math.max(1, Math.min(MAX_EPISODE_COUNT, Number(episodeCountInput) || config.episodeCount || DEFAULT_EPISODE_COUNT));
    setEpisodeCountInput(String(next));
    setConfig({ ...config, episodeCount: next });
  };

  const normalizeEpisodeDurationInput = () => {
    const next = episodeDurationInput.trim() === ''
      ? config.episodeDurationSeconds || 70
      : Math.max(15, Math.min(180, Number(episodeDurationInput) || config.episodeDurationSeconds || 70));
    setEpisodeDurationInput(String(next));
    setConfig({ ...config, episodeDurationSeconds: next });
  };

  const normalizeChapterWordCountInput = () => {
    const next = chapterWordCountInput.trim() === ''
      ? config.chapterWordCount || 1800
      : Math.max(300, Math.min(8000, Number(chapterWordCountInput) || config.chapterWordCount || 1800));
    setChapterWordCountInput(String(next));
    setConfig({ ...config, chapterWordCount: next });
  };

  return (
    <aside className="space-y-4">
      <div className="rounded-2xl border border-blue-400/25 bg-blue-500/10 px-5 py-4">
        <p className="text-xs font-black uppercase tracking-[0.18em] text-blue-300">当前模式</p>
        <div className="mt-2 flex flex-wrap items-center gap-3">
          <span className="text-2xl font-black text-white">{modeBadge}</span>
        </div>
      </div>

      <Section step={1} title={isCreateMode ? '试播方向输入' : '评测内容'} desc={isCreateMode ? getCreationPresetDescription(config) : '作品评测独立运行，不参与生成链路。'}>
        {isCreateMode ? (
          <>
            <label>
              <FieldLabel required>一句想法</FieldLabel>
              <textarea
                value={config.userIdea}
                onChange={(event) => setConfig({ ...config, userIdea: event.target.value })}
                rows={5}
                maxLength={500}
                placeholder="例如：月薪三千，却开两百万豪车，只因明天要陪69岁女友过70大寿。"
                className="w-full resize-none rounded-xl border border-[#26354d] bg-[#081321] px-4 py-3 text-slate-100 outline-none focus:border-blue-400"
              />
              <p className="mt-1 text-right text-xs text-slate-500">{config.userIdea.length}/500</p>
              <p className="mt-2 text-xs text-slate-500">不需要先写完整世界观，只要把你最想测试的卖点说清楚。</p>
            </label>

            <div>
              <FieldLabel>创作方向</FieldLabel>
              <Segmented
                value={config.audience}
                onChange={(audience) => setConfig({ ...config, audience })}
                options={[
                  { value: 'male', label: '男频' },
                  { value: 'female', label: '女频' },
                ]}
              />
            </div>

            <div>
              <FieldLabel>故事风格</FieldLabel>
              <Segmented
                value={config.contentStyle}
                onChange={(contentStyle) => setConfig({ ...config, contentStyle })}
                options={[
                  { value: 'normal', label: '正常', desc: '不强行堆梗' },
                  { value: 'dianwen', label: '颠文', desc: '模型自行判断强度' },
                ]}
              />
            </div>
          </>
        ) : (
          <>
            <div>
              <FieldLabel>作品类型</FieldLabel>
              <Segmented
                value={config.inputType === 'idea' ? 'novel' : config.inputType}
                onChange={(inputType) => setConfig({ ...config, inputType })}
                options={[
                  { value: 'novel', label: '小说' },
                  { value: 'screenplay', label: '剧本' },
                ]}
              />
            </div>
            <label>
              <FieldLabel required>粘贴要评测的作品</FieldLabel>
              <textarea
                value={config.sourceText}
                onChange={(event) => setConfig({ ...config, sourceText: event.target.value })}
                rows={10}
                placeholder="粘贴小说或剧本。系统只评测，不改写。"
                className="w-full resize-y rounded-xl border border-[#26354d] bg-[#081321] px-4 py-3 text-slate-100 outline-none focus:border-blue-400"
              />
            </label>
          </>
        )}

        <label className="flex items-center justify-between gap-4 rounded-xl border border-[#26354d] bg-[#081321] px-4 py-3">
          <span>
            <span className="block text-sm font-black text-slate-100">红果审核适配</span>
            <span className="text-xs leading-5 text-slate-500">开启后，合规优先于高风险表达；关闭后只做普通内容质量判断。</span>
          </span>
          <input
            type="checkbox"
            checked={config.hongguoReviewEnabled}
            onChange={(event) => setConfig({ ...config, hongguoReviewEnabled: event.target.checked })}
            className="h-5 w-5 shrink-0"
          />
        </label>
      </Section>

      <Section step={2} title={isScoreMode ? '开始评测' : '试播包参数'}>
        {isCreateMode && (
          <>
            <div className="grid gap-4 sm:grid-cols-2">
              <label>
                <FieldLabel>总集数</FieldLabel>
                <input
                  type="number"
                  min={1}
                  max={MAX_EPISODE_COUNT}
                  value={episodeCountInput}
                  onChange={(event) => updateEpisodeCountInput(event.target.value)}
                  onBlur={normalizeEpisodeCountInput}
                  className="h-12 w-full rounded-xl border border-[#26354d] bg-[#081321] px-4 text-slate-100 outline-none focus:border-blue-400"
                />
                <p className="mt-1 text-xs text-slate-500">默认 60，可自定义到 {MAX_EPISODE_COUNT} 集，但当前主目标仍然是先把当前创作入口做对。</p>
              </label>
              {config.outputType === 'novel' ? (
                <label>
                  <FieldLabel>单集字数</FieldLabel>
                  <input
                    type="number"
                    min={300}
                    max={8000}
                    step={100}
                    value={chapterWordCountInput}
                    onChange={(event) => updateChapterWordCountInput(event.target.value)}
                    onBlur={normalizeChapterWordCountInput}
                    className="h-12 w-full rounded-xl border border-[#26354d] bg-[#081321] px-4 text-slate-100 outline-none focus:border-blue-400"
                  />
                </label>
              ) : (
                <label>
                  <FieldLabel>单集时长</FieldLabel>
                  <input
                    type="text"
                    inputMode="numeric"
                    pattern="[0-9]*"
                    value={episodeDurationInput}
                    onChange={(event) => updateEpisodeDurationInput(event.target.value)}
                    onBlur={normalizeEpisodeDurationInput}
                    className="h-12 w-full rounded-xl border border-[#26354d] bg-[#081321] px-4 text-right font-semibold tabular-nums text-slate-100 outline-none focus:border-blue-400"
                  />
                </label>
              )}
            </div>

            <p className="rounded-xl border border-[#26354d] bg-[#081321] px-4 py-3 text-sm leading-6 text-slate-400">
              {config.outputType === 'novel'
                ? `小说按每集约 ${config.chapterWordCount || 1800} 字生成；后台会检查开头钩子、章节冲突、追更点、主线状态和上下集连贯。`
                : `短剧/分镜按每集约 ${config.episodeDurationSeconds || 70} 秒生成；后台会按 ${retentionWindows} 个15秒留存窗口检查节奏。`}
            </p>
          </>
        )}

        {isScoreMode && (
          <p className="rounded-xl border border-[#26354d] bg-[#081321] px-4 py-3 text-sm leading-6 text-slate-400">
            作品评测是独立工具，不参与生成链路。剧本使用九维100分模型；小说使用市场转化100分模型，只看钩子、留存、追更和变现。
          </p>
        )}

        <div className="grid gap-4">
          {isGenerating ? (
            <button
              type="button"
              onClick={stopGeneration}
              className="h-14 rounded-xl bg-red-500 text-base font-black text-white hover:bg-red-400"
            >
              停止
            </button>
          ) : canContinue ? (
            <button
              type="button"
              onClick={continueGeneration}
              className="h-14 rounded-xl bg-gradient-to-r from-blue-500 to-fuchsia-500 text-base font-black text-white"
            >
              {retryEpisodeId ? `重试第${retryEpisodeId}集` : '继续生成'}
            </button>
          ) : (
            <button
              type="button"
              onClick={primaryAction}
              disabled={!canGenerate}
              className="h-14 rounded-xl bg-gradient-to-r from-blue-500 to-fuchsia-500 text-base font-black text-white shadow-[0_16px_40px_rgba(99,102,241,0.28)] disabled:cursor-not-allowed disabled:opacity-40"
            >
              {isCreateMode ? '开始生成试播方案' : primaryLabel}
            </button>
          )}
        </div>
        {isCreateMode && (
          <p className="rounded-xl border border-blue-400/20 bg-blue-500/10 px-4 py-3 text-sm leading-6 text-slate-300">
            系统会先生成方案，再生成前3集，并在完成后给出一页试播判断卡，告诉你值不值得继续压资源。
          </p>
        )}
      </Section>
    </aside>
  );
}
