import re
from dataclasses import dataclass
from typing import Iterable

from .jimeng_models import JimengAsset, JimengAssetBinding, JimengAssetType, JimengProject, JimengShot


VARIABLE_RE = re.compile(r"\{\{\s*([A-Za-z_][A-Za-z0-9_]*)\s*\}\}")


@dataclass(frozen=True)
class RenderedJimengPrompt:
    prefix_prompt: str
    final_prompt: str
    unresolved_variables: list[str]


def render_prompt_preset(
    template: str,
    project: JimengProject,
    shot: JimengShot,
    bindings: Iterable[JimengAssetBinding],
    assets: Iterable[JimengAsset],
    camera: str = "",
    era: str = "",
    style_prompt: str | None = None,
) -> RenderedJimengPrompt:
    asset_by_id = {asset.id: asset for asset in assets}
    ordered_bindings = sorted(bindings, key=lambda binding: binding.slot_order)
    names_by_type = {
        JimengAssetType.character: [],
        JimengAssetType.scene: [],
        JimengAssetType.prop: [],
    }

    for binding in ordered_bindings:
        asset = asset_by_id.get(binding.asset_id)
        if asset is None:
            continue
        names_by_type[binding.asset_type].append(asset.name)

    values = {
        "style": style_prompt if style_prompt is not None else project.style,
        "camera": camera,
        "era": era,
        "roles": "、".join(names_by_type[JimengAssetType.character]),
        "scene": "、".join(names_by_type[JimengAssetType.scene]),
        "props": "、".join(names_by_type[JimengAssetType.prop]),
        "shot_prompt": shot.prompt,
    }
    unresolved: set[str] = set()

    def replace_variable(match: re.Match[str]) -> str:
        key = match.group(1)
        if key not in values:
            unresolved.add(key)
            return match.group(0)
        return values[key]

    template_text = template or ""
    contains_shot_prompt = any(match.group(1) == "shot_prompt" for match in VARIABLE_RE.finditer(template_text))
    prefix_prompt = VARIABLE_RE.sub(replace_variable, template_text).strip()
    final_prompt = prefix_prompt if contains_shot_prompt else (f"{prefix_prompt}\n\n{shot.prompt}" if prefix_prompt else shot.prompt)

    return RenderedJimengPrompt(
        prefix_prompt=prefix_prompt,
        final_prompt=final_prompt,
        unresolved_variables=sorted(unresolved),
    )
