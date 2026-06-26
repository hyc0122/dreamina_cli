import { Episode, EpisodeJob, FinalEpisodeRecord } from '../types';

export function episodeFromFinalRecord(record: FinalEpisodeRecord): Episode {
  return {
    id: record.episodeId,
    title: record.title,
    content: record.content,
    scenes: record.scenes || [],
    status: record.status,
    selfCheck: typeof record.score === 'number'
      ? {
          passed: record.status === 'passed',
          score: record.score,
          gatePassed: record.status !== 'failed',
          summary: 'Restored from finalized episode record.',
          issues: [],
          suggestions: [],
        }
      : undefined,
  };
}

export function episodesFromFinalRecords(records: FinalEpisodeRecord[]): Episode[] {
  return records
    .map(episodeFromFinalRecord)
    .sort((a, b) => a.id - b.id);
}

export function isCompletedEpisodeUsable(episode?: Episode): boolean {
  return Boolean(
    episode &&
    episode.status !== 'generating' &&
    episode.status !== 'failed' &&
    episode.content.trim()
  );
}

export function leadingUsableEpisodes(items: Episode[]): Episode[] {
  const byId = new Map(items.map((episode) => [episode.id, episode]));
  const result: Episode[] = [];

  for (let expectedId = 1; expectedId <= items.length; expectedId += 1) {
    const episode = byId.get(expectedId);
    if (!episode || !isCompletedEpisodeUsable(episode)) break;
    result.push(episode);
  }

  return result;
}

export function interruptedNextEpisodeId(completedEpisodes: Episode[], jobs: EpisodeJob[]): number | null {
  const nextEpisodeId = leadingUsableEpisodes(completedEpisodes).length + 1;
  const nextJob = jobs.find((job) => job.episodeId === nextEpisodeId);
  if (!nextJob) return null;
  return ['running', 'blocked', 'failed', 'stopped'].includes(nextJob.status) ? nextEpisodeId : null;
}
