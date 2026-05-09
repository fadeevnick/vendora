import os from 'node:os'
import type { Prisma, WorkerHeartbeatStatus } from '@prisma/client'
import { prisma } from '../../shared/db.js'

export function workerInstanceId(workerName: string) {
  return process.env['WORKER_INSTANCE_ID'] ?? `${workerName}:${os.hostname()}:${process.pid}`
}

export async function recordWorkerStarted(input: {
  workerName: string
  instanceId: string
  metadata?: Prisma.InputJsonValue
}) {
  const now = new Date()
  return prisma.workerHeartbeat.upsert({
    where: {
      workerName_instanceId: {
        workerName: input.workerName,
        instanceId: input.instanceId,
      },
    },
    update: {
      status: 'RUNNING',
      runs: 0,
      processed: 0,
      idleRuns: 0,
      lastStartedAt: now,
      lastHeartbeatAt: now,
      lastStoppedAt: null,
      lastError: null,
      metadata: input.metadata ?? undefined,
    },
    create: {
      workerName: input.workerName,
      instanceId: input.instanceId,
      status: 'RUNNING',
      lastStartedAt: now,
      lastHeartbeatAt: now,
      metadata: input.metadata ?? undefined,
    },
  })
}

export async function recordWorkerHeartbeat(input: {
  workerName: string
  instanceId: string
  runs: number
  processed?: number
  idleRuns?: number
  metadata?: Prisma.InputJsonValue
}) {
  const now = new Date()
  return prisma.workerHeartbeat.upsert({
    where: {
      workerName_instanceId: {
        workerName: input.workerName,
        instanceId: input.instanceId,
      },
    },
    update: {
      status: 'RUNNING',
      runs: input.runs,
      processed: input.processed ?? 0,
      idleRuns: input.idleRuns ?? 0,
      lastHeartbeatAt: now,
      lastError: null,
      metadata: input.metadata ?? undefined,
    },
    create: {
      workerName: input.workerName,
      instanceId: input.instanceId,
      status: 'RUNNING',
      runs: input.runs,
      processed: input.processed ?? 0,
      idleRuns: input.idleRuns ?? 0,
      lastStartedAt: now,
      lastHeartbeatAt: now,
      metadata: input.metadata ?? undefined,
    },
  })
}

export async function recordWorkerStopped(input: {
  workerName: string
  instanceId: string
  status?: WorkerHeartbeatStatus
  runs: number
  processed?: number
  idleRuns?: number
  error?: unknown
  metadata?: Prisma.InputJsonValue
}) {
  const now = new Date()
  const status = input.status ?? (input.error ? 'ERROR' : 'STOPPED')
  const errorMessage = input.error instanceof Error ? input.error.message : input.error ? String(input.error) : null
  return prisma.workerHeartbeat.upsert({
    where: {
      workerName_instanceId: {
        workerName: input.workerName,
        instanceId: input.instanceId,
      },
    },
    update: {
      status,
      runs: input.runs,
      processed: input.processed ?? 0,
      idleRuns: input.idleRuns ?? 0,
      lastHeartbeatAt: now,
      lastStoppedAt: now,
      lastError: errorMessage,
      metadata: input.metadata ?? undefined,
    },
    create: {
      workerName: input.workerName,
      instanceId: input.instanceId,
      status,
      runs: input.runs,
      processed: input.processed ?? 0,
      idleRuns: input.idleRuns ?? 0,
      lastStartedAt: now,
      lastHeartbeatAt: now,
      lastStoppedAt: now,
      lastError: errorMessage,
      metadata: input.metadata ?? undefined,
    },
  })
}
