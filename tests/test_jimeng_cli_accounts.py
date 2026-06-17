from pathlib import Path

from backend.app.jimeng_cli import DreaminaTaskResult
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


def test_store_creates_cli_account_with_isolated_profile_dir(tmp_path: Path):
    store = JimengStore(db_path=tmp_path / "jimeng.sqlite3", output_root=tmp_path / "output")

    account = store.create_cli_account("主账号")

    assert account.label == "主账号"
    assert account.is_default is True
    assert Path(account.profile_dir).is_dir()
    assert Path(account.profile_dir).is_relative_to(tmp_path / "output")
    assert store.list_cli_accounts()[0].id == account.id


def test_queue_worker_uses_account_specific_cli_factory(tmp_path: Path):
    store = JimengStore(db_path=tmp_path / "jimeng.sqlite3", output_root=tmp_path / "output")
    project = store.create_project("项目 A")
    shot = store.create_shot(project.id, "镜头提示词")
    cli_by_account = {"account-1": RecordingCli()}
    requested_accounts = []
    item = store.create_queue_item(
        project_id=project.id,
        shot_id=shot.id,
        final_prompt_snapshot="最终提示词",
        asset_snapshot={"generation_settings": {"account_id": "account-1"}},
    )

    def cli_factory(account_id):
        requested_accounts.append(account_id)
        return cli_by_account[account_id]

    worker = JimengQueueWorker(
        store=store,
        cli=RecordingCli(),
        cli_factory=cli_factory,
        poll_seconds=30,
        duration=5,
        ratio="9:16",
        video_resolution="720p",
        model_version="seedance2.0fast",
    )

    processed = worker.start(max_items=1)

    assert processed[0].id == item.id
    assert requested_accounts == ["account-1", "account-1"]
    assert cli_by_account["account-1"].text2video_calls[0]["prompt"] == "最终提示词"
