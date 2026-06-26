import { GenerationConfig } from '../types';

export type WorkspacePreset = 'home' | 'settings' | 'novel' | 'screenplay' | 'storyboard' | 'score';

const SCREENPLAY_TARGET_SECONDS = 70;
const SCREENPLAY_FLEX_SECONDS = 5;
const STORYBOARD_TARGET_SECONDS = 15;
const STORYBOARD_FLEX_SECONDS = 3;

export function isStoryboardPreset(config: GenerationConfig) {
  return config.workflowMode === 'create'
    && config.outputType === 'screenplay'
    && (config.episodeDurationSeconds || STORYBOARD_TARGET_SECONDS) <= STORYBOARD_TARGET_SECONDS + STORYBOARD_FLEX_SECONDS;
}

export function getCreationPreset(config: GenerationConfig): Exclude<WorkspacePreset, 'home' | 'settings' | 'score'> {
  if (config.outputType === 'novel') return 'novel';
  if (isStoryboardPreset(config)) return 'storyboard';
  return 'screenplay';
}

export function getCreationPresetLabel(config: GenerationConfig) {
  const preset = getCreationPreset(config);
  if (preset === 'novel') return '小说创作';
  if (preset === 'storyboard') return '15秒分镜稿创作';
  return '剧本创作';
}

export function getCreationPresetDescription(config: GenerationConfig) {
  const preset = getCreationPreset(config);
  if (preset === 'novel') return '按字数生成小说正文，保留短视频钩子';
  if (preset === 'storyboard') return '按15秒窗口生成分镜稿，方便拆镜拍摄';
  return '按短剧节拍生成剧本，便于拍摄';
}

export function getCreationPresetAction(config: GenerationConfig) {
  const preset = getCreationPreset(config);
  if (preset === 'novel') return '开始生成小说试播包';
  if (preset === 'storyboard') return '开始生成15秒分镜稿';
  return '开始生成剧本试播包';
}

export function getEpisodeDurationTarget(config: GenerationConfig) {
  const preset = getCreationPreset(config);
  if (preset === 'storyboard') return config.episodeDurationSeconds || STORYBOARD_TARGET_SECONDS;
  if (preset === 'screenplay') return config.episodeDurationSeconds || SCREENPLAY_TARGET_SECONDS;
  return config.episodeDurationSeconds || SCREENPLAY_TARGET_SECONDS;
}

export function getEpisodeDurationTolerance(config: GenerationConfig) {
  return getCreationPreset(config) === 'storyboard' ? STORYBOARD_FLEX_SECONDS : SCREENPLAY_FLEX_SECONDS;
}

export function getEpisodeDurationLabel(config: GenerationConfig) {
  const target = getEpisodeDurationTarget(config);
  const tolerance = getEpisodeDurationTolerance(config);
  return `约${target}秒（允许上下浮动${tolerance}秒）`;
}

export function applyCreationPreset(config: GenerationConfig, preset: Exclude<WorkspacePreset, 'home' | 'settings' | 'score'>): GenerationConfig {
  if (preset === 'novel') {
    return {
      ...config,
      workflowMode: 'create',
      inputType: 'idea',
      outputType: 'novel',
      episodeDurationSeconds: config.episodeDurationSeconds || 70,
    };
  }

  if (preset === 'storyboard') {
    return {
      ...config,
      workflowMode: 'create',
      inputType: 'idea',
      outputType: 'screenplay',
      episodeDurationSeconds: 15,
    };
  }

  return {
    ...config,
    workflowMode: 'create',
    inputType: 'idea',
    outputType: 'screenplay',
    episodeDurationSeconds: config.episodeDurationSeconds && config.episodeDurationSeconds > 15
      ? config.episodeDurationSeconds
      : 70,
  };
}
