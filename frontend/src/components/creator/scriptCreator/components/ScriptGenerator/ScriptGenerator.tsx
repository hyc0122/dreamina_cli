import { useApp } from '../../contexts/AppContext';
import { getCreationPresetLabel } from '../../utils/workspacePreset';
import { Episode, TrialFixItem, TrialJudgment } from '../../types';
import { buildTrialJudgment } from '../../services/qualityService';
import { useMemo, useState } from 'react';
import { buildFinalPlainText } from '../../utils/finalOutput';

function statusLabel(episode: Episode) {
  if (episode.status === 'generating') return { text: '生成中', className: 'bg-neon-gold/20 border-neon-gold text-neon-gold' };
  if (episode.status === 'checking') return { text: '优化中', className: 'bg-neon-cyan/20 border-neon-cyan text-neon-cyan' };
  if (episode.status === 'warning') return { text: '需确认', className: 'bg-yellow-500/20 border-yellow-500 text-yellow-300' };
  if (episode.status === 'failed') return { text: '失败', className: 'bg-red-500/20 border-red-500 text-red-400' };
  return { text: '已完成', className: 'bg-green-500/20 border-green-500 text-green-400' };
}

function SelfCheckStatus({ episode }: { episode: Episode }) {
  const isEvaluation = episode.title.includes('评测');
  if (episode.status === 'generating') return null;
  if (!episode.selfCheck) {
    return (
      <div className="mt-3 rounded-lg border border-gray-700 bg-cyber-dark/50 px-3 py-2 text-xs text-gray-400">
        {isEvaluation ? '评测：等待模型评分' : '自检：等待后台检查'}
      </div>
    );
  }

  const passed = episode.selfCheck.passed && episode.selfCheck.gatePassed !== false && episode.selfCheck.score >= 95;
  const scorePassed = isEvaluation ? episode.selfCheck.score >= 85 && episode.selfCheck.gatePassed !== false : passed;
  const evaluationFailed = isEvaluation && episode.selfCheck.score <= 0;
  return (
    <details className="mt-3 rounded-lg border border-gray-700 bg-cyber-dark/60 px-3 py-2">
      <summary className="cursor-pointer list-none text-sm font-bold text-gray-200">
        {isEvaluation ? '评测' : '自检'}：{episode.selfCheck.score}分 {evaluationFailed ? '失败，未得到有效评分' : scorePassed ? '已通过' : isEvaluation ? '有明显可改点' : '已自动修复后需确认'} <span className="text-xs text-gray-500">展开</span>
      </summary>
      <div className="mt-3 space-y-3 border-t border-gray-700 pt-3">
        {(episode.selfCheckRounds || [{ round: 1, action: passed ? 'passed' as const : 'checked' as const, report: episode.selfCheck }]).map((round) => {
          const roundPassed = isEvaluation
            ? round.report.score >= 85 && round.report.gatePassed !== false
            : round.report.passed && round.report.gatePassed !== false && round.report.score >= 95;
          const isScriptReport = round.report.evaluationMeta?.scoreModel === 'script_nine_dimensions';
          return (
          <div key={round.round} className="rounded-lg bg-cyber-purple/40 p-3">
            <div className="mb-2 flex items-center justify-between gap-2">
              <span className="text-xs font-bold text-neon-cyan">
                第{round.round}轮：{round.report.score}分 {round.selected ? '最终采用' : ''}
              </span>
              <span className={`rounded-full px-2 py-1 text-[11px] font-bold ${roundPassed ? 'bg-green-500/20 text-green-400' : 'bg-yellow-500/20 text-yellow-300'}`}>
                {isEvaluation ? '评测结果' : round.selected ? '最高分版本' : round.report.passed && round.report.gatePassed !== false && round.report.score >= 95 ? '通过' : '已触发修复'}
              </span>
            </div>
            <p className="mb-2 text-xs text-gray-300">{round.report.summary}</p>
            {round.report.evaluationMeta && (
              <div className="mb-3 rounded-lg border border-neon-cyan/30 bg-cyber-dark/50 p-2">
                <p className="mb-2 text-[11px] font-bold text-gray-500">评测识别</p>
                <div className="grid gap-2 text-[11px] text-gray-300 sm:grid-cols-3">
                  <span>赛道：{round.report.evaluationMeta.detectedTrack === 'male' ? '男频' : round.report.evaluationMeta.detectedTrack === 'female' ? '女频' : '泛性别'}</span>
                  <span>题材：{round.report.evaluationMeta.detectedGenre || '未识别'}</span>
                  <span>等级：{round.report.evaluationMeta.rating || '未定级'}</span>
                  {isScriptReport ? (
                    <span>模型：剧本九维100分</span>
                  ) : (
                    <>
                      <span>模型：市场转化100分</span>
                      <span>转化：{round.report.evaluationMeta.marketScore ?? round.report.score}/100</span>
                    </>
                  )}
                  <span>留存参考：{round.report.evaluationMeta.retentionScore ?? 0}</span>
                  <span className="sm:col-span-2">适配：{round.report.evaluationMeta.suitableTracks?.join('、') || '未给出'}</span>
                </div>
                {round.report.evaluationMeta.scoreReason && (
                  <p className="mt-2 text-[11px] text-gray-400">{round.report.evaluationMeta.scoreReason}</p>
                )}
                {isScriptReport && (
                  <div className="mt-2 space-y-1 text-[11px] text-gray-400">
                    {round.report.evaluationMeta.coreAdvantages && round.report.evaluationMeta.coreAdvantages.length > 0 && (
                      <p>核心优点：{round.report.evaluationMeta.coreAdvantages.join('、')}</p>
                    )}
                    {round.report.evaluationMeta.coreDisadvantages && round.report.evaluationMeta.coreDisadvantages.length > 0 && (
                      <p>核心短板：{round.report.evaluationMeta.coreDisadvantages.join('、')}</p>
                    )}
                    {round.report.evaluationMeta.redLineItems && round.report.evaluationMeta.redLineItems.length > 0 && (
                      <p className="text-red-300">红线：{round.report.evaluationMeta.redLineItems.join('、')}</p>
                    )}
                    {round.report.evaluationMeta.rectificationPriority && <p>整改优先级：{round.report.evaluationMeta.rectificationPriority}</p>}
                    {round.report.evaluationMeta.productionConclusion && <p>制作适配：{round.report.evaluationMeta.productionConclusion}</p>}
                    {round.report.evaluationMeta.trafficAdvice && <p>流量建议：{round.report.evaluationMeta.trafficAdvice}</p>}
                  </div>
                )}
              </div>
            )}
            {round.report.gates && round.report.gates.length > 0 && (
              <div className="mb-3 rounded-lg border border-gray-700 bg-cyber-dark/50 p-2">
                <p className="mb-2 text-[11px] font-bold text-gray-500">门禁项</p>
                <div className="grid gap-2 text-[11px] sm:grid-cols-3">
                  {round.report.gates.map((gate) => (
                    <div key={gate.key} className={gate.passed ? 'text-green-400' : 'text-red-300'}>
                      <span className="font-bold">{gate.passed ? '通过' : '失败'}</span> · {gate.name}
                      {!gate.passed && gate.issue && <p className="mt-1 text-gray-400">{gate.issue}</p>}
                    </div>
                  ))}
                </div>
              </div>
            )}
            {round.report.weightedMetrics && round.report.weightedMetrics.length > 0 ? (
              <div className="mb-3 rounded-lg border border-gray-700 bg-cyber-dark/50 p-2">
                <p className="mb-2 text-[11px] font-bold text-gray-500">主评分权重</p>
                <div className="grid gap-2 text-[11px] text-gray-400 sm:grid-cols-2">
                  {round.report.weightedMetrics.map((metric) => {
                    const metricPassed = isEvaluation ? metric.score >= metric.weight * 0.75 : metric.score >= 95;
                    return (
                    <div key={metric.key} className={metricPassed ? 'text-gray-400' : 'text-yellow-300'}>
                      {metric.name} {isEvaluation ? `${metric.score}/${metric.weight}分` : `${metric.score}分 / 权重${metric.weight}%`}
                      {metric.issue && <p className="mt-1 text-gray-500">{metric.issue}</p>}
                    </div>
                    );
                  })}
                </div>
              </div>
            ) : null}
            {round.report.failedDimensions && round.report.failedDimensions.length > 0 && (
              <p className="mb-2 text-[11px] font-bold text-yellow-300">
                失败项：{round.report.failedDimensions.join('、')}
              </p>
            )}
            {round.report.issues.length > 0 && (
              <div className="mb-2">
                <p className="text-[11px] font-bold text-gray-500">问题</p>
                <ul className="mt-1 space-y-1 text-xs text-gray-400">
                  {round.report.issues.map((issue, index) => <li key={index}>- {issue}</li>)}
                </ul>
              </div>
            )}
            {round.report.suggestions.length > 0 && (
              <div>
                <p className="text-[11px] font-bold text-gray-500">修复建议</p>
                <ul className="mt-1 space-y-1 text-xs text-gray-400">
                  {round.report.suggestions.map((suggestion, index) => <li key={index}>- {suggestion}</li>)}
                </ul>
              </div>
            )}
          </div>
          );
        })}
      </div>
    </details>
  );
}

