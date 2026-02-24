-- AlterTable
ALTER TABLE "audit_logs" ALTER COLUMN "metadata_json" SET DEFAULT '{}'::jsonb;

-- AlterTable
ALTER TABLE "compliance_checks" ALTER COLUMN "flags_json" SET DEFAULT '{}'::jsonb;
