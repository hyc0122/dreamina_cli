"""Standalone Jimeng web-session client helpers.

This path is intentionally separate from the official Dreamina CLI queue. It is a
small, inspectable test channel for sessionid-cookie based web requests.
"""

import gzip
import hashlib
import json
import time
import urllib.parse
import urllib.request
import uuid
from typing import Any

BASE_URL = "https://jimeng.jianying.com"
AID = "513695"
PLATFORM_CODE = "7"
VERSION_CODE = "8.4.0"
SIGN_PREFIX = "9e2c"
SIGN_SUFFIX = "11ac"

WEB_VIDEO_MODEL_MAP: dict[str, dict[str, str]] = {
    "seedance2.0fast": {
        "model_req_key": "dreamina_seedance_40",
        "benefit_type": "dreamina_seedance_20_fast",
        "label": "Seedance 2.0 Fast",
    },
    "seedance2.0mini": {
        "model_req_key": "dreamina_seedance_40",
        "benefit_type": "dreamina_seedance_20_fast",
        "label": "Seedance 2.0 Mini",
    },
    "seedance2.0": {
        "model_req_key": "dreamina_seedance_40_pro",
        "benefit_type": "dreamina_video_seedance_20_pro",
        "label": "Seedance 2.0",
    },
    "seedance-2.0-lite-i2v": {
        "model_req_key": "seedance-2.0-lite-i2v",
        "benefit_type": "dreamina_seedance_20_fast",
        "label": "Seedance 2.0 Lite I2V",
    },
}


def mask_sessionid(sessionid: str | None) -> str:
    value = str(sessionid or "")
    if len(value) <= 8:
        return "*" * len(value)
    return f"{value[:4]}********{value[-4:]}"


def build_jimeng_cookie(sessionid: str, extra_cookies: dict[str, str] | None = None) -> str:
    clean_sessionid = str(sessionid or "").strip()
    cookies: dict[str, str] = {
        "sessionid": clean_sessionid,
        "sessionid_ss": clean_sessionid,
        "sid_tt": clean_sessionid,
        "sid_guard": clean_sessionid,
    }
    if extra_cookies:
        cookies.update({str(key): str(value) for key, value in extra_cookies.items() if value})
    return "; ".join(f"{key}={value}" for key, value in cookies.items() if value)


def build_text_to_video_payload(
    prompt: str,
    model: str = "seedance2.0fast",
    ratio: str = "9:16",
    duration: int = 5,
    resolution: str = "720p",
) -> dict[str, Any]:
    model_cfg = WEB_VIDEO_MODEL_MAP.get(model) or {
        "model_req_key": model,
        "benefit_type": "dreamina_seedance_20_fast",
        "label": model,
    }
    submit_id = str(uuid.uuid4())
    submit_group_id = str(uuid.uuid4())
    model_req_key = model_cfg["model_req_key"]
    duration_seconds = max(4, min(15, int(duration or 5)))
    scene_options = [
        {
            "type": "video",
            "scene": "BasicVideoGenerateButton",
            "resolution": resolution,
            "modelReqKey": model_req_key,
            "videoDuration": duration_seconds,
            "batchNumber": 1,
            "useSeedanceFast5sFreeTrial": False,
            "reportParams": {
                "enterSource": "generate",
                "vipSource": "generate",
                "extraVipFunctionKey": f"{model_req_key}-{resolution}",
                "useVipFunctionDetailsReporterHoc": True,
            },
            "materialTypes": [],
        }
    ]
    draft_content = _build_video_draft(prompt, model_req_key, ratio, duration_seconds, submit_id, submit_group_id, scene_options)
    commerce_info = {
        "amount": 0,
        "benefit_type": model_cfg["benefit_type"],
        "resource_id": "generate_video",
        "resource_id_type": "str",
        "resource_sub_type": "aigc",
    }
    return {
        "extend": {
            "root_model": model_req_key,
            "m_video_commerce_info": commerce_info,
            "m_video_commerce_info_list": [commerce_info],
        },
        "submit_id": submit_id,
        "metrics_extra": json.dumps(
            {
                "isDefaultSeed": 1,
                "originSubmitId": submit_id,
                "isRegenerate": False,
                "enterFrom": "click",
                "position": "page_bottom_box",
                "functionMode": "first_last_frames",
                "sceneOptions": json.dumps(scene_options, ensure_ascii=False),
            },
            ensure_ascii=False,
        ),
        "draft_content": json.dumps(draft_content, ensure_ascii=False),
        "http_common_info": {"aid": int(AID)},
    }


