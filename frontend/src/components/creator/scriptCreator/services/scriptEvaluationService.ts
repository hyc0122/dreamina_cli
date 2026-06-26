import { GateCheck, GenerationConfig, SelfCheckReport, WeightedMetric, WeightedMetricKey } from '../types';
import { callAI, callAIWithFallback } from './aiService';

const PASS_SCORE = 85;

type Track = 'male' | 'female' | 'universal';

interface EvaluationProfile {
  label: string;
  scoreModel: 'novel_market_conversion' | 'script_nine_dimensions';
  metrics: WeightedMetric[];
  literaryKeys: WeightedMetricKey[];
  marketKeys: WeightedMetricKey[];
  prompt: string;
}

const NOVEL_MARKET_CONVERSION_METRICS: WeightedMetric[] = [
  { key: 'viralPotential', name: '3秒爆款入口/第一眼钩子', weight: 20, score: 0 },
  { key: 'adaptationFit', name: '15秒留存密度/段段有钩子', weight: 20, score: 0 },
  { key: 'monetization', name: '变现能力/追更付费欲望', weight: 18, score: 0 },
  { key: 'plotLogicAndSatisfaction', name: '爽点闭环/反转兑现', weight: 12, score: 0 },
  { key: 'empathyDrive', name: '情绪代入/即时损失', weight: 10, score: 0 },
  { key: 'genreHeat', name: '题材热度/赛道匹配', weight: 8, score: 0 },
  { key: 'audienceBreadth', name: '受众广度/传播面', weight: 5, score: 0 },
  { key: 'reputationRisk', name: '口碑风险/劝退点', weight: 4, score: 0 },
  { key: 'lifecycle', name: '长线生命周期/持续追更空间', weight: 3, score: 0 },
];

const NOVEL_MARKET_CONVERSION_KEYS: WeightedMetricKey[] = [
  'viralPotential',
  'adaptationFit',
  'monetization',
  'plotLogicAndSatisfaction',
  'empathyDrive',
  'genreHeat',
  'audienceBreadth',
  'reputationRisk',
  'lifecycle',
];

const SCRIPT_METRICS: WeightedMetric[] = [
  { key: 'plotClosure', name: '剧情逻辑闭环', weight: 18, score: 0 },
  { key: 'characterPortrayal', name: '人物塑造人设', weight: 18, score: 0 },
  { key: 'pacingStructure', name: '节奏结构编排', weight: 16, score: 0 },
  { key: 'conflictEmotion', name: '冲突与情绪共情', weight: 12, score: 0 },
  { key: 'dialogueTexture', name: '台词口语转化力', weight: 12, score: 0 },
  { key: 'commercialTraffic', name: '商业流量落地性', weight: 10, score: 0 },
  { key: 'valueCompliance', name: '价值观&合规风控', weight: 6, score: 0 },
  { key: 'relationshipArchitecture', name: '人物关系架构', weight: 4, score: 0 },
  { key: 'productionFit', name: '拍摄&AI制作适配', weight: 4, score: 0 },
];

const SCRIPT_LITERARY_KEYS: WeightedMetricKey[] = [];

const SCRIPT_MARKET_KEYS: WeightedMetricKey[] = [];

function clampPoint(value: unknown, max: number): number {
  const score = Number(value);
  if (!Number.isFinite(score)) return 0;
  const actual = score > max ? (score / 100) * max : score;
  return Math.round(Math.max(0, Math.min(max, actual)) * 10) / 10;
}

function clampTotal(value: unknown): number {
  const score = Number(value);
  if (!Number.isFinite(score)) return 0;
  return Math.max(0, Math.min(100, Math.round(score)));
}

