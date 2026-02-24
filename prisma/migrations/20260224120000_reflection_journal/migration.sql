CREATE TYPE "reflection_trigger_type" AS ENUM ('STANDARD_EXPORT', 'COMPLIANCE_SERIOUS');

CREATE TYPE "reflection_status" AS ENUM ('REQUIRED', 'COMPLETED');

CREATE TABLE "reflection_journal_entries" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "user_id" UUID NOT NULL,
  "assignment_id" UUID NOT NULL,
  "trigger_type" "reflection_trigger_type" NOT NULL,
  "status" "reflection_status" NOT NULL DEFAULT 'REQUIRED',
  "prompt_set_version" VARCHAR(20) NOT NULL DEFAULT 'v1',
  "responses_json" JSONB NOT NULL DEFAULT '{}'::jsonb,
  "justification_text" TEXT,
  "required_for_unlock" BOOLEAN NOT NULL DEFAULT false,
  "completed_at" TIMESTAMPTZ(6),
  "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMPTZ(6) NOT NULL,

  CONSTRAINT "reflection_journal_entries_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "reflection_journal_entries_user_id_assignment_id_trigger_type_key"
  ON "reflection_journal_entries"("user_id", "assignment_id", "trigger_type");

ALTER TABLE "reflection_journal_entries"
  ADD CONSTRAINT "reflection_journal_entries_user_id_fkey"
  FOREIGN KEY ("user_id") REFERENCES "users"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "reflection_journal_entries"
  ADD CONSTRAINT "reflection_journal_entries_assignment_id_fkey"
  FOREIGN KEY ("assignment_id") REFERENCES "assignments"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;
