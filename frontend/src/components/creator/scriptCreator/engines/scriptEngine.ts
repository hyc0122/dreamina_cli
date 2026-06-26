import { Episode, GenerationConfig, Scheme, Script, Scene } from '../types';
import { callAI, callAIStream } from '../services/aiService';
import { SelfCheckReport } from '../types';
import { prependPriorityPrompt } from '../utils/promptPriority';
import { getEpisodeDurationLabel, getEpisodeDurationTolerance, isStoryboardPreset } from '../utils/workspacePreset';
import {
  episodeNumberContinuityRules,
  hiddenPlanNumberContinuityRules,
  schemeNumberContinuityRules,
} from '../utils/storyNumberContinuity';

function isAbortError(error: unknown): boolean {
  return error instanceof DOMException && error.name === 'AbortError';
}

function isExternalApi(config: GenerationConfig): boolean {
  return !!config.apiBaseUrl && !config.apiBaseUrl.trim().startsWith('/');
}

function shouldFallbackModel(error: unknown): boolean {
  const message = error instanceof Error ? error.message : String(error || '');
  return /model_timeout|超时|timed out|model_not_found|无可用渠道|请求失败：408|请求失败：404/i.test(message);
}

async function callCreativeModel(
  prompt: string,
  maxTokens: number,
  temperature: number,
  config: GenerationConfig,
  signal?: AbortSignal,
  timeoutMs = 240000
): Promise<string> {
  const primaryModel = config.modelName;
  const fallbackModels = [config.fallbackModelName1, config.fallbackModelName2];

  try {
    return await callAI(prompt, maxTokens, temperature, {
      apiBaseUrl: config.apiBaseUrl,
      apiKey: config.apiKey,
      modelName: primaryModel,
      signal,
      timeoutMs,
    });
  } catch (error) {
    if (isAbortError(error)) throw error;
    if (!isExternalApi(config) || !shouldFallbackModel(error)) throw error;
    let lastError: unknown = error;
    for (const modelName of fallbackModels) {
      try {
        return await callAI(prompt, maxTokens, temperature, {
          apiBaseUrl: config.apiBaseUrl,
          apiKey: config.apiKey,
          modelName,
          signal,
          timeoutMs,
        });
      } catch (fallbackError) {
        if (isAbortError(fallbackError)) throw fallbackError;
        lastError = fallbackError;
      }
    }
    throw lastError;
  }
}

function outputTypeLabel(config: GenerationConfig): string {
  if (config.outputType === 'screenplay') return isStoryboardPreset(config) ? '15秒分镜稿' : '短剧剧本';
  return '小说正文';
}

function targetWordCount(config: GenerationConfig): number {
  return Math.max(300, Math.min(8000, config.chapterWordCount || 1800));
}

function targetDuration(config: GenerationConfig): number {
  return Math.max(1, config.episodeDurationSeconds || 70);
}

function contentScaleLines(config: GenerationConfig): string[] {
  if (config.outputType === 'novel') {
    const words = targetWordCount(config);
    return [
      `单集字数：约${words}字`,
      `小说节奏：开头3行必须抓人，每300字至少有一个可视化冲突/信息变化，每1000字至少有一个悬念，结尾必须有追更动作或未解问题。`,
    ];
  }
  const duration = targetDuration(config);
  const tolerance = getEpisodeDurationTolerance(config);
  return [
    `单集时长：${duration}秒（允许上下浮动${tolerance}秒）`,
    `15秒留存窗口数：约${Math.ceil(duration / 15)}个`,
  ];
}

function fixedPriority(config: GenerationConfig): string {
  return [
    `输出类型必须是${outputTypeLabel(config)}，它决定最终格式。`,
    `内容风格必须是${config.contentStyle === 'dianwen' ? '颠文' : '正常'}。`,
    '最终成稿必须用大白话写，像真人在现场说话和做事；禁止文绉绉、说明文、评审腔、作文腔和故作高级的修辞。',
    '用户想法优先级最高，题材、年代、男女频、重生、金手指、冲突节奏和转折都必须服务于用户想法。',
    config.hongguoReviewEnabled ? '红果审核已开启：除输出类型外，红果合规优先级最高。' : '',
  ].filter(Boolean).join('\n');
}

function baseSettingLines(scheme: Scheme, config: GenerationConfig): string {
  return [
    `输出类型：${outputTypeLabel(config)}`,
    `用户想法：${config.userIdea || '无'}`,
    `方案：${scheme.name}`,
    `故事介绍：${scheme.storyIntroduction}`,
    `核心冲突：${scheme.coreConflict}`,
    `人物设计：${scheme.characterDesign}`,
    `主角：${scheme.protagonistArc}`,
    `反派：${scheme.antagonistProfile}`,
    `高光场景：${scheme.highlightScenes.join(' / ')}`,
    `剧情大纲：${scheme.plotOutline}`,
    `分集目录：${scheme.episodeDirectory}`,
    `总集数：${config.episodeCount}`,
    ...contentScaleLines(config),
    '剧情节奏：由系统根据题材、人物关系、用户想法和输出类型自动判断，禁止机械堆热梗、硬爽点和硬反转。',
    '主线状态逻辑：必须明确人物当前在争什么、谁会失去什么、哪些关系或资源状态会推动人物行动；每个重大冲突都要有可理解的收益、损失和交换关系。',
    '主线数字一致性：涉及年代、贫富、债务、工资、物价、资产、订单、彩礼、嫁妆、灵石/功法资源等内容时，内部只需锁定会影响剧情的关键数字和状态变化；普通生活开销保持自然口吻。允许夸张反差设定，但必须在前后文补清来源、赠与、家庭支持、隐藏资产、关系交换或信息差解释，不能无来源硬跳。',
    schemeNumberContinuityRules(),
  ].join('\n');
}

function deAiRules(): string {
  return `成稿口吻硬要求：
1. 用大白话写。能说“她把手机扣在桌上”，就不要写“她压下翻涌的情绪”；能说“门被踹开”，就不要写“命运的裂缝被撕开”。
2. 句子短一点，动作清楚一点，对白像真人吵架、试探、顶嘴、哄人、撒谎，不像作文朗诵。
3. 禁止文绉绉：缓缓、逐渐、仿佛、似乎、不禁、眼神复杂、空气凝固、命运齿轮、心中一震、久久没有说话、此刻的她、无形的压迫感。
4. 禁止解释腔：不要写“这说明”“他意识到”“她终于明白”“这一刻意味着”“背后隐藏着”。要把信息放进动作、证据、道具和对话里。
5. 禁止流水账和小学生腔：不要只写“他很生气，她很害怕，大家很震惊”。必须写具体动作：杯子碰响、手机亮屏、门把手被拧动、合同被按在桌上。
6. 对白必须先回应对方，再推进冲突；允许打断、反问、半句话、停顿。不要让角色背设定、讲道理、念广告词。
7. 小说正文像读者能一口气看下去的故事；短剧剧本像演员拿来能直接演；15秒分镜像现场导演能直接拍，不要像表格作业。
8. 最终输出不要解释规则，不要写“开场/反转/钩子/留存点/商业目标”等栏目名。`;
}

