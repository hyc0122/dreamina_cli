export type ProjectOpenDecision = 'open' | 'reattach' | 'handoff-and-open' | 'block';

export function canRunProjectInBackground(project: { selectedScheme?: unknown } | null | undefined): boolean {
  return Boolean(project?.selectedScheme);
}

export function decideProjectOpenNavigation(params: {
  activeProjectId: string | null;
  detachedProjectId: string | null;
  isGenerating: boolean;
  targetProjectId: string;
  canHandoffActiveProject: boolean;
  canHandoffDetachedProject: boolean;
}): ProjectOpenDecision {
  const {
    activeProjectId,
    detachedProjectId,
    isGenerating,
    targetProjectId,
    canHandoffActiveProject,
    canHandoffDetachedProject,
  } = params;

  if (!isGenerating) return 'open';

  if (activeProjectId === targetProjectId) return 'reattach';

  if (!activeProjectId && detachedProjectId) {
    if (detachedProjectId === targetProjectId) return 'reattach';
    return canHandoffDetachedProject ? 'handoff-and-open' : 'block';
  }

  if (activeProjectId && activeProjectId !== targetProjectId) {
    return canHandoffActiveProject ? 'handoff-and-open' : 'block';
  }

  return 'open';
}
