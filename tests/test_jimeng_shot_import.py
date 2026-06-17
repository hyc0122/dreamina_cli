from backend.app.jimeng_matching import parse_plain_text_shots


def test_plain_text_import_preserves_scene_character_and_prop_lines():
    text = """# 1
承接：无 -> 当前分镜救援队从山里抬出白布担架
场景：山路悬崖
人物：沈云禾（年轻时期）、陆怀川、工作人员
道具：白布担架、断裂竹篮
环境描述：傍晚，暴雨后，山中悬崖边

▲俯拍，缓慢下压，全景，24mm，广角，冷灰色调。
音频：
- 动作音：泥水被膝盖压开的黏滑声
"""

    shots = parse_plain_text_shots(text)

    assert len(shots) == 1
    assert "场景：山路悬崖" in shots[0].prompt
    assert "人物：沈云禾（年轻时期）、陆怀川、工作人员" in shots[0].prompt
    assert "道具：白布担架、断裂竹篮" in shots[0].prompt
    assert shots[0].scene_names == ["山路悬崖"]
    assert shots[0].character_names == ["沈云禾（年轻时期）", "陆怀川", "工作人员"]
    assert shots[0].prop_names == ["白布担架", "断裂竹篮"]