function EpisodeCard({ episode }: { episode: Episode }) {
  const label = statusLabel(episode);
  return (
    <details className="rounded-xl border border-gray-700 bg-cyber-purple/50 p-5 transition hover:border-neon-pink/50" open={episode.id <= 3}>
      <summary className="cursor-pointer list-none">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center">
            <span className="mr-3 inline-flex h-9 w-9 items-center justify-center rounded-full bg-gradient-to-r from-neon-pink to-neon-gold text-sm font-bold text-white">
              {episode.id}
            </span>
            <div>
              <h4 className="text-lg font-bold text-white">第{episode.id}集：{episode.title}</h4>
              <p className="text-xs text-gray-500">{episode.content.length} 字 / {episode.scenes.length} 个结构段落</p>
            </div>
          </div>
          <span className={`rounded-full border px-3 py-1 text-xs font-bold ${label.className}`}>{label.text}</span>
        </div>
      </summary>

      <div className="mt-4 rounded-lg border border-gray-800 bg-cyber-dark/70 p-4">
        <p className="whitespace-pre-line text-sm leading-relaxed text-gray-300">
          {episode.content || '等待AI输出内容...'}
          {episode.status === 'generating' && <span className="ml-1 animate-pulse text-neon-gold">|</span>}
        </p>
      </div>

      <SelfCheckStatus episode={episode} />
    </details>
  );
}

