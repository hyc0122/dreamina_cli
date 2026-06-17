import subprocess

from fastapi.testclient import TestClient

from backend.app.main import app
import backend.app.jimeng_api as jimeng_api


client = TestClient(app)


def test_install_cli_reports_missing_bash(monkeypatch):
    monkeypatch.setattr(jimeng_api.shutil, "which", lambda name: None)

    response = client.post("/jimeng/settings/install_cli")

    assert response.status_code == 400
    assert "bash" in response.json()["detail"].lower()


def test_install_cli_runs_official_installer(monkeypatch):
    calls = []

    class Completed:
        returncode = 0
        stdout = "installed"
        stderr = ""

    def fake_run(args, **kwargs):
        calls.append((args, kwargs))
        return Completed()

    monkeypatch.setattr(jimeng_api.shutil, "which", lambda name: "C:/Program Files/Git/bin/bash.exe")
    monkeypatch.setattr(jimeng_api.subprocess, "run", fake_run)

    response = client.post("/jimeng/settings/install_cli")

    assert response.status_code == 200
    payload = response.json()
    assert payload["ok"] is True
    assert payload["returncode"] == 0
    assert payload["stdout"] == "installed"
    assert calls[0][0] == [
        "C:/Program Files/Git/bin/bash.exe",
        "-lc",
        "curl -s https://jimeng.jianying.com/cli | bash",
    ]
    assert calls[0][1]["capture_output"] is True
    assert calls[0][1]["timeout"] == 180


def test_install_cli_returns_command_failure(monkeypatch):
    class Completed:
        returncode = 1
        stdout = ""
        stderr = "network failed"

    monkeypatch.setattr(jimeng_api.shutil, "which", lambda name: "bash")
    monkeypatch.setattr(jimeng_api.subprocess, "run", lambda *args, **kwargs: Completed())

    response = client.post("/jimeng/settings/install_cli")

    assert response.status_code == 200
    payload = response.json()
    assert payload["ok"] is False
    assert payload["returncode"] == 1
    assert payload["stderr"] == "network failed"
