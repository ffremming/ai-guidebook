CREATE TABLE "reflection_notes" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "user_id" UUID NOT NULL,
  "course_id" UUID NOT NULL,
  "content" TEXT NOT NULL,
  "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "reflection_notes_pkey" PRIMARY KEY ("id")
);

ALTER TABLE "reflection_notes"
  ADD CONSTRAINT "reflection_notes_user_id_fkey"
  FOREIGN KEY ("user_id") REFERENCES "users"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "reflection_notes"
  ADD CONSTRAINT "reflection_notes_course_id_fkey"
  FOREIGN KEY ("course_id") REFERENCES "courses"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;
