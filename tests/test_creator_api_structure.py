from pathlib import Path


def test_creator_router_is_registered():
    router = Path("backend/app/api/router.py").read_text(encoding="utf-8")
    assert "creator" in router
    assert "creator_router" in router


def test_creator_api_uses_existing_llm_settings_without_exposing_key():
    source = Path("backend/app/api/creator.py").read_text(encoding="utf-8")
    assert "load_llm_settings" in source
    assert "api_key" not in source.lower().replace("api_key_secret", "")
    assert "/creator/chat/fallback" in source
