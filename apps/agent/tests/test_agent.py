import os
import sys
from unittest.mock import patch

# Ensure apps/agent is in PYTHONPATH
sys.path.insert(0, os.path.abspath(os.path.join(os.path.dirname(__file__), "..")))

from agent import SYSTEM_PROMPT, get_selected_model, get_openai_timeout_seconds


def test_agent_system_prompt():
    assert "Shadow Trader" in SYSTEM_PROMPT
    assert "Do not guarantee profits" in SYSTEM_PROMPT
    assert "Direction: BULLISH, BEARISH, or NEUTRAL" in SYSTEM_PROMPT


def test_get_selected_model_fast():
    with patch.dict(os.environ, {"SHADOW_TRADER_MODE": "fast"}):
        mode, model = get_selected_model()
        assert mode == "fast"
        assert model == "gpt-4o-mini"


def test_get_selected_model_deep():
    with patch.dict(os.environ, {"SHADOW_TRADER_MODE": "deep"}):
        mode, model = get_selected_model()
        assert mode == "deep"
        assert model == "gpt-4o"


def test_get_selected_model_custom_env():
    with patch.dict(os.environ, {"SHADOW_TRADER_MODE": "deep", "OPENAI_MODEL_DEEP": "gpt-4o-2024-08-06"}):
        mode, model = get_selected_model()
        assert mode == "deep"
        assert model == "gpt-4o-2024-08-06"


def test_agent_timeout_seconds():
    with patch.dict(os.environ, {"OPENAI_TIMEOUT_MS": "45000"}):
        assert get_openai_timeout_seconds() == 45.0

    with patch.dict(os.environ, {"OPENAI_TIMEOUT_MS": "100"}):
        assert get_openai_timeout_seconds() == 5.0
