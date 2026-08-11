import json
from typing import Dict, Any, Optional
from app.db import get_db_cursor

def _extract_key_from_dict_or_json(data: Any, key: str) -> Any:
    if not isinstance(data, dict):
        return None
    if key in data:
        return data[key]
    if "response_text" in data and isinstance(data["response_text"], str):
        txt = data["response_text"].strip()
        if txt.startswith("```"):
            lines = txt.splitlines()
            if len(lines) > 2:
                txt = "\n".join(lines[1:-1]).strip()
        try:
            parsed = json.loads(txt)
            if isinstance(parsed, dict) and key in parsed:
                return parsed[key]
        except Exception:
            pass
    if "payload" in data and isinstance(data["payload"], dict):
        val = _extract_key_from_dict_or_json(data["payload"], key)
        if val is not None:
            return val
    return None

def evaluate_safe_condition(condition_str: str, prev_output: Dict[str, Any], run_id: Optional[str] = None) -> bool:
    """
    Safely evaluates a conditional string against previous step outputs and prior step runs without using eval().
    Example condition_str:
      - "priority == HIGH"
      - "status_code == 200"
      - "status == success"
    """
    if not condition_str or not isinstance(condition_str, str):
        return True

    clean_str = condition_str.strip()

    # Operators to check
    for op in ["==", "!=", ">=", "<=", ">", "<"]:
        if op in clean_str:
            parts = clean_str.split(op, 1)
            left_key = parts[0].strip()
            right_val = parts[1].strip().strip('"').strip("'")

            # 1. Fetch left value from prev_output dict
            left_val = _extract_key_from_dict_or_json(prev_output, left_key)

            # 2. If not found in prev_output, search all prior step_runs for run_id
            if left_val is None and run_id:
                with get_db_cursor() as cursor:
                    cursor.execute(
                        "SELECT output FROM public.step_runs WHERE workflow_run_id = %s AND status = 'completed' ORDER BY started_at ASC;",
                        (run_id,)
                    )
                    rows = cursor.fetchall()
                    for r in rows:
                        out = r["output"]
                        if isinstance(out, str):
                            try:
                                out = json.loads(out)
                            except Exception:
                                pass
                        extracted = _extract_key_from_dict_or_json(out, left_key)
                        if extracted is not None:
                            left_val = extracted
                            break

            if left_val is None:
                left_val = ""

            # Convert right value if left value is int or float
            if isinstance(left_val, int):
                try:
                    right_val = int(right_val)
                except ValueError:
                    pass
            elif isinstance(left_val, float):
                try:
                    right_val = float(right_val)
                except ValueError:
                    pass

            if op == "==":
                return str(left_val).strip() == str(right_val).strip()
            elif op == "!=":
                return str(left_val).strip() != str(right_val).strip()
            elif op == ">":
                return left_val > right_val if isinstance(left_val, (int, float)) else False
            elif op == "<":
                return left_val < right_val if isinstance(left_val, (int, float)) else False
            elif op == ">=":
                return left_val >= right_val if isinstance(left_val, (int, float)) else False
            elif op == "<=":
                return left_val <= right_val if isinstance(left_val, (int, float)) else False

    # Default fallback: check if key exists and is truthy
    left_val = _extract_key_from_dict_or_json(prev_output, clean_str)
    return bool(left_val)

def execute_conditional_step(config: Dict[str, Any], prev_output: Dict[str, Any], step: Dict[str, Any], run_id: Optional[str] = None) -> Dict[str, Any]:
    """
    Evaluates conditional step configuration and returns routing decision.
    """
    condition_expr = config.get("condition", "status_code == 200")
    is_true = evaluate_safe_condition(condition_expr, prev_output, run_id=run_id)

    selected_next_step_id = step.get("true_next_step_id") if is_true else step.get("false_next_step_id")

    return {
        "condition_evaluated": condition_expr,
        "is_true": is_true,
        "selected_next_step_id": selected_next_step_id
    }
