from __future__ import annotations

import os
import logging
import socket
import sys
import threading
import time
import webbrowser
from pathlib import Path

import uvicorn
from fastapi.staticfiles import StaticFiles


def _bundle_root() -> Path:
    if getattr(sys, "frozen", False):
        return Path(sys.executable).resolve().parent
    return Path(__file__).resolve().parents[1]


def _resource_root() -> Path:
    meipass = getattr(sys, "_MEIPASS", None)
    if meipass:
        return Path(meipass).resolve()
    return _bundle_root()


def _prepare_environment() -> tuple[Path, Path]:
    bundle_root = _bundle_root()
    data_dir = Path(os.getenv("DREAMINA_CLI_DATA_DIR", bundle_root / "data")).resolve()
    data_dir.mkdir(parents=True, exist_ok=True)
    (data_dir / "logs").mkdir(parents=True, exist_ok=True)
    os.environ["DREAMINA_CLI_DATA_DIR"] = str(data_dir)

    resource_root = _resource_root()
    if str(resource_root) not in sys.path:
        sys.path.insert(0, str(resource_root))
    return resource_root, data_dir


def _setup_logging(data_dir: Path) -> None:
    log_path = data_dir / "logs" / "desktop.log"
    logging.basicConfig(
        filename=str(log_path),
        level=logging.INFO,
        format="%(asctime)s %(levelname)s %(message)s",
        encoding="utf-8",
    )


def _mount_frontend(resource_root: Path):
    from backend.app.main import app

    frontend_dist = resource_root / "frontend" / "dist"
    if not frontend_dist.exists():
        raise RuntimeError(f"frontend dist not found: {frontend_dist}")
    app.mount("/", StaticFiles(directory=str(frontend_dist), html=True), name="frontend")
    return app


def _open_browser_later(url: str) -> None:
    def open_browser() -> None:
        time.sleep(1.5)
        webbrowser.open(url)

    threading.Thread(target=open_browser, daemon=True).start()


def _is_port_available(host: str, port: int) -> bool:
    with socket.socket(socket.AF_INET, socket.SOCK_STREAM) as sock:
        sock.setsockopt(socket.SOL_SOCKET, socket.SO_REUSEADDR, 1)
        try:
            sock.bind((host, port))
        except OSError:
            return False
    return True


def _select_desktop_port(host: str, preferred_port: int) -> int:
    for port in range(preferred_port, preferred_port + 100):
        if _is_port_available(host, port):
            return port
    raise RuntimeError(f"no available desktop port found from {preferred_port} to {preferred_port + 99}")


def _safe_print(message: str) -> None:
    if sys.stdout is not None:
        print(message)


def main() -> None:
    try:
        resource_root, data_dir = _prepare_environment()
        _setup_logging(data_dir)
        app = _mount_frontend(resource_root)
        host = os.getenv("DREAMINA_DESKTOP_HOST", "127.0.0.1")
        preferred_port = int(os.getenv("DREAMINA_DESKTOP_PORT", "62100"))
        port = _select_desktop_port(host, preferred_port)
        url = f"http://{host}:{port}"

        logging.info("Dreamina CLI Batch starting")
        logging.info("Data directory: %s", data_dir)
        logging.info("Open: %s", url)
        _safe_print("Dreamina CLI Batch")
        _safe_print(f"Data directory: {data_dir}")
        _safe_print(f"Open: {url}")
        if os.getenv("DREAMINA_DESKTOP_NO_BROWSER", "").lower() not in {"1", "true", "yes"}:
            _open_browser_later(url)
        uvicorn.run(app, host=host, port=port, log_config=None, access_log=False)
    except Exception:
        logging.exception("Dreamina CLI Batch failed to start")
        raise


if __name__ == "__main__":
    main()
