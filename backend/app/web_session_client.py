"""Jimeng web-session client based on jimeng-web2api-master.

This channel is intentionally separate from the official Dreamina CLI queue. It
uses sessionid as a browser cookie, signed web requests, and history-id polling.
"""

import gzip
import hashlib
import json
import random
import ssl
import time
import urllib.error
import urllib.parse
import urllib.request
import uuid
from typing import Any

BASE_URL = "https://jimeng.jianying.com"
AID = 513695
PLATFORM_CODE = "7"
VERSION_CODE = "8.4.0"
SIGN_PREFIX = "9e2c"
SIGN_SUFFIX = "11ac"
SSL_CTX = ssl.create_default_context()
SECURITY_COOKIE_NAMES = (
    "_tea_web_id",
    "s_v_web_id",
    "fpk1",
    "uifid",
    "uifid_temp",
    "x-web-secsdk-uid",
)
IMPORTANT_BROWSER_COOKIE_NAMES = (
    "ttwid",
    "odin_tt",
    "user_spaces_idc",
)
WEB_GENERATE_EXTRA_PARAMS: dict[str, str] = {
    "da_version": "3.3.17",
    "os": "linux",
    "web_component_open_flag": "1",
    "commerce_with_input_video": "1",
    "web_version": "7.5.0",
    "aigc_features": "app_lip_sync",
}

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
    "seedance2.0fast_vip": {
        "model_req_key": "dreamina_seedance_40",
        "benefit_type": "dreamina_seedance_20_fast",
        "label": "Seedance 2.0 Fast VIP",
    },
    "seedance2.0_vip": {
        "model_req_key": "dreamina_seedance_40_pro",
        "benefit_type": "dreamina_video_seedance_20_pro",
        "label": "Seedance 2.0 VIP",
    },
    "seedance1.0": {
        "model_req_key": "dreamina_ic_generate_video_model_vgfm_3.5",
        "benefit_type": "dreamina_video_seedance_15",
        "label": "Seedance 1.0",
    },
    "seedance1.0fast": {
        "model_req_key": "dreamina_ic_generate_video_model_vgfm_3.5_fast",
        "benefit_type": "dreamina_video_seedance_15",
        "label": "Seedance 1.0 Fast",
    },
    "jimeng-video-3.0": {
        "model_req_key": "dreamina_ic_generate_video_model_vgfm_3.5_pro",
        "benefit_type": "dreamina_video_seedance_15_pro",
        "label": "即梦视频 3.0",
    },
}

STATUS_CODE_MAP: dict[Any, str] = {
    10: "completed",
    20: "polling",
    30: "failed",
    42: "polling",
    45: "polling",
    50: "completed",
    "10": "completed",
    "20": "polling",
    "30": "failed",
    "42": "polling",
    "45": "polling",
    "50": "completed",
    "success": "completed",
    "completed": "completed",
    "failed": "failed",
    "error": "failed",
    "processing": "polling",
    "running": "polling",
    "querying": "polling",
}


def mask_sessionid(sessionid: str | None) -> str:
    value = str(sessionid or "")
    if len(value) <= 8:
        return "*" * len(value)
    return f"{value[:4]}********{value[-4:]}"


def build_jimeng_cookie(sessionid: str, extra_cookies: dict[str, str] | None = None) -> str:
    cookies: dict[str, str] = {"sessionid": str(sessionid or "").strip()}
    if extra_cookies:
        cookies.update({str(key): str(value) for key, value in extra_cookies.items() if value})
    return build_cookie_header(cookies)


def build_cookie_header(cookies: dict[str, str]) -> str:
    return "; ".join(f"{key}={value}" for key, value in cookies.items() if value)


def create_web_session_client(sessionid: str, cookies: dict[str, str] | str | None = None) -> "JimengWebSessionClient":
    return JimengWebSessionClient(sessionid=sessionid, cookies=cookies, auto_save=False)


def normalize_web_session_cookies(
    sessionid_or_cookie: str | dict[str, Any],
    existing_cookies: dict[str, Any] | str | None = None,
) -> dict[str, str]:
    cookies = _coerce_cookie_map(existing_cookies)
    cookies.update(_coerce_cookie_map(sessionid_or_cookie))
    sessionid = str(cookies.get("sessionid") or "").strip()
    if not sessionid:
        raise ValueError("sessionid 不能为空")
    cookies["sessionid"] = sessionid
    generated = generate_web_fingerprint_cookies()
    for key in SECURITY_COOKIE_NAMES:
        if not str(cookies.get(key) or "").strip():
            cookies[key] = generated[key]
    return {str(key): str(value).strip() for key, value in cookies.items() if str(value).strip()}


