-- Migration: init_schema
-- AI Guidebook — initial database schema
-- Generated from prisma/schema.prisma via `prisma migrate diff --from-empty --to-schema-datamodel`
-- Trigger section appended manually per architectural document section 7 (NFR-2).

-- CreateEnum
CREATE TYPE "user_role" AS ENUM ('STUDENT', 'INSTRUCTOR', 'ADMIN');

-- CreateEnum
CREATE TYPE "enrollment_role" AS ENUM ('STUDENT', 'INSTRUCTOR');

-- CreateEnum
CREATE TYPE "assignment_status" AS ENUM ('ACTIVE', 'CLOSED');

-- CreateEnum
CREATE TYPE "policy_status" AS ENUM ('DRAFT', 'ACTIVE', 'ARCHIVED');

-- CreateEnum
CREATE TYPE "severity_level" AS ENUM ('ALLOWED', 'MINOR', 'MODERATE', 'SERIOUS', 'FORBIDDEN');

-- CreateEnum
CREATE TYPE "compliance_status" AS ENUM ('PENDING', 'COMPLIANT', 'WARNING', 'NON_COMPLIANT');

-- CreateEnum
CREATE TYPE "resolution_status" AS ENUM ('NONE', 'UNRESOLVED', 'STUDENT_RESPONDED');

-- CreateEnum
CREATE TYPE "check_type" AS ENUM ('PRE_SESSION', 'POST_SESSION');

-- CreateEnum
CREATE TYPE "declaration_status" AS ENUM ('DRAFT', 'EXPORTED');

-- CreateTable
CREATE TABLE "users" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "email" VARCHAR(320) NOT NULL,
    "name" VARCHAR(255) NOT NULL,
    "role" "user_role" NOT NULL,
    "feide_sub" VARCHAR(255),
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "users_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "courses" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "course_code" VARCHAR(20) NOT NULL,
    "name" VARCHAR(255) NOT NULL,
    "institution" VARCHAR(255) NOT NULL DEFAULT 'NTNU',
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "courses_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "enrollments" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "user_id" UUID NOT NULL,
    "course_id" UUID NOT NULL,
    "role" "enrollment_role" NOT NULL,
    "enrolled_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "enrollments_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "policy_versions" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "version_number" VARCHAR(100) NOT NULL,
    "description" TEXT,
    "status" "policy_status" NOT NULL DEFAULT 'DRAFT',
    "published_by" UUID,
    "published_at" TIMESTAMPTZ(6),
    "archived_at" TIMESTAMPTZ(6),
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "policy_versions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "policy_rules" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "policy_version_id" UUID NOT NULL,
    "usage_category" VARCHAR(100) NOT NULL,
    "severity_level" "severity_level" NOT NULL,
    "description" TEXT,
    "rule_reference" VARCHAR(100) NOT NULL,
    "keywords" TEXT[] DEFAULT ARRAY[]::TEXT[],

    CONSTRAINT "policy_rules_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "assignments" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "course_id" UUID NOT NULL,
    "title" VARCHAR(500) NOT NULL,
    "description" TEXT,
    "due_date" TIMESTAMPTZ(6),
    "status" "assignment_status" NOT NULL DEFAULT 'ACTIVE',
    "pinned_policy_version_id" UUID,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "assignments_pkey" PRIMARY KEY ("id")
);

-- CreateTable
-- Sensitive fields (usage_reason, session_description) are encrypted at the
-- application layer with AES-256-GCM before every INSERT or UPDATE (NFR-2).
CREATE TABLE "ai_logs" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "user_id" UUID NOT NULL,
    "assignment_id" UUID NOT NULL,
    "usage_reason" TEXT NOT NULL,
    "session_description" TEXT,
    "ai_tool" VARCHAR(100) NOT NULL,
    "logged_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "compliance_status" "compliance_status" NOT NULL DEFAULT 'PENDING',
    "flag_severity" "severity_level",
    "intent_category" VARCHAR(100),
    "actual_usage_category" VARCHAR(100),
    "conflict_flag" BOOLEAN NOT NULL DEFAULT false,
    "direct_violation_flag" BOOLEAN NOT NULL DEFAULT false,
    "applied_policy_version_id" UUID NOT NULL,
    "resolution_status" "resolution_status" NOT NULL DEFAULT 'NONE',
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "ai_logs_pkey" PRIMARY KEY ("id")
);

