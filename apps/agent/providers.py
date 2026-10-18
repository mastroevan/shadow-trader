import json
import os
import re
from typing import Any, Optional
import requests

SUPPORTED_PROVIDERS: dict[str, dict[str, Any]] = {
    "openai": {
        "id": "openai",
        "name": "OpenAI",
        "env_key": "OPENAI_API_KEY",
        "models": [
            {"id": "gpt-4o-mini", "name": "GPT-4o Mini", "tier": "fast", "description": "High-speed, low-latency analysis"},
            {"id": "gpt-4o", "name": "GPT-4o", "tier": "deep", "description": "Frontier multimodal reasoning & thesis synthesis"},
        ],
        "default_fast": "gpt-4o-mini",
        "default_deep": "gpt-4o",
    },
    "anthropic": {
        "id": "anthropic",
        "name": "Anthropic Claude",
        "env_key": "ANTHROPIC_API_KEY",
        "models": [
            {"id": "claude-3-5-haiku-20241022", "name": "Claude 3.5 Haiku", "tier": "fast", "description": "Ultra-fast technical setup scanner"},
            {"id": "claude-3-5-sonnet-20241022", "name": "Claude 3.5 Sonnet", "tier": "deep", "description": "State-of-the-art market context & risk evaluation"},
        ],
        "default_fast": "claude-3-5-haiku-20241022",
        "default_deep": "claude-3-5-sonnet-20241022",
    },
    "google": {
        "id": "google",
        "name": "Google Gemini",
        "env_key": "GEMINI_API_KEY",
        "alt_env_key": "GOOGLE_API_KEY",
        "models": [
            {"id": "gemini-2.0-flash", "name": "Gemini 2.0 Flash", "tier": "fast", "description": "Next-gen low-latency multimodal reasoning"},
            {"id": "gemini-1.5-pro", "name": "Gemini 1.5 Pro", "tier": "deep", "description": "Deep contextual reasoning & long-window analysis"},
        ],
        "default_fast": "gemini-2.0-flash",
        "default_deep": "gemini-1.5-pro",
    },
}


def get_available_providers() -> list[dict[str, Any]]:
    providers_list = []
    for pid, pdata in SUPPORTED_PROVIDERS.items():
        has_key = bool(os.getenv(pdata["env_key"]))
        if not has_key and "alt_env_key" in pdata:
            has_key = bool(os.getenv(pdata["alt_env_key"]))

        providers_list.append({
            "id": pid,
            "name": pdata["name"],
            "is_configured": has_key,
            "default_fast": pdata["default_fast"],
            "default_deep": pdata["default_deep"],
            "models": pdata["models"],
        })
    return providers_list


def resolve_provider_and_model(
    requested_provider: Optional[str] = None,
    requested_model: Optional[str] = None,
    requested_mode: Optional[str] = None,
) -> tuple[str, str, str]:
    mode = (requested_mode or os.getenv("SHADOW_TRADER_MODE", "fast")).lower()
    if mode not in {"fast", "deep"}:
        raise ValueError("mode must be either 'fast' or 'deep'")

    provider = (requested_provider or os.getenv("SHADOW_TRADER_PROVIDER", "openai")).lower()
    if provider not in SUPPORTED_PROVIDERS:
        raise ValueError(f"Unsupported provider '{provider}'. Must be one of: {', '.join(SUPPORTED_PROVIDERS.keys())}")

    pdata = SUPPORTED_PROVIDERS[provider]
    if requested_model:
        model = requested_model
    else:
        if mode == "deep":
            model = os.getenv(f"{provider.upper()}_MODEL_DEEP", pdata["default_deep"])
        else:
            model = os.getenv(f"{provider.upper()}_MODEL_FAST", pdata["default_fast"])

    return provider, model, mode


def execute_llm_completion(
    provider: str,
    model: str,
    prompt: str,
    timeout_seconds: float = 60.0,
    system_prompt: Optional[str] = None,
) -> str:
    system_instruction = system_prompt or (
        "You are Shadow Trader's trading analysis agent. "
        "Return only valid JSON matching the requested schema. Do not wrap in markdown."
    )

    if provider == "openai":
        return _call_openai(model, prompt, system_instruction, timeout_seconds)
    elif provider == "anthropic":
        return _call_anthropic(model, prompt, system_instruction, timeout_seconds)
    elif provider == "google":
        return _call_google_gemini(model, prompt, system_instruction, timeout_seconds)
    else:
        raise ValueError(f"Unknown provider '{provider}'")


def _call_openai(model: str, prompt: str, system_prompt: str, timeout: float) -> str:
    api_key = os.getenv("OPENAI_API_KEY")
    if not api_key:
        raise RuntimeError("OPENAI_API_KEY is not configured.")

    response = requests.post(
        "https://api.openai.com/v1/chat/completions",
        headers={
            "Authorization": f"Bearer {api_key}",
            "Content-Type": "application/json",
        },
        json={
            "model": model,
            "temperature": 0,
            "response_format": {"type": "json_object"},
            "messages": [
                {"role": "system", "content": system_prompt},
                {"role": "user", "content": prompt},
            ],
        },
        timeout=timeout,
    )
    if not response.ok:
        raise RuntimeError(f"OpenAI request failed ({response.status_code}): {response.text[:500]}")

    payload = response.json()
    return payload["choices"][0]["message"]["content"]


def _call_anthropic(model: str, prompt: str, system_prompt: str, timeout: float) -> str:
    api_key = os.getenv("ANTHROPIC_API_KEY")
    if not api_key:
        raise RuntimeError("ANTHROPIC_API_KEY is not configured.")

    response = requests.post(
        "https://api.anthropic.com/v1/messages",
        headers={
            "x-api-key": api_key,
            "anthropic-version": "2023-06-01",
            "Content-Type": "application/json",
        },
        json={
            "model": model,
            "max_tokens": 4096,
            "temperature": 0,
            "system": system_prompt,
            "messages": [
                {"role": "user", "content": prompt},
            ],
        },
        timeout=timeout,
    )
    if not response.ok:
        raise RuntimeError(f"Anthropic request failed ({response.status_code}): {response.text[:500]}")

    payload = response.json()
    content_blocks = payload.get("content", [])
    text_pieces = [b.get("text", "") for b in content_blocks if b.get("type") == "text"]
    return "".join(text_pieces)


def _call_google_gemini(model: str, prompt: str, system_prompt: str, timeout: float) -> str:
    api_key = os.getenv("GEMINI_API_KEY") or os.getenv("GOOGLE_API_KEY")
    if not api_key:
        raise RuntimeError("GEMINI_API_KEY or GOOGLE_API_KEY is not configured.")

    url = f"https://generativelanguage.googleapis.com/v1beta/models/{model}:generateContent?key={api_key}"
    response = requests.post(
        url,
        headers={"Content-Type": "application/json"},
        json={
            "system_instruction": {
                "parts": [{"text": system_prompt}]
            },
            "contents": [
                {
                    "role": "user",
                    "parts": [{"text": prompt}],
                }
            ],
            "generationConfig": {
                "temperature": 0,
                "responseMimeType": "application/json",
            },
        },
        timeout=timeout,
    )
    if not response.ok:
        raise RuntimeError(f"Google Gemini request failed ({response.status_code}): {response.text[:500]}")

    payload = response.json()
    candidates = payload.get("candidates", [])
    if not candidates:
        raise RuntimeError("Gemini returned empty candidate list.")

    parts = candidates[0].get("content", {}).get("parts", [])
    text_pieces = [p.get("text", "") for p in parts if "text" in p]
    return "".join(text_pieces)
