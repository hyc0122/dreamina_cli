from pathlib import Path

from backend.app.jimeng_models import JimengAssetType
from backend.app.jimeng_storage import JimengStore


def test_queue_snapshot_omits_disabled_character_voice(tmp_path: Path):
    store = JimengStore(db_path=tmp_path / "jimeng.sqlite3", output_root=tmp_path / "output")
    project = store.create_project("Project A")
    shot = store.create_shot(project.id, "Shot prompt")
    asset = store.create_asset(project.id, JimengAssetType.character, "Hero")
    asset = store.upsert_asset_file(project.id, JimengAssetType.character, asset.name, Path("Hero.mp3"), "audio", content=b"voice")
    binding = store.create_binding(project.id, shot.id, asset.id, JimengAssetType.character, source="manual", locked=True)

    store.update_binding(binding.id, voice_enabled=False)
    item = store.create_queue_item(project_id=project.id, shot_id=shot.id, final_prompt_snapshot="final prompt")

    assert item.asset_snapshot["characters"][0]["name"] == "Hero"
    assert item.asset_snapshot["characters"][0]["audio_path"] is None