-- CreateTable
-- url field is encrypted at the application layer (NFR-2).
CREATE TABLE "conversation_links" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "ai_log_id" UUID NOT NULL,
    "url" TEXT NOT NULL,
    "label" VARCHAR(255),
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "conversation_links_pkey" PRIMARY KEY ("id")
);

-- CreateTable
-- input_text field is encrypted at the application layer (NFR-2).
CREATE TABLE "compliance_checks" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "ai_log_id" UUID,
    "check_type" "check_type" NOT NULL,
    "policy_version_id" UUID NOT NULL,
    "input_text" TEXT NOT NULL,
    "detected_category" VARCHAR(100) NOT NULL,
    "compliance_result" "compliance_status" NOT NULL,
    "rule_references" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "flags_json" JSONB NOT NULL DEFAULT '{}'::jsonb,
    "checked_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "compliance_checks_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "declarations" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "user_id" UUID NOT NULL,
    "assignment_id" UUID NOT NULL,
    "system_generated_summary" TEXT NOT NULL,
    "student_remarks" TEXT,
    "policy_version_id" UUID NOT NULL,
    "status" "declaration_status" NOT NULL DEFAULT 'DRAFT',
    "exported_at" TIMESTAMPTZ(6),
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "declarations_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "resolutions" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "ai_log_id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "narrative_explanation" TEXT NOT NULL,
    "disputed_category" VARCHAR(100),
    "dispute_evidence" TEXT,
    "original_system_category" VARCHAR(100) NOT NULL,
    "submitted_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "resolutions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "policy_change_notifications" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "user_id" UUID NOT NULL,
    "assignment_id" UUID NOT NULL,
    "old_policy_version_id" UUID NOT NULL,
    "new_policy_version_id" UUID NOT NULL,
    "change_summary" TEXT NOT NULL,
    "is_read" BOOLEAN NOT NULL DEFAULT false,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "policy_change_notifications_pkey" PRIMARY KEY ("id")
);

-- CreateTable
-- APPEND-ONLY: protected by the trigger below (NFR-2).
CREATE TABLE "audit_logs" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "actor_id" UUID NOT NULL,
    "action_type" VARCHAR(100) NOT NULL,
    "resource_type" VARCHAR(50) NOT NULL,
    "resource_id" UUID NOT NULL,
    "metadata_json" JSONB NOT NULL DEFAULT '{}'::jsonb,
    "ip_address" VARCHAR(45),
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "audit_logs_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "users_email_key" ON "users"("email");

-- CreateIndex
CREATE UNIQUE INDEX "users_feide_sub_key" ON "users"("feide_sub");

-- CreateIndex
CREATE UNIQUE INDEX "courses_course_code_key" ON "courses"("course_code");

-- CreateIndex
CREATE UNIQUE INDEX "enrollments_user_id_course_id_key" ON "enrollments"("user_id", "course_id");

-- CreateIndex
CREATE UNIQUE INDEX "policy_versions_version_number_key" ON "policy_versions"("version_number");

-- CreateIndex
CREATE UNIQUE INDEX "policy_rules_policy_version_id_usage_category_key" ON "policy_rules"("policy_version_id", "usage_category");

-- CreateIndex
CREATE UNIQUE INDEX "declarations_user_id_assignment_id_key" ON "declarations"("user_id", "assignment_id");

-- CreateIndex
CREATE UNIQUE INDEX "resolutions_ai_log_id_key" ON "resolutions"("ai_log_id");