function commercialPriorityRules(config: GenerationConfig): string {
  const scale = config.outputType === 'novel'
    ? `小说按每集约${targetWordCount(config)}字写，开头3行抓人，每300字至少一个新钩子或新压力。`
    : `${isStoryboardPreset(config) ? '15秒分镜稿' : '短剧剧本'}按每集约${targetDuration(config)}秒写，每15秒必须有一个新钩子或新压力。`;
  return `商业爆款硬要求：
1. 变现第一。文学造诣不单独加分，不能变现的文笔、氛围、立意和长铺垫都要让位给点击、留存、追更和付费欲望。
2. 第一集必须让人看完就想点第二集，像手里拿着放不下的玩具：刚解决一个问题，马上又冒出更大的问题。
3. 开头必须有爆款入口：异常画面、当场翻脸、证据甩脸、身份误会、资源马上被抢、关系马上断、钱/资格/名声马上要没。
4. 钩子要密，不要只靠一个大反转。每一段都要有继续看的理由：新证据、新误会、新压力、新损失、新筹码、新身份、新规则、新选择。
5. 只要段落在解释背景、铺世界观、炫文笔、讲大道理、写空泛情绪，但没有新压力，就删掉或改成现场事件。
6. 人物不是为了文学完整而存在，是为了制造选择、冲突、损失和追更。每个主要人物出场都要带着目的或筹码。
7. ${scale}
8. 最终成稿仍然要通顺，不能为了钩子乱跳；钩子必须从人物目标、关系压力、证据和资源变化里长出来。`;
}

function plainLanguageRules(config: GenerationConfig): string {
  if (config.outputType === 'novel') {
    return `小说大白话标准：
1. 正文要像人在讲一个正在发生的事，不要像散文、作文、评语或故事梗概。
2. 少写心理总结，多写动作和对话。人物急了就让他摔门、抢手机、压低声音，不要写一大段内心独白。
3. 每段尽量短，长段必须拆开；读起来要顺，不能为了爽点硬跳因果。`;
  }

  if (!isStoryboardPreset(config)) {
    return `剧本大白话标准：
1. 画面/动作只写演员能演、摄影能拍的东西，不写导演感想、人物心理分析和抽象气氛。
2. 台词短，像人说话。每句台词尽量一口气能说完，禁止长篇解释身份、背景和世界观。
3. 场次字段可以固定，但字段里的内容必须自然、具体、好拍，不要像学生填空。`;
  }

  return `15秒分镜大白话标准：
1. 字段必须保留，但字段内容要像给现场拍摄团队的口头指令，短、清楚、能拍。
2. 动作细节不要写“人物情绪到达临界点”这种空话，要写“她后退半步，手里的钥匙掉在地上”。
3. 画面字段不要堆“高级质感、电影感、压迫氛围”，要写清谁在什么地方做什么，镜头怎么拍，观众第一眼看见什么。
4. 台词/对白必须像真人声音，不要像旁白、口号或说明书。`;
}

function visualHookRules(config: GenerationConfig): string {
  const modeRule = config.outputType === 'screenplay'
    ? '短剧剧本：每场都能单独剪成短视频片段，场景描述可拍，对白短狠，转场靠动作。'
    : '小说正文：也按短剧画面逻辑写，少背景和心理，多动作、表情、道具、空间关系和视觉反差。';

  return `短剧视觉钩子引擎：
1. 所有不能被摄像机拍下来的文字，必须删掉或改成动作、表情、道具、空间关系、现场对白。
2. 开头3秒必须是正在发生的动作、反常视觉、强冲突或极端表情，不能从背景介绍开始。
3. 开头不能千篇一律，禁止连续多集都用同一种起手，例如都从推门、摔东西、亮证据、电话响、当众质问、主角冷笑开始。
3.1 允许夸张梗、荒诞反差或爆点句作为开头，只要它服务剧情，并且在后文很快把来源和逻辑补清楚，而不是只靠一句怪话吊着不解释。
4. 每集必须根据上一集结尾、当前人物目标和题材选择不同开头类型：动作承接、道具异动、表情特写、空间反差、关系压迫、证据露出、误会爆发、安静异常、现场对话半句、机会临门。
5. 小说和剧本即使讲同一剧情，也必须使用适合各自格式的不同开头表达，不能复制同一段开头文字。
6. 前10秒必须出现可做封面/截图传播的画面。
7. 抽象情绪必须视觉化，例如指节发白、嘴唇发抖、手机摔碎、杯子滚落。
8. 台词必须推动冲突，删解释性台词、铺垫性台词和废话。
9. 环境描写必须服务冲突、情绪或剧情信息。
10. 转场尽量靠动作或道具完成。
11. 每段/每场都必须有观看理由。
${modeRule}`;
}

function retentionRules(config: GenerationConfig): string {
  if (config.outputType === 'novel') {
    const words = targetWordCount(config);
    const conflictCount = Math.max(1, Math.ceil(words / 300));
    const suspenseCount = Math.max(1, Math.ceil(words / 1000));
    return `小说短视频化节奏逻辑：
1. 小说按字数生成，不按秒数生成；本集目标约${words}字。
2. 开头3行决定读者是否继续看：必须是正在发生的动作、反常视觉、强冲突、极端表情、证据露出或现场对白半句，不能背景介绍起手。
3. 每300字至少出现一个新的观看/阅读理由：视觉冲突、秘密暴露、关系压迫、资源/身份/关系状态变化、证据变化、身份误差、未解问题或行动后果；本集至少要有约${conflictCount}个节奏点。
4. 每1000字至少出现一个更大的悬念或变量变化；本集至少要有约${suspenseCount}个强悬念点。
5. 主线状态变化必须参与节奏：每个关键节点要让读者看见人物得到了什么、失去了什么、被谁卡住关系或资源、谁在用规则/机会/身份压人。
6. 只在主线需要时使用明确数字和单位；凡正文把收入、存款、欠款、资产、订单、期限、证据编号或玄幻资源数量当作剧情支点，必须能被内部主线数字账本解释来源和变化。普通消费、买菜、日用花销不必逐笔精算，口吻要像真人说话。核心要求是“关键数字和状态讲得通”，不是“所有钱都要算得细”。
7. 结尾必须逼出下一集：停在可见动作、新证据、当面对峙、电话响、门被推开、道具亮出、半句话中断或新的资源风险。
8. 以上规则只内部执行，不输出给用户。`;
  }
  const duration = targetDuration(config);
  const windowCount = Math.ceil(duration / 15);
  const lastWindowStart = Math.max(0, duration - 15);
  const modeRule = `短剧剧本：一集约${duration}秒，拆成${windowCount}个场景节拍，每个节拍对应一个15秒留存窗口。`;

  return `短视频流量与15秒广告留存逻辑：
1. 所有输出最终都要制作成短视频发布，用来获取流量并持续吸引用户看完15秒广告窗口。
2. 用户选择的单集时长为${duration}秒；常见整剧约60集，必须做成长链条追看结构。
3. 开头权重最高：0-3秒决定点进，0-15秒决定是否继续看。
4. 每15秒必须出现新的观看理由：视觉冲击、冲突升级、秘密暴露、身份反转、情绪压迫、道具线索、关系破裂、未解问题。
5. 主线状态变化必须参与留存：每个关键节点要让观众看见人物得到了什么、失去了什么、被谁卡住关系或资源、谁在用规则/机会/身份压人。
5.1 只在主线需要时使用明确数字和单位；凡正文把收入、存款、欠款、资产、订单、期限、证据编号或玄幻资源数量当作剧情支点，必须能被内部主线数字账本解释来源和变化。普通消费、买菜、日用花销不必逐笔精算；夸张金额可以出现，但要尽快交代来源。
6. 单集留存链必须覆盖约${windowCount}个窗口：0-3秒入口钩子，3-15秒第一冲突，中段每15秒递进一次；最后${lastWindowStart}-${duration}秒必须收束到悬念或下一集动作。
7. 每集结尾必须逼出下一集：停在可见动作、新证据、当面对峙、电话响、门被推开、道具亮出、半句话中断。
8. 60集长剧中，每一集都要改变一个具体变量：关系、证据、地位、威胁、目标、资源、误会、地点或秘密。
9. 观看理由必须从人物目标、关系压力、资源/身份/关系状态变化、证据变化和现场动作里自然长出来，禁止为了爽而爽、为了反转而反转。
10. 以上规则只内部执行，不输出给用户。
${modeRule}`;
}

