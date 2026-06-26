import { GenerationConfig, Scheme, Script, Scene } from '../types';

export function generateScript(scheme: Scheme, config: GenerationConfig): Script {
  const scenes: Scene[] = [
    {
      id: 1,
      title: '视觉开场',
      content: `${config.userIdea || scheme.storyIntroduction}。画面从一个正在发生的冲突动作开始，不做背景解释。`,
    },
    {
      id: 2,
      title: '冲突升级',
      content: `围绕${scheme.coreConflict || '核心矛盾'}推进，人物用动作、道具和现场对白制造15秒留存理由。`,
    },
    {
      id: 3,
      title: '结尾悬念',
      content: '本集结尾停在一个可见动作或新线索上，逼出下一集。',
    },
  ];

  return {
    title: scheme.name,
    scenes,
    episodes: [
      {
        id: 1,
        title: scheme.name,
        content: scenes.map((scene) => `${scene.title}\n${scene.content}`).join('\n\n'),
        scenes,
        status: 'passed',
      },
    ],
    totalLength: `${scenes.length}段 / 约${scenes.reduce((sum, scene) => sum + scene.content.length, 0)}字`,
  };
}
