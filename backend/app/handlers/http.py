import httpx
from typing import Dict, Any, Tuple
from app.config import settings

def execute_http_step(config: Dict[str, Any], input_data: Dict[str, Any], max_retries: int = 2) -> Tuple[Dict[str, Any], int, str]:
    """
    Executes an HTTP Request step with retry logic.
    Returns: (output_dict, attempt_count, error_message_if_any)
    """
    method = config.get("method", "GET").upper()
    url = config.get("url", input_data.get("url", "https://jsonplaceholder.typicode.com/todos/1"))
    headers = config.get("headers", {})
    body = config.get("body", None)

    # Documented Stub Mode: skip real HTTP call (e.g. in test environments)
    if settings.HTTP_STUB_MODE:
        return ({
            "status_code": 200,
            "data": {"stub": True, "url": url, "method": method},
            "url": url,
            "method": method,
            "stub_mode": True,
        }, 1, "")

    attempt_count = 0
    last_error = ""
    last_status_code = 500

    for attempt in range(1, max_retries + 1):
        attempt_count = attempt
        try:
            with httpx.Client(timeout=10.0) as client:
                response = client.request(method=method, url=url, headers=headers, json=body if body else None)
                last_status_code = response.status_code
                
                # Check HTTP status
                if response.status_code < 400:
                    try:
                        res_body = response.json()
                    except Exception:
                        res_body = {"text": response.text}
                    return ({
                        "status_code": response.status_code,
                        "data": res_body,
                        "url": url,
                        "method": method
                    }, attempt_count, "")
                else:
                    last_error = f"HTTP Error {response.status_code}: {response.text[:200]}"
        except Exception as e:
            last_error = f"Connection Error: {str(e)}"

    return ({
        "status_code": last_status_code,
        "error": last_error,
        "url": url
    }, attempt_count, last_error)