function TrialJudgmentPanel({
  judgment,
  canContinue,
  revisionPending,
  onContinue,
  onApplySuggestions,
  onReselect,
}: {
  judgment: TrialJudgment;
  canContinue: boolean;
  revisionPending: boolean;
  onContinue: () => void;
  onApplySuggestions: () => void;
  onReselect: () => void;
}) {
  const colorClass = judgment.card.grade === 'A'
    ? 'border-green-500/60 bg-green-500/10 text-green-300'
    : judgment.card.grade === 'B'
      ? 'border-neon-gold/60 bg-neon-gold/10 text-neon-gold'
      : 'border-red-500/60 bg-red-500/10 text-red-300';
  const actionLabel = {
    test_now: '建议直接测试',
    revise_then_test: '建议修改后测试',
    pause: '建议暂缓投入',
    switch_scheme: '建议更换方案',
  }[judgment.card.action];
  const gradeLabel = {
    A: 'A档｜可以直接试投',
    B: 'B档｜有潜力，先改再测',
    C: 'C档｜暂不建议推进',
  }[judgment.card.grade];
  const fixIcon = (key: TrialFixItem['key']) => ({
    protagonist_identity: '身份',
    opening_hook: '开头',
    first_30_seconds: '30秒',
    episode_structure: '结构',
    scheme_selling_point: '卖点',
  }[key]);

  return (
    <section className={`mb-6 rounded-2xl border p-6 ${colorClass}`}>
      <div className="mb-5 flex flex-col gap-4 xl:flex-row xl:items-start xl:justify-between">
        <div className="min-w-0">
          <p className="text-xs font-bold uppercase tracking-[0.18em] text-gray-400">试播判断卡</p>
          <div className="mt-3 flex flex-wrap items-center gap-3">
            <span className="rounded-full border border-white/20 bg-white/10 px-3 py-1 text-sm font-black text-white">
              {gradeLabel}
            </span>
            <span className="rounded-full border border-white/10 px-3 py-1 text-xs font-bold text-slate-100">
              {actionLabel}
            </span>
            <span className="rounded-full border border-white/10 px-3 py-1 text-xs font-bold text-slate-100">
              平均 {judgment.score} 分
            </span>
          </div>
          <h3 className="mt-4 text-3xl font-black text-white">{judgment.card.headline}</h3>
          <p className="mt-3 max-w-3xl text-sm leading-6 text-slate-200">{judgment.reason}</p>
        </div>
        <div className="grid min-w-[220px] gap-3 rounded-2xl border border-white/10 bg-[#081321]/60 p-4">
          <div>
            <p className="text-[11px] font-bold uppercase tracking-wide text-slate-500">建议动作</p>
            <p className="mt-1 text-lg font-black text-white">{revisionPending ? '采用修订版并继续' : actionLabel}</p>
          </div>
          <div>
            <p className="text-[11px] font-bold uppercase tracking-wide text-slate-500">继续推进条件</p>
            <p className="mt-1 text-sm leading-6 text-slate-200">{judgment.card.readyToScaleAfter}</p>
          </div>
        </div>
      </div>

      <div className="grid gap-4 xl:grid-cols-[1.2fr_0.8fr]">
        <div className="rounded-2xl border border-white/10 bg-[#081321]/60 p-4">
          <p className="text-xs font-bold uppercase tracking-wide text-slate-500">为什么这样判断</p>
          <ul className="mt-3 space-y-2 text-sm leading-6 text-slate-200">
            {judgment.card.whyItDeserves.map((item, index) => (
              <li key={index} className="flex gap-3">
                <span className="mt-0.5 text-blue-300">•</span>
                <span>{item}</span>
              </li>
            ))}
          </ul>
        </div>
        <div className="rounded-2xl border border-white/10 bg-[#081321]/60 p-4">
          <p className="text-xs font-bold uppercase tracking-wide text-slate-500">前三集试播链路</p>
          <p className="mt-3 text-sm leading-6 text-slate-200">{judgment.card.pilotChainReview}</p>
          {judgment.card.riskFlags.length > 0 && (
            <div className="mt-4">
              <p className="text-xs font-bold uppercase tracking-wide text-slate-500">当前风险</p>
              <ul className="mt-2 space-y-2 text-sm text-slate-300">
                {judgment.card.riskFlags.map((risk, index) => (
                  <li key={index} className="flex gap-3">
                    <span className="mt-0.5 text-yellow-300">•</span>
                    <span>{risk}</span>
                  </li>
                ))}
              </ul>
            </div>
          )}
        </div>
      </div>

      <div className="mt-4 rounded-2xl border border-white/10 bg-[#081321]/60 p-4">
        <div className="mb-4">
          <p className="text-xs font-bold uppercase tracking-wide text-slate-500">先改这三刀</p>
          <p className="mt-1 text-sm text-slate-300">不用全改，先把最影响测试结果的地方改对。</p>
        </div>
        <div className="grid gap-4 xl:grid-cols-3">
          {judgment.card.topFixes.map((fix, index) => (
            <div key={`${fix.key}-${index}`} className="rounded-xl border border-white/10 bg-[#07111d] p-4">
              <div className="mb-3 flex items-center gap-2">
                <span className="rounded-full bg-white/10 px-2 py-1 text-[11px] font-black text-blue-300">{fixIcon(fix.key)}</span>
                <p className="text-sm font-black text-white">{fix.title}</p>
              </div>
              <p className="text-xs font-bold text-slate-500">当前问题</p>
              <p className="mt-1 text-sm leading-6 text-slate-200">{fix.issue}</p>
              <p className="mt-3 text-xs font-bold text-slate-500">为什么影响测试</p>
              <p className="mt-1 text-sm leading-6 text-slate-200">{fix.impact}</p>
              <p className="mt-3 text-xs font-bold text-slate-500">建议怎么改</p>
              <p className="mt-1 text-sm leading-6 text-slate-200">{fix.action}</p>
            </div>
          ))}
        </div>
      </div>

      <details className="mt-4 rounded-2xl border border-white/10 bg-cyber-dark/40 px-4 py-3">
        <summary className="cursor-pointer list-none text-sm font-bold text-gray-200">展开首集前段判断和逐集试播分析</summary>
        <div className="mt-4 grid gap-4 border-t border-white/10 pt-4 md:grid-cols-2">
          <div className="rounded-xl border border-white/10 bg-[#081321]/60 p-4">
            <p className="mb-2 text-xs font-bold uppercase tracking-wide text-slate-500">首集前段判断</p>
            <div className="space-y-3 text-sm text-slate-200">
              <div>
                <p className="text-[11px] font-bold text-slate-500">第一句 / 第一画面</p>
                <p className="mt-1">{judgment.card.openingReview.firstLineStatus}</p>
              </div>
              <div>
                <p className="text-[11px] font-bold text-slate-500">前30秒拉力</p>
                <p className="mt-1">{judgment.card.openingReview.firstThirtySecondsStatus}</p>
              </div>
              <div>
                <p className="text-[11px] font-bold text-slate-500">首集结构顺序</p>
                <p className="mt-1">{judgment.card.openingReview.episodeStructureStatus}</p>
              </div>
            </div>
          </div>
          <div>
            <p className="mb-2 text-xs font-bold text-gray-500">逐集判断</p>
            <ul className="space-y-2 text-sm text-gray-300">
              {judgment.details.map((detail, index) => <li key={index}>- {detail}</li>)}
            </ul>
          </div>
          <div>
            <p className="mb-2 text-xs font-bold text-gray-500">系统建议</p>
            <ul className="space-y-2 text-sm text-gray-300">
              {judgment.suggestions.map((suggestion, index) => <li key={index}>- {suggestion}</li>)}
            </ul>
          </div>
        </div>
      </details>

      {revisionPending && (
        <div className="mt-4 rounded-2xl border border-emerald-400/30 bg-emerald-400/10 p-4">
          <p className="text-xs font-bold uppercase tracking-wide text-emerald-300">修订版总结</p>
          <p className="mt-2 text-sm leading-6 text-slate-200">
            前三集已按试播卡建议重新打包修订，并重新完成质检。最终输出区现在展示的是修订后的前三集；确认采用后，后续第4集开始会以这版为连续基线继续生成。
          </p>
        </div>
      )}

      <div className="mt-4 grid gap-3 lg:grid-cols-3">
        <button
          onClick={onContinue}
          disabled={!canContinue}
          className={`rounded-xl px-5 py-3 font-bold text-white disabled:cursor-not-allowed disabled:opacity-40 ${
            revisionPending || judgment.card.action === 'test_now'
              ? 'bg-gradient-to-r from-neon-cyan to-blue-500'
              : 'border border-blue-400/60 bg-blue-500/10 text-blue-200 hover:bg-blue-500/20'
          }`}
        >
          {revisionPending ? '采用修订版并继续' : '继续生成后续集'}
        </button>
        <button
          onClick={onApplySuggestions}
          className={`rounded-xl px-5 py-3 font-bold text-white ${
            !revisionPending && judgment.card.action !== 'test_now'
              ? 'bg-gradient-to-r from-neon-pink to-neon-gold'
              : 'border border-neon-gold/60 bg-neon-gold/10 text-neon-gold hover:bg-neon-gold/20'
          }`}
        >
          按试播卡建议优化前三集
        </button>
        <button
          onClick={onReselect}
          className={`rounded-xl px-5 py-3 font-bold ${
            judgment.card.action === 'switch_scheme'
              ? 'border border-red-400/70 bg-red-500/10 text-red-200 hover:bg-red-500/20'
              : 'border border-gray-600 text-gray-200 hover:border-neon-pink'
          }`}
        >
          回退重选方案
        </button>
      </div>

      <div className="hidden">
        <button
          onClick={onContinue}
          disabled={!canContinue}
          className={`rounded-xl px-5 py-3 font-bold text-white disabled:cursor-not-allowed disabled:opacity-40 ${
            judgment.card.action === 'test_now'
              ? 'bg-gradient-to-r from-neon-cyan to-blue-500'
              : 'border border-blue-400/60 bg-blue-500/10 text-blue-200 hover:bg-blue-500/20'
          }`}
        >
          继续生成后续集
        </button>
        <button
          onClick={onApplySuggestions}
          className={`rounded-xl px-5 py-3 font-bold text-white ${
            judgment.card.action !== 'test_now'
              ? 'bg-gradient-to-r from-neon-pink to-neon-gold'
              : 'border border-neon-gold/60 bg-neon-gold/10 text-neon-gold hover:bg-neon-gold/20'
          }`}
        >
          按试播卡建议优化前三集
        </button>
        <button
          onClick={onReselect}
          className={`rounded-xl px-5 py-3 font-bold ${
            judgment.card.action === 'switch_scheme'
              ? 'border border-red-400/70 bg-red-500/10 text-red-200 hover:bg-red-500/20'
              : 'border border-gray-600 text-gray-200 hover:border-neon-pink'
          }`}
        >
          回退重选方案
        </button>
      </div>

      <div className="hidden">
        {judgment.card.action === 'test_now' && canContinue && (
          <button onClick={onContinue} className="rounded-xl bg-gradient-to-r from-neon-cyan to-blue-500 px-5 py-3 font-bold text-white">
            进入测试
          </button>
        )}
        {judgment.card.action !== 'test_now' && (
          <button onClick={onApplySuggestions} className="rounded-xl bg-gradient-to-r from-neon-pink to-neon-gold px-5 py-3 font-bold text-white">
            按建议重写前三集并直接输出
          </button>
        )}
        <button onClick={onReselect} className="rounded-xl border border-gray-600 px-5 py-3 font-bold text-gray-200 hover:border-neon-pink">
          回退重选方案
        </button>
      </div>
    </section>
  );
}

