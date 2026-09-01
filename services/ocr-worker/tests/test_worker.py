from app.main import _flatten


def test_flatten_preserves_text_confidence_and_bbox() -> None:
    result = _flatten([
        {"res": {"rec_texts": ["소비기한 2026.09.02"], "rec_scores": [0.93], "rec_boxes": [[1, 2, 3, 4]]}},
    ], image_size=(10, 20))

    assert result[0].text == "소비기한 2026.09.02"
    assert result[0].confidence == 0.93
    assert result[0].bbox == [0.1, 0.8, 0.2, 0.1]
