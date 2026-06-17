from pathlib import Path

from fastapi.testclient import TestClient

from backend.app.jimeng_storage import JimengStore
from backend.app.main import app
import backend.app.jimeng_api as jimeng_api


def test_project_default_ratio_is_saved_and_updated(tmp_path: Path):
    store = JimengStore(db_path=tmp_path / "jimeng.sqlite3", output_root=tmp_path / "output")

    project = store.create_project("Project A", default_ratio="16:9")

    assert project.default_ratio == "16:9"

    updated = store.update_project(project.id, default_ratio="9:16")

    assert updated.default_ratio == "9:16"


def test_project_api_accepts_default_ratio(tmp_path: Path):
    store = JimengStore(db_path=tmp_path / "jimeng.sqlite3", output_root=tmp_path / "output")
    jimeng_api.set_jimeng_store_for_tests(store)
    try:
        client = TestClient(app)

        created_response = client.post(
            "/jimeng/projects",
            json={"name": "Project A", "style": "film", "default_ratio": "16:9"},
        )

        assert created_response.status_code == 200
        created = created_response.json()
        assert created["default_ratio"] == "16:9"

        updated_response = client.put(
            f"/jimeng/projects/{created['id']}",
            json={"default_ratio": "9:16"},
        )

        assert updated_response.status_code == 200
        assert updated_response.json()["default_ratio"] == "9:16"
    finally:
        jimeng_api.reset_jimeng_store_for_tests()
