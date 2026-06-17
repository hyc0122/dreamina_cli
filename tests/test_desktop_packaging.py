import socket
import importlib.util
import sys
from pathlib import Path


def _load_desktop_module():
    module_path = Path(__file__).resolve().parents[1] / "packaging" / "dreamina_desktop.py"
    spec = importlib.util.spec_from_file_location("dreamina_desktop_for_tests", module_path)
    assert spec is not None
    assert spec.loader is not None
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module


dreamina_desktop = _load_desktop_module()


def test_select_desktop_port_uses_requested_port_when_free():
    port = dreamina_desktop._select_desktop_port("127.0.0.1", 62101)

    assert isinstance(port, int)
    assert port >= 62101


def test_select_desktop_port_skips_occupied_port():
    sock = socket.socket(socket.AF_INET, socket.SOCK_STREAM)
    sock.bind(("127.0.0.1", 0))
    sock.listen()
    occupied_port = sock.getsockname()[1]
    try:
        selected = dreamina_desktop._select_desktop_port("127.0.0.1", occupied_port)

        assert selected != occupied_port
    finally:
        sock.close()


def test_safe_print_allows_windowed_exe_without_stdout(monkeypatch):
    monkeypatch.setattr(sys, "stdout", None)

    dreamina_desktop._safe_print("no console")