def generate_web_fingerprint_cookies() -> dict[str, str]:
    rng = random.SystemRandom()

    def sha_uuid() -> str:
        return hashlib.sha256(uuid.uuid4().bytes).hexdigest()

    return {
        "_tea_web_id": str(rng.randint(7000000000000000000, 7999999999999999999)),
        "s_v_web_id": f"verify_{_random_base36(rng, 8)}_{_random_base36(rng, 4)}_{_random_base36(rng, 4)}_{_random_base36(rng, 4)}_{_random_base36(rng, 12)}",
        "fpk1": sha_uuid(),
        "uifid": f"{''.join(sha_uuid() for _ in range(6))}0002c{rng.randrange(256):02x}",
        "uifid_temp": f"{''.join(sha_uuid() for _ in range(4))}0002{rng.randrange(256):02x}",
        "x-web-secsdk-uid": str(uuid.uuid4()),
    }


def _coerce_cookie_map(value: dict[str, Any] | str | None) -> dict[str, str]:
    if value in (None, ""):
        return {}
    if isinstance(value, str):
        text = value.strip()
        if not text:
            return {}
        if text.lower().startswith("cookie:"):
            text = text.split(":", 1)[1].strip()
        if text.startswith("{"):
            try:
                loaded = json.loads(text)
            except json.JSONDecodeError:
                loaded = None
            if isinstance(loaded, dict):
                return _coerce_cookie_map(loaded)
        if ";" in text or "=" in text:
            parsed = _parse_cookie_text(text)
            if parsed:
                return parsed
        return {"sessionid": text}
    result: dict[str, str] = {}
    for key, raw in value.items():
        if raw in (None, ""):
            continue
        key_text = str(key).strip()
        if key_text in {"cookie", "cookie_header"} and isinstance(raw, str):
            result.update(_coerce_cookie_map(raw))
            continue
        if key_text == "cookies":
            if isinstance(raw, dict):
                result.update(_coerce_cookie_map(raw))
            elif isinstance(raw, str):
                result.update(_coerce_cookie_map(raw))
            continue
        if isinstance(raw, (dict, list)):
            continue
        result[key_text] = str(raw).strip()
    return {key: item for key, item in result.items() if key and item}



def web_session_cookie_diagnostics(value: dict[str, Any] | str | None) -> dict[str, Any]:
    cookies = _coerce_cookie_map(value)
    missing_browser = [name for name in IMPORTANT_BROWSER_COOKIE_NAMES if not cookies.get(name)]
    missing_fingerprint = [name for name in SECURITY_COOKIE_NAMES if not cookies.get(name)]
    return {
        "cookie_count": len(cookies),
        "has_fingerprint": not missing_fingerprint,
        "missing_fingerprint_names": missing_fingerprint,
        "missing_browser_cookie_names": missing_browser,
        "cookie_ready": not missing_browser,
    }


def web_session_error_message(response: dict[str, Any], cookies: dict[str, Any] | str | None = None) -> str:
    base = response_error_message(response)
    ret = str(response.get("ret") if isinstance(response, dict) else "")
    if ret != "4013":
        return base
    diagnostics = web_session_cookie_diagnostics(cookies)
    missing = diagnostics.get("missing_browser_cookie_names") or []
    if missing:
        return (
            f"{base}；网页风控 4013：当前账号缺少真实浏览器 Cookie：{', '.join(missing)}。"
            "请从已登录即梦网页的 Network 请求里复制完整 Cookie 后重新保存账号；"
            "只填 sessionid 或本地生成指纹不稳定。"
        )
    return f"{base}；网页风控 4013：Cookie 已较完整，建议重新复制最新 Cookie、降低提交频率或换账号测试。"

def _parse_cookie_text(text: str) -> dict[str, str]:
    result: dict[str, str] = {}
    for part in text.split(";"):
        item = part.strip()
        if not item or "=" not in item:
            continue
        key, value = item.split("=", 1)
        key = key.strip()
        value = value.strip()
        if key and value:
            result[key] = value
    return result


def _random_base36(rng: random.SystemRandom, length: int) -> str:
    alphabet = "0123456789abcdefghijklmnopqrstuvwxyz"
    return "".join(rng.choice(alphabet) for _ in range(length))