def build_history_query_payload(history_id: str) -> dict[str, Any]:
    return {
        "history_ids": [history_id],
        "image_info": {
            "width": 2048,
            "height": 2048,
            "format": "webp",
            "image_scene_list": [
                {"scene": "smart_crop", "width": 360, "height": 360, "uniq_key": "smart_crop-w:360-h:360", "format": "webp"},
                {"scene": "smart_crop", "width": 720, "height": 720, "uniq_key": "smart_crop-w:720-h:720", "format": "webp"},
            ],
        },
    }


def jimeng_web_request(endpoint: str, payload: dict[str, Any], cookie: str, timeout: int = 120) -> dict[str, Any]:
    uri = endpoint if endpoint.startswith("/") else f"/{endpoint}"
    params = {
        "aid": AID,
        "device_platform": "web",
        "region": "cn",
    }
    if "aigc_draft/generate" in uri:
        params.update(
            {
                "da_version": "3.3.17",
                "os": "linux",
                "web_component_open_flag": "1",
                "commerce_with_input_video": "1",
                "web_version": "7.5.0",
                "aigc_features": "app_lip_sync",
            }
        )
    url = f"{BASE_URL}{uri}?{urllib.parse.urlencode(params, doseq=True)}"
    data = json.dumps(payload, ensure_ascii=False).encode("utf-8")
    req = urllib.request.Request(url, data=data, headers=_headers(uri, cookie), method="POST")
    try:
        with urllib.request.urlopen(req, timeout=timeout) as response:
            raw = response.read()
    except Exception as exc:
        raise RuntimeError(f"即梦网页接口请求失败: {exc}") from exc
    if raw[:2] == b"\x1f\x8b":
        raw = gzip.decompress(raw)
    try:
        return json.loads(raw.decode("utf-8"))
    except Exception as exc:
        raise RuntimeError(f"即梦网页接口返回无法解析: {raw[:200]!r}") from exc


def extract_submit_identity(response: dict[str, Any], fallback_submit_id: str | None = None) -> tuple[str | None, str | None]:
    data = response.get("data") if isinstance(response, dict) else None
    aigc = data.get("aigc_data", {}) if isinstance(data, dict) else {}
    task = aigc.get("task", {}) if isinstance(aigc, dict) else {}
    submit_id = _first_string(
        task.get("submit_id") if isinstance(task, dict) else None,
        aigc.get("submit_id") if isinstance(aigc, dict) else None,
        data.get("submit_id") if isinstance(data, dict) else None,
        response.get("submit_id") if isinstance(response, dict) else None,
        fallback_submit_id,
    )
    history_id = _first_string(
        aigc.get("history_record_id") if isinstance(aigc, dict) else None,
        aigc.get("history_id") if isinstance(aigc, dict) else None,
        data.get("history_record_id") if isinstance(data, dict) else None,
        data.get("history_id") if isinstance(data, dict) else None,
        submit_id,
    )
    return submit_id, history_id


def parse_poll_result(response: dict[str, Any], lookup_id: str) -> dict[str, str | None]:
    record = _find_history_record(response, lookup_id)
    raw_status: Any = None
    if isinstance(record, dict):
        raw_status = record.get("status") or record.get("status_code") or record.get("state")
    status = _normalize_status(raw_status)
    result_url = _find_first_url(record or response)
    if result_url and status in {"running", "polling", "unknown"}:
        status = "completed"
    error_message = None
    if status == "failed" and isinstance(record, dict):
        error_message = str(record.get("errmsg") or record.get("error") or record.get("fail_code") or "任务失败")
    return {"status": status, "result_url": result_url, "error_message": error_message}