function firstThirtySecondHookRules(episodeIndex: number): string {
  if (episodeIndex === 1) {
    return `第1集前30秒商业硬钩子：
1. 前30秒是本产品当前最高商业目标：先让用户停住并看完第1集，再谈文笔、设定和长线。
2. 固定检查项，不固定写法；顺序可以变化，但必须同时具备：第一眼异常画面、关系压力、误会/信息差、可见道具或证据、即时损失、最低逻辑支点。
3. 即时损失默认优先写“关系/归属马上损失”：亲人、恋人、婚约、师门、团队、村庄、公司、家族、宗门、阶层圈层、保护资格、继承资格、合作资格等正在断裂。
4. 题材不适合关系/归属时，才替换为钱/订单/资源、名誉/身份、安全/自由的即时损失；但必须让观众看见谁马上失去什么、谁造成损失、为什么现在发生。
5. 允许强反差、荒诞感和颠感开头；但30秒内必须补出最低逻辑支点：谁误会了什么、谁因此受损、主角如果不行动会付出什么代价。
6. 有冲突不够，必须有立刻损失；只有争吵、冷笑、推门、拍桌、众人震惊但没有马上要失去的东西，视为开头失败。
7. 红果审核开启时，合规优先；危险、低俗、违法或高风险刺激必须替换为规则压力、证据压力、契约压力、商业压力或人际压力，但不能把刺激删平。`;
  }

  if (episodeIndex === 2) {
    return `第2集开头承接规则：
1. 不重新开故事，不重新解释世界观。
2. 必须承接第1集结尾的最后一个动作、证据、误会、关系压力或即时损失。
3. 开头要把第1集的损失、误会或证据推进一步，让观众确认这不是一集钩子骗点击。`;
  }

  if (episodeIndex === 3) {
    return `第3集开头承接规则：
1. 必须承接第2集结尾，不能只是继续吵。
2. 开头要打开更大的变量：身份、利益、资源、关系、证据、规则或阵营。
3. 目标是证明项目能连续追，后面还有可持续的损失、反击和翻盘空间。`;
  }

  return `逐集开头承接规则：
1. 开头必须承接上一集最后一个可见动作、证据、误会、关系压力或即时损失。
2. 每集至少改变一个具体变量：关系、证据、地位、威胁、目标、资源、误会、地点或秘密。
3. 不要把每集都写成同一种炸裂模板，开头必须从当前剧情压力里长出来。`;
}

function episodeContinuityAndAdRetentionRules(episodeIndex: number, config: GenerationConfig): string {
  const scaleRule = config.outputType === 'novel'
    ? `小说正文也必须按广告留存逻辑写：每集约${targetWordCount(config)}字，开头3行先抓人，每300字给一个继续读的理由，每1000字给一个更大的变量或悬念。`
    : `${isStoryboardPreset(config) ? '15秒分镜稿' : '短剧剧本'}必须按广告留存逻辑写：每集约${targetDuration(config)}秒，0-3秒抓人，0-15秒留住，中段每15秒给一个继续看的理由。`;
  const continuityRule = episodeIndex === 1
    ? '第1集要在本集内部建立清楚的主冲突、即时损失、误会/信息差和追更方向。'
    : `第${episodeIndex}集开头必须承接第${episodeIndex - 1}集最终内容的最后一个画面、最后一个动作、最后一句关键台词、未解决损失、误会/信息差、证据/道具状态和人物关系变化。`;

  return `逐集承接与广告留存硬规则：
0. 除了3秒钩子、5秒播放、12秒留存、30秒完播这些入口硬指标外，上下文通顺连贯是最高优先级，没有之一。
1. 小说正文、短剧剧本、15秒分镜稿都必须优先参考上一集最终文案、隐藏故事结构、剧情大纲和分集目录；输出格式不同，但故事状态不能断。
2. ${continuityRule}
3. 每一集本身也必须通顺连贯：前因后果清楚，人物动机接得上，场景转场有动作或道具承接，台词先回应上一句/上一场压力再推进新冲突。
4. ${scaleRule}
5. 每一集都必须产生新的观看理由：新损失、新证据、新误会、新关系压力、新身份变量、新资源风险、新规则限制或新反击机会。
6. 每一集结尾都必须给下一集点击理由：停在可见动作、证据变化、关系断裂、权限/资格变化、电话/门禁/合同/名单/族谱等道具变化，或一句被打断的关键台词。
6.1 15秒分镜稿必须把承接关系落实到镜头动作、道具状态、人物站位、表情变化或声音线索，不能只重新开始一组镜头字段。
7. 禁止把第2集以后写成重开故事、背景补课、单纯解释世界观、只延续吵架、只做文笔润色；如果没有新变量和新损失，本集视为商业留存失败。
8. 红果审核开启时，仍然要保留每集的损失、压力和追看理由，只把风险表达替换为合规的规则、证据、契约、商业或人际压力。`;
}

function hongguoRules(config: GenerationConfig): string {
  if (!config.hongguoReviewEnabled) return `红果审核未开启：
1. 不套用红果专属限制，不把红果当成唯一平台。
2. 只做通用可发布表达：避免明显违法、低俗、危险教学和不可公开发布内容。
3. 保留题材张力、人物反差、喜剧冲突和用户想法，但不要堆热梗。`;
  return `红果审核已开启：
1. 风险内容必须合规改写，保留核心戏剧目的和情绪结果。
2. 金手指现实化：能力来自训练、专业技能、行业经验、信息差、证据链、团队协作。
3. 不写血腥暴力、违法教学、隐私侵犯、低俗羞辱、危险驾驶、未成年人不当内容。
4. 冲突用规则、证据、安保、法律流程、商业博弈、人际博弈解决。
5. 反派作恶必须有现实后果。
6. 涉及未成年、强迫、脱衣、验身、性暗示、洞房、生孩子等高风险表达时，必须改写成合规奇幻/剧情动作：成年礼未完成、族中仪式未成、结契、血脉印记、龙鳞印记、灵力反应、族群传承、族规压力。
7. 保留喜剧冲突、疯感、反差和追看点，但不得保留违规动作细节，不要堆网络热梗。`;
}