function evaluationReportText(episode: Episode) {
  const report = episode.selfCheck;
  if (!report) return episode.content.trim();
  const meta = report.evaluationMeta;
  const lines = [
    `${episode.title}`,
    `综合总分：${report.score}/100`,
    meta?.rating ? `等级：${meta.rating}` : '',
    meta?.detectedGenre ? `题材：${meta.detectedGenre}` : '',
    meta?.scoreReason ? `结论：${meta.scoreReason}` : report.summary,
    '',
    '九大/权重维度：',
    ...(report.weightedMetrics || []).map((metric) => `${metric.name}：${metric.score}/${metric.weight}分${metric.issue ? `。${metric.issue}` : ''}${metric.evidence ? ` 证据：${metric.evidence}` : ''}`),
    '',
    meta?.coreAdvantages?.length ? `核心优点：${meta.coreAdvantages.join('；')}` : '',
    meta?.redLineItems?.length ? `红线违规项：${meta.redLineItems.join('；')}` : '红线违规项：无触碰烂作红线',
    report.issues.length ? `关键问题：${report.issues.join('；')}` : '',
    report.suggestions.length ? `针对性优化建议：${report.suggestions.join('；')}` : '',
    meta?.rectificationPriority ? `整改优先级：${meta.rectificationPriority}` : '',
    meta?.productionConclusion ? `商用&拍摄&AI制作适配结论：${meta.productionConclusion}` : '',
    meta?.trafficAdvice ? `流量适配建议：${meta.trafficAdvice}` : '',
  ];
  return lines.filter((line) => line !== '').join('\n');
}

