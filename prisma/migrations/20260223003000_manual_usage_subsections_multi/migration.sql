ALTER TABLE "ai_logs"
  ADD COLUMN "manual_usage_subsections" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[];
