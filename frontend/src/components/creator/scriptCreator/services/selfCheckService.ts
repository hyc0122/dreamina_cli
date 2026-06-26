import { Episode, GateCheck, GenerationConfig, SelfCheckReport, WeightedMetric } from '../types';
import { callAIWithFallback } from './aiService';
import { selfCheckNumberContinuityRules } from '../utils/storyNumberContinuity';

const PASS_SCORE = 95;

const GATE_DEFINITIONS: GateCheck[] = [
  { key: 'outputType', name: '输出类型和硬格式', passed: false },
  { key: 'storyPlan', name: '故事结构/大纲/目录/上下集连贯', passed: false },
  { key: 'platform', name: '红果/通用发布合规', passed: false },
];

const WEIGHT_DEFINITIONS: WeightedMetric[] = [
  { key: 'openingHook', name: '3秒开头/5秒播放/12秒留存/30秒完播', weight: 30, score: 0 },
  { key: 'retentionBeats', name: '每15秒观看理由', weight: 25, score: 0 },
  { key: 'continuity', name: '上下文通顺连贯', weight: 20, score: 0 },
  { key: 'bingeDrive', name: '追更动力/长线悬念', weight: 10, score: 0 },
  { key: 'characterLogic', name: '人物是否成立', weight: 7, score: 0 },
  { key: 'dialogueNaturalness', name: '对话是否自然', weight: 5, score: 0 },
  { key: 'formatEfficiency', name: '小说/剧本格式规范', weight: 2, score: 0 },
  { key: 'deAi', name: '去AI味', weight: 1, score: 0 },
];

function outputTypeLabel(config: GenerationConfig): string {
  if (config.outputType === 'screenplay') return isStoryboardOutput(config) ? '15秒分镜稿' : '短剧剧本';
  return '小说正文';
}

function targetWordCount(config: GenerationConfig): number {
  return Math.max(300, Math.min(8000, config.chapterWordCount || 1800));
}

function targetDuration(config: GenerationConfig): number {
  return Math.max(15, config.episodeDurationSeconds || 70);
}

function isStoryboardOutput(config: GenerationConfig): boolean {
  return config.outputType === 'screenplay' && targetDuration(config) <= 15;
}

function scaleRuleForCheck(config: GenerationConfig): string {
  if (config.outputType === 'novel') {
    const words = targetWordCount(config);
    return `小说按字数质检：目标约${words}字；不得用秒数判断小说长度。开头3行必须抓人；每300字至少一个新的冲突/信息变化/资源损益/关系压力；每1000字至少一个强悬念；结尾必须形成追更。`;
  }
  const duration = targetDuration(config);
  return `${isStoryboardOutput(config) ? '15秒分镜稿' : '短剧剧本'}按时长质检：单集约${duration}秒；15秒留存窗口数约${Math.ceil(duration / 15)}个。`;
}

function clampScore(value: unknown): number {
  const score = Number(value);
  if (!Number.isFinite(score)) return 0;
  return Math.max(0, Math.min(100, Math.round(score)));
}

function normalizeGates(input: unknown): GateCheck[] {
  const raw = Array.isArray(input) ? input : [];
  return GATE_DEFINITIONS.map((definition) => {
    const item = raw.find((entry) => entry && typeof entry === 'object' && (entry as GateCheck).key === definition.key) as Partial<GateCheck> | undefined;
    return {
      key: definition.key,
      name: String(item?.name || definition.name),
      passed: Boolean(item?.passed),
      issue: item?.issue ? String(item.issue) : undefined,
      evidence: item?.evidence ? String(item.evidence) : undefined,
      repairInstruction: item?.repairInstruction ? String(item.repairInstruction) : undefined,
    };
  });
}

function normalizeWeightedMetrics(input: unknown): WeightedMetric[] {
  const raw = Array.isArray(input) ? input : [];
  return WEIGHT_DEFINITIONS.map((definition) => {
    const item = raw.find((entry) => entry && typeof entry === 'object' && (entry as WeightedMetric).key === definition.key) as Partial<WeightedMetric> | undefined;
    return {
      key: definition.key,
      name: String(item?.name || definition.name),
      weight: definition.weight,
      score: clampScore(item?.score),
      issue: item?.issue ? String(item.issue) : undefined,
      evidence: item?.evidence ? String(item.evidence) : undefined,
      repairInstruction: item?.repairInstruction ? String(item.repairInstruction) : undefined,
    };
  });
}

