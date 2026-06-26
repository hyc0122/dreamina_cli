import { Episode, GenerationConfig, Scheme, SelfCheckReport, SelfCheckRound, TrialFixItem, TrialJudgment, TrialJudgmentCard, TrialOpeningReview, TrialVerdict } from '../types';
import { optimizeEpisodeContent } from '../engines/scriptEngine';
import { selfCheckEpisode } from './selfCheckService';

export const PASSING_SCORE = 95;
export const DEFAULT_QUALITY_ROUNDS = 2;
export const MAX_REPAIR_ROUNDS = DEFAULT_QUALITY_ROUNDS;

export function qualityRoundLimit(report: SelfCheckReport): number {
  return report ? DEFAULT_QUALITY_ROUNDS : DEFAULT_QUALITY_ROUNDS;
}

interface EpisodeQualityRequest {
  scheme: Scheme;
  config: GenerationConfig;
  episode: Episode;
  previousEpisodes: Episode[];
  hiddenStoryPlan: string;
  signal?: AbortSignal;
  onRepairRound?: (score: number, nextRound: number) => void;
}

export async function runEpisodeQualityLoop({
  scheme,
  config,
  episode,
  previousEpisodes,
  hiddenStoryPlan,
  signal,
  onRepairRound,
}: EpisodeQualityRequest): Promise<Episode> {
  let bestEpisode = episode;
  let bestSelfCheck = await selfCheckEpisode(bestEpisode, previousEpisodes, config, hiddenStoryPlan);
  let bestRound = 1;
  const selfCheckRounds: SelfCheckRound[] = [
    {
      round: 1,
      action: bestSelfCheck.gatePassed !== false && bestSelfCheck.score >= PASSING_SCORE ? 'passed' : 'repairing',
      report: bestSelfCheck,
    },
  ];
  let roundLimit = qualityRoundLimit(bestSelfCheck);

  for (
    let repairRound = 1;
    repairRound < roundLimit && (!bestSelfCheck.gatePassed || bestSelfCheck.score < PASSING_SCORE);
    repairRound += 1
  ) {
    if (signal?.aborted) throw new DOMException('Generation stopped', 'AbortError');
    onRepairRound?.(bestSelfCheck.score, repairRound + 1);

    const repairedEpisode = await optimizeEpisodeContent(
      scheme,
      config,
      bestEpisode,
      previousEpisodes,
      hiddenStoryPlan,
      signal,
      bestSelfCheck
    );
    const repairedSelfCheck = await selfCheckEpisode(repairedEpisode, previousEpisodes, config, hiddenStoryPlan);
    selfCheckRounds.push({
      round: repairRound + 1,
      action: repairedSelfCheck.gatePassed !== false && repairedSelfCheck.score >= PASSING_SCORE ? 'passed' : 'repairing',
      report: repairedSelfCheck,
    });

    const repairedFixesGate = !bestSelfCheck.gatePassed && repairedSelfCheck.gatePassed;
    const repairedImprovesScore = repairedSelfCheck.score > bestSelfCheck.score;
    if (repairedFixesGate || repairedImprovesScore) {
      bestEpisode = repairedEpisode;
      bestSelfCheck = repairedSelfCheck;
      bestRound = repairRound + 1;
      roundLimit = Math.max(roundLimit, qualityRoundLimit(bestSelfCheck));
    }
  }

  return {
    ...bestEpisode,
    selfCheck: bestSelfCheck,
    selfCheckRounds: selfCheckRounds.map((round) => ({
      ...round,
      selected: round.round === bestRound,
    })),
    status: bestSelfCheck.passed && bestSelfCheck.gatePassed !== false ? 'passed' : 'warning',
  };
}

function uniqueItems(items: string[], limit: number) {
  const seen = new Set<string>();
  const result: string[] = [];
  for (const item of items) {
    const cleaned = item.trim();
    if (!cleaned || seen.has(cleaned)) continue;
    seen.add(cleaned);
    result.push(cleaned);
    if (result.length >= limit) break;
  }
  return result;
}

