ALTER TABLE `job_targets` ADD `skipped` integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE `jobs` ADD `exportSkipBadTimestamps` integer DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE `jobs` ADD `exportCollapseBursts` integer DEFAULT false NOT NULL;