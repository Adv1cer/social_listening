import type { PrismaClient } from '@prisma/client';
import type { StopReason } from '../collectors/collector.types.js';

export type RunStatus = 'running' | 'completed' | 'partial' | 'failed';

export function deriveRunStatus(stopReason: StopReason, errorCode: string | null): RunStatus {
  if (stopReason === 'blocked' || stopReason === 'error' || errorCode) return 'failed';
  return 'completed';
}

export interface CreateRunInput {
  platform: string;
  queryType: string;
  queryValue: string;
  targetPosts: number;
}

export async function createCollectionRun(prisma: PrismaClient, data: CreateRunInput) {
  return prisma.collectionRun.create({
    data: { ...data, status: 'running' as RunStatus },
  });
}

export interface FinishRunInput {
  scannedCount: number;
  foundCount: number;
  newCount: number;
  updatedCount: number;
  failedCount: number;
  stopReason: StopReason;
  status: RunStatus;
  errorCode?: string | null;
  errorMessage?: string | null;
}

export async function finishCollectionRun(prisma: PrismaClient, id: string, data: FinishRunInput) {
  return prisma.collectionRun.update({
    where: { id },
    data: { ...data, finishedAt: new Date() },
  });
}
