from __future__ import annotations

import os
import json
import logging
import socket
import sys
import threading
import time
import urllib.error
import urllib.request
import webbrowser
from pathlib import Path

import uvicorn
from fastapi.staticfiles import StaticFiles


def _repair_mojibake_path(path: Path) -> Path:
    try:
        repaired = Path(str(path).encode("latin-1").decode("utf-8")).resolve()
    except (OSError, UnicodeError):
        return path.resolve()
    return repaired if repaired.exists() else path.resolve()


def _bundle_root() -> Path:
    if getattr(sys, "frozen", False):
        return _repair_mojibake_path(Path(sys.executable).parent)
    return _repair_mojibake_path(Path(__file__).parents[1])


def _resource_root() -> Path:
    meipass = getattr(sys, "_MEIPASS", None)
    if meipass:
        return _repair_mojibake_path(Path(meipass))
    return _bundle_root()


def _prepare_environment() -> tuple[Path, Path]:
    bundle_root = _bundle_root()
    os.environ["DREAMINA_CLI_PROJECT_DIR"] = str(bundle_root)
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


def _launcher_url(host: str, port: int) -> str:
    return f"http://{host}:{port}/#/launcher"


def _app_url(host: str, port: int) -> str:
    return f"http://{host}:{port}/#/app"


def _default_desktop_url(host: str, port: int) -> str:
    return _app_url(host, port)


def _browser_disabled() -> bool:
    return os.getenv("DREAMINA_DESKTOP_NO_BROWSER", "").lower() in {"1", "true", "yes"}


def _request_json(url: str, timeout: float = 2.0) -> dict | None:
    try:
        with urllib.request.urlopen(url, timeout=timeout) as response:
            return json.loads(response.read().decode("utf-8"))
    except (OSError, TimeoutError, ValueError, urllib.error.URLError):
        return None


def _post_json(url: str, timeout: float = 2.0) -> dict | None:
    try:
        request = urllib.request.Request(url, method="POST")
        with urllib.request.urlopen(request, timeout=timeout) as response:
            return json.loads(response.read().decode("utf-8"))
    except (OSError, TimeoutError, ValueError, urllib.error.URLError):
        return None


def _open_desktop_entry(host: str, port: int, project_dir: Path, data_dir: Path) -> None:
    if _browser_disabled():
        return
    _show_native_launcher(host=host, port=port, project_dir=project_dir, data_dir=data_dir)


def _start_startup_splash() -> threading.Event:
    stop_event = threading.Event()

    def run_splash() -> None:
        try:
            import math
            import tkinter as tk

            root = tk.Tk()
            root.title("即梦 CLI 正在启动")
            root.geometry("420x300")
            root.resizable(False, False)
            root.configure(bg="#050816")

            canvas = tk.Canvas(root, width=420, height=180, bg="#050816", highlightthickness=0)
            canvas.pack(fill="x", padx=0, pady=(22, 0))
            title = tk.Label(root, text="启动程序中...", bg="#050816", fg="#f8fafc", font=("Microsoft YaHei UI", 17, "bold"))
            title.pack(pady=(4, 4))
            subtitle = tk.Label(root, text="正在加载本地服务与工作台，请稍等", bg="#050816", fg="#94a3b8", font=("Microsoft YaHei UI", 10))
            subtitle.pack()
            progress = tk.Label(root, text="Dreamina CLI Batch", bg="#050816", fg="#8b5cf6", font=("Consolas", 9))
            progress.pack(pady=(14, 0))

            angle = {"value": 0.0}

            def draw() -> None:
                if stop_event.is_set():
                    root.destroy()
                    return
                value = angle["value"]
                canvas.delete("orb")
                cx, cy = 210, 92
                for radius, color in ((64, "#312e81"), (54, "#4f46e5"), (44, "#7c3aed"), (34, "#22d3ee")):
                    canvas.create_oval(cx - radius, cy - radius, cx + radius, cy + radius, outline="", fill=color, tags="orb")
                for index in range(7):
                    theta = value + index * 0.9
                    x = cx + math.cos(theta) * (30 + index * 3)
                    y = cy + math.sin(theta * 1.3) * (20 + index * 2)
                    size = 18 + (index % 3) * 7
                    color = ["#a78bfa", "#60a5fa", "#e879f9"][index % 3]
                    canvas.create_oval(x - size, y - size, x + size, y + size, outline="", fill=color, tags="orb")
                canvas.create_oval(cx - 70, cy - 70, cx + 70, cy + 70, outline="#818cf8", width=2, tags="orb")
                canvas.create_arc(cx - 82, cy - 82, cx + 82, cy + 82, start=int(value * 58) % 360, extent=78, outline="#22d3ee", width=4, style="arc", tags="orb")
                angle["value"] = value + 0.08
                root.after(45, draw)

            draw()
            root.mainloop()
        except Exception:
            return

    threading.Thread(target=run_splash, daemon=True).start()
    return stop_event


