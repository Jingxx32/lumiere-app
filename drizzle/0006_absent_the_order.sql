CREATE TABLE IF NOT EXISTS "conjugation_attempts" (
	"id" text PRIMARY KEY NOT NULL,
	"verb" text NOT NULL,
	"tense" text NOT NULL,
	"person" integer NOT NULL,
	"user_input" text NOT NULL,
	"expected" text NOT NULL,
	"correct" boolean NOT NULL,
	"answered_at" timestamp DEFAULT now() NOT NULL
);