def _build_video_draft(
    prompt: str,
    model_req_key: str,
    ratio: str,
    duration: int,
    submit_id: str,
    submit_group_id: str,
    scene_options: list[dict[str, Any]],
) -> dict[str, Any]:
    comp_id = str(uuid.uuid4())
    video_task_extra = {
        "isDefaultSeed": 1,
        "originSubmitId": submit_id,
        "isRegenerate": False,
        "enterFrom": "click",
        "position": "page_bottom_box",
        "functionMode": "first_last_frames",
        "sceneOptions": json.dumps(scene_options, ensure_ascii=False),
        "batchNumber": 1,
        "submitGroupId": submit_group_id,
        "hasRejectedAudit": 0,
    }
    return {
        "type": "draft",
        "id": str(uuid.uuid4()),
        "min_version": "3.0.5",
        "min_features": [],
        "is_from_tsn": True,
        "version": "3.3.17",
        "main_component_id": comp_id,
        "component_list": [
            {
                "type": "video_base_component",
                "id": comp_id,
                "min_version": "3.0.5",
                "aigc_mode": "workbench",
                "metadata": {
                    "type": "",
                    "id": str(uuid.uuid4()),
                    "created_platform": 3,
                    "created_platform_version": "",
                    "created_time_in_ms": str(int(time.time() * 1000)),
                    "created_did": "",
                },
                "generate_type": "gen_video",
                "abilities": {
                    "type": "",
                    "id": str(uuid.uuid4()),
                    "gen_video": {
                        "id": str(uuid.uuid4()),
                        "type": "",
                        "text_to_video_params": {
                            "type": "",
                            "id": str(uuid.uuid4()),
                            "video_gen_inputs": [
                                {
                                    "type": "",
                                    "id": str(uuid.uuid4()),
                                    "min_version": "3.0.5",
                                    "prompt": prompt,
                                    "video_mode": 2,
                                    "fps": 24,
                                    "duration_ms": duration * 1000,
                                    "first_frame_image": None,
                                    "end_frame_image": None,
                                    "idip_meta_list": [],
                                }
                            ],
                            "video_aspect_ratio": ratio,
                            "seed": int(time.time() * 1000) % 4294967295,
                            "model_req_key": model_req_key,
                            "priority": 0,
                        },
                        "video_task_extra": json.dumps(video_task_extra, ensure_ascii=False),
                    },
                },
                "process_type": 1,
            }
        ],
    }


def _headers(uri: str, cookie: str) -> dict[str, str]:
    sign, device_time = _generate_sign(uri)
    return {
        "Content-Type": "application/json",
        "Cookie": cookie,
        "Origin": BASE_URL,
        "Referer": f"{BASE_URL}/ai-tool/generate/",
        "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/142.0.0.0 Safari/537.36",
        "Accept": "application/json, text/plain, */*",
        "Accept-Encoding": "gzip, deflate",
        "Accept-Language": "zh-CN,zh;q=0.9",
        "Cache-control": "no-cache",
        "Pragma": "no-cache",
        "Lan": "zh-Hans",
        "Loc": "cn",
        "App-Sdk-Version": "48.0.0",
        "Sign": sign,
        "Device-Time": str(device_time),
        "Sign-Ver": "1",
        "Pf": PLATFORM_CODE,
        "Appvr": VERSION_CODE,
        "Tdid": "",
    }


def _generate_sign(uri: str) -> tuple[str, int]:
    pathname = urllib.parse.urlparse(uri).path
    suffix = pathname[-7:] if len(pathname) >= 7 else pathname
    device_time = int(time.time())
    sign_str = f"{SIGN_PREFIX}|{suffix}|{PLATFORM_CODE}|{VERSION_CODE}|{device_time}||{SIGN_SUFFIX}"
    return hashlib.md5(sign_str.encode()).hexdigest().lower(), device_time


def _normalize_status(raw_status: Any) -> str:
    if raw_status in (10, 50, "10", "50", "success", "completed"):
        return "completed"
    if raw_status in (30, "30", "failed", "error"):
        return "failed"
    if raw_status in (20, 42, 45, "20", "42", "45", "processing", "running", "querying"):
        return "polling"
    return "unknown"


def _find_history_record(response: Any, lookup_id: str) -> Any:
    if not isinstance(response, dict):
        return None
    data = response.get("data")
    if isinstance(data, dict):
        if lookup_id in data:
            return data[lookup_id]
        if "aigc_data" in data:
            return data["aigc_data"]
    if lookup_id in response:
        return response[lookup_id]
    return data if isinstance(data, dict) else response


def _find_first_url(value: Any) -> str | None:
    if isinstance(value, dict):
        for key in ("video_url", "result_url", "download_url", "url", "image_url"):
            item = value.get(key)
            if isinstance(item, str) and item.startswith(("http://", "https://")):
                return item
        for key in ("url_list", "urls"):
            item = value.get(key)
            if isinstance(item, list):
                for url in item:
                    if isinstance(url, str) and url.startswith(("http://", "https://")):
                        return url
        for item in value.values():
            found = _find_first_url(item)
            if found:
                return found
    if isinstance(value, list):
        for item in value:
            found = _find_first_url(item)
            if found:
                return found
    return None


def _first_string(*values: Any) -> str | None:
    for value in values:
        if value is None:
            continue
        text = str(value).strip()
        if text:
            return text
    return None