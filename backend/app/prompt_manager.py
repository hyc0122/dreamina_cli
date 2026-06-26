"""独立的提示词模板管理存储。

这个模块不复用漫剧项目库里的 prompt_presets，避免提示词管理工具和生产项目数据混在一起。
"""

from __future__ import annotations

import json
import sqlite3
import uuid
from datetime import datetime, timezone
from pathlib import Path
from typing import Any


PROMPT_TEMPLATE_TYPES: tuple[dict[str, str], ...] = (
    {"category": "video", "type": "prompt_reasoning", "name": "提示词推理模板"},
    {"category": "video", "type": "story_plot", "name": "故事情节模板"},
    {"category": "video", "type": "character_extract", "name": "角色提取模板"},
    {"category": "video", "type": "scene_extract", "name": "场景提取模板"},
    {"category": "video", "type": "prop_extract", "name": "物品提取模板"},
    {"category": "video", "type": "shot_adjust", "name": "分镜调整模板"},
    {"category": "creative", "type": "novel_to_storyboard", "name": "小说转分镜提示词"},
)


PROMPT_REASONING_TEMPLATE = """## 输入信息

**故事情节：**
{{故事情节}}

**推文文案：**
{{推文文案}}

**角色信息库 (用于映射)：**
{{角色信息}}

**场景信息库 (用于映射，每个视频提示词只能出现一个场景,没有场景信息内出现的不需要映射)：**
{{场景信息}}

**物品信息库 (用于映射，每个视频提示词只能出现物品提示词内已有的信息,没有在物品信息内出现的不需要映射)：**
{{物品信息}}

## 输入文案规则
输入文案是台词唯一来源，图片提示词和视频提示词必须十分符合当前输入文案，并且需要有绝对的连贯性。
提示词 (prompt) 和视频提示词 (video_prompt) 都严格限定在提供的【输入文案】的信息范围之内，绝不进行任何超出原文的联想或创造。

## 输入文案
{{输入文案}}

## 任务指令：即梦 2.0 注释专家版
你是一位精通即梦 2.0 的高级视频分镜架构师。请将输入文案实现为具有冲击力的视觉和解说词。

## 输出格式
请严格按照自定义格式输出，使用 === 作为字段分隔符，第一部分为图片提示词 prompt，第二部分为视频提示词 video_prompt。
输出头部固定为 _::~OUTPUT_START::~_，尾部固定为 _::~OUTPUT_END::~_。
角色、场景、物品使用原名，并在前面加入 @ 符号；台词前写明参考人物音色，并在音色前加入 @ 符号。
"""


SHOT_ADJUST_TEMPLATE = """你是一位资深的视频分镜规划专家。请基于以下信息进行智能分镜调整：

## 故事情节
{{故事情节}}

## 分镜进度
总分镜数：{{总分镜数}}
当前分镜数：{{当前分镜数}}

## 待调整文案
{{单条输入文案}}
{{单条输入文案}}
{{单条输入文案}}
{{单条输入文案}}
{{单条输入文案}}
{{单条输入文案}}
{{单条输入文案}}
{{单条输入文案}}
{{单条输入文案}}
{{单条输入文案}}
{{单条输入文案}}
{{单条输入文案}}

## 分镜调整原则
1. 语义连贯性：将表达同一场景、动作或情感的文案归为同一分镜
2. 前后一致性：待调整文案的前后顺序不发生改变
3. 视觉节奏：考虑视频的视觉节奏，避免单个分镜过长或过短
4. 渐进式分配：视频开头部分的分镜可以包含更多文案行，体现丰富性
5. 内容完整性：确保每个分镜都能独立表达一个完整的画面或情节片段
6. 数据完整性：确保每一条输入文案都在输出中归属于某个分镜

## 输出要求
请返回 JSON 格式的分镜划分结果，包含 scene_index、text_lines、reasoning 字段。
每条待调整文案都要一对一对应 text_lines 中的序号顺序输出，不能多，不能漏。
"""


DEFAULT_TEMPLATE_CONTENT: dict[str, str] = {
    "prompt_reasoning": PROMPT_REASONING_TEMPLATE,
    "story_plot": "你是专业短剧故事策划，请根据 {{小说原文}} 和 {{推文文案}} 输出故事情节梗概，保留冲突、反转和人物动机。",
    "character_extract": "根据 {{小说原文}}、{{推文文案}}、{{故事情节}} 提取人物 JSON 数组，每个人物包含 name、aliases、description。",
    "scene_extract": "根据 {{小说原文}}、{{推文文案}}、{{故事情节}} 提取场景 JSON 数组，每个场景包含 name、aliases、description。",
    "prop_extract": "根据 {{小说原文}}、{{推文文案}}、{{故事情节}} 提取重要物品 JSON 数组，每个物品包含 name、aliases、description。",
    "shot_adjust": SHOT_ADJUST_TEMPLATE,
    "novel_to_storyboard": "请将 {{小说原文}} 改写为适合漫剧制作的分镜文本，保留人物、场景、台词和推荐时长。",
}