function summarizeOpeningReview(issues: string[]): TrialOpeningReview {
  const joined = issues.join('；');
  return {
    firstLineStatus: /开头|第一眼|钩子/.test(joined) ? '第一眼有问题，钩子还不够稳。' : '第一眼基本能立住，有抓人基础。',
    firstThirtySecondsStatus: /30秒|前段|节奏|拖/.test(joined) ? '前30秒拉力不够连续，容易掉速。' : '前30秒整体拉力基本成立。',
    episodeStructureStatus: /顺序|结构|承接|前移|后置/.test(joined) ? '首集顺序需要调整，卖点释放偏慢。' : '首集结构顺序基本可用。',
  };
}

function inferFixKey(text: string): TrialFixItem['key'] {
  if (/身份|题材/.test(text)) return 'protagonist_identity';
  if (/第一句|第一眼|第一画面|开头/.test(text)) return 'opening_hook';
  if (/30秒|前段|前30秒/.test(text)) return 'first_30_seconds';
  if (/顺序|结构|承接|前移|后置/.test(text)) return 'episode_structure';
  return 'scheme_selling_point';
}

function fixTitle(key: TrialFixItem['key']) {
  return {
    protagonist_identity: '先重判主角身份',
    opening_hook: '重开第一句和第一画面',
    first_30_seconds: '把前30秒顺序调对',
    episode_structure: '重排首集结构',
    scheme_selling_point: '先改方案底层卖点',
  }[key];
}

function fixImpact(key: TrialFixItem['key']) {
  return {
    protagonist_identity: '主角身份不贴题，第一眼新鲜感不足，不适合直接压资源。',
    opening_hook: '第一眼拉不住人，后面的内容价值很难被看到。',
    first_30_seconds: '前段掉速会直接影响测试效率和首集留人能力。',
    episode_structure: '卖点释放顺序不对，会让首集前段失去持续拉力。',
    scheme_selling_point: '底层卖点不够硬，后面越写越像表面修补。',
  }[key];
}

function toFixItems(suggestions: string[], issues: string[]): TrialFixItem[] {
  const source = uniqueItems([...suggestions, ...issues.map((issue) => `修正：${issue}`)], 6);
  const used = new Set<TrialFixItem['key']>();
  const items: TrialFixItem[] = [];

  for (const item of source) {
    const key = inferFixKey(item);
    if (used.has(key)) continue;
    used.add(key);
    items.push({
      key,
      title: fixTitle(key),
      issue: item,
      impact: fixImpact(key),
      action: item.startsWith('修正：') ? item.replace(/^修正：/, '') : item,
    });
    if (items.length >= 3) break;
  }

  if (items.length === 0) {
    return [
      {
        key: 'protagonist_identity',
        title: '先重判主角身份',
        issue: '当前版本方向可用，但主角身份与题材贴合度还不够稳。',
        impact: fixImpact('protagonist_identity'),
        action: '保留题材，先把主角身份调整到更贴题、更有新鲜感的版本。',
      },
      {
        key: 'opening_hook',
        title: '重开第一句和第一画面',
        issue: '第一眼还不够抓人。',
        impact: fixImpact('opening_hook'),
        action: '把最强反差前移，第一眼先给冲击力，再解释背景。',
      },
      {
        key: 'first_30_seconds',
        title: '把前30秒顺序调对',
        issue: '前段爆点和说明顺序还不够顺。',
        impact: fixImpact('first_30_seconds'),
        action: '把最强冲突前移，解释后置，先把前30秒打穿。',
      },
    ];
  }

  return items;
}

