import sys
import os
sys.path.insert(0, os.path.abspath(os.path.join(os.path.dirname(__file__), "..")))

from fastapi import FastAPI, HTTPException, Body, Request
from pydantic import BaseModel
from typing import Optional
from app.executor import start_workflow_run, resume_workflow
from app.actions import router as actions_router

from fastapi.responses import JSONResponse

from app.scheduler import start_scheduler, stop_scheduler

app = FastAPI(
    title="AI Agent Workflow Executor Backend",
    description="Standalone Python + FastAPI workflow execution engine",
    version="1.0.0"
)

@app.on_event("startup")
async def startup_event():
    start_scheduler()

@app.on_event("shutdown")
async def shutdown_event():
    stop_scheduler()

@app.exception_handler(HTTPException)
async def hasura_http_exception_handler(request: Request, exc: HTTPException):
    return JSONResponse(
        status_code=exc.status_code,
        content={"message": str(exc.detail), "detail": str(exc.detail)}
    )

@app.exception_handler(Exception)
async def hasura_general_exception_handler(request: Request, exc: Exception):
    return JSONResponse(
        status_code=500,
        content={"message": str(exc), "detail": str(exc)}
    )

@app.middleware("http")
async def add_tunnel_headers(request: Request, call_next):
    response = await call_next(request)
    response.headers["bypass-tunnel-reminder"] = "true"
    return response

app.include_router(actions_router)

class ResumeRequest(BaseModel):
    approver_id: str

@app.get("/health")
def health_check():
    return {"status": "ok", "service": "workflow-executor"}

@app.post("/internal/test/run/{workflow_id}")
def test_run_workflow(workflow_id: str, trigger_type: Optional[str] = "manual"):
    """
    Internal test endpoint to trigger a workflow execution run.
    """
    try:
        run_id = start_workflow_run(workflow_id, trigger_type=trigger_type)
        return {
            "status": "started",
            "workflow_id": workflow_id,
            "workflow_run_id": run_id
        }
    except ValueError as ve:
        raise HTTPException(status_code=404, detail=str(ve))
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@app.post("/internal/test/resume/{run_id}")
def test_resume_workflow(run_id: str, req: ResumeRequest):
    """
    Internal test endpoint to resume a paused approval gate step.
    """
    try:
        resume_workflow(run_id, req.approver_id)
        return {
            "status": "resumed",
            "workflow_run_id": run_id,
            "approver_id": req.approver_id
        }
    except ValueError as ve:
        raise HTTPException(status_code=400, detail=str(ve))
    except PermissionError as pe:
        raise HTTPException(status_code=403, detail=str(pe))
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))
