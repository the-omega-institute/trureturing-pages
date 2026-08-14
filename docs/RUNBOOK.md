# Runbook

## Attended start
Purpose: begin a supervised run with explicit operator awareness. Safety: verify the intended repository and a clean, in-scope working directory before starting.

`TODO(Phase C): start command`

## Single-round enqueue
Purpose: enqueue exactly one eligible work item. Safety: confirm source snapshot and dependency closure before enqueueing.

`TODO(Phase C): enqueue command`

## Observe (status, logs)
Purpose: monitor progress and evidence without mutating state. Safety: use read-only status and log views.

`TODO(Phase C): status command; TODO(Phase C): logs command`

## Normal foreground exit
Purpose: finish a supervised process and verify its receipt. Safety: preserve the run receipt and confirm the process exited normally.

`TODO(Phase C): exit command`

## Failure recovery
Purpose: recover after interruption without duplicating accepted work. Safety: re-derive from durable receipts and verify digests before resuming.

`TODO(Phase C): recovery command`

## Dead-letter replay
Purpose: explicitly replay a dead-letter item under a new attempt budget. Safety: retain the original decision and require operator authorization.

`TODO(Phase C): replay command`

## PID manual verification checklist
Purpose: ensure an operator is inspecting the intended process. Safety: all four independent facts must agree: command, cwd, PGID, and start time.

`TODO(Phase C): command + cwd + PGID + start-time evidence commands`
