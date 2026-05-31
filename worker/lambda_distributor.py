"""
M4 Lambda distributor.

EventBridge fires this every minute. On each invocation:

  1. SELECT pending jobs with no Fargate task yet.
  2. For each, ensure a job_sessions row exists (creating session_number=1 if not).
  3. ecs.run_task → write the task ARN back to job_sessions.fargate_task_arn so
     the next tick skips this row (the index idx_job_sessions_unspawned keeps
     this query cheap as the table grows).

The Lambda never talks to OpenAI/Whisper directly — it just forwards the API
keys into the Fargate container's environment via containerOverrides. The
container does the actual transcription work.

Env vars (all set in Step 5c):
  SUPABASE_URL, SUPABASE_SECRET_KEY  → DB access
  OPENAI_API_KEY                     → forwarded to the container
  ECS_CLUSTER                        → "subtitle-workers"
  TASK_DEFINITION                    → "subtitle-worker"
  SUBNETS                            → comma-separated subnet IDs (awsvpc config)
  SECURITY_GROUPS                    → comma-separated SG IDs (optional; default if blank)
"""
import json
import os
from typing import Any

import boto3
from supabase import create_client


SUPABASE_URL = os.environ["SUPABASE_URL"]
SUPABASE_SECRET_KEY = os.environ["SUPABASE_SECRET_KEY"]
OPENAI_API_KEY = os.environ["OPENAI_API_KEY"]
ECS_CLUSTER = os.environ["ECS_CLUSTER"]
TASK_DEFINITION = os.environ["TASK_DEFINITION"]
SUBNETS = [s.strip() for s in os.environ["SUBNETS"].split(",") if s.strip()]
SECURITY_GROUPS = [s.strip() for s in os.environ.get("SECURITY_GROUPS", "").split(",") if s.strip()]

# Module-scope clients so warm invocations skip cold-start cost.
db = create_client(SUPABASE_URL, SUPABASE_SECRET_KEY)
ecs = boto3.client("ecs")


def _find_unspawned_jobs() -> list[dict[str, Any]]:
    """Pending jobs whose latest session has no fargate_task_arn yet.

    We can't do this in one Supabase REST call cleanly, so:
      - fetch pending jobs
      - join client-side to job_sessions (small N per minute → fine)
    """
    pending = db.table("jobs").select("id").eq("status", "pending").execute().data
    if not pending:
        return []
    pending_ids = [j["id"] for j in pending]
    sessions = (
        db.table("job_sessions")
        .select("id,job_id,session_number,fargate_task_arn")
        .in_("job_id", pending_ids)
        .execute()
        .data
    )
    # Index sessions by job_id, pick the highest session_number per job.
    latest_by_job: dict[str, dict[str, Any]] = {}
    for s in sessions:
        cur = latest_by_job.get(s["job_id"])
        if cur is None or s["session_number"] > cur["session_number"]:
            latest_by_job[s["job_id"]] = s

    out = []
    for job in pending:
        sess = latest_by_job.get(job["id"])
        if sess is None:
            out.append({"job_id": job["id"], "session": None})
        elif sess["fargate_task_arn"] is None:
            out.append({"job_id": job["id"], "session": sess})
    return out


def _ensure_session(job_id: str, existing: dict[str, Any] | None) -> dict[str, Any]:
    if existing is not None:
        return existing
    row = (
        db.table("job_sessions")
        .insert({"job_id": job_id, "session_number": 1})
        .execute()
        .data[0]
    )
    return row


def _spawn(job_id: str) -> str:
    """Launch a Fargate task for this job; return the task ARN."""
    net = {
        "subnets": SUBNETS,
        "assignPublicIp": "ENABLED",  # public subnet, no NAT
    }
    if SECURITY_GROUPS:
        net["securityGroups"] = SECURITY_GROUPS

    resp = ecs.run_task(
        cluster=ECS_CLUSTER,
        taskDefinition=TASK_DEFINITION,
        launchType="FARGATE",
        count=1,
        networkConfiguration={"awsvpcConfiguration": net},
        overrides={
            "containerOverrides": [
                {
                    "name": "worker",
                    "environment": [
                        {"name": "JOB_ID", "value": job_id},
                        {"name": "SUPABASE_URL", "value": SUPABASE_URL},
                        {"name": "SUPABASE_SECRET_KEY", "value": SUPABASE_SECRET_KEY},
                        {"name": "OPENAI_API_KEY", "value": OPENAI_API_KEY},
                    ],
                }
            ]
        },
    )
    failures = resp.get("failures") or []
    if failures:
        raise RuntimeError(f"run_task failed for {job_id}: {failures}")
    return resp["tasks"][0]["taskArn"]


def handler(event, _context):
    spawned = []
    errors = []
    for item in _find_unspawned_jobs():
        job_id = item["job_id"]
        try:
            sess = _ensure_session(job_id, item["session"])
            arn = _spawn(job_id)
            db.table("job_sessions").update({"fargate_task_arn": arn}).eq("id", sess["id"]).execute()
            spawned.append({"job_id": job_id, "task_arn": arn})
        except Exception as e:  # noqa: BLE001
            errors.append({"job_id": job_id, "error": str(e)})
    result = {"spawned": spawned, "errors": errors}
    print(json.dumps(result))
    return result