function extractJson(text: string): unknown {
  const unfenced = text
    .trim()
    .replace(/^```json\s*/i, '')
    .replace(/^```\s*/i, '')
    .replace(/```$/i, '')
    .trim();
  const start = unfenced.indexOf('{');
  const end = unfenced.lastIndexOf('}');
  return JSON.parse(start >= 0 && end > start ? unfenced.slice(start, end + 1) : unfenced);
}

function normalizeGates(input: unknown, redFruitEnabled: boolean): GateCheck[] {
  const raw = Array.isArray(input) ? input : [];
  const pick = (key: GateCheck['key'], fallbackName: string, fallbackPassed: boolean) => {
    const item = raw.find((entry) => entry && typeof entry === 'object' && (entry as GateCheck).key === key) as Partial<GateCheck> | undefined;
    return {
      key,
      name: String(item?.name || fallbackName),
      passed: typeof item?.passed === 'boolean' ? item.passed : fallbackPassed,
      issue: item?.issue ? String(item.issue) : undefined,
      evidence: item?.evidence ? String(item.evidence) : undefined,
      repairInstruction: item?.repairInstruction ? String(item.repairInstruction) : undefined,
    };
  };
  return [
    pick('outputType', '独立作品评测，不参与生成输出类型', true),
    pick('storyPlan', '作品内容自洽和主线可评估', false),
    pick('platform', redFruitEnabled ? '红果风险门禁' : '通用发布风险参考', !redFruitEnabled),
  ];
}

function normalizeMetrics(input: unknown, definitions: WeightedMetric[]): WeightedMetric[] {
  const raw = Array.isArray(input) ? input : [];
  return definitions.map((definition) => {
    const item = raw.find((entry) => {
      if (!entry || typeof entry !== 'object') return false;
      const metric = entry as Partial<WeightedMetric>;
      return metric.key === definition.key || metric.name === definition.name;
    }) as Partial<WeightedMetric> | undefined;
    return {
      ...definition,
      score: clampPoint(item?.score, definition.weight),
      issue: item?.issue ? String(item.issue) : undefined,
      evidence: item?.evidence ? String(item.evidence) : undefined,
      repairInstruction: item?.repairInstruction ? String(item.repairInstruction) : undefined,
    };
  });
}

function metricSum(metrics: WeightedMetric[], keys: WeightedMetricKey[]) {
  return Math.round(metrics
    .filter((item) => keys.includes(item.key))
    .reduce((sum, item) => sum + item.score, 0) * 10) / 10;
}

function allMetricSum(metrics: WeightedMetric[]) {
  return Math.round(metrics.reduce((sum, item) => sum + item.score, 0) * 10) / 10;
}

function hasMetricSignal(metrics: WeightedMetric[]) {
  return metrics.some((item) => item.score > 0);
}

function stringArray(input: unknown): string[] {
  return Array.isArray(input) ? input.map(String).filter(Boolean) : [];
}

function metricRatio(metrics: WeightedMetric[], key: WeightedMetricKey) {
  const item = metrics.find((metric) => metric.key === key);
  if (!item || item.weight <= 0) return 0;
  return item.score / item.weight;
}

function failedKeys(gates: GateCheck[], metrics: WeightedMetric[]) {
  return [
    ...gates.filter((item) => !item.passed).map((item) => item.key),
    ...metrics.filter((item) => item.score < item.weight * 0.6).map((item) => item.key),
  ];
}

function gradeFromScore(score: number) {
  if (score >= 90) return 'S';
  if (score >= 80) return 'A';
  if (score >= 70) return 'B';
  if (score >= 60) return 'C';
  return 'D';
}

function failureReport(reason: string, profile: EvaluationProfile): SelfCheckReport {
  const gates = normalizeGates([], false);
  const metrics = profile.metrics.map((item) => ({
    ...item,
    issue: '作品评测未完成',
    repairInstruction: '重新调用作品评测模型',
  }));
  return {
    passed: false,
    score: 0,
    gatePassed: false,
    gates,
    weightedScore: 0,
    weightedMetrics: metrics,
    evaluationMeta: {
      rating: '无效',
      literaryScore: 0,
      marketScore: 0,
      calibrationScore: 0,
      scoreModel: profile.scoreModel,
      scoreReason: reason,
    },
    recommendedAction: 'targeted_repair',
    summary: `${profile.label}失败，未产生有效评分`,
    issues: [reason],
    suggestions: ['重新发起作品评测；如果连续失败，请更换质检模型或缩短单次导入内容'],
    failedDimensions: failedKeys(gates, metrics),
  };
}

function parseEvaluation(text: string, redFruitEnabled: boolean, profile: EvaluationProfile): SelfCheckReport | null {
  try {
    const data = extractJson(text) as Partial<SelfCheckReport>;
    const gates = normalizeGates(data.gates, redFruitEnabled);
    const metrics = normalizeMetrics(data.weightedMetrics, profile.metrics);
    if (!hasMetricSignal(metrics)) return null;
    const rawTrack = data.evaluationMeta?.detectedTrack;
    const detectedTrack: Track = rawTrack === 'male' || rawTrack === 'female' || rawTrack === 'universal' ? rawTrack : 'universal';
    const gatePassed = gates.every((gate) => gate.passed);
    const literaryScore = 0;
    const marketScore = profile.scoreModel === 'script_nine_dimensions' ? 0 : metricSum(metrics, profile.marketKeys);
    const modelCalibration = Number(data.evaluationMeta?.calibrationScore);
    const defaultCalibration = detectedTrack === 'male' ? 2 : detectedTrack === 'female' ? 1 : 0;
    const calibrationScore = profile.scoreModel === 'script_nine_dimensions'
      ? 0
      : Math.max(-3, Math.min(3, Number.isFinite(modelCalibration) ? modelCalibration : defaultCalibration));
    const score = profile.scoreModel === 'script_nine_dimensions'
      ? clampTotal(allMetricSum(metrics))
      : clampTotal(marketScore);
    const retentionScore = profile.scoreModel === 'script_nine_dimensions'
      ? Math.round((metricRatio(metrics, 'pacingStructure') * 0.40 + metricRatio(metrics, 'commercialTraffic') * 0.35 + metricRatio(metrics, 'productionFit') * 0.25) * 100)
      : Math.round((metricRatio(metrics, 'viralPotential') * 0.35 + metricRatio(metrics, 'adaptationFit') * 0.35 + metricRatio(metrics, 'monetization') * 0.30) * 100);
    return {
      passed: gatePassed && score >= PASS_SCORE,
      score,
      gatePassed,
      gates,
      weightedScore: score,
      weightedMetrics: metrics,
      evaluationMeta: {
        detectedTrack,
        detectedGenre: data.evaluationMeta?.detectedGenre || '',
        rating: data.evaluationMeta?.rating || gradeFromScore(score),
        literaryScore,
        marketScore,
        calibrationScore,
        retentionScore,
        suitableTracks: stringArray(data.evaluationMeta?.suitableTracks),
        scoreReason: data.evaluationMeta?.scoreReason || '',
        scoreModel: profile.scoreModel,
        redLineItems: stringArray(data.evaluationMeta?.redLineItems),
        rectificationPriority: data.evaluationMeta?.rectificationPriority || '',
        productionConclusion: data.evaluationMeta?.productionConclusion || '',
        trafficAdvice: data.evaluationMeta?.trafficAdvice || '',
        coreAdvantages: stringArray(data.evaluationMeta?.coreAdvantages),
        coreDisadvantages: stringArray(data.evaluationMeta?.coreDisadvantages),
      },
      recommendedAction: data.recommendedAction || (gatePassed && score >= PASS_SCORE ? 'continue' : 'targeted_repair'),
      summary: String(data.summary || ''),
      issues: Array.isArray(data.issues) ? data.issues.map(String) : [],
      suggestions: Array.isArray(data.suggestions) ? data.suggestions.map(String) : [],
      failedDimensions: failedKeys(gates, metrics),
    };
  } catch {
    return null;
  }
}

function compactJsonRepairPrompt(profile: EvaluationProfile, rawResponse: string) {
  const metricSchema = profile.metrics
    .map((item) => `{"key":"${item.key}","name":"${item.name}","weight":${item.weight},"score":0,"issue":"","evidence":"","repairInstruction":""}`)
    .join(',');
  return `下面是一段作品评测模型返回内容。请只做格式修复，不重新评测，不改分数含义。
如果原文里能读出分数、问题、建议，请整理为严格JSON；如果某项没有明确分数，请按原文整体判断补齐合理分数，不能全填0。
必须包含weightedMetrics，且key必须逐字使用给定schema里的key。

固定JSON结构：
{
  "passed": false,
  "gatePassed": true,
  "gates": [
    {"key":"outputType","name":"独立作品评测","passed":true,"issue":"","evidence":"","repairInstruction":""},
    {"key":"storyPlan","name":"作品内容自洽和主线可评估","passed":true,"issue":"","evidence":"","repairInstruction":""},
    {"key":"platform","name":"发布风险","passed":true,"issue":"","evidence":"","repairInstruction":""}
  ],
  "evaluationMeta": {
    "detectedTrack": "universal",
    "detectedGenre": "",
    "rating": "",
    "scoreModel": "${profile.scoreModel}",
    "suitableTracks": [],
    "redLineItems": [],
    "rectificationPriority": "",
    "productionConclusion": "",
    "trafficAdvice": "",
    "coreAdvantages": [],
    "coreDisadvantages": [],
    "scoreReason": ""
  },
  "weightedMetrics": [${metricSchema}],
  "summary": "",
  "issues": [],
  "suggestions": []
}

待修复内容：
${rawResponse}`;
}

function commonHeader(config: GenerationConfig, label: string) {
  const duration = Math.max(15, config.episodeDurationSeconds || 70);
  const retentionWindows = Math.ceil(duration / 15);
  return `你是独立的短剧赛道${label}。请只输出JSON。

重要边界：
1. 这是独立评测工具，不属于小说生成或剧本生成链路。
2. 你只参考用户粘贴的内容做评测，不改写、不续写。
3. 本机制仅作为分支线参考工具，不影响生成主链路。
4. 评分目标是判断内容能不能变成可拍、可剪、可投流、可追更的短视频/短剧项目。
5. 分数要真实，不要为了讨好用户给高分；差就是差，必须指出病灶。
6. 必须检查财富/资源/利益逻辑：钱、资源、身份、机会、订单、家产、流量、权力或安全感如何驱动人物行动；谁得利、谁受损、谁掌握筹码、谁被资源卡住。
7. 必须检查财富数值和年代合理性：凡关键剧情依赖收入、存款、欠款、资产、物价、订单、彩礼、嫁妆、医药费、学费、工资、灵石/功法资源等内容，都要判断数字、单位、来源、消耗和时代/世界观基准是否一致。年代题材尤其不能出现“前文贫困，后文无来源拿出几万元”的矛盾；但不要因为普通生活细节没报精确数字就误判。若作品用夸张金额或反差梗开头，只要后续能把来源讲通，应视为可接受写法。

参考单集时长：${duration}秒
参考15秒留存窗口：约${retentionWindows}个
红果检测：${config.hongguoReviewEnabled ? '开启，明显高风险表达会使platform门禁失败' : '关闭，只提示通用发布风险'}
用户补充关注点：${config.userIdea || '无'}

自动识别：
1. detectedTrack必须从 male / female / universal 中选一个，不许带性别偏见，只按题材、情绪驱动、受众习惯、卖点结构识别。
2. detectedGenre写清题材赛道。
3. 男频/女频/泛性别只是市场评测标签，不代表用户性别，也不能贬低任一类型。`;
}

function scriptPrompt(config: GenerationConfig, content: string): string {
  return `${commonHeader(config, '剧本评测员')}

剧本评测必须使用九大维度，总分100分，不使用小说市场转化模型，也不使用性别加分校准。
所有weightedMetrics.score必须使用实际得分，不是百分制。例如plotClosure满分18，score只能是0到18。

九大核心评测维度：
1. plotClosure 剧情逻辑闭环，18分：起承转合完整；伏笔有效铺垫和回收；人物行为动机自洽；无强行巧合、机械降神、半途断主线；因果关系闭环；财富数值、年代物价和资金来源前后一致。
2. characterPortrayal 人物塑造人设，18分：人设统一；主角有成长/黑化/逆袭弧；配角不纯工具人；角色差异化强；行为匹配身份、处境、财富位置和资源筹码。
3. pacingStructure 节奏结构编排，16分：开篇30秒强钩子；无注水闲聊；冲突递进；支线服务主线；短剧单集结尾有悬念卡点；集间衔接顺滑；财富/资源变量要持续变化。
4. conflictEmotion 冲突与情绪共情，12分：核心矛盾贯穿；情绪可代入；冲突来自人物立场、利益、性格，不硬造狗血；情绪转折自然。
5. dialogueTexture 台词口语转化力，12分：台词贴人设和身份；口语生活化；简洁无废话；情绪戏有张力；每句话都服务冲突、留存或反转；规避AI句式重复、模板话术、无真人细节。
6. commercialTraffic 商业流量落地性，10分：题材贴合短剧/网文市场；爽点、爆点、名场面、逆袭打脸密度充足；财富/资源/阶层差可视化强且金额可信；适合切片；具备平台投放和追更属性。
7. valueCompliance 价值观&合规风控，6分：三观不扭曲；不美化反派；无低俗擦边、敏感禁忌、违背公序良俗；红果开启时更严格。
8. relationshipArchitecture 人物关系架构，4分：主角、配角、情敌、家人、职场对手等关系清晰；情感递进有铺垫；不乱凑关系。
9. productionFit 拍摄&AI制作适配，4分：场景低成本可落地；人物数量合理；画面感强；适合转成竖屏AI短剧。

加厚剧本烂作红线，出现任意一条必须写入evaluationMeta.redLineItems和issues，并重点扣分：
1. 人设严重崩塌、角色无脑降智。
2. 逻辑漏洞密集，强行反转、强行洗白、强行和解。
3. 大段注水凑篇幅，全程闲聊无推进。
4. 台词生硬书面化，脱离人物身份。
5. 无主线无核心冲突，流水账。
6. 刻意制造狗血误会，为虐而虐，为吵而吵。
7. 挖坑不填，伏笔不回收，结局潦草。
8. AI剧本通病：句式重复、人设模板、剧情套路、无生活细节。
9. 三观扭曲，美化反派，合理化作恶。
10. 低俗擦边、暧昧过度、敏感禁区。
11. 集与集割裂，无衔接、无悬念卡点，不适配短剧连载。
12. 财富逻辑空心：无资源来源、无利益损益、无阶层/筹码变化，只靠空泛炫富或口头复仇推动。
13. 年代/世界观金钱价值崩坏：贫困设定后凭空出现大额资金，工资、物价、债务、资产、彩礼、订单、灵石等关键数字没有来源或明显不符合时代基准。

分品类自动适配：
1. 竖屏AI短剧：重点严查开篇钩子、单集卡点、每集反转密度、场景简易度、台词口语化。
2. 长剧/网剧剧本：重点查人物弧光、支线完整性、剧情长线逻辑、群像塑造。
3. 网文改编剧本：重点查原著内核还原、删减不毁人设、剧情浓缩不丢爽点。
4. 短视频剧情脚本：重点查15秒钩子、极快节奏、无冗余、结尾互动点。

输出报告语义必须覆盖这些固定部分：
1. 综合总分。
2. 九大维度逐项得分+简短扣分原因。
3. 剧本核心优点总结。
4. 红线违规项标记。
5. 关键问题逐条拆解。
6. 针对性精细化优化建议。
7. 整改优先级：轻微优化/中度修改/重度重构。
8. 商用&拍摄&AI制作适配结论：完全适配/微调可适配/不适配需大改。
9. 流量适配建议：是否适合切片剪辑、平台投放、二创引流。

输出JSON：
{
  "passed": false,
  "score": 78,
  "gatePassed": true,
  "gates": [
    {"key":"outputType","name":"独立剧本评测，不参与生成输出类型","passed":true,"issue":"","evidence":"","repairInstruction":""},
    {"key":"storyPlan","name":"剧本内容自洽和主线可评估","passed":true,"issue":"","evidence":"","repairInstruction":""},
    {"key":"platform","name":"红果/通用发布风险","passed":true,"issue":"","evidence":"","repairInstruction":""}
  ],
  "evaluationMeta": {
    "detectedTrack": "female",
    "detectedGenre": "古风/宫斗",
    "rating": "B",
    "literaryScore": 0,
    "marketScore": 0,
    "calibrationScore": 0,
    "scoreModel": "script_nine_dimensions",
    "suitableTracks": ["短剧"],
    "redLineItems": [],
    "rectificationPriority": "中度修改",
    "productionConclusion": "微调可适配",
    "trafficAdvice": "适合切片剪辑，但前三十秒需要补一个更强的视觉钩子。",
    "coreAdvantages": ["优点1"],
    "coreDisadvantages": ["缺点1"],
    "scoreReason": "一句话说明为什么是这个分"
  },
  "weightedMetrics": [
    {"key":"plotClosure","name":"剧情逻辑闭环","weight":18,"score":12,"issue":"扣分原因","evidence":"原文证据","repairInstruction":"定向修改建议"},
    {"key":"characterPortrayal","name":"人物塑造人设","weight":18,"score":12,"issue":"","evidence":"","repairInstruction":""},
    {"key":"pacingStructure","name":"节奏结构编排","weight":16,"score":10,"issue":"","evidence":"","repairInstruction":""},
    {"key":"conflictEmotion","name":"冲突与情绪共情","weight":12,"score":8,"issue":"","evidence":"","repairInstruction":""},
    {"key":"dialogueTexture","name":"台词口语转化力","weight":12,"score":8,"issue":"","evidence":"","repairInstruction":""},
    {"key":"commercialTraffic","name":"商业流量落地性","weight":10,"score":7,"issue":"","evidence":"","repairInstruction":""},
    {"key":"valueCompliance","name":"价值观&合规风控","weight":6,"score":5,"issue":"","evidence":"","repairInstruction":""},
    {"key":"relationshipArchitecture","name":"人物关系架构","weight":4,"score":3,"issue":"","evidence":"","repairInstruction":""},
    {"key":"productionFit","name":"拍摄&AI制作适配","weight":4,"score":3,"issue":"","evidence":"","repairInstruction":""}
  ],
  "summary": "一句话判断剧本好坏",
  "issues": ["问题 + 证据 + 定向修改"],
  "suggestions": ["只改哪里 + 保留哪里 + 怎么改"]
}

用户剧本：
${content}`;
}

function marketConversionNovelPrompt(config: GenerationConfig, content: string): string {
  return `${commonHeader(config, '小说市场转化评测员')}

小说/故事评测总分结构：市场转化100分，文学0分。
文学造诣不参与得分。文笔、立意、世界观、修辞只有在帮助点击、留存、追更、转化时才算有效；不能变现的文学表达一律不加分。
所有weightedMetrics.score必须使用实际得分，不是百分制。

市场转化100分：
1. viralPotential 3秒爆款入口/第一眼钩子，20分。
2. adaptationFit 15秒留存密度/段段有钩子，20分。
3. monetization 变现能力/追更付费欲望，18分。
4. plotLogicAndSatisfaction 爽点闭环/反转兑现，12分。
5. empathyDrive 情绪代入/即时损失，10分。
6. genreHeat 题材热度/赛道匹配，8分。
7. audienceBreadth 受众广度/传播面，5分。
8. reputationRisk 口碑风险/劝退点，4分。
9. lifecycle 长线生命周期/持续追更空间，3分。

评分必须尊重市场：
1. 不看文学奖标准，只看能不能抓人、能不能卖、能不能转化。
2. 看完第一集不想看第二集，最高不得超过70分。
3. 前3行没有强钩子，最高不得超过75分。
4. 只有文笔好但没有钩子、没有损失、没有追更，最高不得超过60分。
5. 必须给出具体证据：哪一句抓人，哪一段掉速，哪里缺钩子，哪里影响转化。
6. evaluationMeta.scoreModel必须是"novel_market_conversion"。
7. literaryScore必须为0；marketScore必须等于市场转化总分。
8. weightedMetrics只能使用这些key：viralPotential, adaptationFit, monetization, plotLogicAndSatisfaction, empathyDrive, genreHeat, audienceBreadth, reputationRisk, lifecycle。不要使用文学字段。

输出JSON结构沿用系统schema。

用户作品：
${content}`;
}

function getProfile(config: GenerationConfig, content: string): EvaluationProfile {
  if (config.inputType === 'screenplay') {
    return {
      label: '剧本评测',
      scoreModel: 'script_nine_dimensions',
      metrics: SCRIPT_METRICS,
      literaryKeys: SCRIPT_LITERARY_KEYS,
      marketKeys: SCRIPT_MARKET_KEYS,
      prompt: scriptPrompt(config, content),
    };
  }
  return {
    label: '小说/故事评测',
    scoreModel: 'novel_market_conversion',
    metrics: NOVEL_MARKET_CONVERSION_METRICS,
    literaryKeys: [],
    marketKeys: NOVEL_MARKET_CONVERSION_KEYS,
    prompt: marketConversionNovelPrompt(config, content),
  };
}

export async function evaluateUserWork(content: string, config: GenerationConfig): Promise<SelfCheckReport> {
  const profile = getProfile(config, content);
  const fallbackModels = [config.fallbackModelName1, config.fallbackModelName2];
  try {
    const response = await callAIWithFallback(profile.prompt, 2600, 0.2, {
      apiBaseUrl: config.apiBaseUrl,
      apiKey: config.apiKey,
      modelName: config.modelName,
      timeoutMs: 180000,
    }, fallbackModels);
    const parsed = parseEvaluation(response, config.hongguoReviewEnabled, profile);
    if (parsed) return parsed;

    const repairedResponse = await callAI(compactJsonRepairPrompt(profile, response), 2200, 0.1, {
      apiBaseUrl: config.apiBaseUrl,
      apiKey: config.apiKey,
      modelName: config.modelName,
      timeoutMs: 120000,
    });
    return parseEvaluation(repairedResponse, config.hongguoReviewEnabled, profile) || failureReport(`${profile.label}返回内容无法解析为有效评分，已重试JSON修复仍失败`, profile);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error || '未知错误');
    return failureReport(`${profile.label}请求失败：${message}`, profile);
  }
}
