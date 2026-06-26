export function prependPriorityPrompt(prompt: string, userIdea: string, fixedPriority = ''): string {
  const trimmed = userIdea.trim();
  const fixed = fixedPriority.trim();
  if (!trimmed && !fixed) {
    return prompt;
  }

  return `${fixed ? `固定优先级（高于其他所有配置）：
${fixed}

` : ''}${trimmed ? `用户创意（高优先级，仅低于输出类型和内容风格）：
${trimmed}

如果这段创意与后续题材、年代、受众、重生、金手指、爽点、反转等设定冲突，一律以这段创意为准，不得覆盖、削弱或改写。

` : ''}

${prompt}`;
}