class JimengWebSessionClient:
    """Small local copy of the jimeng-web2api-master signed web client."""

    def __init__(
        self,
        sessionid: str,
        base_url: str = BASE_URL,
        auto_save: bool = False,
        max_retries: int = 2,
        cookies: dict[str, str] | str | None = None,
    ):
        normalized_cookies = normalize_web_session_cookies(sessionid, cookies)
        self.sessionid = normalized_cookies["sessionid"]
        self.base_url = base_url.rstrip("/")
        self.auto_save = auto_save
        self.max_retries = max_retries
        self._cookies = normalized_cookies

    def set_cookies(self, cookies: dict[str, str]) -> None:
        self._cookies = normalize_web_session_cookies(self.sessionid, {**self._cookies, **cookies})
        self.sessionid = self._cookies["sessionid"]

    @property
    def cookie_header(self) -> str:
        return build_cookie_header(self._cookies)

    def build_signed_query_params(self, extra_params: dict[str, Any] | None = None) -> dict[str, Any]:
        return build_common_params(extra_params, self._cookies)
    def signed_post(
        self,
        uri: str,
        body: dict[str, Any],
        extra_params: dict[str, Any] | None = None,
        extra_headers: dict[str, str] | None = None,
        timeout: int = 120,
    ) -> dict[str, Any]:
        url = f"{self.base_url}{uri}"
        params = self.build_signed_query_params(extra_params)
        full_url = f"{url}?{urllib.parse.urlencode(params, doseq=True)}"
        headers = self._build_headers(uri)
        if extra_headers:
            headers.update(extra_headers)
        data = json.dumps(body, ensure_ascii=False).encode("utf-8")
        request = urllib.request.Request(full_url, data=data, headers=headers, method="POST")
        return self._do_request(request, timeout)

    def _build_headers(self, uri: str, referer: str = "/ai-tool/generate") -> dict[str, str]:
        sign, device_time = generate_sign(uri)
        headers = {
            "Content-Type": "application/json",
            "Cookie": self.cookie_header,
            "Origin": self.base_url,
            "Referer": f"{self.base_url}{referer}",
            "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/142.0.0.0 Safari/537.36",
            "Accept": "application/json, text/plain, */*",
            "Accept-Encoding": "gzip, deflate",
            "Accept-Language": "zh-CN,zh;q=0.9",
            "Cache-control": "no-cache",
            "Pragma": "no-cache",
            "Priority": "u=1, i",
            "Lan": "zh-Hans",
            "Loc": "cn",
            "App-Sdk-Version": "48.0.0",
            "Sec-Ch-Ua": '"Google Chrome";v="142", "Chromium";v="142", "Not_A Brand";v="99"',
            "Sec-Ch-Ua-Mobile": "?0",
            "Sec-Ch-Ua-Platform": '"Windows"',
            "Sec-Fetch-Dest": "empty",
            "Sec-Fetch-Mode": "cors",
            "Sec-Fetch-Site": "same-origin",
            "Sign": sign,
            "Device-Time": str(device_time),
            "Sign-Ver": "1",
            "Pf": PLATFORM_CODE,
            "Appvr": VERSION_CODE,
            "Tdid": "",
        }
        return headers

    def _do_request(self, request: urllib.request.Request, timeout: int) -> dict[str, Any]:
        last_result: dict[str, Any] | None = None
        for attempt in range(self.max_retries + 1):
            try:
                with urllib.request.urlopen(request, timeout=timeout, context=SSL_CTX) as response:
                    return _read_response(response)
            except urllib.error.HTTPError as exc:
                result = _read_error_response(exc)
                if _is_retryable(str(result.get("ret", ""))) and attempt < self.max_retries:
                    last_result = result
                    time.sleep(2**attempt)
                    continue
                return result
            except Exception as exc:
                result = {"ret": "-1", "errmsg": str(exc)}
                if attempt < self.max_retries:
                    last_result = result
                    time.sleep(2**attempt)
                    continue
                return result
        return last_result or {"ret": "-1", "errmsg": "max retries exceeded"}


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
        "http_common_info": {"aid": AID},
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
                {"scene": "smart_crop", "width": 480, "height": 480, "uniq_key": "smart_crop-w:480-h:480", "format": "webp"},
                {"scene": "smart_crop", "width": 720, "height": 720, "uniq_key": "smart_crop-w:720-h:720", "format": "webp"},
                {"scene": "smart_crop", "width": 720, "height": 480, "uniq_key": "smart_crop-w:720-h:480", "format": "webp"},
            ],
        },
    }


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
        _find_first_string_by_keys(aigc, {"history_record_id", "history_id", "record_id"}),
        _find_first_string_by_keys(data, {"history_record_id", "history_id", "record_id"}),
        _find_first_string_by_keys(response, {"history_record_id", "history_id", "record_id"}),
    )
    return submit_id, history_id


