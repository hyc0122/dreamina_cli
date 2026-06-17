from pathlib import Path

from fastapi.testclient import TestClient

import backend.app.jimeng_api as jimeng_api
from backend.app.jimeng_prompting import render_prompt_preset
from backend.app.jimeng_storage import JimengStore
from backend.app.main import app


def test_style_preset_prompt_replaces_style_variable(tmp_path: Path):
    store = JimengStore(db_path=tmp_path / "jimeng.sqlite3", output_root=tmp_path / "output")
    store.create_style_preset("国风3Q", "国风三头身，水墨光影，角色比例稳定", scope="video")
    store.create_style_preset("国风3Q资产", "白底国风角色设定图", scope="image")
    project = store.create_project("项目 A", style="国风3Q")
    shot = store.create_shot(project.id, "角色走进院子")

    rendered = render_prompt_preset(
        template="风格：{{style}}。镜头：{{shot_prompt}}",
        project=project,
        shot=shot,
        bindings=[],
        assets=[],
        style_prompt=store.style_prompt_for(project.style, scope="video"),
    )

    assert "国风三头身，水墨光影，角色比例稳定" in rendered.prefix_prompt
    assert "国风3Q。" not in rendered.prefix_prompt
    assert rendered.final_prompt.count("角色走进院子") == 1
    assert store.style_prompt_for("国风3Q资产", scope="image") == "白底国风角色设定图"
    assert store.style_prompt_for("国风3Q资产", scope="video") == "国风3Q资产"


def test_style_preset_api_crud_and_project_style_name(tmp_path: Path):
    store = JimengStore(db_path=tmp_path / "jimeng.sqlite3", output_root=tmp_path / "output")
    jimeng_api.set_jimeng_store_for_tests(store)
    try:
        client = TestClient(app)

        created = client.post(
            "/jimeng/style_presets",
            json={"name": "电影写实", "prompt": "真实电影摄影，克制光影，人物自然", "scope": "video", "accent": "#6478ff"},
        )
        assert created.status_code == 200
        preset = created.json()
        assert preset["name"] == "电影写实"
        assert preset["prompt"] == "真实电影摄影，克制光影，人物自然"
        assert preset["scope"] == "video"
        assert preset["accent"] == "#6478ff"

        project_response = client.post(
            "/jimeng/projects",
            json={"name": "项目 A", "style": "电影写实"},
        )
        assert project_response.status_code == 200
        assert project_response.json()["style"] == "电影写实"

        updated = client.put(
            f"/jimeng/style_presets/{preset['id']}",
            json={"name": "电影感写实", "prompt": "写实短剧电影感，浅景深，真实布光", "accent": "#25c2a0"},
        )
        assert updated.status_code == 200
        assert updated.json()["name"] == "电影感写实"
        assert updated.json()["accent"] == "#25c2a0"

        listed = client.get("/jimeng/style_presets", params={"scope": "video"})
        assert listed.status_code == 200
        assert any(item["name"] == "电影感写实" for item in listed.json())

        image_created = client.post(
            "/jimeng/style_presets",
            json={"name": "资产真人", "prompt": "真实商品摄影资产图", "scope": "image"},
        )
        assert image_created.status_code == 200
        image_listed = client.get("/jimeng/style_presets", params={"scope": "image"})
        assert image_listed.status_code == 200
        assert any(item["name"] == "资产真人" for item in image_listed.json())
        assert all(item["scope"] == "image" for item in image_listed.json())

        deleted = client.delete(f"/jimeng/style_presets/{preset['id']}")
        assert deleted.status_code == 200
    finally:
        jimeng_api.reset_jimeng_store_for_tests()
