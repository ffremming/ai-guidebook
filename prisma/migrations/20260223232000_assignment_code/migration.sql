ALTER TABLE "assignments"
  ADD COLUMN "assignment_code" VARCHAR(32);

UPDATE "assignments"
SET "assignment_code" = 'ASG-' || UPPER(SUBSTRING(md5("id"::text), 1, 8))
WHERE "assignment_code" IS NULL;

ALTER TABLE "assignments"
  ALTER COLUMN "assignment_code" SET NOT NULL;

CREATE UNIQUE INDEX "assignments_assignment_code_key"
  ON "assignments"("assignment_code");
