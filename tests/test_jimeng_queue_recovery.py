from pathlib import Path

from backend.app.jimeng_cli import DreaminaTaskResult
from backend.app.jimeng_models import JimengQueueStatus
from backend.app.jimeng_queue import JimengQueueWorker
from backend.app.jimeng_storage import JimengStore


class PollingCli:
    def __init__(self):
        self.queries = []

    def query_result(self, submit_id, download_dir):
        self.queries.append((submit_id, str(download_dir)))
        return DreaminaTaskResult(submit_id=submit_id, gen_status="running", raw_output="still running")


def _queue_item(store: JimengStore):
    project = store.create_project("项目 A")
    shot = store.create_shot(project.id, "镜头提示词")
    return store.create_queue_item(project_id=project.id, shot_id=shot.id, final_prompt_snapshot="最终提示词")


def test_queue_recovery_moves_running_item_with_submit_id_to_polling(tmp_path: Path):
    store = JimengStore(db_path=tmp_path / "jimeng.sqlite3", output_root=tmp_path / "output")
    item = _queue_item(store)
    store.update_queue_item(item.id, status=JimengQueueStatus.running, submit_id="submit-123")
    worker = JimengQueueWorker(store=store, cli=PollingCli())

    recovered = worker.recover_interrupted_items()

    assert recovered["polling"] == [item.id]
    assert store.get_queue_item(item.id).status == JimengQueueStatus.polling


def test_queue_recovery_marks_running_item_without_submit_id_as_orphaned(tmp_path: Path):
    store = JimengStore(db_path=tmp_path / "jimeng.sqlite3", output_root=tmp_path / "output")
    item = _queue_item(store)
    store.update_queue_item(item.id, status=JimengQueueStatus.running)
    worker = JimengQueueWorker(store=store, cli=PollingCli())

    recovered = worker.recover_interrupted_items()

    refreshed = store.get_queue_item(item.id)
    assert recovered["orphaned"] == [item.id]
    assert refreshed.status == JimengQueueStatus.orphaned
    assert "程序上次关闭时任务尚未提交成功" in (refreshed.error_message or "")
