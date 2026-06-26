import { Episode, FinalEpisodeRecord, GenerationConfig, Script } from '../types';

export interface FinalOutputEpisode {
  id: number;
  title: string;
  content: string;
}

function completedEpisodeItems(episodes: Episode[]): FinalOutputEpisode[] {
  return episodes
    .filter((episode) => episode.status !== 'generating' && episode.content.trim())
    .map((episode) => ({
      id: episode.id,
      title: episode.title,
      content: episode.content,
    }))
    .sort((a, b) => a.id - b.id);
}

function finalRecordItems(finalEpisodes: FinalEpisodeRecord[]): FinalOutputEpisode[] {
  return finalEpisodes
    .filter((episode) => episode.content.trim())
    .map((episode) => ({
      id: episode.episodeId,
      title: episode.title,
      content: episode.content,
    }))
    .sort((a, b) => a.id - b.id);
}

export function selectFinalOutputEpisodes(
  finalEpisodes: FinalEpisodeRecord[],
  episodes: Episode[],
  generatedScript?: Script | null
): FinalOutputEpisode[] {
  const finalized = finalRecordItems(finalEpisodes);
  if (finalized.length > 0) return finalized;

  const liveCompleted = completedEpisodeItems(episodes);
  if (liveCompleted.length > 0) return liveCompleted;

  return completedEpisodeItems(generatedScript?.episodes || []);
}

export function formatEvaluationReport(episode: Episode): string {
  const report = episode.selfCheck;
  if (!report) return episode.content.trim();
  const meta = report.evaluationMeta;

  return [
    episode.title,
    `综合总分：${report.score}/100`,
    meta?.rating ? `等级：${meta.rating}` : '',
    meta?.detectedTrack ? `赛道：${meta.detectedTrack === 'male' ? '男频' : meta.detectedTrack === 'female' ? '女频' : '泛向'}` : '',
    meta?.detectedGenre ? `题材：${meta.detectedGenre}` : '',
    meta?.scoreReason ? `结论：${meta.scoreReason}` : report.summary,
    '',
    '维度评分：',
    ...(report.weightedMetrics || []).map((metric) => [
      `${metric.name}：${metric.score}/${metric.weight}`,
      metric.issue ? `问题：${metric.issue}` : '',
      metric.evidence ? `证据：${metric.evidence}` : '',
    ].filter(Boolean).join('；')),
    '',
    meta?.coreAdvantages?.length ? `核心优点：${meta.coreAdvantages.join('；')}` : '',
    meta?.coreDisadvantages?.length ? `核心短板：${meta.coreDisadvantages.join('；')}` : '',
    meta?.redLineItems?.length ? `红线风险：${meta.redLineItems.join('；')}` : '红线风险：未发现明确红线',
    report.issues.length ? `关键问题：${report.issues.join('；')}` : '',
    report.suggestions.length ? `优化建议：${report.suggestions.join('；')}` : '',
    meta?.rectificationPriority ? `整改优先级：${meta.rectificationPriority}` : '',
    meta?.productionConclusion ? `制作适配：${meta.productionConclusion}` : '',
    meta?.trafficAdvice ? `流量建议：${meta.trafficAdvice}` : '',
  ].filter((line) => line !== '').join('\n');
}

export function buildFinalPlainText(
  config: GenerationConfig,
  finalEpisodes: FinalEpisodeRecord[],
  episodes: Episode[],
  generatedScript?: Script | null
): string {
  if (config.workflowMode === 'score') {
    const sourceEpisodes = episodes.length > 0 ? episodes : generatedScript?.episodes || [];
    return sourceEpisodes
      .filter((episode) => episode.status !== 'generating')
      .map(formatEvaluationReport)
      .filter(Boolean)
      .join('\n\n');
  }

  return selectFinalOutputEpisodes(finalEpisodes, episodes, generatedScript)
    .map((episode) => episode.content.trim())
    .filter(Boolean)
    .join('\n\n');
}

export function buildFinalMarkdown(
  title: string,
  config: GenerationConfig,
  finalEpisodes: FinalEpisodeRecord[],
  episodes: Episode[],
  generatedScript?: Script | null
): string {
  if (config.workflowMode === 'score') {
    return `# ${title}\n\n${buildFinalPlainText(config, finalEpisodes, episodes, generatedScript)}`;
  }

  const body = selectFinalOutputEpisodes(finalEpisodes, episodes, generatedScript)
    .map((episode) => `## 第${episode.id}集 ${episode.title}\n\n${episode.content.trim()}`)
    .join('\n\n');

  return `# ${title}\n\n${body}`;
}
