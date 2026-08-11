import pytest
from unittest.mock import patch, MagicMock
from app.handlers.llm import execute_llm_step
from app.handlers.http import execute_http_step
from app.handlers.conditional import evaluate_safe_condition, execute_conditional_step
from app.handlers.approval import execute_approval_step
import app.handlers.http as http_handler

def test_llm_step_stub():
    config = {"prompt": "Summarize user inquiry", "model": "gemini-2.0-flash"}
    res = execute_llm_step(config, {})
    assert res["status"] == "success"
    assert "Summarize user inquiry" in res["response_text"]

def test_resolve_provider_and_model():
    from app.handlers.llm import resolve_provider_and_model

    # Gemini model name with groq provider -> model mapped to llama-3.3-70b-versatile
    prov, model = resolve_provider_and_model({"provider": "groq", "model": "gemini-2.0-flash"})
    assert prov == "groq"
    assert model == "llama-3.3-70b-versatile"

    # Gemini model name without explicit provider -> infers gemini
    prov, model = resolve_provider_and_model({"model": "gemini-2.0-flash"})
    assert prov == "gemini"
    assert model == "gemini-2.0-flash"

    # Valid Groq model with groq provider -> keeps model
    prov, model = resolve_provider_and_model({"provider": "groq", "model": "llama-3.1-8b-instant"})
    assert prov == "groq"
    assert model == "llama-3.1-8b-instant"

@patch("httpx.Client.request")
def test_http_step_retry(mock_request, monkeypatch):
    # Disable HTTP stub mode so the real httpx path (and the mock) is exercised
    monkeypatch.setattr(http_handler.settings, "HTTP_STUB_MODE", False)
    # Simulate a 404 response
    mock_resp = MagicMock()
    mock_resp.status_code = 404
    mock_resp.text = "Not Found"
    mock_request.return_value = mock_resp

    config = {"method": "GET", "url": "https://api.example.com/notfound"}
    res, attempt_count, error_msg = execute_http_step(config, {}, max_retries=2)
    assert attempt_count == 2
    assert res["status_code"] == 404
    assert "HTTP Error 404" in error_msg

@patch("httpx.Client.request")
def test_http_step_success(mock_request, monkeypatch):
    # Disable HTTP stub mode so the real httpx path (and the mock) is exercised
    monkeypatch.setattr(http_handler.settings, "HTTP_STUB_MODE", False)
    # Simulate a successful 200 response
    mock_resp = MagicMock()
    mock_resp.status_code = 200
    mock_resp.json.return_value = {"url": "https://api.example.com/get"}
    mock_request.return_value = mock_resp

    config = {"method": "GET", "url": "https://api.example.com/get"}
    res, attempt_count, error_msg = execute_http_step(config, {}, max_retries=1)
    assert attempt_count == 1
    assert res["status_code"] == 200
    assert error_msg == ""
    assert res["data"]["url"] == "https://api.example.com/get"

def test_safe_conditional_evaluation():
    prev_out_success = {"status_code": 200, "status": "success"}
    prev_out_failed = {"status_code": 500, "status": "failed"}

    # Test equality checks
    assert evaluate_safe_condition("status_code == 200", prev_out_success) is True
    assert evaluate_safe_condition("status_code == 200", prev_out_failed) is False
    assert evaluate_safe_condition("status != failed", prev_out_success) is True
    assert evaluate_safe_condition("status != failed", prev_out_failed) is False

    # Test numeric comparisons
    assert evaluate_safe_condition("status_code < 400", prev_out_success) is True
    assert evaluate_safe_condition("status_code < 400", prev_out_failed) is False

def test_conditional_step_routing():
    config = {"condition": "status_code == 200"}
    step = {
        "id": "step-2",
        "step_type": "conditional_branch",
        "true_next_step_id": "step-3-approval",
        "false_next_step_id": "step-4-finish"
    }

    res_true = execute_conditional_step(config, {"status_code": 200}, step)
    assert res_true["is_true"] is True
    assert res_true["selected_next_step_id"] == "step-3-approval"

    res_false = execute_conditional_step(config, {"status_code": 500}, step)
    assert res_false["is_true"] is False
    assert res_false["selected_next_step_id"] == "step-4-finish"

def test_approval_step():
    config = {"message": "Requires Manager Sign-off"}
    res = execute_approval_step(config, {"user_data": "Alice"})
    assert res["status"] == "paused"
    assert res["requires_approval"] is True
    assert res["message"] == "Requires Manager Sign-off"
