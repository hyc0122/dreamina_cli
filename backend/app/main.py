import os
from pathlib import Path

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles

from .api.router import router as jimeng_router


BASE_DIR = Path(__file__).resolve().parents[1]
PROJECT_DIR = BASE_DIR.parent
DATA_DIR = Path(os.getenv("DREAMINA_CLI_DATA_DIR", PROJECT_DIR / "runtime_data")).resolve()
OUTPUT_DIR = DATA_DIR / "output"

OUTPUT_DIR.mkdir(parents=True, exist_ok=True)
(OUTPUT_DIR / "jimeng").mkdir(parents=True, exist_ok=True)

app = FastAPI(title="Dreamina CLI Batch API")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
    expose_headers=["Content-Disposition"],
)

app.include_router(jimeng_router)
app.mount("/files/jimeng", StaticFiles(directory=str(OUTPUT_DIR / "jimeng")), name="files_jimeng")
app.mount("/files", StaticFiles(directory=str(OUTPUT_DIR)), name="files")


@app.get("/health")
def health_check():
    return {
        "ok": True,
        "app": "dreamina_cli",
        "data_dir": str(DATA_DIR),
        "output_dir": str(OUTPUT_DIR),
    }
