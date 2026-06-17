from pathlib import Path

from backend.app.jimeng_storage import JimengStore
import backend.app.jimeng_api as jimeng_api


def test_store_updates_shot_default_duration(tmp_path: Path):
    store = JimengStore(db_path=tmp_path / "jimeng.sqlite3", output_root=tmp_path / "output")
    project = store.create_project("项目 A")
    shot = store.create_shot(project.id, "镜头时长 8 秒，人物走入画面")

    updated = store.update_shot(shot.id, default_duration=8)

    assert updated.default_duration == 8


def test_detect_duration_from_chinese_prompt(tmp_path: Path):
    store = JimengStore(db_path=tmp_path / "jimeng.sqlite3", output_root=tmp_path / "output")
    jimeng_api.set_jimeng_store_for_tests(store)
    try:
        project = store.create_project("项目 A")
        shot = store.create_shot(project.id, "总时长：12秒。夜雨中，镜头慢慢推近。")

        response = jimeng_api.detect_shot_duration(project.id, shot.id)

        assert response["duration"] == 12
        assert response["shot"]["default_duration"] == 12
    finally:
        jimeng_api.reset_jimeng_store_for_tests()


def test_batch_detect_project_durations_updates_only_detectable_shots(tmp_path: Path):
    store = JimengStore(db_path=tmp_path / "jimeng.sqlite3", output_root=tmp_path / "output")
    jimeng_api.set_jimeng_store_for_tests(store)
    try:
        project = store.create_project("项目 A")
        first = store.create_shot(project.id, "开场，时长 6 秒，镜头推进。")
        second = store.create_shot(project.id, "没有时长描述，只写画面。")
        third = store.create_shot(project.id, "duration: 9s, 人物转身。")

        response = jimeng_api.batch_detect_project_durations(project.id)

        assert response["updated_count"] == 2
        assert response["skipped_count"] == 1
        durations = {item["shot_id"]: item["duration"] for item in response["results"]}
        assert durations[first.id] == 6
        assert durations[second.id] is None
        assert durations[third.id] == 9
        assert store.get_shot(first.id).default_duration == 6
        assert store.get_shot(second.id).default_duration is None
        assert store.get_shot(third.id).default_duration == 9
    finally:
        jimeng_api.reset_jimeng_store_for_tests()
