import type {
  PromptManagerCategory,
  PromptManagerTemplateSource,
  PromptManagerTemplateType,
} from "@/lib/jimengApi";

export interface PromptManagerTemplateTypeItem {
  type: PromptManagerTemplateType;
  category: PromptManagerCategory;
  label: string;
  description: string;
  variables: string[];
}

export interface PromptManagerGroup {
  category: PromptManagerCategory;
  title: string;
  items: PromptManagerTemplateTypeItem[];
}

export const PROMPT_MANAGER_GROUPS: PromptManagerGroup[] = [
  {
    category: "video",
    title: "视频创作提示词",
    items: [
      {
        type: "prompt_reasoning",
        category: "video",
        label: "提示词推理模板",
        description: "用于把故事、角色、场景和物品信息推理成视频生成提示词。",
        variables: ["{{故事情节}}", "{{推文文案}}", "{{角色信息}}", "{{场景信息}}", "{{物品信息}}", "{{输入文案}}"],
      },
      {
        type: "story_plot",
        category: "video",
        label: "故事情节模板",
        description: "用于抽取故事情节、冲突和关键剧情节点。",
        variables: ["{{小说原文}}", "{{推文文案}}"],
      },
      {
        type: "character_extract",
        category: "video",
        label: "角色提取模板",
        description: "用于从小说、推文或故事情节中提取角色设定。",
        variables: ["{{小说原文}}", "{{推文文案}}", "{{故事情节}}"],
      },
      {
        type: "scene_extract",
        category: "video",
        label: "场景提取模板",
        description: "用于提取场景名称、别名和场景描述。",
        variables: ["{{小说原文}}", "{{推文文案}}", "{{故事情节}}"],
      },
      {
        type: "prop_extract",
        category: "video",
        label: "物品提取模板",
        description: "用于提取道具、装备、信物和关键物品。",
        variables: ["{{小说原文}}", "{{推文文案}}", "{{故事情节}}"],
      },
      {
        type: "shot_adjust",
        category: "video",
        label: "分镜调整模板",
        description: "用于按故事情节、时长和上下文调整分镜文案。",
        variables: ["{{故事情节}}", "{{总分镜数}}", "{{当前分镜数}}", "{{单条输入文案}}", "{{前面文案}}", "{{后面文案}}"],
      },
    ],
  },
  {
    category: "creative",
    title: "创作作品提示词",
    items: [
      {
        type: "novel_to_storyboard",
        category: "creative",
        label: "小说转分镜提示词",
        description: "用于把小说或推文转换成可导入漫剧制作的分镜文本。",
        variables: ["{{输入文案}}", "{{小说原文}}", "{{推文文案}}"],
      },
    ],
  },
];

export const PROMPT_MANAGER_SOURCE_META: Record<
  PromptManagerTemplateSource,
  { label: string; className: string; badgeClassName: string }
> = {
  official: {
    label: "官方模板",
    className: "border-primary/25 bg-primary/10 text-primary",
    badgeClassName: "bg-primary/15 text-primary border-primary/30",
  },
  user: {
    label: "用户模板",
    className: "border-emerald-400/25 bg-emerald-500/10 text-emerald-300",
    badgeClassName: "bg-emerald-500/15 text-emerald-300 border-emerald-400/30",
  },
  vip: {
    label: "VIP模板",
    className: "border-amber-400/25 bg-amber-500/10 text-amber-300",
    badgeClassName: "bg-amber-500/15 text-amber-300 border-amber-400/30",
  },
};

export const PROMPT_SEPARATOR_OPTIONS = {
  content_separator: ["===", "_::~FIELD::~_", "---", "###", "自定义"],
  record_separator: ["_::~RECORD::~_", "_::~RECORD::~_s", "---RECORD---", "### RECORD", "自定义"],
  output_start: ["_::~OUTPUT_START::~_", ":::OUTPUT_START:::", "BEGIN_OUTPUT", "自定义"],
  output_end: ["_::~OUTPUT_END::~_", "_::~OUTPUT_END::~_s", ":::OUTPUT_END:::", "END_OUTPUT", "自定义"],
};

export const getPromptManagerTemplateTypeItem = (type: PromptManagerTemplateType): PromptManagerTemplateTypeItem =>
  PROMPT_MANAGER_GROUPS.flatMap((group) => group.items).find((item) => item.type === type) ?? PROMPT_MANAGER_GROUPS[0].items[0];
