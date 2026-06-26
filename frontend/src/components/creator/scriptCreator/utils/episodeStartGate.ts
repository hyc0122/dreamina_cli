import { Episode, ProductionEvent } from '../types';
import { deriveEpisodeProductionStates, EpisodeProductionState } from './episodeStateMachine';
import { isCompletedEpisodeUsable } from './episodeRecovery';

export interface EpisodeStartGateResult {
  allowed: boolean;
  episodeId: number;
  previousEpisodeId?: number;
  previousContentReady?: boolean;
  previousState?: EpisodeProductionState | 'missing';
  blocker?: 'missing_previous_final_content' | 'previous_not_finalized';
}

export function evaluateEpisodeStartGate(
  episodeId: number,
  completedEpisodes: Episode[],
  productionEvents: ProductionEvent[]
): EpisodeStartGateResult {
  if (episodeId <= 1) {
    return { allowed: true, episodeId };
  }

  const previousEpisodeId = episodeId - 1;
  const previousEpisode = completedEpisodes.find((episode) => episode.id === previousEpisodeId);
  const previousStates = deriveEpisodeProductionStates(productionEvents);
  const previousState = previousStates[previousEpisodeId];
  const previousContentReady = isCompletedEpisodeUsable(previousEpisode);
  const previousStateReady = !previousState || previousState.state === 'finalized';

  if (!previousContentReady) {
    return {
      allowed: false,
      episodeId,
      previousEpisodeId,
      previousContentReady,
      previousState: previousState?.state || 'missing',
      blocker: 'missing_previous_final_content',
    };
  }

  if (!previousStateReady) {
    return {
      allowed: false,
      episodeId,
      previousEpisodeId,
      previousContentReady,
      previousState: previousState.state,
      blocker: 'previous_not_finalized',
    };
  }

  return {
    allowed: true,
    episodeId,
    previousEpisodeId,
    previousContentReady,
    previousState: previousState?.state || 'missing',
  };
}