def _show_native_launcher(host: str, port: int, project_dir: Path, data_dir: Path) -> None:
    import tkinter as tk
    from tkinter import messagebox

    root = tk.Tk()
    root.title("小狼专用-即梦CLI 启动管理器")
    root.geometry("760x520")
    root.minsize(680, 460)
    root.configure(bg="#080b16")

    title_font = ("Microsoft YaHei UI", 18, "bold")
    body_font = ("Microsoft YaHei UI", 10)
    mono_font = ("Consolas", 9)

    tk.Label(root, text="小狼专用 - 即梦 CLI", bg="#080b16", fg="#f8fafc", font=title_font).pack(anchor="w", padx=24, pady=(22, 4))
    tk.Label(root, text="原生启动管理器：打开软件、查看端口、关闭服务、定位根目录。", bg="#080b16", fg="#94a3b8", font=body_font).pack(anchor="w", padx=24)

    status = tk.StringVar(value=f"服务端口：{host}:{port}")
    tk.Label(root, textvariable=status, bg="#111827", fg="#6ee7b7", font=body_font, padx=12, pady=8).pack(fill="x", padx=24, pady=(18, 10))

    info_frame = tk.Frame(root, bg="#0f172a", padx=14, pady=12)
    info_frame.pack(fill="x", padx=24)
    for label, value in (
        ("访问地址", _default_desktop_url(host, port)),
        ("程序根目录", str(project_dir)),
        ("数据目录", str(data_dir)),
    ):
        row = tk.Frame(info_frame, bg="#0f172a")
        row.pack(fill="x", pady=3)
        tk.Label(row, text=f"{label}：", width=10, anchor="w", bg="#0f172a", fg="#cbd5e1", font=body_font).pack(side="left")
        tk.Label(row, text=value, anchor="w", bg="#0f172a", fg="#e5e7eb", font=mono_font).pack(side="left", fill="x", expand=True)

    list_box = tk.Listbox(root, height=7, bg="#0f172a", fg="#dbeafe", selectbackground="#4f46e5", relief="flat", font=mono_font)
    list_box.pack(fill="both", expand=True, padx=24, pady=12)

    def open_app() -> None:
        webbrowser.open(_default_desktop_url(host, port))
        status.set("已打开主界面。")

    def open_help() -> None:
        webbrowser.open("https://my.feishu.cn/docx/AfO9d2Gd0ovLpLxpeN2cjm1xnF2?from=from_copylink")

    def open_feedback() -> None:
        webbrowser.open("https://my.feishu.cn/share/base/form/shrcneH6UB1riprQBXtvMLycffc")

    def scan_ports() -> None:
        payload = _request_json(f"http://{host}:{port}/runtime/instances")
        list_box.delete(0, tk.END)
        for item in (payload or {}).get("instances", []):
            marker = "当前" if item.get("is_current") else "其他"
            list_box.insert(tk.END, f"[{marker}] {item.get('host')}:{item.get('port')}  {item.get('project_dir')}")
        status.set("端口扫描完成。" if payload else "端口扫描失败，请确认服务是否仍在运行。")

    def shutdown() -> None:
        if not messagebox.askyesno("关闭服务", "确定关闭当前即梦 CLI 批量工具服务吗？"):
            return
        _post_json(f"http://{host}:{port}/runtime/shutdown")
        status.set("关闭指令已发送。")
        root.after(500, root.destroy)

    button_frame = tk.Frame(root, bg="#080b16")
    button_frame.pack(fill="x", padx=24, pady=(0, 18))
    buttons = [
        ("打开软件", open_app, "#6366f1"),
        ("扫描端口", scan_ports, "#0ea5e9"),
        ("使用说明", open_help, "#14b8a6"),
        ("问题反馈", open_feedback, "#f59e0b"),
        ("关闭服务", shutdown, "#ef4444"),
    ]
    for text, command, color in buttons:
        tk.Button(
            button_frame,
            text=text,
            command=command,
            bg=color,
            fg="#ffffff",
            activebackground=color,
            activeforeground="#ffffff",
            relief="flat",
            padx=14,
            pady=8,
            font=body_font,
        ).pack(side="left", padx=(0, 8))

    scan_ports()
    root.mainloop()


