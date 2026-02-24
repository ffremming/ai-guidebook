import { Prisma } from '@prisma/client';

import { prisma } from '@/lib/db/client';

export type AuditActionType =
  | 'USER_LOGIN'
  | 'LOG_CREATED'
  | 'COMPLIANCE_CLASSIFIED'
  | 'DECLARATION_EXPORTED'
  | 'RESOLUTION_SUBMITTED'
  | 'STAFF_VIEW'
  | 'POLICY_VERSION_CREATED'
  | 'POLICY_VERSION_PUBLISHED';

export interface WriteAuditLogInput {
  actorId: string;
  actionType: AuditActionType;
  resourceType: string;
  resourceId: string;
  metadataJson?: Prisma.InputJsonValue;
  ipAddress?: string;
}

export async function writeAuditLog(input: WriteAuditLogInput) {
  return prisma.auditLog.create({
    data: {
      actorId: input.actorId,
      actionType: input.actionType,
      resourceType: input.resourceType,
      resourceId: input.resourceId,
      metadataJson: input.metadataJson ?? {},
      ipAddress: input.ipAddress,
    },
  });
}
