-- M4 Step 1 — idempotency column for the Lambda distributor.
-- The Lambda is stateless; it spawns Fargate tasks only where this column is NULL
-- and writes the ARN immediately after RunTask. This is the M4 equivalent of the
-- in-memory _spawned_jobs set in M1's distributor.py.
ALTER TABLE job_sessions ADD COLUMN IF NOT EXISTS fargate_task_arn TEXT;

-- Partial index so the every-minute "find unspawned" query stays cheap as the
-- table grows (only un-spawned rows live in the index).
CREATE INDEX IF NOT EXISTS idx_job_sessions_unspawned
  ON job_sessions (id) WHERE fargate_task_arn IS NULL;
