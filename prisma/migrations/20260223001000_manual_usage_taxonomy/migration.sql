ALTER TABLE "ai_logs"
  ADD COLUMN "manual_usage_section" VARCHAR(100),
  ADD COLUMN "manual_usage_subsection" VARCHAR(150),
  ADD COLUMN "manual_usage_taxonomy_version" VARCHAR(20);