function outputRules(config: GenerationConfig): string {
  if (config.outputType === 'novel') {
    return '最终输出小说正文，不写剧本场次、秒数、说明、大纲或目录。';
  }

  if (!isStoryboardPreset(config)) {
    return `最终输出短剧剧本正文，必须使用“集 -> 场次 -> 可拍动作与对白”的剧本稿格式。此规则用于“剧本创作”，不要写成15秒分镜镜头稿：
第1集：《本集短标题》
时长：${getEpisodeDurationLabel(config)}

【场次01】具体地点｜日/夜｜内/外
人物：角色A、角色B
画面/动作：只写能拍出来的动作、表情、道具变化、空间关系和冲突推进；不要写抽象心理散文。
对白：
角色A（情绪/语气）：短句台词。
角色B（情绪/语气）：短句台词。
音效/转场：现场声、门响、手机震动、切到下一场等。
本场钩子：这一场留下的新压力、新证据、新误会或新问题。

【场次02】具体地点｜日/夜｜内/外
人物：角色A、角色C
画面/动作：承接上一场最后动作或压力，继续推进冲突。
对白：
角色C（情绪/语气）：短句台词。
音效/转场：现场声或动作转场。
本场钩子：推动下一场继续看的理由。

硬规则：
1. 一次只输出当前这一集剧本，不输出总大纲、目录、解释、评分表或创作说明。
2. 第一行必须是“第X集：《标题》”或“第X集：标题”；系统会按集保存和评分。
3. 每集必须包含多个【场次xx】，每个场次按固定字段：人物 -> 画面/动作 -> 对白 -> 音效/转场 -> 本场钩子。
4. 对白格式必须是“角色（情绪/语气）：台词”，台词短、狠、可表演，禁止长篇解释。
5. 画面/动作必须可拍：表情、身体动作、道具、空间位置、现场反应；禁止小说心理描写和导演讲解。
6. 每集开头3秒必须有强冲突/异常画面/关系压力；每15秒必须有新观看理由；结尾必须有追更钩子。
7. 剧本创作不能输出“机位与拍摄方向”“镜头类型&景别&运镜”“_::~RECORD::~_”。这些只属于15秒分镜稿创作。
8. 红果开启时，高风险表达必须合规替换，但不能把冲突删平。`;
  }

  return `最终输出15秒分镜稿，必须使用“分镜段 -> 多个镜头字段块”的生产稿格式。此规则是核心不可更改规则：
时长：${getEpisodeDurationLabel(config)}
机位与拍摄方向：斜侧45机位
镜头类型&景别&运镜：钩子开场镜头/中景/慢横摇运镜
动作细节：【面部表情：人物具体表情】人物可拍动作、空间关系、道具变化和冲突推进
台词/对白：角色（情绪/声音）：台词；无对白则写“无”
光影氛围：室内暖黄柔光，人物面部明暗对比，局部阴影压暗
特效细节：无
音效：脚步声、拍击声、室内环境低噪
时长：6秒
【人物】：角色A、角色B
【场景】：具体场景
画面：面向AI视频生成的完整画面描述，写清人物、动作、机位、运镜、质感和合规表达
声音：【对白】角色（情绪/声音）：台词；无对白则写“无”

机位与拍摄方向：外反拍过肩机位
镜头类型&景别&运镜：正反打对话镜头/中近景/微推运镜
动作细节：【面部表情：人物具体表情】承接上一个镜头的动作继续推进
台词/对白：角色（情绪/声音）：台词
光影氛围：与上镜统一
特效细节：无
音效：现场声音
时长：5秒
【人物】：角色A、角色B
【场景】：具体场景
画面：承接上镜的可拍画面
声音：【对白】角色（情绪/声音）：台词

NO SRT
_::~RECORD::~_

机位与拍摄方向：低机位仰拍
镜头类型&景别&运镜：冲突强化镜头/中近景/急推运镜
动作细节：【面部表情：人物情绪到达临界点】人物向前一步，现场压力升级，留下下一分镜继续观看的问题
台词/对白：无
光影氛围：明暗对比增强，压迫感上升
特效细节：无
音效：脚步声、现场低噪增强
时长：5秒
【人物】：角色A、角色B
【场景】：具体场景
画面：冲突被推到更高一级，形成下一分镜的追看理由
声音：无

机位与拍摄方向：内反拍机位
镜头类型&景别&运镜：承接反应镜头/中景/慢推运镜
动作细节：【面部表情：人物短暂压住情绪】人物接住上一分镜的压力，转向新的证据或关系对象
台词/对白：角色（克制+青年声）：台词
光影氛围：面光提亮人物表情，背景压暗
特效细节：无
音效：轻缓脚步声、环境低噪
时长：5秒
【人物】：角色A、角色B
【场景】：具体场景
画面：上一分镜冲突后的承接反应，镜头聚焦人物动作和新证据
声音：【对白】角色（克制+青年声）：台词

硬规则：
1. 正文第一行必须是“机位与拍摄方向：...”，不要输出“第X集”“【分镜xx】”“【镜头xx】”标题。
2. 分镜段是15秒留存内容单元；分镜段内部连续写多个镜头字段块，每个镜头字段块都从“机位与拍摄方向：”开始。
3. 每个镜头字段块必须按固定顺序写全字段：机位与拍摄方向 -> 镜头类型&景别&运镜 -> 动作细节 -> 台词/对白 -> 光影氛围 -> 特效细节 -> 音效 -> 时长 -> 【人物】 -> 【场景】 -> 画面 -> 声音。
4. “_::~RECORD::~_”只分割分镜段，不分割镜头；分镜段内部多个镜头连续书写，禁止在镜头之间放“_::~RECORD::~_”。
5. 每个分镜段通常包含2-4个镜头，镜头“时长”相加约等于一个15秒留存单元；最后不足15秒时按剧情剩余时长自然收束。
6. 每集按${targetDuration(config)}秒设计，约每15秒一个分镜段；第一个分镜段必须是强钩子分镜。
7. 动作细节必须包含可拍动作、面部表情、身体姿态、道具或空间关系，禁止小说心理散文。
8. 台词格式必须是“角色（情绪/声音）：台词”，没有对白写“无”。
9. 画面字段必须适合AI视频生成，写清人物、场景、机位、运镜、光影、质感和合规边界。
10. 分镜段末尾可按样例写“NO SRT”，但不能破坏字段顺序和RECORD分段。
11. 禁止旧格式：不要写“1-1  夜  内  地点”“人物：”“【画面】场景块”、分镜/镜头标题、Markdown列表、导演解释、剧情梗概。
12. 红果开启时高风险内容必须在动作细节、画面和声音字段里同步合规改写。`;
}