function buildJudgmentCard(verdict: TrialVerdict, score: number, details: string[], suggestions: string[]): TrialJudgmentCard {
  const issues = details.map((detail) => detail.replace(/^第\d+集：\d+分，/, '').trim());
  const openingReview = summarizeOpeningReview([...issues, ...suggestions]);
  const topFixes = toFixItems(suggestions, issues);
  const cardMap: Record<TrialVerdict, Omit<TrialJudgmentCard, 'topFixes' | 'openingReview'>> = {
    continue: {
      grade: 'A',
      headline: '这版值得压资源',
      action: 'test_now',
      whyItDeserves: [
        '试播链路已经成立，第一集能拉人，后两集也能接住。',
        '首集前段具备持续拉力，不只是第一句炸一下。',
        '当前版本已接近可测状态，修改成本较低。',
      ],
      pilotChainReview: '第一集能拉人，第二集承接稳，第三集有继续追的理由。',
      riskFlags: ['仍建议小范围测试，不建议一上来压满预算。'],
      readyToScaleAfter: '保持当前核心卖点结构，完成小范围测试后再决定是否继续放量。',
    },
    revise: {
      grade: 'B',
      headline: '这版可以做，但先别急着压资源',
      action: 'revise_then_test',
      whyItDeserves: [
        '试播链路有雏形，但首集前段还不够稳。',
        '有爆点，但前30秒的信息顺序和拉力还不够顺。',
        '不是不能测，而是先改关键点，测试效率会更高。',
      ],
      pilotChainReview: '第一集能进人，但第二集承接和第三集追更动力还不够稳。',
      riskFlags: ['方向成立，但现在直接投，只会放大前段问题。'],
      readyToScaleAfter: '把这三刀改完，就可以进入小范围测试。',
    },
    reselect: {
      grade: 'C',
      headline: '这版暂时不值得继续压资源',
      action: 'switch_scheme',
      whyItDeserves: [
        '当前卖点不足以支撑试播验证，继续推进性价比不高。',
        '首集前段没把人真正拉进来，后面再完整也难起量。',
        '现在继续投，只会把问题放大。',
      ],
      pilotChainReview: '首集有信息，但前三集还没形成完整试播闭环。',
      riskFlags: ['当前版本不适合直接做前3集试播包，建议回退重选。'],
      readyToScaleAfter: '先重做核心卖点或更换方案，再决定要不要继续推进。',
    },
  };

  return {
    ...cardMap[verdict],
    topFixes,
    openingReview,
  };
}

export function buildTrialJudgment(episodes: Episode[]): TrialJudgment | null {
  const checkedEpisodes = episodes.filter((episode) => episode.selfCheck);
  if (checkedEpisodes.length !== episodes.length || episodes.length === 0) return null;

  const scores = checkedEpisodes.map((episode) => episode.selfCheck?.score || 0);
  const score = Math.round(scores.reduce((sum, item) => sum + item, 0) / scores.length);
  const hasLowScore = scores.some((item) => item < 85);
  const allPassed = checkedEpisodes.every((episode) => episode.selfCheck?.passed && episode.selfCheck?.gatePassed !== false && (episode.selfCheck?.score || 0) >= PASSING_SCORE);
  const issueCount = checkedEpisodes.reduce((sum, episode) => sum + (episode.selfCheck?.issues.length || 0), 0);

  let verdict: TrialVerdict = 'revise';
  if (allPassed && score >= PASSING_SCORE) verdict = 'continue';
  if (hasLowScore || score < 85) verdict = 'reselect';

  const titles: Record<TrialVerdict, string> = {
    continue: '建议继续',
    revise: '建议修改后继续',
    reselect: '建议重选方案',
  };
  const reasons: Record<TrialVerdict, string> = {
    continue: '前3集已达到项目试播标准，可以进入下一批10集。',
    revise: '前3集方向可用，但还有会影响投流观看或后续稳定生产的问题，建议先应用系统建议重写前3集。',
    reselect: '前3集基础偏弱，继续往后写会放大问题，建议回退重选或重写方案。',
  };

  const details = checkedEpisodes.map((episode) => {
    const report = episode.selfCheck as SelfCheckReport;
    const issueText = report.issues.length ? `问题：${report.issues.slice(0, 2).join('；')}` : '未发现主要问题';
    return `第${episode.id}集：${report.score}分，${report.summary || '已完成自检'}。${issueText}`;
  });

  const suggestions = uniqueItems(
    checkedEpisodes.flatMap((episode) => [
      ...(episode.selfCheck?.suggestions || []),
      ...(episode.selfCheck?.issues || []).map((issue) => `修正：${issue}`),
    ]),
    5
  );

  if (suggestions.length === 0 && verdict === 'revise') {
    suggestions.push('强化前3秒可拍视觉钩子，让第一眼就能截图当封面');
    suggestions.push('压缩解释性信息，把冲突、动作、台词提前');
  }
  if (suggestions.length === 0 && verdict === 'reselect') {
    suggestions.push('重新选择更适合短视频试播的方案，优先可拍画面、人物反差和15秒留存链');
  }

  return {
    verdict,
    score,
    title: titles[verdict],
    reason: `${reasons[verdict]} 当前平均${score}分，累计${issueCount}个待关注点。`,
    details,
    suggestions,
    card: buildJudgmentCard(verdict, score, details, suggestions),
  };
}
