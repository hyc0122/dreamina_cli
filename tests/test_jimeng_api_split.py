import inspect

import backend.app.api.projects as project_api
import backend.app.api.shots as shot_api
import backend.app.api.assets as asset_api
import backend.app.api.queue as queue_api
from backend.app.jimeng_storage import JimengStore


def test_project_and_shot_api_modules_do_not_import_legacy_api():
    for module in (project_api, shot_api):
        source = inspect.getsource(module)
        assert "jimeng_api" not in source


def test_asset_api_module_does_not_import_legacy_api():
    source = inspect.getsource(asset_api)
    assert "jimeng_api" not in source


def test_queue_api_module_does_not_import_legacy_api():
    source = inspect.getsource(queue_api)
    assert "jimeng_api" not in source


def test_project_and_shot_store_methods_delegate_to_split_modules():
    delegated_methods = [
        "create_project",
        "update_project",
        "list_projects",
        "get_project",
        "delete_project",
        "create_shot",
        "get_shot",
        "list_shots",
        "update_shot",
        "delete_shot",
        "delete_shots",
        "move_shot",
    ]
    for method_name in delegated_methods:
        source = inspect.getsource(getattr(JimengStore, method_name))
        assert "_storage." in source


def test_asset_store_methods_delegate_to_split_module():
    delegated_methods = [
        "upsert_asset_file",
        "create_asset",
        "upsert_asset_metadata",
        "update_asset",
        "list_assets",
        "update_asset_aliases",
        "delete_asset",
        "delete_assets",
        "asset_binding_shot_indexes",
    ]
    for method_name in delegated_methods:
        source = inspect.getsource(getattr(JimengStore, method_name))
        assert "asset_storage." in source


def test_account_store_methods_delegate_to_split_module():
    delegated_methods = [
        "create_cli_account",
        "list_cli_accounts",
        "get_cli_account",
        "update_cli_account",
        "set_default_cli_account",
        "delete_cli_account",
    ]
    for method_name in delegated_methods:
        source = inspect.getsource(getattr(JimengStore, method_name))
        assert "account_storage." in source


def test_queue_store_methods_delegate_to_split_module():
    delegated_methods = [
        "create_queue_item",
        "get_queue_item",
        "list_queue",
        "next_waiting_item",
        "running_queue_item",
        "count_queue",
        "update_queue_item",
        "recover_interrupted_queue_items",
    ]
    for method_name in delegated_methods:
        source = inspect.getsource(getattr(JimengStore, method_name))
        assert "queue_storage." in source