function internalScreenplayBridgeRules(config: GenerationConfig): string {
  if (config.outputType !== 'screenplay') return '';
  if (!isStoryboardPreset(config)) {
    return `短剧剧本内部桥接流程：
1. 先在内部理清上下集承接、人物动机、现场冲突、15秒留存点和结尾追看点。
2. 最终用户只能看到“第X集 -> 【场次xx】 -> 人物/画面动作/对白/音效转场/本场钩子”的剧本稿。
3. 剧本稿必须可拍、可表演、可统筹；不要输出小说段落、分镜镜头字段、导演说明或评分解释。
4. 如果上下承接和格式冲突，先保证剧情承接成立，再用场次结构表达清楚。`;
  }

  return `15秒分镜稿内部桥接流程：
1. 你可以先在内部形成一版“可拍场面稿”：它像小说一样理清上下承接、人物动机、现场冲突、15秒留存点和结尾追看点。
2. 这版场面稿只用于你理解剧情，不允许输出给用户，不允许夹在最终正文里。
3. 最终必须先按15秒留存窗口拆成分镜段，再在每个分镜段里连续写多个镜头字段块；不能把单个镜头当成15秒分镜段。
4. 每个镜头字段块从“机位与拍摄方向：”开始，只写可拍动作、表情、机位、运镜、台词、声音、光影、镜头时长和AI视频画面描述。
5. 如果上下承接、人物动机和镜头格式冲突，先保证剧情承接成立，再用本集必要分镜段和镜头数表达清楚；不要为了凑字段牺牲故事逻辑。
6. 用户看到的只能是“机位与拍摄方向：...镜头字段块..._::~RECORD::~_...机位与拍摄方向：...”这种最终分镜生产稿。`;
}

function episodeFormatGuard(config: GenerationConfig, episodeIndex: number): string {
  if (config.outputType === 'novel') {
    return `小说正文格式硬性要求：
只输出第${episodeIndex}集小说正文。
禁止出现剧本场次、人物表、秒数字段。
如果草稿混入其他格式，必须彻底改回小说正文。`;
  }
  if (!isStoryboardPreset(config)) {
    return `短剧剧本格式硬性要求：
只输出第${episodeIndex}集剧本正文。
第一行写“第${episodeIndex}集：《本集标题》”。
必须使用多个【场次xx】，每个场次包含：人物、画面/动作、对白、音效/转场、本场钩子。
画面/动作必须可拍；对白必须是“角色（情绪/语气）：台词”。
每集开头3秒有强钩子；每15秒有新观看理由；结尾有追更钩子。
禁止输出机位与拍摄方向、镜头类型&景别&运镜、_::~RECORD::~_、分镜表格、Markdown列表、小说段落或创作解释。`;
  }

  return `15秒分镜稿格式硬性要求：
正文第一行必须严格写：机位与拍摄方向：
不要输出“第${episodeIndex}集”标题，集数由系统外层记录。
每个15秒留存内容必须成为一个分镜段，分镜段不是单个镜头；分镜段内连续写多个镜头字段块。
每个镜头字段块必须包含：机位与拍摄方向、镜头类型&景别&运镜、动作细节、台词/对白、光影氛围、特效细节、音效、时长、【人物】、【场景】、画面、声音。
分镜段之间必须用单独一行“_::~RECORD::~_”分割；它分割分镜段，不分割镜头，禁止放在同一分镜段的镜头之间。
同一分镜段内镜头“时长”相加必须约等于15秒留存单元。
不能输出旧场景行“${episodeIndex}-1  日/夜  内/外  地点”，不能输出【分镜xx】、【镜头xx】标题、小说段落、剧情梗概、分镜表格、Markdown列表或导演解释。`;
}

function buildHiddenStoryPlanPrompt(scheme: Scheme, config: GenerationConfig): string {
  return `请生成内部故事结构，只供后续写作使用，不要写给用户看。

${baseSettingLines(scheme, config)}

要求：
1. 生成内部故事结构：故事介绍、世界观/年代基准、人物关系、主角缺点/癖好、反派动机、总大纲、严格按${config.episodeCount}集的分集目录。
2. ${config.outputType === 'novel' ? `每集约${targetWordCount(config)}字，按开头3行、每300字冲突、每1000字悬念和结尾追更设计。` : `每集约${targetDuration(config)}秒，按15秒留存窗口设计。`}
3. 每集都要承接上一集，不能跳剧情。
4. 小说和剧本都按短视频视觉逻辑规划，但最终格式只按用户选择输出。
5. 必须生成主线状态逻辑：主角缺什么、反派抢什么、每条关系背后的压力来源、每阶段关键状态如何变化、规则/机会/身份如何推动长线冲突。
6. 必须在内部结构里生成【主线状态表】，不展示给用户，但后续每集必须遵守。表内至少包含：人物/家庭/势力、关键关系状态、关键资源状态、关键时间点、证据编号、订单/合同状态、必要时出现的金额或数量、状态约束。
7. 主线状态表只服务内部一致性，不要求正文把每个细节都说穿；只在剧情关键处写明会影响后续连续性的数字或状态变化。若要用夸张反差开头，后续必须能补得上来源、关系或信息差解释。

${hiddenPlanNumberContinuityRules()}

${commercialPriorityRules(config)}

${plainLanguageRules(config)}

${visualHookRules(config)}

${retentionRules(config)}

${hongguoRules(config)}`;
}

function buildEpisodePrompt(scheme: Scheme, config: GenerationConfig, episodeIndex: number, previousEpisodes: Episode[], hiddenStoryPlan: string): string {
  const compressedContext = buildContextDigest(previousEpisodes);
  const previousContent = previousEpisodes.slice(-2).map((episode) => `第${episode.id}集最终内容：\n${episode.content}`).join('\n\n');
  return `只输出第${episodeIndex}集${outputTypeLabel(config)}正文，不要解释，不要输出大纲目录。

基础设定：
${baseSettingLines(scheme, config)}

内部故事结构：
${hiddenStoryPlan}

前情压缩：
${compressedContext}

前文：
${previousContent || '无'}

写作规则：
${commercialPriorityRules(config)}

${plainLanguageRules(config)}

${internalScreenplayBridgeRules(config)}

${outputRules(config)}

${episodeFormatGuard(config, episodeIndex)}

${firstThirtySecondHookRules(episodeIndex)}

${episodeContinuityAndAdRetentionRules(episodeIndex, config)}

${visualHookRules(config)}

${retentionRules(config)}

${hongguoRules(config)}

${deAiRules()}

${episodeNumberContinuityRules(previousEpisodes.length > 0)}

人物规则：
1. 主角不能完美，缺点、癖好、小恶趣味必须从情节里长出来。
2. 反派不能降智；可以搞笑，但搞笑来自性格、处境、口癖或局势反差。
3. 人物任何行动都要有欲望、压力、利益或情绪原因。
4. 主线状态逻辑必须自洽：人物做选择时要能看出收益、损失、资源筹码、关系压力或阶层压力；不能只靠“他有钱/她很惨/我要复仇”这种空话推动。
5. 关键数字和状态必须可信：正文如果主动写出收入、存款、欠款、资产、订单、嫁妆、彩礼、灵石、物价、证据编号、期限等关键数值，必须符合内部主线数字账本、年代物价或世界观规则。不要为了显得严谨把普通生活细节写成算术题；允许自然口语，也允许夸张梗开场，但禁止无来源巨款和前后状态矛盾。

开头多样性：
1. 第${episodeIndex}集开头必须避开前面几集已用过的起手方式。
2. 不要机械使用“门被推开、电话响、摔杯子、众人回头、主角冷笑、证据拍桌”这类固定模板；除非上一集结尾自然要求。
3. 开头必须从当前剧情压力里长出来，而不是为了钩子硬造动作。
4. 如果前一集结尾已经有动作，本集优先承接该动作的后果；如果前一集结尾是悬念，本集优先展示悬念造成的现场变化。`;
}