-- AddForeignKey
ALTER TABLE "enrollments" ADD CONSTRAINT "enrollments_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "enrollments" ADD CONSTRAINT "enrollments_course_id_fkey" FOREIGN KEY ("course_id") REFERENCES "courses"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "policy_versions" ADD CONSTRAINT "policy_versions_published_by_fkey" FOREIGN KEY ("published_by") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "policy_rules" ADD CONSTRAINT "policy_rules_policy_version_id_fkey" FOREIGN KEY ("policy_version_id") REFERENCES "policy_versions"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "assignments" ADD CONSTRAINT "assignments_course_id_fkey" FOREIGN KEY ("course_id") REFERENCES "courses"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "assignments" ADD CONSTRAINT "assignments_pinned_policy_version_id_fkey" FOREIGN KEY ("pinned_policy_version_id") REFERENCES "policy_versions"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ai_logs" ADD CONSTRAINT "ai_logs_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ai_logs" ADD CONSTRAINT "ai_logs_assignment_id_fkey" FOREIGN KEY ("assignment_id") REFERENCES "assignments"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ai_logs" ADD CONSTRAINT "ai_logs_applied_policy_version_id_fkey" FOREIGN KEY ("applied_policy_version_id") REFERENCES "policy_versions"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "conversation_links" ADD CONSTRAINT "conversation_links_ai_log_id_fkey" FOREIGN KEY ("ai_log_id") REFERENCES "ai_logs"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "compliance_checks" ADD CONSTRAINT "compliance_checks_ai_log_id_fkey" FOREIGN KEY ("ai_log_id") REFERENCES "ai_logs"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "compliance_checks" ADD CONSTRAINT "compliance_checks_policy_version_id_fkey" FOREIGN KEY ("policy_version_id") REFERENCES "policy_versions"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "declarations" ADD CONSTRAINT "declarations_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "declarations" ADD CONSTRAINT "declarations_assignment_id_fkey" FOREIGN KEY ("assignment_id") REFERENCES "assignments"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "declarations" ADD CONSTRAINT "declarations_policy_version_id_fkey" FOREIGN KEY ("policy_version_id") REFERENCES "policy_versions"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "resolutions" ADD CONSTRAINT "resolutions_ai_log_id_fkey" FOREIGN KEY ("ai_log_id") REFERENCES "ai_logs"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "resolutions" ADD CONSTRAINT "resolutions_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "policy_change_notifications" ADD CONSTRAINT "policy_change_notifications_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "policy_change_notifications" ADD CONSTRAINT "policy_change_notifications_assignment_id_fkey" FOREIGN KEY ("assignment_id") REFERENCES "assignments"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "policy_change_notifications" ADD CONSTRAINT "policy_change_notifications_old_policy_version_id_fkey" FOREIGN KEY ("old_policy_version_id") REFERENCES "policy_versions"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "policy_change_notifications" ADD CONSTRAINT "policy_change_notifications_new_policy_version_id_fkey" FOREIGN KEY ("new_policy_version_id") REFERENCES "policy_versions"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "audit_logs" ADD CONSTRAINT "audit_logs_actor_id_fkey" FOREIGN KEY ("actor_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- ─────────────────────────────────────────────────────────────────────────────
-- AUDIT LOG PROTECTION TRIGGER  (NFR-2)
--
-- The audit_logs table is append-only by design. No row may ever be updated or
-- deleted — this is a non-negotiable requirement for academic integrity audit
-- trails. The trigger below enforces this invariant at the database engine level,
-- independently of application-layer access controls.
--
-- Attempting UPDATE or DELETE on any audit_logs row raises a PostgreSQL
-- exception and aborts the transaction.
-- ─────────────────────────────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION fn_prevent_audit_log_modification()
RETURNS TRIGGER AS $$
BEGIN
  RAISE EXCEPTION
    'audit_logs is append-only. % operations are not permitted. '
    'Action type: %. Actor: %.',
    TG_OP,
    CASE TG_OP WHEN 'UPDATE' THEN OLD.action_type ELSE OLD.action_type END,
    OLD.actor_id;
  RETURN NULL;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_audit_logs_no_update
  BEFORE UPDATE ON "audit_logs"
  FOR EACH ROW
  EXECUTE FUNCTION fn_prevent_audit_log_modification();

CREATE TRIGGER trg_audit_logs_no_delete
  BEFORE DELETE ON "audit_logs"
  FOR EACH ROW
  EXECUTE FUNCTION fn_prevent_audit_log_modification();
