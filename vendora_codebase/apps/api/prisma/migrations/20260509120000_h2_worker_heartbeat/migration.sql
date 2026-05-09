CREATE TYPE "WorkerHeartbeatStatus" AS ENUM ('RUNNING', 'STOPPED', 'ERROR');

CREATE TABLE "WorkerHeartbeat" (
    "id" TEXT NOT NULL,
    "workerName" TEXT NOT NULL,
    "instanceId" TEXT NOT NULL,
    "status" "WorkerHeartbeatStatus" NOT NULL DEFAULT 'RUNNING',
    "runs" INTEGER NOT NULL DEFAULT 0,
    "processed" INTEGER NOT NULL DEFAULT 0,
    "idleRuns" INTEGER NOT NULL DEFAULT 0,
    "lastStartedAt" TIMESTAMP(3),
    "lastHeartbeatAt" TIMESTAMP(3),
    "lastStoppedAt" TIMESTAMP(3),
    "lastError" TEXT,
    "metadata" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "WorkerHeartbeat_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "WorkerHeartbeat_workerName_instanceId_key" ON "WorkerHeartbeat"("workerName", "instanceId");
CREATE INDEX "WorkerHeartbeat_workerName_idx" ON "WorkerHeartbeat"("workerName");
CREATE INDEX "WorkerHeartbeat_status_idx" ON "WorkerHeartbeat"("status");
CREATE INDEX "WorkerHeartbeat_lastHeartbeatAt_idx" ON "WorkerHeartbeat"("lastHeartbeatAt");