function buildContextDigest(previousEpisodes: Episode[]): string {
  if (previousEpisodes.length === 0) return '无。当前为第一集，直接用强视觉动作开局。';

  const completed = previousEpisodes.filter((episode) => episode.content.trim());
  const recent = completed.slice(-2).map((episode) => {
    const compact = episode.content
      .replace(/\s+/g, ' ')
      .slice(0, 650);
    return `第${episode.id}集：${compact}`;
  });
  const longArc = completed.map((episode) => {
    const firstLine = episode.content
      .split(/\n+/)
      .map((line) => line.trim())
      .find(Boolean) || episode.title;
    return `第${episode.id}集=${firstLine.slice(0, 80)}`;
  });
  const previousOpenings = completed.slice(-5).map((episode) => {
    const firstLines = episode.content
      .split(/\n+/)
      .map((line) => line.trim())
      .filter(Boolean)
      .slice(0, 3)
      .join(' / ');
    return `第${episode.id}集开头=${firstLines.slice(0, 160)}`;
  });

  return [
    '已发生事实链：',
    longArc.join('；'),
    '近期开头样式，下一集必须避开重复：',
    previousOpenings.join('\n') || '无',
    '最近两集原文压缩：',
    recent.join('\n'),
    '进入下一集要求：优先参考上一集最终文案、隐藏故事结构、剧情大纲和分集目录；承接上一集最后一个可见动作、未回收伏笔、人物关系变化和当前情绪，不得跳剧情。',
    '本集内部要求：每一集都要通顺连贯，因果、动机、转场、台词回应和新冲突必须接得上。',
  ].join('\n');
}

function selfCheckRepairLines(selfCheck?: SelfCheckReport): string {
  if (!selfCheck) return '';
  const failedGates = (selfCheck.gates || []).filter((gate) => !gate.passed);
  const failedMetrics = (selfCheck.weightedMetrics || [])
    .filter((metric) => metric.score < 95)
    .sort((a, b) => b.weight - a.weight);
  const gateLines = failedGates.length > 0
    ? failedGates.map((gate) => [
      `门禁失败：${gate.name}`,
      gate.issue ? `病灶：${gate.issue}` : '',
      gate.evidence ? `证据：${gate.evidence}` : '',
      gate.repairInstruction ? `定向动作：${gate.repairInstruction}` : '',
    ].filter(Boolean).join('；')).join('\n')
    : '门禁全部通过';
  const metricLines = failedMetrics.length > 0
    ? failedMetrics.map((metric) => [
      `${metric.name}（权重${metric.weight}，得分${metric.score}）`,
      metric.issue ? `病灶：${metric.issue}` : '',
      metric.evidence ? `证据：${metric.evidence}` : '',
      metric.repairInstruction ? `定向动作：${metric.repairInstruction}` : '',
    ].filter(Boolean).join('；')).join('\n')
    : '主评分项全部达到95分以上';
  const legacyFailed = selfCheck.failedDimensions || [];
  const fallbackActions = failedMetrics.length === 0 && failedGates.length === 0 ? [
    legacyFailed.includes('format') ? '旧格式项失败：只修输出类型和目标格式。' : '',
    legacyFailed.includes('story') ? '旧故事项失败：只修大纲承接、人物动机、关系和时间线。' : '',
    legacyFailed.includes('dialogue') ? '旧台词项失败：只修不自然台词，禁止热梗和口号拼贴。' : '',
    legacyFailed.includes('openingHook') || legacyFailed.includes('retentionBeats') ? '旧留存项失败：只修0-3秒钩子、15秒观看理由和结尾追更。' : '',
    legacyFailed.includes('platform') ? '旧平台项失败：只做合规改写，保留戏剧目的。' : '',
  ].filter(Boolean).join('\n') : '';

  return `本轮自检结果：
得分：${selfCheck.score}
门禁：
${gateLines}
高权重病灶：
${metricLines}
旧失败项兼容：${legacyFailed.join('、') || '无'}
问题：${selfCheck.issues.join('；') || '无'}
建议：${selfCheck.suggestions.join('；') || '无'}

定向修复指令：
${fallbackActions || '先修门禁失败；门禁通过后，严格按权重从高到低修：3秒开头/5秒播放/12秒留存/30秒完播30 > 每15秒观看理由25 > 上下文通顺连贯20 > 追更动力10 > 人物成立7 > 对话自然5 > 格式2 > 去AI味1。'}

修复边界：
1. 自检不是评价，自检是找病灶；修复不是整体润色，修复是按病灶动刀。
2. 只修门禁失败项、低于95分的高权重病灶、issues原文位置和suggestions指定位置，不要整篇重写。
3. 已通过的高权重项必须保留，禁止为了追更、格式或去AI味牺牲入口指标、15秒留存和上下文通顺连贯。
4. suggestions写了“只改哪里、保留哪里、怎么改”时，必须逐条执行，不能另起炉灶。
5. 不允许为了修一个问题引入新的格式错误、上下文断层、人物降智或台词拼贴。
6. 如果只差1-2个低权重项，做局部小修；不要推翻当前最佳版本。
7. 修复后只输出成稿，不输出修复说明。`;
}

function buildOptimizationPrompt(scheme: Scheme, config: GenerationConfig, episodeIndex: number, previousEpisodes: Episode[], hiddenStoryPlan: string, draftContent: string, selfCheck?: SelfCheckReport): string {
  const previousContent = previousEpisodes.slice(-2).map((episode) => `第${episode.id}集：\n${episode.content}`).join('\n\n');
  return `你是内部质检改写器。只输出优化后的第${episodeIndex}集${outputTypeLabel(config)}正文。

基础设定：
${baseSettingLines(scheme, config)}

内部故事结构：
${hiddenStoryPlan}

前文：
${previousContent || '无'}

待优化草稿：
${draftContent}

${commercialPriorityRules(config)}

${plainLanguageRules(config)}

${selfCheckRepairLines(selfCheck)}

${firstThirtySecondHookRules(episodeIndex)}

${episodeContinuityAndAdRetentionRules(episodeIndex, config)}

强制优化：
1. 保持输出类型不变。
2. 先修门禁项：输出类型硬格式、大纲/目录/上下集连贯、红果开启时的合规风险。
3. 门禁通过后按商业优先级修复：3秒钩子/5秒播放/12秒留存/30秒完播 > 上一集文案+目录+大纲承接 > 本集内部通顺连贯 > 追更动力 > 人物成立 > 对话自然 > 格式效率 > 去AI味。
4. 必须优先执行自检suggestions里的具体修复动作；没有被点名的问题不要主动大改。
5. 优先参考上一集最终文案、隐藏故事结构、剧情大纲和分集目录；人物动机、称呼、关系、时间线、场景信息不能断。
6. ${config.outputType === 'novel' ? `每集约${targetWordCount(config)}字，内部必须有开头3行、每300字冲突、每1000字悬念和结尾追更链。` : `每集约${targetDuration(config)}秒，内部必须有15秒留存链。`}
7. 开头必须更强，不能背景介绍起手。
8. 结尾必须逼出下一集。
9. 如果自检指出AI腔、人味不足、长段落、缺少现场对白，必须重写对应句式和画面，不允许只替换几个词。
10. 如果自检指出开头重复或模板化，必须只重写开头相关段落/场景，让它与前几集开头不同，同时保留本集主线。
11. 如果自检指出关键数字、资源或年代基准不合理，只能定向修复对应金额、来源、道具、证据、交易或人物动机；不要借机重写整集。
12. 如果第1集前30秒缺少即时损失、关系/归属断裂、误会/信息差或可见道具证据，只重写开头前30秒对应段落/第一场；保留后文已经成立的人物、冲突和结尾。
13. 红果审核开启时，风险表达要合规替换但保留刺激；不要用“删掉冲突、降级羞辱感、淡化损失”来通过审核。

${internalScreenplayBridgeRules(config)}

${episodeFormatGuard(config, episodeIndex)}

${visualHookRules(config)}

${retentionRules(config)}

${hongguoRules(config)}

${deAiRules()}`;
}

