from pathlib import Path

from backend.app.jimeng_cli import DreaminaTaskResult
from backend.app.jimeng_models import JimengAssetType
from backend.app.jimeng_queue import JimengQueueWorker
from backend.app.jimeng_storage import JimengStore


class RecordingCli:
    def __init__(self):
        self.text2video_calls = []

    def submit_text2video(self, **kwargs):
        self.text2video_calls.append(kwargs)
        return DreaminaTaskResult(submit_id="submit-1", gen_status="running", raw_output="queued")

    def query_result(self, submit_id, download_dir):
        return DreaminaTaskResult(submit_id=submit_id, gen_status="running", raw_output="still running")


def test_queue_worker_uses_queue_item_generation_settings(tmp_path: Path):
    store = JimengStore(db_path=tmp_path / "jimeng.sqlite3", output_root=tmp_path / "output")
    project = store.create_project("项目 A")
    shot = store.create_shot(project.id, "镜头提示词")
    item = store.create_queue_item(
        project_id=project.id,
        shot_id=shot.id,
        final_prompt_snapshot="最终提示词",
        poll_seconds=7,
        asset_snapshot={
            "generation_settings": {
                "model_version": "seedance2.0mini",
                "duration": 8,
                "ratio": "16:9",
                "video_resolution": "1080p",
            }
        },
    )
    cli = RecordingCli()
    worker = JimengQueueWorker(
        store=store,
        cli=cli,
        poll_seconds=30,
        duration=5,
        ratio="9:16",
        video_resolution="720p",
        model_version="seedance2.0fast",
    )

    processed = worker.start(max_items=1)

    assert processed[0].id == item.id
    assert cli.text2video_calls == [
        {
            "prompt": "最终提示词",
            "duration": 8,
            "ratio": "16:9",
            "video_resolution": "1080p",
            "poll_seconds": 7,
            "model_version": "seedance2.0mini",
        }
    ]
    refreshed = store.get_queue_item(item.id)
    assert refreshed.poll_seconds == 7
    assert "--model_version seedance2.0mini" in refreshed.cli_command


def test_queue_item_merges_generation_settings_with_asset_snapshot(tmp_path: Path):
    store = JimengStore(db_path=tmp_path / "jimeng.sqlite3", output_root=tmp_path / "output")
    project = store.create_project("项目 A")
    shot = store.create_shot(project.id, "镜头提示词")
    asset = store.create_asset(project.id, JimengAssetType.character, "许禾")
    store.create_binding(project.id, shot.id, asset.id, JimengAssetType.character, source="manual", locked=True)

    item = store.create_queue_item(
        project_id=project.id,
        shot_id=shot.id,
        final_prompt_snapshot="最终提示词",
        asset_snapshot={"generation_settings": {"model_version": "seedance2.0mini"}},
    )

    assert item.asset_snapshot["generation_settings"]["model_version"] == "seedance2.0mini"
    assert item.asset_snapshot["characters"][0]["name"] == "许禾"
    assert item.asset_snapshot["scenes"] == []
    assert item.asset_snapshot["props"] == []
