"""即梦 CLI 设置和多账号接口边界。

负责 CLI 路径、登录、授权、积分查询、多账号 profile、能力检测和一键安装。
不要在这里放具体分镜队列提交逻辑。
"""

from fastapi import APIRouter

from .. import jimeng_api as legacy


router = APIRouter(prefix="/jimeng", tags=["jimeng-settings"])


@router.get("/settings")
def get_settings():
    return legacy.get_settings()


@router.put("/settings")
def update_settings(request: legacy.SettingsUpdate):
    return legacy.update_settings(request)


@router.get("/settings/accounts")
def list_cli_accounts():
    return legacy.list_cli_accounts()


@router.post("/settings/accounts")
def create_cli_account(request: legacy.CliAccountCreate):
    return legacy.create_cli_account(request)


@router.put("/settings/accounts/{account_id}")
def update_cli_account(account_id: str, request: legacy.CliAccountUpdate):
    return legacy.update_cli_account(account_id, request)


@router.delete("/settings/accounts/{account_id}")
def delete_cli_account(account_id: str):
    return legacy.delete_cli_account(account_id)


@router.post("/settings/accounts/{account_id}/default")
def set_default_cli_account(account_id: str):
    return legacy.set_default_cli_account(account_id)


@router.post("/settings/accounts/{account_id}/check_login")
def check_cli_account_login(account_id: str):
    return legacy.check_cli_account_login(account_id)


@router.post("/settings/accounts/{account_id}/query_credit")
def query_cli_account_credit(account_id: str):
    return legacy.query_cli_account_credit(account_id)


@router.post("/settings/accounts/{account_id}/logout")
def logout_cli_account(account_id: str):
    return legacy.logout_cli_account(account_id)


@router.post("/settings/accounts/{account_id}/login/start")
def start_cli_account_login_session(account_id: str, request: legacy.LoginSessionStart = legacy.LoginSessionStart()):
    return legacy.start_cli_account_login_session(account_id, request)


@router.post("/settings/check_cli")
def check_cli():
    return legacy.check_cli()


@router.post("/settings/install_cli")
def install_cli():
    return legacy.install_cli()


@router.post("/settings/check_login")
def check_login():
    return legacy.check_login()


@router.post("/settings/login/start")
def start_login_session(request: legacy.LoginSessionStart = legacy.LoginSessionStart()):
    return legacy.start_login_session(request)


@router.get("/settings/login_sessions/{session_id}")
def get_login_session(session_id: str):
    return legacy.get_login_session(session_id)


@router.post("/settings/login_sessions/{session_id}/cancel")
def cancel_login_session(session_id: str):
    return legacy.cancel_login_session(session_id)


@router.post("/settings/login")
def login():
    return legacy.login()


@router.post("/settings/login_debug")
def login_debug():
    return legacy.login_debug()


@router.post("/settings/relogin")
def relogin():
    return legacy.relogin()


@router.post("/settings/logout")
def logout():
    return legacy.logout()


@router.post("/settings/query_credit")
def query_credit():
    return legacy.query_credit()


@router.get("/settings/cli_paths")
def cli_paths():
    return legacy.cli_paths()


@router.get("/settings/cli_capabilities")
def cli_capabilities():
    return legacy.cli_capabilities()