def parse_poll_result(response: dict[str, Any], lookup_id: str) -> dict[str, str | None]:
    if _is_ret_error(response):
        return {"status": "failed", "result_url": None, "error_message": response_error_message(response)}
    record = _find_history_record(response, lookup_id)
    raw_status: Any = None
    if isinstance(record, dict):
        raw_status = record.get("status") or record.get("status_code") or record.get("state") or _find_first_status(record)
    status = _normalize_status(raw_status)
    result_url = _find_first_url(record or response)
    if result_url and status in {"polling", "unknown"}:
        status = "completed"
    error_message = None
    if status == "failed" and isinstance(record, dict):
        error_message = response_error_message(record)
    return {"status": status, "result_url": result_url, "error_message": error_message}


def response_error_message(response: dict[str, Any]) -> str:
    ret = response.get("ret") if isinstance(response, dict) else None
    parts: list[str] = []
    if ret not in (None, "", "0", 0):
        parts.append(f"ret={ret}")
    for value in _iter_error_values(response):
        text = str(value).strip()
        if text and text not in parts:
            parts.append(text)
    return "，".join(parts) or "网页接口返回失败"


def build_common_params(extra: dict[str, Any] | None = None, cookies: dict[str, str] | None = None) -> dict[str, Any]:
    params: dict[str, Any] = {
        "aid": AID,
        "device_platform": "web",
        "region": "cn",
    }
    web_id = (cookies or {}).get("_tea_web_id", "")
    if web_id:
        params["webId"] = web_id
    if extra:
        params.update(extra)
    return params


def generate_sign(uri: str) -> tuple[str, int]:
    pathname = urllib.parse.urlparse(uri).path
    suffix = pathname[-7:] if len(pathname) >= 7 else pathname
    device_time = int(time.time())
    sign_string = f"{SIGN_PREFIX}|{suffix}|{PLATFORM_CODE}|{VERSION_CODE}|{device_time}||{SIGN_SUFFIX}"
    return hashlib.md5(sign_string.encode()).hexdigest().lower(), device_time


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


def _read_response(response: Any) -> dict[str, Any]:
    raw = response.read()
    if raw[:2] == b"\x1f\x8b":
        raw = gzip.decompress(raw)
    return json.loads(raw.decode("utf-8"))


def _read_error_response(error: urllib.error.HTTPError) -> dict[str, Any]:
    raw = error.read()
    if raw[:2] == b"\x1f\x8b":
        raw = gzip.decompress(raw)
    try:
        return json.loads(raw.decode("utf-8"))
    except Exception:
        return {"ret": str(error.code), "errmsg": f"HTTP {error.code}: {raw[:200]!r}"}


def _is_retryable(ret_code: str) -> bool:
    return ret_code in {"1001", "2000", "-1"}


def _is_ret_error(response: Any) -> bool:
    if not isinstance(response, dict) or "ret" not in response:
        return False
    return str(response.get("ret")) != "0"


def _normalize_status(raw_status: Any) -> str:
    return STATUS_CODE_MAP.get(raw_status, "unknown")


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


def _find_first_string_by_keys(value: Any, keys: set[str]) -> str | None:
    if isinstance(value, dict):
        for key in keys:
            text = _first_string(value.get(key))
            if text:
                return text
        for item in value.values():
            found = _find_first_string_by_keys(item, keys)
            if found:
                return found
    if isinstance(value, list):
        for item in value:
            found = _find_first_string_by_keys(item, keys)
            if found:
                return found
    return None


def _find_first_status(value: Any) -> Any:
    if isinstance(value, dict):
        for key in ("status", "status_code", "state"):
            if key in value and value[key] not in (None, ""):
                return value[key]
        for item in value.values():
            found = _find_first_status(item)
            if found not in (None, ""):
                return found
    if isinstance(value, list):
        for item in value:
            found = _find_first_status(item)
            if found not in (None, ""):
                return found
    return None


def _iter_error_values(value: Any):
    if isinstance(value, dict):
        for key in ("errmsg", "error", "message", "fail_code", "fail_starling_message", "status_msg"):
            item = value.get(key)
            if item not in (None, ""):
                yield item
        for item in value.values():
            yield from _iter_error_values(item)
    elif isinstance(value, list):
        for item in value:
            yield from _iter_error_values(item)


def _first_string(*values: Any) -> str | None:
    for value in values:
        if value is None:
            continue
        text = str(value).strip()
        if text:
            return text
    return None