import time
import logging
import httpx
from typing import Dict, Any, Tuple
from app.config import settings

logger = logging.getLogger(__name__)

# Default supported models for each provider
PROVIDER_DEFAULTS = {
    "groq":      "llama-3.3-70b-versatile",
    "nvidia":    "nvidia/llama-3.1-nemotron-70b-instruct",
    "gemini":    "gemini-2.0-flash",
    "openrouter":"openai/gpt-4o-mini",
}

# Known valid models per provider
VALID_GROQ_MODELS = {
    "llama-3.3-70b-versatile",
    "llama-3.1-8b-instant",
    "llama3-70b-8192",
    "llama3-8b-8192",
    "mixtral-8x7b-32768",
    "gemma2-9b-it",
    "deepseek-r1-distill-llama-70b",
}

VALID_GEMINI_MODELS = {
    "gemini-2.0-flash",
    "gemini-1.5-flash",
    "gemini-1.5-pro",
}

def resolve_provider_and_model(config: Dict[str, Any]) -> Tuple[str, str]:
    """
    Explicitly resolves provider and model, ensuring provider/model consistency.
    Guarantees no invalid/mismatched model name (e.g. 'gemini-2.0-flash') is ever sent to Groq.
    """
    raw_provider = config.get("provider", "").strip().lower()
    raw_model = config.get("model", "").strip()

    # 1. Infer provider from model name if provider is not explicitly set
    if not raw_provider:
        if raw_model.lower().startswith("gemini"):
            raw_provider = "gemini"
        elif raw_model.lower().startswith("nvidia") or raw_model.lower().startswith("nv"):
            raw_provider = "nvidia"
        elif any(raw_model.lower().startswith(p) for p in ["llama", "mixtral", "gemma", "deepseek", "groq"]):
            raw_provider = "groq"
        else:
            raw_provider = settings.LLM_PROVIDER.lower()

    # 2. Validate and map model for resolved provider
    if raw_provider == "groq":
        # If Gemini key is present and model is gemini, but provider was defaulted to groq, use gemini
        if raw_model.lower().startswith("gemini") and settings.GEMINI_API_KEY and not config.get("provider"):
            return "gemini", raw_model if raw_model in VALID_GEMINI_MODELS else PROVIDER_DEFAULTS["gemini"]

        # Ensure model is valid for Groq API
        if not raw_model or raw_model not in VALID_GROQ_MODELS:
            model = PROVIDER_DEFAULTS["groq"]
        else:
            model = raw_model
        return "groq", model

    elif raw_provider == "gemini":
        if not raw_model or raw_model not in VALID_GEMINI_MODELS:
            model = PROVIDER_DEFAULTS["gemini"]
        else:
            model = raw_model
        return "gemini", model

    elif raw_provider == "nvidia":
        model = raw_model if raw_model else PROVIDER_DEFAULTS["nvidia"]
        return "nvidia", model

    return raw_provider or "groq", raw_model or PROVIDER_DEFAULTS["groq"]


def _call_groq(prompt: str, model: str) -> Dict[str, Any]:
    """Call Groq OpenAI-compatible API."""
    model = model or PROVIDER_DEFAULTS["groq"]
    groq_key = settings.GROQ_API_KEY.strip('"').strip("'")
    response = httpx.post(
        "https://api.groq.com/openai/v1/chat/completions",
        headers={
            "Authorization": f"Bearer {groq_key}",
            "Content-Type": "application/json",
        },
        json={
            "model": model,
            "messages": [{"role": "user", "content": prompt}],
            "max_tokens": 1024,
            "temperature": 0.7,
        },
        timeout=30.0,
    )
    response.raise_for_status()
    data = response.json()
    text = data["choices"][0]["message"]["content"]
    usage = data.get("usage", {})
    return {
        "status": "success",
        "response_text": text,
        "model": model,
        "provider": "groq",
        "usage": usage,
    }


def _call_nvidia(prompt: str, model: str) -> Dict[str, Any]:
    """Call NVIDIA NIM API (OpenAI-compatible)."""
    model = model or PROVIDER_DEFAULTS["nvidia"]
    nvidia_key = settings.NVIDIA_API_KEY.strip('"').strip("'")
    response = httpx.post(
        "https://integrate.api.nvidia.com/v1/chat/completions",
        headers={
            "Authorization": f"Bearer {nvidia_key}",
            "Content-Type": "application/json",
        },
        json={
            "model": model,
            "messages": [{"role": "user", "content": prompt}],
            "max_tokens": 1024,
            "temperature": 0.7,
            "stream": False,
        },
        timeout=30.0,
    )
    response.raise_for_status()
    data = response.json()
    text = data["choices"][0]["message"]["content"]
    usage = data.get("usage", {})
    return {
        "status": "success",
        "response_text": text,
        "model": model,
        "provider": "nvidia",
        "usage": usage,
    }


def _call_gemini(prompt: str, model: str) -> Dict[str, Any]:
    """Call Google Gemini API."""
    model = model or PROVIDER_DEFAULTS["gemini"]
    gemini_key = settings.GEMINI_API_KEY.strip('"').strip("'")
    url = (
        f"https://generativelanguage.googleapis.com/v1beta/models/"
        f"{model}:generateContent?key={gemini_key}"
    )
    response = httpx.post(
        url,
        json={"contents": [{"parts": [{"text": prompt}]}]},
        timeout=20.0,
    )
    response.raise_for_status()
    data = response.json()
    text = data["candidates"][0]["content"]["parts"][0]["text"]
    return {
        "status": "success",
        "response_text": text,
        "model": model,
        "provider": "gemini",
    }


def execute_llm_step(config: Dict[str, Any], input_data: Dict[str, Any]) -> Dict[str, Any]:
    """
    Executes an LLM Call step.
    Ensures provider/model configuration is explicit, consistent, and valid.
    """
    prompt = config.get("prompt", input_data.get("prompt", "Generate a concise summary."))
    provider, model = resolve_provider_and_model(config)

    # Stub mode (used in tests / CI)
    if settings.LLM_STUB_MODE:
        time.sleep(0.05)
        return {
            "status": "success",
            "response_text": (
                f"[LLM Stub — {provider}] Analysis of '{prompt[:60]}' completed successfully."
            ),
            "stub_mode": True,
            "model": model,
            "provider": provider,
        }

    # Real API execution
    try:
        if provider == "groq" and settings.GROQ_API_KEY:
            return _call_groq(prompt, model)
        elif provider == "gemini" and settings.GEMINI_API_KEY:
            return _call_gemini(prompt, model)
        elif provider == "nvidia" and settings.NVIDIA_API_KEY:
            return _call_nvidia(prompt, model)

        # Fallback to available key
        if settings.GROQ_API_KEY:
            return _call_groq(prompt, PROVIDER_DEFAULTS["groq"])
        if settings.NVIDIA_API_KEY:
            return _call_nvidia(prompt, PROVIDER_DEFAULTS["nvidia"])
        if settings.GEMINI_API_KEY:
            return _call_gemini(prompt, PROVIDER_DEFAULTS["gemini"])

    except Exception as e:
        logger.error(f"LLM execution failed [{provider}/{model}]: {e}")
        raise RuntimeError(f"LLM API call failed [{provider}]: {e}") from e

    # No keys configured — stub fallback with warning
    return {
        "status": "success",
        "response_text": (
            f"[LLM Stub — no API key configured for provider '{provider}']: "
            f"Analysis of '{prompt[:60]}' completed."
        ),
        "stub_mode": True,
        "model": model,
        "provider": provider,
        "warning": f"No API key found for provider '{provider}'. Set GROQ_API_KEY in .env.local",
    }
