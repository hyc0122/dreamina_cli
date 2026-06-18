"""受限的本机目录选择对话框。"""

import ipaddress
import threading
from pathlib import Path
from typing import Callable


Picker = Callable[[], str]
_PICKER_LOCK = threading.Lock()


def select_directory(client_host: str, picker: Picker) -> str | None:
    try:
        is_loopback = ipaddress.ip_address(client_host).is_loopback
    except ValueError:
        is_loopback = client_host.lower() == "localhost"
    if not is_loopback:
        raise PermissionError("目录选择器只允许本机访问")
    with _PICKER_LOCK:
        selected = str(picker() or "").strip()
    if not selected:
        return None
    path = Path(selected).expanduser().resolve()
    if not path.exists() or not path.is_dir():
        raise ValueError("选择的目录不存在")
    return str(path)


def pick_directory_dialog(title: str = "选择视频保存目录", initial_dir: str | None = None) -> str:
    import tkinter as tk
    from tkinter import filedialog

    root = tk.Tk()
    root.withdraw()
    root.attributes("-topmost", True)
    try:
        return str(
            filedialog.askdirectory(
                parent=root,
                title=title,
                initialdir=initial_dir or str(Path.home()),
                mustexist=True,
            )
            or ""
        )
    finally:
        root.destroy()
