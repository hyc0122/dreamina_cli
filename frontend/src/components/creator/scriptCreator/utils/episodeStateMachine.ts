import { ProductionEvent } from '../types';

export type EpisodeProductionState =
  | 'idle'
  | 'planning'
  | 'drafting'
  | 'drafted'
  | 'checking'
  | 'repairing'
  | 'finalized'
  | 'failed'
  | 'stopped';

export interface EpisodeStateSnapshot {
  episodeId: number;
  state: EpisodeProductionState;
  updatedAt: string;
  lastEventType: ProductionEvent['type'];
  violation?: string;
}

type EpisodeEventType = ProductionEvent['type'];

const EVENT_STATE_MAP: Partial<Record<EpisodeEventType, EpisodeProductionState>> = {
  episode_planning_started: 'planning',
  episode_drafting_started: 'drafting',
  episode_draft_completed: 'drafted',
  episode_check_started: 'checking',
  episode_repair_started: 'repairing',
  episode_finalized: 'finalized',
  episode_state_blocked: 'failed',
  generation_failed: 'failed',
  generation_stopped: 'stopped',
};

const ALLOWED_TRANSITIONS: Record<EpisodeProductionState, EpisodeProductionState[]> = {
  idle: ['planning', 'drafting', 'failed', 'stopped'],
  planning: ['drafting', 'failed', 'stopped'],
  drafting: ['drafted', 'failed', 'stopped'],
  drafted: ['checking', 'failed', 'stopped'],
  checking: ['repairing', 'finalized', 'failed', 'stopped'],
  repairing: ['checking', 'finalized', 'failed', 'stopped'],
  finalized: ['planning', 'failed', 'stopped'],
  failed: ['planning', 'drafting', 'stopped'],
  stopped: ['planning', 'drafting', 'failed'],
};

export function stateForProductionEvent(event: ProductionEvent): EpisodeProductionState | null {
  if (!event.episodeId) return null;
  return EVENT_STATE_MAP[event.type] || null;
}

export function canTransitionEpisodeState(from: EpisodeProductionState, to: EpisodeProductionState): boolean {
  if (from === to) return true;
  return ALLOWED_TRANSITIONS[from].includes(to);
}

export function deriveEpisodeProductionStates(events: ProductionEvent[]): Record<number, EpisodeStateSnapshot> {
  const ordered = [...events].reverse();
  const snapshots: Record<number, EpisodeStateSnapshot> = {};

  for (const event of ordered) {
    if (!event.episodeId) continue;
    const nextState = stateForProductionEvent(event);
    if (!nextState) continue;

    const previous = snapshots[event.episodeId];
    const previousState = previous?.state || 'idle';
    const allowed = canTransitionEpisodeState(previousState, nextState);
    snapshots[event.episodeId] = {
      episodeId: event.episodeId,
      state: nextState,
      updatedAt: event.createdAt,
      lastEventType: event.type,
      violation: allowed ? previous?.violation : `${previousState} -> ${nextState}`,
    };
  }

  return snapshots;
}

export function describeEpisodeProductionState(state: EpisodeProductionState): string {
  const labels: Record<EpisodeProductionState, string> = {
    idle: '未开始',
    planning: '计划中',
    drafting: '生成中',
    drafted: '草稿完成',
    checking: '检查中',
    repairing: '修复中',
    finalized: '已完成',
    failed: '失败',
    stopped: '已停止',
  };
  return labels[state];
}