def _fetch_instance_health(host: str, port: int, timeout: float = 0.15) -> dict | None:
    try:
        with urllib.request.urlopen(f"http://{host}:{port}/health", timeout=timeout) as response:
            payload = json.loads(response.read().decode("utf-8"))
    except (OSError, TimeoutError, ValueError, urllib.error.URLError):
        return None
    if payload.get("app") != "dreamina_cli":
        return None
    payload["host"] = payload.get("host") or host
    payload["port"] = int(payload.get("port") or port)
    return payload


def _find_existing_instance(host: str, preferred_port: int, project_dir: Path) -> dict | None:
    expected_project_dir = str(project_dir.resolve())
    for port in range(preferred_port, preferred_port + 100):
        payload = _fetch_instance_health(host, port)
        if not payload:
            continue
        if str(payload.get("project_dir")) == expected_project_dir:
            return payload
    return None


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
    startup_splash: threading.Event | None = None
    try:
        resource_root, data_dir = _prepare_environment()
        _setup_logging(data_dir)
        if os.getenv("DREAMINA_QUEUE_WORKER", "").lower() in {"1", "true", "yes"}:
            logging.info("Dreamina CLI Batch queue worker starting")
            _safe_print("Dreamina CLI Batch queue worker")
            from backend.app.queue_worker import main as queue_worker_main

            queue_worker_main()
            return

        host = os.getenv("DREAMINA_DESKTOP_HOST", "127.0.0.1")
        preferred_port = int(os.getenv("DREAMINA_DESKTOP_PORT", "62100"))
        if not _browser_disabled():
            startup_splash = _start_startup_splash()
        existing = _find_existing_instance(host, preferred_port, _bundle_root())
        if existing:
            existing_port = int(existing["port"])
            existing_url = _default_desktop_url(host, existing_port)
            logging.info("Existing Dreamina CLI Batch instance detected: %s", existing_url)
            _safe_print("Dreamina CLI Batch already running")
            _safe_print(f"Open: {existing_url}")
            if startup_splash is not None:
                startup_splash.set()
                time.sleep(0.15)
            _open_desktop_entry(host, existing_port, project_dir=Path(str(existing.get("project_dir") or _bundle_root())), data_dir=data_dir)
            return

        port = _select_desktop_port(host, preferred_port)
        os.environ["DREAMINA_DESKTOP_BOUND_PORT"] = str(port)
        app = _mount_frontend(resource_root)
        url = _default_desktop_url(host, port)

        logging.info("Dreamina CLI Batch starting")
        logging.info("Data directory: %s", data_dir)
        logging.info("Open: %s", url)
        _safe_print("Dreamina CLI Batch")
        _safe_print(f"Data directory: {data_dir}")
        _safe_print(f"Open: {url}")
        if _browser_disabled():
            uvicorn.run(app, host=host, port=port, log_config=None, access_log=False)
            return

        server_thread = threading.Thread(
            target=lambda: uvicorn.run(app, host=host, port=port, log_config=None, access_log=False),
            daemon=True,
        )
        server_thread.start()
        time.sleep(0.8)
        if startup_splash is not None:
            startup_splash.set()
            time.sleep(0.15)
        _open_desktop_entry(host, port, project_dir=_bundle_root(), data_dir=data_dir)
    except Exception:
        if startup_splash is not None:
            startup_splash.set()
        logging.exception("Dreamina CLI Batch failed to start")
        raise


if __name__ == "__main__":
    main()