function buildTrialPackageOptimizationPrompt(
  scheme: Scheme,
  config: GenerationConfig,
  trialEpisodes: Episode[],
  hiddenStoryPlan: string,
  suggestions: string[]
): string {
  const sourceEpisodes = trialEpisodes
    .map((episode) => `【原第${episode.id}集】\n${episode.content}`)
    .join('\n\n');
  const suggestionText = suggestions.map((item, index) => `${index + 1}. ${item}`).join('\n');

  return `你是短剧前三集试播包总修编。现在不是单集润色，而是把第1-3集作为一个完整试播链路整体优化。

目标：
1. 一次性重写第1、2、3集，让三集形成连续试播包。
2. 第1集负责强入口和即时损失；第2集必须承接第1集结尾压力；第3集必须打开更大的追更变量。
3. 必须应用试播卡建议，但不要把建议原文输出给用户。
4. 允许调整三集内部信息顺序、冲突释放顺序、证据/道具出现位置、台词承接和结尾钩子。
5. 不要把三集拆成互不相干的单集优化；每一集开头都要承接上一集最终内容。
6. 输出只包含三集最终正文，不要解释、不要评分、不要清单。

基础设定：
${baseSettingLines(scheme, config)}

隐藏故事结构：
${hiddenStoryPlan}

试播卡建议：
${suggestionText || '无。'}

原前三集：
${sourceEpisodes}

${commercialPriorityRules(config)}

${plainLanguageRules(config)}

三集整体优化硬规则：
${visualHookRules(config)}

${retentionRules(config)}

${hongguoRules(config)}

${deAiRules()}

输出格式必须严格如下：
<<<EPISODE_1>>>
第1集最终正文
<<<EPISODE_2>>>
第2集最终正文
<<<EPISODE_3>>>
第3集最终正文`;
}

export async function generateHiddenStoryPlan(scheme: Scheme, config: GenerationConfig, signal?: AbortSignal): Promise<string> {
  try {
    return await callCreativeModel(
      prependPriorityPrompt(buildHiddenStoryPlanPrompt(scheme, config), config.userIdea, fixedPriority(config)),
      4200,
      0.6,
      config,
      signal,
      240000
    );
  } catch (error) {
    if (isAbortError(error)) throw error;
    return config.outputType === 'novel'
      ? `内部故事结构：围绕${scheme.coreConflict}展开，共${config.episodeCount}集；每集约${targetWordCount(config)}字，按开头3行、每300字冲突、每1000字悬念和结尾追更推进。`
      : `内部故事结构：围绕${scheme.coreConflict}展开，共${config.episodeCount}集；每集约${targetDuration(config)}秒，按15秒留存窗口推进。`;
  }
}

export async function optimizeEpisodeContent(scheme: Scheme, config: GenerationConfig, episode: Episode, previousEpisodes: Episode[], hiddenStoryPlan: string, signal?: AbortSignal, selfCheck?: SelfCheckReport): Promise<Episode> {
  try {
    const content = await callCreativeModel(
      prependPriorityPrompt(buildOptimizationPrompt(scheme, config, episode.id, previousEpisodes, hiddenStoryPlan, episode.content, selfCheck), config.userIdea, fixedPriority(config)),
      3600,
      0.35,
      config,
      signal,
      240000
    );
    return { ...parseEpisodeResponse(ensureEpisodeFormat(content || episode.content, episode.id, config), episode.id), status: 'checking' };
  } catch (error) {
    if (isAbortError(error)) throw error;
    return episode;
  }
}

export async function optimizeTrialPackageContent(
  scheme: Scheme,
  config: GenerationConfig,
  trialEpisodes: Episode[],
  hiddenStoryPlan: string,
  suggestions: string[],
  signal?: AbortSignal
): Promise<Episode[]> {
  const prompt = prependPriorityPrompt(
    buildTrialPackageOptimizationPrompt(scheme, config, trialEpisodes, hiddenStoryPlan, suggestions),
    config.userIdea,
    fixedPriority(config)
  );

  try {
    const content = await callCreativeModel(prompt, 7200, 0.45, config, signal, 240000);
    const parts = content.split(/<<<EPISODE_(?:1|2|3)>>>/).map((part) => part.trim()).filter(Boolean);
    const resolved = trialEpisodes.map((episode, index) => {
      const part = parts[index] || episode.content;
      return {
        ...parseEpisodeResponse(ensureEpisodeFormat(part, episode.id, config), episode.id),
        status: 'checking' as const,
      };
    });
    return resolved;
  } catch (error) {
    if (isAbortError(error)) throw error;
    return trialEpisodes;
  }
}

export async function generateEpisodeStream(scheme: Scheme, config: GenerationConfig, episodeIndex: number, previousEpisodes: Episode[], hiddenStoryPlan: string, onToken: (token: string) => void, signal?: AbortSignal): Promise<Episode> {
  const prompt = prependPriorityPrompt(buildEpisodePrompt(scheme, config, episodeIndex, previousEpisodes, hiddenStoryPlan), config.userIdea, fixedPriority(config));

  try {
    const content = await callAIStream(prompt, { onToken, signal }, 3200, 0.72, {
          apiBaseUrl: config.apiBaseUrl,
          apiKey: config.apiKey,
          modelName: config.modelName,
          signal,
          timeoutMs: 180000,
        });
    return parseEpisodeResponse(ensureEpisodeFormat(content, episodeIndex, config), episodeIndex);
  } catch (error) {
    if (isAbortError(error)) throw error;
    const content = await callCreativeModel(prompt, 3200, 0.72, config, signal, 240000);
    onToken(content);
    return parseEpisodeResponse(ensureEpisodeFormat(content, episodeIndex, config), episodeIndex);
  }
}

const STORYBOARD_SEGMENT_SEPARATOR = '_::~RECORD::~_';
const SHOT_BLOCK_START_PATTERN = /^机位与拍摄方向：/m;
const REQUIRED_SHOT_FIELDS = [
  '机位与拍摄方向：',
  '镜头类型&景别&运镜：',
  '动作细节：',
  '台词/对白：',
  '光影氛围：',
  '特效细节：',
  '音效：',
  '时长：',
  '【人物】：',
  '【场景】：',
  '画面：',
  '声音：',
];

function stripEpisodeHeading(content: string, episodeIndex: number): string {
  return content.replace(new RegExp(`^\\s*第${episodeIndex}集\\s*\\n*`), '').trim();
}