function EmptyResultPanel({
  title,
  description,
}: {
  title: string;
  description: string;
}) {
  return (
    <section className="min-h-[36rem] rounded-xl border border-slate-700/80 bg-[#0a1421]/80">
      <div className="border-b border-slate-800 px-6 py-5">
        <h2 className="text-xl font-bold text-white">方案预览</h2>
      </div>
      <div className="flex min-h-[28rem] flex-col items-center justify-center px-6 text-center">
        <div className="mb-8 flex h-28 w-28 items-center justify-center rounded-2xl border border-slate-700 bg-slate-900/40 text-6xl text-slate-600">□</div>
        <h3 className="text-3xl font-bold text-white">{title}</h3>
        <p className="mt-4 max-w-xl text-base text-slate-400">{description}</p>
      </div>
      <div className="border-t border-slate-800 px-6 py-5">
        <h3 className="text-lg font-bold text-white">生成历史</h3>
        <div className="flex h-40 flex-col items-center justify-center text-slate-500">
          <p>暂无生成记录</p>
          <p className="mt-2">生成结果将会显示在这里</p>
        </div>
      </div>
    </section>
  );
}

export default function ScriptGenerator() {
  const [copyStatus, setCopyStatus] = useState('');
  const {
    config,
    generatedScript,
    selectedScheme,
    isGenerating,
    episodes,
    finalEpisodes,
    trialRevisionPending,
    continueGeneration,
    applyTrialSuggestions,
    resetToSchemeSelection,
  } = useApp();
  const visibleEpisodes = episodes.length > 0 ? episodes : generatedScript?.episodes || [];
  const finalContent = useMemo(
    () => buildFinalPlainText(config, finalEpisodes, episodes, generatedScript),
    [config, finalEpisodes, episodes, generatedScript]
  );
  const outputTypeName = config.workflowMode === 'create'
    ? getCreationPresetLabel(config)
    : config.inputType === 'screenplay'
      ? '剧本评测'
      : '小说评测';
  const totalEpisodes = Math.max(1, Math.min(1000, config.episodeCount || 1));
  const trialEpisodeCount = Math.min(3, totalEpisodes);
  const completedVisibleEpisodes = visibleEpisodes.filter((episode) => episode.status !== 'generating');
  const shouldShowTrialJudgment =
    config.workflowMode === 'create' &&
    !isGenerating &&
    completedVisibleEpisodes.length === trialEpisodeCount &&
    totalEpisodes > trialEpisodeCount;
  const trialJudgment = shouldShowTrialJudgment ? buildTrialJudgment(completedVisibleEpisodes.slice(0, trialEpisodeCount)) : null;
  const trialRewriteInstructions = trialJudgment
    ? [
        ...trialJudgment.suggestions,
        ...trialJudgment.card.topFixes.map((fix) => `${fix.title}：${fix.action}`),
      ]
    : [];
  const copyFinalContent = async () => {
    if (!finalContent.trim()) return;
    await navigator.clipboard.writeText(finalContent);
    setCopyStatus('已复制全部最终结果');
    window.setTimeout(() => setCopyStatus(''), 1800);
  };

  if (config.workflowMode === 'score' && visibleEpisodes.length === 0 && !isGenerating) {
    return (
      <EmptyResultPanel title="等待用户作品评测" description="左侧粘贴自写小说或剧本后开始评测；这是独立评分工具，不参与生成框架。" />
    );
  }

  if (!selectedScheme && config.workflowMode === 'create') {
    return (
      <EmptyResultPanel title="等待选择方案" description="先生成三套轻量故事方案，选择并自由编辑一套，再生成故事结构和前3集。" />
    );
  }

  if (visibleEpisodes.length === 0) return null;

  return (
    <section className="rounded-xl border border-neon-gold/50 bg-cyber-dark/80 p-6 backdrop-blur-sm">
      <div className="mb-6 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h2 className="bg-gradient-to-r from-neon-gold to-neon-cyan bg-clip-text text-2xl font-bold text-transparent">
            {generatedScript?.title || selectedScheme?.name || '生成结果'}
          </h2>
          <p className="mt-1 text-sm text-gray-400">
            已输出 {visibleEpisodes.length} 集{generatedScript ? ` | ${generatedScript.totalLength}` : ' | 生成中实时显示'}
          </p>
        </div>
        <div className="rounded-full border border-neon-gold bg-neon-gold/20 px-4 py-2">
          <span className="text-sm font-bold text-neon-gold">{isGenerating ? '生成中' : `${outputTypeName}已完成当前批次`}</span>
        </div>
      </div>
      {trialJudgment && (
        <div className="mb-6">
          <TrialJudgmentPanel
            judgment={trialJudgment}
            canContinue={completedVisibleEpisodes.length < totalEpisodes}
            revisionPending={trialRevisionPending}
            onContinue={continueGeneration}
            onApplySuggestions={() => applyTrialSuggestions(trialRewriteInstructions)}
            onReselect={resetToSchemeSelection}
          />
        </div>
      )}
      <div className="max-h-[36rem] space-y-4 overflow-y-auto pr-2 custom-scrollbar">
        {visibleEpisodes.map((episode) => <EpisodeCard key={episode.id} episode={episode} />)}
      </div>
      <div className="mt-6 rounded-xl border border-neon-gold/40 bg-cyber-purple/40 p-4">
        <div className="mb-3 flex items-center justify-between gap-3">
          <div>
            <h3 className="text-lg font-bold text-white">最终结果</h3>
            <p className="mt-1 text-xs text-gray-400">这里只放当前所有已输出内容的最终合并稿。</p>
          </div>
          <button
            type="button"
            onClick={copyFinalContent}
            disabled={!finalContent.trim()}
            className="rounded-lg bg-gradient-to-r from-neon-cyan to-blue-500 px-5 py-3 text-sm font-bold text-white disabled:cursor-not-allowed disabled:opacity-50"
          >
            复制全部最终结果
          </button>
        </div>
        <textarea
          readOnly
          value={finalContent}
          rows={8}
          className="w-full resize-y rounded-lg border border-gray-700 bg-cyber-dark/80 px-4 py-3 text-sm leading-relaxed text-gray-200 outline-none custom-scrollbar"
        />
        {copyStatus && <p className="mt-2 text-sm font-bold text-neon-cyan">{copyStatus}</p>}
      </div>
    </section>
  );
}
