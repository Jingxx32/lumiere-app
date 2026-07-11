CREATE TABLE IF NOT EXISTS "grammar_points" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"slug" text NOT NULL,
	"name" text NOT NULL,
	"level" text NOT NULL,
	"category" text NOT NULL,
	"order_index" integer NOT NULL,
	"summary" text NOT NULL,
	"description_en" text NOT NULL,
	"examples" jsonb NOT NULL,
	"taxonomy_subcategories" jsonb NOT NULL,
	"status" text DEFAULT 'draft' NOT NULL,
	"verified_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "grammar_points_slug_unique" UNIQUE("slug")
);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "grammar_points_category_order_idx" ON "grammar_points" USING btree ("category","order_index");