DEFAULT_VARIABLES: dict[str, list[str]] = {
    "prompt_reasoning": ["{{故事情节}}", "{{推文文案}}", "{{角色信息}}", "{{场景信息}}", "{{物品信息}}", "{{输入文案}}"],
    "story_plot": ["{{小说原文}}", "{{推文文案}}"],
    "character_extract": ["{{小说原文}}", "{{推文文案}}", "{{故事情节}}"],
    "scene_extract": ["{{小说原文}}", "{{推文文案}}", "{{故事情节}}"],
    "prop_extract": ["{{小说原文}}", "{{推文文案}}", "{{故事情节}}"],
    "shot_adjust": ["{{故事情节}}", "{{总分镜数}}", "{{当前分镜数}}", "{{单条输入文案}}"],
    "novel_to_storyboard": ["{{小说原文}}"],
}


def _now_iso() -> str:
    return datetime.now(timezone.utc).isoformat()


def _row_to_dict(row: sqlite3.Row) -> dict[str, Any]:
    item = dict(row)
    try:
        item["variables"] = json.loads(str(item.get("variables_json") or "[]"))
    except json.JSONDecodeError:
        item["variables"] = []
    item.pop("variables_json", None)
    return item


class PromptManagerStore:
    """提示词管理独立 SQLite 存储。"""

    def __init__(self, runtime_data_dir: str | Path):
        self.runtime_data_dir = Path(runtime_data_dir)
        self.db_path = self.runtime_data_dir / "prompt_manager" / "prompt_manager.sqlite3"
        self.db_path.parent.mkdir(parents=True, exist_ok=True)
        self._init_db()

    def _connect(self) -> sqlite3.Connection:
        conn = sqlite3.connect(self.db_path)
        conn.row_factory = sqlite3.Row
        return conn

    def _init_db(self) -> None:
        with self._connect() as conn:
            conn.execute(
                """
                CREATE TABLE IF NOT EXISTS prompt_templates (
                    id TEXT PRIMARY KEY,
                    category TEXT NOT NULL,
                    type TEXT NOT NULL,
                    source TEXT NOT NULL,
                    name TEXT NOT NULL,
                    content_separator TEXT NOT NULL DEFAULT '',
                    record_separator TEXT NOT NULL DEFAULT '',
                    output_start TEXT NOT NULL DEFAULT '',
                    output_end TEXT NOT NULL DEFAULT '',
                    sop_prompt TEXT NOT NULL DEFAULT '',
                    content TEXT NOT NULL DEFAULT '',
                    variables_json TEXT NOT NULL DEFAULT '[]',
                    enabled INTEGER NOT NULL DEFAULT 1,
                    created_at TEXT NOT NULL,
                    updated_at TEXT NOT NULL
                )
                """
            )
            conn.execute("CREATE INDEX IF NOT EXISTS idx_prompt_templates_type ON prompt_templates(type, source, name)")
            self._seed_official_templates(conn)

    def _seed_official_templates(self, conn: sqlite3.Connection) -> None:
        stamp = _now_iso()
        for config in PROMPT_TEMPLATE_TYPES:
            template_type = config["type"]
            template_id = f"official_{template_type}"
            exists = conn.execute("SELECT 1 FROM prompt_templates WHERE id = ?", (template_id,)).fetchone()
            if exists:
                continue
            conn.execute(
                """
                INSERT INTO prompt_templates (
                    id, category, type, source, name, content_separator, record_separator,
                    output_start, output_end, sop_prompt, content, variables_json,
                    enabled, created_at, updated_at
                ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 1, ?, ?)
                """,
                (
                    template_id,
                    config["category"],
                    template_type,
                    "official",
                    config["name"],
                    "_::~FIELD::~_",
                    "_::~RECORD::~_",
                    "_::~OUTPUT_START::~_",
                    "_::~OUTPUT_END::~_",
                    "",
                    DEFAULT_TEMPLATE_CONTENT.get(template_type, ""),
                    json.dumps(DEFAULT_VARIABLES.get(template_type, []), ensure_ascii=False),
                    stamp,
                    stamp,
                ),
            )

    def list_templates(self, type: str | None = None, category: str | None = None) -> list[dict[str, Any]]:
        clauses: list[str] = []
        params: list[str] = []
        if type:
            clauses.append("type = ?")
            params.append(type)
        if category:
            clauses.append("category = ?")
            params.append(category)
        where_sql = f"WHERE {' AND '.join(clauses)}" if clauses else ""
        with self._connect() as conn:
            rows = conn.execute(
                f"""
                SELECT * FROM prompt_templates
                {where_sql}
                ORDER BY
                    CASE source WHEN 'official' THEN 0 WHEN 'user' THEN 1 WHEN 'vip' THEN 2 ELSE 3 END,
                    created_at ASC
                """,
                params,
            ).fetchall()
        return [_row_to_dict(row) for row in rows]

    def get_template(self, template_id: str) -> dict[str, Any]:
        with self._connect() as conn:
            row = conn.execute("SELECT * FROM prompt_templates WHERE id = ?", (template_id,)).fetchone()
        if row is None:
            raise KeyError(template_id)
        return _row_to_dict(row)

    def create_template(
        self,
        *,
        category: str,
        type: str,
        name: str,
        content: str = "",
        content_separator: str = "",
        record_separator: str = "",
        output_start: str = "",
        output_end: str = "",
        sop_prompt: str = "",
        variables: list[str] | None = None,
        source: str = "user",
    ) -> dict[str, Any]:
        if source != "user":
            raise ValueError("只能新建用户模板")
        stamp = _now_iso()
        template_id = uuid.uuid4().hex
        final_name = self._unique_name(category=category, type=type, desired_name=name or "未命名模板")
        with self._connect() as conn:
            conn.execute(
                """
                INSERT INTO prompt_templates (
                    id, category, type, source, name, content_separator, record_separator,
                    output_start, output_end, sop_prompt, content, variables_json,
                    enabled, created_at, updated_at
                ) VALUES (?, ?, ?, 'user', ?, ?, ?, ?, ?, ?, ?, ?, 1, ?, ?)
                """,
                (
                    template_id,
                    category,
                    type,
                    final_name,
                    content_separator,
                    record_separator,
                    output_start,
                    output_end,
                    sop_prompt,
                    content,
                    json.dumps(variables or [], ensure_ascii=False),
                    stamp,
                    stamp,
                ),
            )
        return self.get_template(template_id)

    def update_template(self, template_id: str, **updates: Any) -> dict[str, Any]:
        current = self.get_template(template_id)
        if current["source"] != "user":
            raise ValueError("官方模板不可修改")

        allowed = {
            "name",
            "content_separator",
            "record_separator",
            "output_start",
            "output_end",
            "sop_prompt",
            "content",
            "enabled",
        }
        values: dict[str, Any] = {key: value for key, value in updates.items() if key in allowed and value is not None}
        if "variables" in updates and updates["variables"] is not None:
            values["variables_json"] = json.dumps(list(updates["variables"]), ensure_ascii=False)
        if not values:
            return current

        values["updated_at"] = _now_iso()
        assignments = ", ".join(f"{key} = ?" for key in values)
        with self._connect() as conn:
            conn.execute(f"UPDATE prompt_templates SET {assignments} WHERE id = ?", (*values.values(), template_id))
        return self.get_template(template_id)

    def delete_template(self, template_id: str) -> dict[str, str]:
        current = self.get_template(template_id)
        if current["source"] != "user":
            raise ValueError("官方模板不可删除")
        with self._connect() as conn:
            conn.execute("DELETE FROM prompt_templates WHERE id = ?", (template_id,))
        return {"deleted": template_id}

    def duplicate_template(self, template_id: str) -> dict[str, Any]:
        current = self.get_template(template_id)
        return self.create_template(
            category=current["category"],
            type=current["type"],
            name=current["name"],
            content=current["content"],
            content_separator=current["content_separator"],
            record_separator=current["record_separator"],
            output_start=current["output_start"],
            output_end=current["output_end"],
            sop_prompt=current["sop_prompt"],
            variables=current.get("variables") or [],
        )

    def build_full_prompt(self, template_id: str) -> str:
        template = self.get_template(template_id)
        parts = [
            ("内容分隔符", template.get("content_separator")),
            ("记录分隔符", template.get("record_separator")),
            ("输出开始符", template.get("output_start")),
            ("输出结束符", template.get("output_end")),
            ("大模型 SOP", template.get("sop_prompt")),
            ("模板内容", template.get("content")),
        ]
        return "\n\n".join(f"## {title}\n{value}" for title, value in parts if str(value or "").strip()).strip()

    def _unique_name(self, *, category: str, type: str, desired_name: str) -> str:
        base = desired_name.strip() or "未命名模板"
        with self._connect() as conn:
            rows = conn.execute(
                "SELECT name FROM prompt_templates WHERE category = ? AND type = ?",
                (category, type),
            ).fetchall()
        existing = {str(row["name"]) for row in rows}
        if base not in existing:
            return base
        index = 2
        while f"{base} {index}" in existing:
            index += 1
        return f"{base} {index}"
