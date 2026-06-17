from pathlib import Path

from fastapi.testclient import TestClient

from backend.app.jimeng_models import JimengAssetType
from backend.app.jimeng_storage import JimengStore
from backend.app.main import app
import backend.app.jimeng_api as jimeng_api


def _store(tmp_path: Path) -> JimengStore:
    return JimengStore(db_path=tmp_path / "jimeng.sqlite3", output_root=tmp_path / "output")


def test_delete_bound_asset_reports_bound_shot_indexes(tmp_path: Path):
    store = _store(tmp_path)
    jimeng_api.set_jimeng_store_for_tests(store)
    try:
        project = store.create_project("项目 A")
        shot = store.create_shot(project.id, "分镜提示词")
        asset = store.create_asset(
            project.id,
            JimengAssetType.character,
            "许禾",
            [],
            "角色描述",
            "dreamina4.0",
            "16:9",
            "",
            "",
        )
        store.create_binding(project.id, shot.id, asset.id, JimengAssetType.character, "manual")

        response = TestClient(app).delete(f"/jimeng/projects/{project.id}/assets/{asset.id}")

        assert response.status_code == 400
        assert "许禾" in response.json()["detail"]
        assert "分镜1" in response.json()["detail"]
        assert store._get_asset(asset.id).id == asset.id
    finally:
        jimeng_api.reset_jimeng_store_for_tests()


def test_batch_delete_assets_is_all_or_nothing_when_any_asset_is_bound(tmp_path: Path):
    store = _store(tmp_path)
    jimeng_api.set_jimeng_store_for_tests(store)
    try:
        project = store.create_project("项目 A")
        shot = store.create_shot(project.id, "分镜提示词")
        bound = store.create_asset(project.id, JimengAssetType.character, "许禾", [], "", "dreamina4.0", "16:9", "", "")
        free = store.create_asset(project.id, JimengAssetType.prop, "竹篮", [], "", "dreamina4.0", "16:9", "", "")
        store.create_binding(project.id, shot.id, bound.id, JimengAssetType.character, "manual")

        response = TestClient(app).post(
            f"/jimeng/projects/{project.id}/assets/batch_delete",
            json={"asset_ids": [bound.id, free.id]},
        )

        assert response.status_code == 400
        detail = response.json()["detail"]
        assert "许禾" in detail
        assert "分镜1" in detail
        assert store._get_asset(bound.id).id == bound.id
        assert store._get_asset(free.id).id == free.id
    finally:
        jimeng_api.reset_jimeng_store_for_tests()


def test_batch_delete_shots_removes_selected_shots_and_normalizes_indexes(tmp_path: Path):
    store = _store(tmp_path)
    jimeng_api.set_jimeng_store_for_tests(store)
    try:
        project = store.create_project("项目 A")
        first = store.create_shot(project.id, "第一镜")
        second = store.create_shot(project.id, "第二镜")
        third = store.create_shot(project.id, "第三镜")

        response = TestClient(app).post(
            f"/jimeng/projects/{project.id}/shots/batch_delete",
            json={"shot_ids": [second.id]},
        )

        assert response.status_code == 200
        assert response.json()["deleted"] == [second.id]
        shots = store.list_shots(project.id)
        assert [shot.id for shot in shots] == [first.id, third.id]
        assert [shot.shot_index for shot in shots] == [1, 2]
    finally:
        jimeng_api.reset_jimeng_store_for_tests()
