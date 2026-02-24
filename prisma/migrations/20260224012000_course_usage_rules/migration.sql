CREATE TABLE "course_usage_rules" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "course_id" UUID NOT NULL,
  "node_id" VARCHAR(150) NOT NULL,
  "is_allowed" BOOLEAN NOT NULL DEFAULT true,
  "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMPTZ(6) NOT NULL,

  CONSTRAINT "course_usage_rules_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "course_usage_rules_course_id_node_id_key"
  ON "course_usage_rules"("course_id", "node_id");

ALTER TABLE "course_usage_rules"
  ADD CONSTRAINT "course_usage_rules_course_id_fkey"
  FOREIGN KEY ("course_id") REFERENCES "courses"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;
