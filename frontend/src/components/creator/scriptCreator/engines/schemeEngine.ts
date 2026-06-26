import { GenerationConfig, Scheme } from '../types';
import { callAI, callAIStream } from '../services/aiService';
import { prependPriorityPrompt } from '../utils/promptPriority';
import { getEpisodeDurationLabel, isStoryboardPreset } from '../utils/workspacePreset';
import { schemeNumberContinuityRules } from '../utils/storyNumberContinuity';

const EXTERNAL_SCHEME_TIMEOUT_MS = 600000;
const EXTERNAL_SCHEME_MAX_TOKENS = 500;

function outputLabel(config: GenerationConfig): string {
  if (config.outputType === 'screenplay') {
    return isStoryboardPreset(config) ? '15秒分镜稿' : '短剧剧本';
  }
  return '小说正文';
}

function parseJsonObject(text: string): unknown {
  const unfenced = text
    .trim()
    .replace(/^```json\s*/i, '')
    .replace(/^```\s*/i, '')
    .replace(/```$/i, '')
    .trim();

  try {
    return JSON.parse(unfenced);
  } catch {
    const start = unfenced.indexOf('{');
    const end = unfenced.lastIndexOf('}');
    if (start >= 0 && end > start) {
      return JSON.parse(unfenced.slice(start, end + 1));
    }
    throw new Error('No JSON object found');
  }
}

function promptRules(config: GenerationConfig): string {
  const duration = Math.max(1, config.episodeDurationSeconds || 70);
  const windowCount = Math.ceil(duration / 15);
  const wordCount = Math.max(300, Math.min(8000, config.chapterWordCount || 1800));
  const scaleRule = config.outputType === 'novel'
    ? `用户选择的是小说正文：每集约${wordCount}字；轻量方案只判断故事是否适合按“开头3行、每300字冲突、每1000字悬念、结尾追更”展开，不使用秒数控制小说长度。`
    : (duration <= 15
      ? `用户选择的是15秒分镜稿：${getEpisodeDurationLabel(config)}；每个15秒分镜段内部可以包含多个镜头字段块；_::~RECORD::~_只分割分镜段，不分割镜头。`
      : `用户选择的是短剧剧本：${getEpisodeDurationLabel(config)}；常见整剧约60集；每集按0-3秒入口钩子、3-15秒第一冲突，中段每15秒递进一次，最后一个窗口收束到悬念设计。`);
  return `产品定位：
1. 这是短剧赛道内容工具，不是普通小说工具。
2. 理论上所有输出都会制作成短视频发布，用来获取流量，并吸引用户持续看完15秒广告窗口。
3. ${scaleRule}
4. 每套方案都必须有开篇3秒视觉钩子，不能只是背景设定。
5. 所有方案字段都要可拍：动作、表情、道具、空间关系、现场对白、可截图封面。
6. 三套方案必须完全不一致：故事简介、世界观、人物关系、主角缺陷、反派、开篇视觉钩子都不同。
7. 开头设计不能千篇一律；三套方案不能都用推门、摔东西、亮证据、电话响、当众质问、主角冷笑这类同一种模板起手。
8. 每套方案要给出不同的开篇类型，例如动作承接、道具异动、表情特写、空间反差、关系压迫、证据露出、误会爆发、安静异常、现场对话半句。
9. 用户想法优先级最高；红果审核开启时，红果合规高于风险表达。
10. 主角不能完美，必须有自然长出的缺点、癖好或小恶趣味。
11. 反派不能降智；可以搞笑，但搞笑来自性格、处境、误判或局势反差。
12. 禁止刻意网络热梗、尬燃爽文口号和为了反转而反转；所有冲突都必须从人物关系和现场处境里自然发生。
13. 对话方向必须是正常口语交际，不能是梗句拼贴。
14. 必须有主线状态逻辑：谁想得到什么、谁会失去什么、哪些关系或资源状态会推动冲突，不能只有空泛打脸。
15. 涉及年代、家庭贫富、债务、收入、资产、彩礼、嫁妆、订单、工资、物价、灵石/功法资源等内容时，只需锁定会影响后续连续性的关键数字和状态变化；普通生活细节允许自然表达。重点不是“所有数字都保守”，而是“关键状态变化必须有来源、有解释、前后不打架”。
16. 允许夸张反差或带梗开头，例如“月薪3000却买200万豪车”这种强钩子，但必须在后续很快交代清楚财富来源、关系背景、资源逻辑或信息反转，不能只靠一句怪话硬撑悬念。
17. 当前只生成轻量故事方案，禁止生成完整大纲、完整目录、60集分集规划；用户选中并确认后才生成故事圣经、大纲和目录。
18. 方案阶段就要为后续每一集的连续性打底：主角最想守住什么、每集会改变哪个具体变量、上一集结尾如何自然接到下一集、哪些数字/证据/关系状态必须连续不能跳。

${schemeNumberContinuityRules()}

当前配置：
输出类型：${outputLabel(config)}
内容风格：${config.contentStyle === 'dianwen' ? '颠文' : '正常'}
用户想法：${config.userIdea || '无'}
男女频：${config.audience === 'male' ? '男频' : '女频'}
年代：${config.era}
重生：${config.isReborn ? '是' : '否'}
金手指：${config.hasGoldenFinger ? '是' : '否'}
集数：${config.episodeCount}
${config.outputType === 'novel' ? `单集字数：约${wordCount}字` : `单集时长：${duration}秒\n15秒留存窗口数：约${windowCount}个`}
剧情节奏：系统自动判断，冲突和转折必须从人物目标、关系压力、证据变化和现场动作里自然长出来。
红果审核：${config.hongguoReviewEnabled ? '开启' : '关闭'}`;
}

function normalizeSchemes(rawSchemes: Partial<Scheme>[]): Scheme[] {
  return rawSchemes.slice(0, 3).map((scheme, index) => ({
    id: scheme.id || `scheme-${index + 1}`,
    name: scheme.name || `方案${index + 1}`,
    tagline: scheme.tagline || '',
    storyIntroduction: scheme.storyIntroduction || '',
    coreConflict: scheme.coreConflict || '',
    characterDesign: scheme.characterDesign || '',
    hongguoAdaptationNote: scheme.hongguoAdaptationNote || '',
    protagonistArc: scheme.protagonistArc || '',
    antagonistProfile: scheme.antagonistProfile || '',
    highlightScenes: Array.isArray(scheme.highlightScenes) ? scheme.highlightScenes : [],
    recommendationScore: typeof scheme.recommendationScore === 'number' ? scheme.recommendationScore : 80 + index,
    recommendationReason: scheme.recommendationReason || '系统会根据最终呈现效果继续判断。',
    missingInfoOptions: Array.isArray(scheme.missingInfoOptions) ? scheme.missingInfoOptions : [],
    plotOutline: scheme.plotOutline || '用户确认此方案后，系统再生成隐藏长线大纲。',
    episodeDirectory: scheme.episodeDirectory || '用户确认此方案后，系统再生成分集目录。',
  }));
}

async function repairSchemeJson(
  rawResponse: string,
  schemeNumber: number,
  config: GenerationConfig,
  signal?: AbortSignal
): Promise<Partial<Scheme>> {
  const repairPrompt = `你是一个只负责修复 JSON 的助手。

任务：
1. 根据下面这段模型返回内容，提取并补全第${schemeNumber}套轻量故事方案。
2. 只输出一个完整 JSON 对象。
3. 不要解释，不要 markdown，不要代码块。
4. 如果原文里某个字段缺失，就根据上下文补成最合理的短内容。
5. highlightScenes 必须是字符串数组，missingInfoOptions 必须是字符串数组。
6. recommendationScore 必须是 0-100 的数字。

输出格式：
{
  "id": "scheme-${schemeNumber}",
  "name": "方案名称",
  "tagline": "短标语",
  "storyIntroduction": "故事简介",
  "coreConflict": "核心冲突",
  "characterDesign": "故事世界观、人物关系",
  "hongguoAdaptationNote": "",
  "protagonistArc": "主角设定",
  "antagonistProfile": "反派设定",
  "highlightScenes": ["场景1", "场景2", "场景3"],
  "recommendationScore": 88,
  "recommendationReason": "推荐理由",
  "missingInfoOptions": ["问题1", "问题2"]
}

原始内容：
${rawResponse}`;

  let lastError: unknown = null;

  for (const modelName of [config.fallbackModelName1, config.fallbackModelName2]) {
    try {
      const repaired = await callAI(
        repairPrompt,
        1200,
        0.1,
        {
          apiBaseUrl: config.apiBaseUrl,
          apiKey: config.apiKey,
          modelName,
          signal,
          timeoutMs: 240000,
        }
      );
      return parseJsonObject(repaired) as Partial<Scheme>;
    } catch (error) {
      lastError = error;
    }
  }

  throw lastError || new Error('修复方案 JSON 失败');
}

export function createRecommendedHybridScheme(schemes: Scheme[], config: GenerationConfig): Scheme | null {
  if (schemes.length === 0) return null;
  const sorted = [...schemes].sort((a, b) => (b.recommendationScore || 0) - (a.recommendationScore || 0));
  const [best, second = best, third = best] = sorted;
  const highlights = Array.from(new Set([
    ...(best.highlightScenes || []).slice(0, 2),
    ...(second.highlightScenes || []).slice(0, 1),
    ...(third.highlightScenes || []).slice(0, 1),
  ])).slice(0, 4);

  return {
    id: 'scheme-hybrid-recommended',
    name: '系统推荐融合版',
    tagline: '默认最优解，直接选它更稳',
    storyIntroduction: `${best.storyIntroduction}\n\n融合优化：保留"${best.name}"的主线呈现力，吸收"${second.name}"的人物关系压力和"${third.name}"的高光画面，减少单一路线的短板。`,
    coreConflict: `${best.coreConflict}\n融合补强：冲突必须同时具备清晰目标、关系压力、资源/身份/关系状态变化、年代/世界观关键数字合理性和可见证据，不靠硬反转撑场。`,
    characterDesign: `${best.characterDesign}\n补强关系：参考${second.characterDesign}，让人物关系更利于连续追看。`,
    hongguoAdaptationNote: config.hongguoReviewEnabled ? '系统推荐版已默认按红果优先保守处理高风险表达。' : '',
    protagonistArc: best.protagonistArc,
    antagonistProfile: second.antagonistProfile || best.antagonistProfile,
    highlightScenes: highlights.length > 0 ? highlights : best.highlightScenes,
    recommendationScore: Math.min(99, Math.max(92, (best.recommendationScore || 88) + 4)),
    recommendationReason: '系统按最终呈现效果合成：主线清楚、人物压力更足、画面更可拍、连续追看更稳定。小白用户建议默认选择这版。',
    missingInfoOptions: [
      '主角最想守住的底线是什么？',
      '第一集必须出现的一个道具/证据是什么？',
      '反派最害怕被谁发现？',
    ],
    plotOutline: '用户确认此融合方案后，系统再生成隐藏长线大纲。',
    episodeDirectory: '用户确认此融合方案后，系统再生成分集目录。',
  };
}

export function fallbackSchemes(config: GenerationConfig): Scheme[] {
  const idea = config.userIdea || '用户给出的核心创意';
  return [
    {
      id: 'scheme-1',
      name: '强冲突视觉钩子方案',
      tagline: '第一秒先给画面，再给原因',
      storyIntroduction: `${idea}。第一集从一个反常道具和当面对峙开始，观众先看到事炸了，再慢慢知道为什么。`,
      coreConflict: '主角被迫在公开压力下做选择，对手用规则、关系和资源额度压人，主角用证据和行动反击。',
      characterDesign: '主角嘴硬、急性子、爱把手机倒扣；反派精明，会借规则逼人；配角负责制造误会和信息差。主线状态必须前后一致，不能低位设定后突然无来源获得大额资源或身份变化。',
      hongguoAdaptationNote: config.hongguoReviewEnabled ? '高风险冲突改为证据、规则、商业和人际博弈表达。' : '',
      protagonistArc: '从被动挨压到学会主动布局，但仍保留嘴硬和不服输的毛病。',
      antagonistProfile: '反派目标清楚，不降智，失败来自低估主角的行动力和证据链。',
      highlightScenes: ['手机屏幕亮出关键证据', '门被推开，所有人同时回头', '主角把合同推回桌面'],
      recommendationScore: 86,
      recommendationReason: '画面冲突直接，适合快速建立短视频入口，但需要补清楚主角最想守住的东西。',
      missingInfoOptions: ['主角最不能失去的人/物是什么？', '反派压主角的现实筹码是什么？'],
      plotOutline: '用户确认此方案后，系统再生成隐藏长线大纲。',
      episodeDirectory: '用户确认此方案后，系统再生成分集目录。',
    },
    {
      id: 'scheme-2',
      name: '关系反差爆点方案',
      tagline: '观众先看见关系崩，再追问真相',
      storyIntroduction: `${idea}。开头用一场关系撕裂的画面抓人，人物越解释越不对劲，秘密从道具和表情里露出来。`,
      coreConflict: '亲密关系、利益关系和身份认知同时错位，每集揭开一点真相和一笔可见损益。',
      characterDesign: '主角外冷内急，有小洁癖或控制欲；反派擅长装无辜，行动有现实利益。人物的收入、债务、资产、支出能力要和年代/阶层匹配。',
      hongguoAdaptationNote: config.hongguoReviewEnabled ? '情感冲突保留，危险或低俗表达改为现实压力和规则约束。' : '',
      protagonistArc: '从情绪失控到学会把情绪变成行动，但缺点一直参与剧情。',
      antagonistProfile: '反派会算计，也会因自负露出破绽，不靠降智输。',
      highlightScenes: ['戒指掉进水杯', '合照被当众翻面', '一份名单从包里滑出来'],
      recommendationScore: 88,
      recommendationReason: '关系压力更强，容易做出情绪追看，但需要补一个能反复推动剧情的秘密。',
      missingInfoOptions: ['两人关系里最大的旧账是什么？', '哪个道具能代表这段关系已经裂开？'],
      plotOutline: '用户确认此方案后，系统再生成隐藏长线大纲。',
      episodeDirectory: '用户确认此方案后，系统再生成分集目录。',
    },
    {
      id: 'scheme-3',
      name: '身份反转追看方案',
      tagline: '每15秒给一次身份或信息差刺激',
      storyIntroduction: `${idea}。主角先被放在低位，观众看到反派得势，再用一个个可拍证据完成身份和局势反转。`,
      coreConflict: '表面身份和真实能力不一致，外部压力逼主角不断亮出新筹码；每个筹码都要有来源、代价和可见证据。',
      characterDesign: '主角有点记仇、爱较真；反派聪明但贪心；关键配角摇摆，带出连续信息差。',
      hongguoAdaptationNote: config.hongguoReviewEnabled ? '金手指现实化为专业能力、行业经验、信息差和证据链。' : '',
      protagonistArc: '从隐藏锋芒到主动承担结果，缺点是太爱硬撑。',
      antagonistProfile: '反派行动逻辑来自利益和恐惧，搞笑感来自局势反差，不降智。',
      highlightScenes: ['主角把旧工牌拍在桌上', '电梯门打开，反派笑容僵住', '监控画面切到关键一秒'],
      recommendationScore: 90,
      recommendationReason: '身份差和证据链最利于连续追看，适合做长线项目主线。',
      missingInfoOptions: ['主角隐藏身份为什么不能马上公开？', '第一集亮出的证据会伤到谁？'],
      plotOutline: '用户确认此方案后，系统再生成隐藏长线大纲。',
      episodeDirectory: '用户确认此方案后，系统再生成分集目录。',
    },
  ];
}

export async function generateSchemesAI(
  config: GenerationConfig,
  signal?: AbortSignal,
  onToken?: (token: string) => void,
  onScheme?: (schemes: Scheme[]) => void
): Promise<Scheme[]> {
  const schemes: Partial<Scheme>[] = [];

  for (let index = 0; index < 3; index += 1) {
    const schemeNumber = index + 1;
    const previous = schemes
      .map((scheme, previousIndex) => `已生成方案${previousIndex + 1}：${scheme.name} / ${scheme.coreConflict} / ${scheme.protagonistArc}`)
      .join('\n');
    const prompt = `${promptRules(config)}

现在只生成第${schemeNumber}套轻量故事方案。必须和已生成方案完全不同。
${previous ? `\n已生成方案，禁止重复：\n${previous}` : ''}

禁止输出完整大纲、完整目录、分集目录、60集规划。这里只帮助用户快速选择故事。

只输出JSON，不要解释。格式：
{
  "id": "scheme-${schemeNumber}",
  "name": "方案名称",
  "tagline": "短标语",
  "storyIntroduction": "故事简介，包含开篇画面、核心处境和追看理由",
  "coreConflict": "核心冲突，必须写清主线状态逻辑：谁想得到什么，谁会失去什么，为什么必须争；若出现夸张金钱反差或高价值物件，必须能解释关键数字和状态从哪里来",
  "characterDesign": "故事世界观、人物关系、资源/身份关系和主要角色关系；关键钱数、资产、证据、权限或资源状态要前后一致，但叙述口吻保持自然，不要写成流水账；允许反差梗设定，但要预留后续解释口",
  "hongguoAdaptationNote": "红果适配说明，未开启则为空",
  "protagonistArc": "主角设定、缺点、小癖好或小恶趣味",
  "antagonistProfile": "反派设定、动机和不降智的行动方式",
  "highlightScenes": ["开篇3秒视觉钩子", "可做封面的高光画面", "前3集的大概视觉方向"],
  "recommendationScore": 0到100的最终呈现潜力分,
  "recommendationReason": "为什么推荐或不推荐用户选这一套，只看最终呈现效果",
  "missingInfoOptions": ["如果用户愿意补充，最能提升最终效果的问题1", "问题2"]
}`;
    const finalPrompt = prependPriorityPrompt(prompt, config.userIdea, `输出类型必须是${outputLabel(config)}。用户想法优先。`);
    let response = '';

    onToken?.(`\n\n[第${schemeNumber}/3套方案开始生成]\n`);
    try {
      response = await callAIStream(
        finalPrompt,
        {
          onToken: (token) => onToken?.(token),
          signal,
        },
        EXTERNAL_SCHEME_MAX_TOKENS,
        0.74,
        { apiBaseUrl: config.apiBaseUrl, apiKey: config.apiKey, modelName: config.modelName, signal, timeoutMs: EXTERNAL_SCHEME_TIMEOUT_MS }
      );
    } catch (error) {
      if (error instanceof DOMException && error.name === 'AbortError') throw error;
      onToken?.(`\n[第${schemeNumber}套流式预览不可用，正在切换普通生成]\n`);
      response = await callAI(
        finalPrompt,
        EXTERNAL_SCHEME_MAX_TOKENS,
        0.74,
        { apiBaseUrl: config.apiBaseUrl, apiKey: config.apiKey, modelName: config.modelName, signal, timeoutMs: EXTERNAL_SCHEME_TIMEOUT_MS }
      );
      onToken?.(response);
    }

    try {
      const parsed = parseJsonObject(response) as Record<string, unknown>;
      const scheme = (parsed.scheme && typeof parsed.scheme === 'object' ? parsed.scheme : parsed) as Partial<Scheme>;
      schemes.push({ ...scheme, id: scheme.id || `scheme-${schemeNumber}` });
      onScheme?.(normalizeSchemes(schemes));
      onToken?.(`\n[第${schemeNumber}/3套方案完成]\n`);
    } catch {
      try {
        onToken?.(`\n[第${schemeNumber}套方案正在自动修复为标准JSON...]\n`);
        const repairedScheme = await repairSchemeJson(response, schemeNumber, config, signal);
        schemes.push({ ...repairedScheme, id: repairedScheme.id || `scheme-${schemeNumber}` });
        onScheme?.(normalizeSchemes(schemes));
        onToken?.(`\n[第${schemeNumber}/3套方案完成]\n`);
      } catch {
        throw new Error(`第${schemeNumber}套方案返回内容不是有效JSON，请换模型或重试`);
      }
    }
  }

  return normalizeSchemes(schemes);
}
