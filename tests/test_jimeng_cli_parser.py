from backend.app.cli.errors import DreaminaErrorCategory
from backend.app.cli.parser import classify_dreamina_error, parse_dreamina_output


def test_parser_extracts_submit_id_status_url_and_local_path():
    result = parse_dreamina_output(
        """
        submit_id: task_123
        gen_status: done
        result_url: https://example.com/video.mp4
        saved: G:\\漫剧\\out\\shot1.mp4
        """
    )

    assert result.submit_id == "task_123"
    assert result.gen_status == "done"
    assert result.result_url == "https://example.com/video.mp4"
    assert result.local_paths == ["G:\\漫剧\\out\\shot1.mp4"]
    assert result.error_category is None


def test_parser_classifies_login_required_error():
    message = "请先登录，即梦 CLI token 不存在，请执行 dreamina login"

    assert classify_dreamina_error(message) == DreaminaErrorCategory.AUTH_REQUIRED
    assert parse_dreamina_output(message).error_category == DreaminaErrorCategory.AUTH_REQUIRED


def test_parser_classifies_credit_error():
    message = "generation failed: insufficient credit balance"

    assert classify_dreamina_error(message) == DreaminaErrorCategory.CREDIT_INSUFFICIENT
    assert parse_dreamina_output(message).error_category == DreaminaErrorCategory.CREDIT_INSUFFICIENT
