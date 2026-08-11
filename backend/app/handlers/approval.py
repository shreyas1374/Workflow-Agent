from typing import Dict, Any

def execute_approval_step(config: Dict[str, Any], input_data: Dict[str, Any]) -> Dict[str, Any]:
    """
    Executes an Approval Gate step.
    Signals the workflow engine to set run status to 'paused' and stop execution loop cleanly.
    """
    prompt = config.get("message", "Human approval required to proceed.")
    return {
        "status": "paused",
        "requires_approval": True,
        "message": prompt,
        "payload": input_data
    }