function calculateWeightedScore(metrics: WeightedMetric[]): number {
  const totalWeight = metrics.reduce((sum, item) => sum + item.weight, 0) || 100;
  const weighted = metrics.reduce((sum, item) => sum + item.score * item.weight, 0) / totalWeight;
  return clampScore(weighted);
}

function deriveFailedDimensions(gates: GateCheck[], metrics: WeightedMetric[]): string[] {
  return [
    ...gates.filter((item) => !item.passed).map((item) => item.key),
    ...metrics.filter((item) => item.score < PASS_SCORE).map((item) => item.key),
  ];
}

function parseJsonReport(text: string): SelfCheckReport | null {
  try {
    const unfenced = text
      .trim()
      .replace(/^```json\s*/i, '')
      .replace(/^```\s*/i, '')
      .replace(/```$/i, '')
      .trim();
    const start = unfenced.indexOf('{');
    const end = unfenced.lastIndexOf('}');
    const jsonText = start >= 0 && end > start ? unfenced.slice(start, end + 1) : unfenced;
    const data = JSON.parse(jsonText);
    const gates = normalizeGates(data.gates);
    const weightedMetrics = normalizeWeightedMetrics(data.weightedMetrics);
    const weightedScore = clampScore(data.weightedScore || calculateWeightedScore(weightedMetrics));
    const score = clampScore(data.score || weightedScore);
    const gatePassed = typeof data.gatePassed === 'boolean'
      ? data.gatePassed && gates.every((item) => item.passed)
      : gates.every((item) => item.passed);

    return {
      passed: Boolean(data.passed) && gatePassed && score >= PASS_SCORE,
      score,
      gatePassed,
      gates,
      weightedScore,
      weightedMetrics,
      recommendedAction: data.recommendedAction || (gatePassed && score >= PASS_SCORE ? 'continue' : 'targeted_repair'),
      summary: String(data.summary || ''),
      issues: Array.isArray(data.issues) ? data.issues.map(String) : [],
      suggestions: Array.isArray(data.suggestions) ? data.suggestions.map(String) : [],
      failedDimensions: Array.isArray(data.failedDimensions)
        ? data.failedDimensions.map(String)
        : deriveFailedDimensions(gates, weightedMetrics),
    };
  } catch {
    return null;
  }
}

function modelCheckFailureReport(reason: string): SelfCheckReport {
  const gates = GATE_DEFINITIONS.map((item) => ({
    ...item,
    issue: '大模型检测未返回有效结果',
    repairInstruction: '重新调用检测模型，不能把本地猜测当作自检结果',
  }));
  const weightedMetrics = WEIGHT_DEFINITIONS.map((item) => ({
    ...item,
    issue: '未完成大模型病灶检测',
    repairInstruction: '重新检测后再按失败项定向修复',
  }));
  return {
    passed: false,
    score: 0,
    gatePassed: false,
    gates,
    weightedScore: 0,
    weightedMetrics,
    recommendedAction: 'targeted_repair',
    summary: '大模型检测失败，未产生有效质检结果',
    issues: [reason],
    suggestions: ['重新发起大模型检测；如果连续失败，请更换模型或降低单次输出长度'],
    failedDimensions: deriveFailedDimensions(gates, weightedMetrics),
  };
}

function typeSpecificRules(config: GenerationConfig): string {
  if (config.outputType === 'novel') {
    return `小说正文门禁：
1. 必须是小说正文，不得写成短剧剧本。
2. 禁止出现“1-1  夜  内  地点”“人物：”“场景：”“机位与拍摄方向”“镜头类型&景别&运镜”这类剧本/分镜/镜头结构。
3. 可以有现场对白，但不能有剧本格式台词表。
4. 如果混入剧本格式，outputType门禁必须失败。`;
  }

  if (!isStoryboardOutput(config)) {
    return `短剧剧本门禁：
1. 必须是一集一集输出的短剧剧本，不得写成小说正文、故事梗概、分镜表格或AI视频分镜稿。
2. 第一行必须包含“第X集：《本集短标题》”，第二行附近必须标明“时长：约${targetDuration(config)}秒”。
3. 正文必须按多个场次推进，每个场次用“【场次01】地点｜日/夜｜内/外”这类标题，不得使用“【镜头01】”作为主结构。
4. 每个场次必须包含这些字段：人物：、画面/动作：、对白：、音效/转场：、本场钩子：。
5. 对白必须能直接拍，主要格式为“角色（情绪/语气）：台词”；无对白场次要写“对白：无”。
6. 每集要有清楚的开头钩子、15秒留存推进、结尾追更点，并承接上一集最终压力。
7. 禁止出现15秒分镜稿字段：机位与拍摄方向、镜头类型&景别&运镜、特效细节、画面：、声音：、NO SRT、_::~RECORD::~_。
8. 如果输出混入上述分镜字段、缺少场次字段、或变成小说散文，outputType门禁必须失败。`;
  }

    return `15秒分镜稿门禁：
1. 正文第一行必须是“机位与拍摄方向：”，不得以“【分镜xx】”“【镜头xx】”“第X集”或旧场景号开头。
2. 15秒内容单元是分镜段；分镜段内部连续写多个镜头字段块，每个镜头字段块从“机位与拍摄方向：”开始。
3. 每个镜头字段块必须包含这些字段：机位与拍摄方向、镜头类型&景别&运镜、动作细节、台词/对白、光影氛围、特效细节、音效、时长、【人物】、【场景】、画面、声音。
4. 多个分镜段之间必须用单独一行“_::~RECORD::~_”分割；这是分镜段分割格式，不是镜头分割格式，不得放在同一分镜段的镜头之间。
5. 同一分镜段内所有镜头“时长”相加必须约等于15秒留存单元。
6. 台词必须主要使用“角色（情绪/声音）：台词”，无对白镜头要写“台词/对白：无”和“声音：无”。
7. 动作细节必须可拍，必须写面部表情、身体动作、道具/空间关系或冲突推进。
8. 画面字段必须能直接给AI视频生成使用，包含人物、场景、动作、机位/运镜、光影和质感。
9. 禁止旧格式：“1-1  夜  内  地点”“人物：”“【画面】场景块”“【分镜xx】”“【镜头xx】”；禁止小说散文、剧情梗概、分镜表格、Markdown列表或导演解释。
10. 如果缺少镜头字段块、关键字段、多分镜段之间的RECORD分隔，或把RECORD放在同一分镜段镜头之间，outputType门禁必须失败。`;
}

function platformRules(config: GenerationConfig): string {
  if (!config.hongguoReviewEnabled) {
    return `平台门禁：
红果未开启，不得按红果专属规则扣死。只检查通用公开发布风险。除严重违法、低俗、危险教学等问题外，platform门禁应通过。`;
  }

  return `平台门禁：
红果已开启。红果合规是一票否决门禁。
未成年不当内容、强迫、脱衣、验身、性暗示、洞房、生孩子、血腥暴力、违法教学、危险行为、隐私侵犯等高风险表达必须判为platform门禁失败，并给出保留戏剧目的的合规改写指令。`;
}

function continuityRules(previousEpisode?: Episode): string {
  if (!previousEpisode) {
    return `当前为第一集：
不检查上一集承接，但必须检查本集内部是否通顺连贯：主冲突、人物目标、因果链、动机、转场、台词回应和追更方向都要接得上。小说、短剧剧本、15秒分镜稿都必须在第一集结尾给下一集留下可承接的动作、证据、关系压力或资源变化。continuity指标按“本集内部连贯和为后续埋钩”评分。`;
  }

  return `上下集连贯门禁：
1. 小说、短剧剧本、15秒分镜稿都必须优先参考上一集最终文案、隐藏故事结构、剧情大纲和分集目录；输出格式不同，故事状态不能断。
2. 本集开头必须承接上一集最后画面、最后动作、最后一句关键台词、未解决悬念、人物关系变化、道具/证据状态、财富/资源损益或身份权限变化。
3. 本集内部也必须通顺连贯：前因后果清楚，人物动机接得上，场景转场有动作或道具承接，台词先回应上一句/上一场压力再推进新冲突。
4. 15秒分镜稿也要承接上一分镜段/上一集的动作、道具状态、人物站位、表情和声音线索，不能只重新列镜头字段。
5. 如果本集像重新开局、跳过上一集压力、人物像失忆、地点/情绪/目标断裂，或本集内部因果/动机/转场/台词不通，storyPlan门禁必须失败。
6. issues里必须指出上一集结尾与本集开头之间的断点位置，或本集内部不通顺的位置，并给出“只修承接处/断裂处”的指令。`;
}

function wealthLogicRules(): string {
  return `主线状态与关键数字必查：
1. 检查人物为什么要争：身份、关系、证据、机会、资源、权力、安全感、生存空间，或剧情确实需要的钱款，至少要有一个清晰驱动力。
2. 检查谁得利、谁受损、谁掌握筹码、谁被卡住；如果只有口头仇恨、空泛打脸或无来源状态跳变，storyPlan门禁应扣问题。
3. 检查主线状态变化是否可见：合同、账单、转账记录、订单、职位、资源名额、客户名单、流量数据、继承权、债务、证据、口供、监控、令牌等最好能变成可拍道具或现场事件。
4. 检查阶层差、身份差或资源差是否服务剧情：豪门、职场、商战、家族、校园、玄幻资源、仙侠灵石/宗门名额等，都要有对应规则，不能只是摆设。
5. 检查反派行动是否聪明：反派作恶要有收益、风险或控制目标，不能为了坏而坏。
6. 年代/世界观基准必查：年代题材必须符合当时工资、物价、家庭积蓄和资产档位；古代、民国、八九十年代、现代、玄幻仙侠都要符合各自世界观的货币/资源/身份规则。只有影响主线的数字才需要校准。
7. 关键数字必查：凡正文把收入、存款、欠款、资产、订单、彩礼、嫁妆、医药费、学费、工资、灵石、功法资源、证据编号、时间期限等当作关键剧情支点时，必须有合理数字、单位或可见凭据支撑；普通买菜、日常消费、随口花销不必写成精确算式。若开头故意用夸张数字制造反差，只要后文迅速补清来源和逻辑，不应机械判死。
8. 内部只核对主线账：只追踪会影响剧情承接的关键数字、证据、关系、权限、资源和身份状态。正文不必展示完整账本，更不应写得像记账本；只要求关键剧情数字和状态一致。
9. 如果主线状态或关键数字不连贯，优先在storyPlan、bingeDrive、characterLogic和retentionBeats中扣分，并给出“只补状态来源、时代基准、道具证据或承接动作，不重写全篇”的修复建议。若只是数字写得太硬、太像算术题，应提示改自然；若是夸张设定本身成立，只是缺少解释，应提示补来源，不要直接否掉梗。

${selfCheckNumberContinuityRules()}`;
}

function weightedScoreRules(): string {
  return `主评分权重，总分100：
1. 3秒开头/5秒播放/12秒留存/30秒完播 openingHook：30分。决定能不能抓住人。第一眼必须有正在发生的动作、反常视觉、人物极端表情、关系压迫、证据露出或可截图传播的画面。没有这个，后面再好也低分。第1集还必须检查前30秒是否出现“即时损失”：默认优先关系/归属马上损失，题材不适合时可替换为钱/订单/资源、名誉/身份、安全/自由的即时损失。只有冲突、吵架、冷笑、拍桌、众人震惊，但看不出谁马上失去什么，openingHook最高不得超过84分。
2. 每15秒观看理由 retentionBeats：25分。按单集时长拆成15秒留存窗口，每个窗口都要有新冲突、秘密、压力、线索、资源/身份/关系状态变化、证据变化或未解问题。小说按字数折算：开头3行抓人，每300字至少一个继续读理由，每1000字至少一个更大变量或悬念。第1集前30秒必须让用户产生“我不看完这一集就不知道损失能不能翻回来”的压力；第2、3集必须承接上一集损失/误会/证据并推进新变量。
3. 上下文通顺连贯 continuity：20分。除了3秒开头、5秒播放、12秒留存、30秒完播这些入口硬指标外，连贯性优先级最高。第一集看内部连贯；第二集起必须带上一集最终内容、内部故事结构、剧情大纲和分集目录一起检查。小说、短剧剧本、15秒分镜稿从第2集开始都必须承接上一集最后画面、最后动作、最后一句关键台词、未解决损失、误会/信息差、证据/道具状态、资源/身份/关系变化或人物关系变化；本集内部因果、动机、转场、台词回应和新冲突也必须接得上。如果像重开故事、跳过上一集压力、只解释背景，或本集内部不通顺，continuity最高不得超过80分。
4. 追更动力/长线悬念 bingeDrive：10分。结尾和长线秘密必须让用户想追下一集；资源、身份、证据、关系筹码要持续变化，不能一集爽完。每一集都要服务广告观看收益：用户必须有理由看完本集并点下一集。15秒分镜稿也必须让下一个分镜段或下一集有明确继续拍摄的动作压力。
5. 人物是否成立 characterLogic：7分。主角不能完美，要有小毛病/癖好/小恶趣味；反派可以坏但不能降智。
6. 对话是否自然 dialogueNaturalness：5分。正常口语交际优先，禁止强行热梗、口号、爽文金句、东拼西凑。
7. 小说/剧本格式规范 formatEfficiency：2分。格式方便制作即可，不能反压高权重项。
8. 去AI味 deAi：1分。只做最后质感微调，绝不能为了去AI味牺牲钩子和留存。

评分原则：
1. 先门禁，后评分。
2. 修复建议必须按权重从高到低排列：30、25、20、10、7、5、2、1。
3. 不允许因为追更、格式或去AI味这些低权重项，破坏入口指标、15秒留存和上下文通顺连贯。
4. 每个weightedMetric必须给score，低于95时必须给issue、evidence、repairInstruction。
5. 自检不是评价，自检是找病灶；修复不是整体润色，修复是按病灶动刀。
6. 如果第1集前30秒缺少即时损失，issue必须明确写“前30秒有冲突但没有即时损失”，evidence引用原文位置，repairInstruction必须要求“只重写第1集前30秒/第一场，补关系或归属损失、误会/信息差、可见证据和最低逻辑支点”。`;
}

export async function selfCheckEpisode(
  episode: Episode,
  previousEpisodes: Episode[],
  config: GenerationConfig,
  hiddenStoryPlan = ''
): Promise<SelfCheckReport> {
  const previousContent = previousEpisodes
    .slice(-2)
    .map((item) => `第${item.id}集最终内容：\n${item.content}`)
    .join('\n\n');
  const previousEpisode = previousEpisodes.length > 0 ? previousEpisodes[previousEpisodes.length - 1] : undefined;
  const duration = targetDuration(config);
  const retentionWindows = Math.ceil(duration / 15);
  const scaleRule = scaleRuleForCheck(config);

  const prompt = `内容规模规则：${scaleRule}
你是严格的${outputTypeLabel(config)}商业留存质检员，不是创作者本人。请只输出JSON。

核心目标：
这个产品服务短视频创作者。质检必须从“能不能赚钱/留用户”出发，而不是先看文笔或低权重格式。
当前第一优化目标：3秒开头、5秒播放、12秒留存、30秒完播。第1集前30秒如果没有即时损失，就算有冲突也要判为高权重病灶。除这些入口硬指标外，上下文通顺连贯优先级最高，没有之一；第2、3集重点看是否承接上一集损失、误会、证据，并证明项目能连续追。
逐集商业目标：小说正文、短剧剧本、15秒分镜稿都必须上下承接，并且每一集都要吸引用户看完本集、继续看下一集，从而支撑广告观看和产品收益。格式不同，留存目标相同。

待检测输出类型：${outputTypeLabel(config)}
单集时长：${duration}秒
15秒留存窗口数：约${retentionWindows}个
红果审核：${config.hongguoReviewEnabled ? '开启，platform是门禁' : '未开启，只做通用发布风险'}

门禁项：
1. outputType：输出类型和硬格式必须正确。
2. storyPlan：必须优先参考上一集最终文案、内部故事结构/大纲/目录；第二集起必须承接上一集最终内容；每一集内部也必须因果、动机、转场、台词回应和新冲突通顺连贯。
3. platform：红果开启时必须合规；未开启时只做通用风险检查。

${typeSpecificRules(config)}

${platformRules(config)}

${continuityRules(previousEpisode)}

${wealthLogicRules()}

${weightedScoreRules()}

病灶定位要求：
1. 每个issue必须包含：问题 + 原文证据/位置 + 定向修改动作。
2. 每条suggestion必须写清：只改哪里、保留哪里、怎么改。
3. 禁止写“优化节奏、增强钩子、提升质感”这种空话。
4. 如果模型判断存在多个问题，先列高权重问题，低权重问题放后面。
5. 如果修复一个低权重问题会损害高权重项，必须放弃低权重修复。
6. 分数要真实保守，不确定是否优秀就按不通过处理。
7. score必须等于weightedScore；低于95或任何门禁失败，passed=false。
8. 第1集前30秒病灶必须具体到“缺哪一个检查项”：异常画面、关系/归属即时损失、误会/信息差、可见道具/证据、最低逻辑支点；不能只说开头弱。
9. 红果审核开启时，platform失败的修复建议必须写清“合规替换但保留刺激”，不能只建议删掉风险段落。
10. 第2集以后如果没有承接上一集最终内容，storyPlan门禁必须失败或continuity低分；issue必须指出断在上一集哪个最后画面/动作/台词/证据/损失。15秒分镜稿还要指出断在哪个镜头动作、道具状态或分镜段压力。
10.1 如果本集内部因果、动机、转场、台词回应或新冲突不通顺，storyPlan门禁必须失败或continuity低分；issue必须指出本集内部断裂位置。
11. 如果本集没有足够观看理由，retentionBeats必须低分；issue必须指出缺少哪类新变量：新损失、新证据、新误会、新关系压力、新身份变量、新资源风险、新规则限制或新反击机会。

输出JSON结构必须严格如下：
{
  "passed": false,
  "score": 88,
  "gatePassed": true,
  "gates": [
    {"key":"outputType","name":"输出类型和硬格式","passed":true,"issue":"","evidence":"","repairInstruction":""},
    {"key":"storyPlan","name":"故事结构/大纲/目录/上下集连贯","passed":true,"issue":"","evidence":"","repairInstruction":""},
    {"key":"platform","name":"红果/通用发布合规","passed":true,"issue":"","evidence":"","repairInstruction":""}
  ],
  "weightedScore": 88,
  "weightedMetrics": [
    {"key":"openingHook","name":"3秒开头/5秒播放/12秒留存/30秒完播","weight":30,"score":80,"issue":"前30秒有冲突但没有即时损失，缺少关系/归属断裂或其他马上要失去的东西","evidence":"引用开头原文证据","repairInstruction":"只重写第1集前30秒/第一场，补关系或归属即时损失、误会/信息差、可见证据和最低逻辑支点"},
    {"key":"retentionBeats","name":"每15秒观看理由","weight":25,"score":90,"issue":"本集缺少新的观看理由或广告留存压力","evidence":"引用掉速段落或缺少新变量的位置","repairInstruction":"只补对应段落的新损失、新证据、新误会、新关系压力或新资源风险，不重写全篇"},
    {"key":"continuity","name":"上下文通顺连贯","weight":20,"score":95,"issue":"第2集以后未承接上一集最后画面/动作/证据/损失，或本集内部因果/动机/转场/台词不通","evidence":"引用上一集结尾、本集开头或本集内部断点","repairInstruction":"只重写承接处或内部断裂处，接上上一集最后压力并让因果、动机、台词回应顺起来"},
    {"key":"bingeDrive","name":"追更动力/长线悬念","weight":10,"score":92,"issue":"","evidence":"","repairInstruction":""},
    {"key":"characterLogic","name":"人物是否成立","weight":7,"score":95,"issue":"","evidence":"","repairInstruction":""},
    {"key":"dialogueNaturalness","name":"对话是否自然","weight":5,"score":95,"issue":"","evidence":"","repairInstruction":""},
    {"key":"formatEfficiency","name":"小说/剧本格式规范","weight":2,"score":98,"issue":"","evidence":"","repairInstruction":""},
    {"key":"deAi","name":"去AI味","weight":1,"score":90,"issue":"","evidence":"","repairInstruction":""}
  ],
  "recommendedAction": "targeted_repair",
  "summary": "一句话总结",
  "issues": ["问题 + 原文证据/位置 + 定向修改动作"],
  "suggestions": ["只改哪里 + 保留哪里 + 怎么改"]
}

内部故事结构/大纲/目录：
${hiddenStoryPlan || '未提供。仍需按已选方案和当前集内容判断，不得编造不存在的硬性目录。'}

前文：
${previousContent || '无'}

待检测：
第${episode.id}集：${episode.title}
${episode.content}`;

  try {
    const response = await callAIWithFallback(prompt, 2200, 0.2, {
      apiBaseUrl: config.apiBaseUrl,
      apiKey: config.apiKey,
      modelName: config.modelName,
      timeoutMs: 180000,
    }, [config.fallbackModelName1, config.fallbackModelName2]);
    const modelReport = parseJsonReport(response);
    return modelReport || modelCheckFailureReport('大模型检测返回内容不是有效JSON，无法作为评分依据');
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error || '未知错误');
    return modelCheckFailureReport(`大模型检测请求失败：${message}`);
  }
}