function normalizeStoryboardSeparators(content: string): string {
  return content
    .replace(/\(NO SRT\),?/gi, '')
    .replace(new RegExp(`\\s*${STORYBOARD_SEGMENT_SEPARATOR.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\s*`, 'g'), `\n\n${STORYBOARD_SEGMENT_SEPARATOR}\n\n`)
    .replace(/\n{3,}/g, '\n\n')
    .replace(new RegExp(`${STORYBOARD_SEGMENT_SEPARATOR}\\s*$`), '')
    .trim();
}

function hasShotProductionFormat(content: string): boolean {
  return SHOT_BLOCK_START_PATTERN.test(content)
    && REQUIRED_SHOT_FIELDS.every((field) => content.includes(field));
}

function addMissingStoryboardSeparators(content: string): string {
  const escapedSeparator = STORYBOARD_SEGMENT_SEPARATOR.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  return content
    .replace(new RegExp(`(${escapedSeparator}\\s*){2,}`, 'g'), `${STORYBOARD_SEGMENT_SEPARATOR}\n\n`)
    .trim();
}

function firstDialogueLine(content: string): string {
  const line = content
    .split(/\n+/)
    .map((item) => item.trim())
    .find((item) => /^[\u4e00-\u9fa5A-Za-z0-9_]{1,12}（[^）]+）：.+/.test(item));
  return line || '无';
}

function formatAsFallbackShot(content: string): string {
  const clean = content
    .replace(/^第\d+集\s*/m, '')
    .replace(/^\d+-\d+\s+(日|夜)\s+(内|外)\s+.+$/gm, '')
    .replace(/^人物：.+$/gm, '')
    .replace(/^【画面】/gm, '')
    .trim() || '人物在当前场景中形成可拍冲突。';
  const dialogue = firstDialogueLine(clean);
  return [
    '机位与拍摄方向：斜侧45机位',
    '镜头类型&景别&运镜：钩子开场镜头/中景/慢横摇运镜',
    `动作细节：【面部表情：人物表情清晰可见】${clean}`,
    `台词/对白：${dialogue}`,
    '光影氛围：室内暖黄柔光，人物面部明暗对比，局部阴影压暗，营造紧张氛围',
    '特效细节：无',
    '音效：现场环境声',
    '时长：6秒',
    '【人物】：待补充',
    '【场景】：待定场景',
    `画面：${clean}`,
    `声音：${dialogue === '无' ? '无' : `【对白】${dialogue}`}`,
    '',
    '机位与拍摄方向：外反拍过肩机位',
    '镜头类型&景别&运镜：正反打对话镜头/中近景/微推运镜',
    '动作细节：【面部表情：对方表情变化清晰可见】承接上镜冲突，人物做出反应，关系压力继续升级',
    '台词/对白：无',
    '光影氛围：背景压暗，焦点锁定人物反应',
    '特效细节：无',
    '音效：现场环境声、轻微衣物摩擦声',
    '时长：4秒',
    '【人物】：待补充',
    '【场景】：待定场景',
    '画面：反打人物反应，保留冲突压力和下一句台词前的停顿',
    '声音：无',
    '',
    '机位与拍摄方向：低机位仰拍',
    '镜头类型&景别&运镜：冲突强化镜头/中近景/急推运镜',
    '动作细节：【面部表情：人物情绪被推到临界点】人物向前一步，现场压力形成新的追看问题',
    '台词/对白：无',
    '光影氛围：明暗对比增强，压迫感上升',
    '特效细节：无',
    '音效：脚步声、现场低噪增强',
    '时长：5秒',
    '【人物】：待补充',
    '【场景】：待定场景',
    '画面：冲突被推到更高一级，留出下一分镜继续观看的理由',
    '声音：无',
  ].join('\n');
}

function hasStandardScreenplayFormat(content: string): boolean {
  return /第\d+集/.test(content)
    && /【场次\d+】/.test(content)
    && content.includes('人物：')
    && content.includes('画面/动作：')
    && content.includes('对白：');
}

function formatAsFallbackScreenplay(content: string, episodeIndex: number, config: GenerationConfig): string {
  const clean = content
    .replace(/^机位与拍摄方向：.*$/gm, '')
    .replace(/^镜头类型&景别&运镜：.*$/gm, '')
    .replace(new RegExp(STORYBOARD_SEGMENT_SEPARATOR.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'g'), '')
    .trim() || '人物在当前场景中形成可拍冲突。';
  const dialogue = firstDialogueLine(clean);

  return [
    `第${episodeIndex}集：《关键冲突升级》`,
    `时长：约${targetDuration(config)}秒`,
    '',
    '【场次01】核心冲突场｜日｜内',
    '人物：待补充',
    `画面/动作：${clean}`,
    '对白：',
    dialogue === '无' ? '无' : dialogue,
    '音效/转场：现场环境声，动作切到下一场。',
    '本场钩子：当前冲突没有解决，人物关系和利益压力继续升级。',
  ].join('\n');
}

export function ensureEpisodeFormat(content: string, episodeIndex: number, config: GenerationConfig): string {
  let trimmed = content.trim();
  if (config.outputType !== 'screenplay') return trimmed;
  if (isStoryboardPreset(config)) {
    trimmed = normalizeStoryboardSeparators(stripEpisodeHeading(trimmed, episodeIndex));
    if (hasShotProductionFormat(trimmed)) return addMissingStoryboardSeparators(trimmed);
    return formatAsFallbackShot(trimmed);
  }
  if (hasStandardScreenplayFormat(trimmed)) return trimmed;
  return formatAsFallbackScreenplay(trimmed, episodeIndex, config);
}

function splitIntoScenes(content: string): Scene[] {
  const isStoryboard = content.includes(STORYBOARD_SEGMENT_SEPARATOR) || hasShotProductionFormat(content);
  const parts = content.includes(STORYBOARD_SEGMENT_SEPARATOR)
    ? content.split(STORYBOARD_SEGMENT_SEPARATOR)
    : /【场次\d+】/.test(content)
      ? content.split(/(?=【场次\d+】)/)
      : content.split(/\n\s*\n/);
  return parts
    .map((part) => part.trim())
    .filter(Boolean)
    .slice(0, 80)
    .map((content, index) => ({
      id: index + 1,
      title: `${isStoryboard ? '分镜段' : '场次'} ${index + 1}`,
      content,
    }));
}

export function parseEpisodeResponse(content: string, episodeIndex: number): Episode {
  const trimmed = content.trim();
  return {
    id: episodeIndex,
    title: `第${episodeIndex}集`,
    content: trimmed,
    scenes: splitIntoScenes(trimmed),
    status: 'checking',
  };
}

export async function generateScriptAI(scheme: Scheme, config: GenerationConfig): Promise<Script> {
  const hiddenStoryPlan = await generateHiddenStoryPlan(scheme, config);
  const episode = await generateEpisodeStream(scheme, config, 1, [], hiddenStoryPlan, () => undefined);
  return {
    title: scheme.name,
    scenes: episode.scenes,
    episodes: [{ ...episode, status: 'passed' }],
    totalLength: `1集 / ${episode.scenes.length}段 / 约${episode.content.length}字`,
  };
}
