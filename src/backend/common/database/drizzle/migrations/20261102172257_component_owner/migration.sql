ALTER TABLE `components` ADD `userId` text REFERENCES users(id) ON UPDATE CASCADE ON DELETE CASCADE;--> statement-breakpoint
ALTER TABLE `jobs` ADD `userId` text REFERENCES users(id) ON UPDATE CASCADE ON DELETE CASCADE;--> statement-breakpoint
DROP INDEX IF EXISTS `uid_mode_type_idx`;--> statement-breakpoint
CREATE UNIQUE INDEX `user_uid_mode_type_idx` ON `components` (`userId`,`uid`,`mode`,`type`);--> statement-breakpoint
CREATE INDEX `component_user_id_idx` ON `components` (`userId`);--> statement-breakpoint
CREATE INDEX `job_user_id_idx` ON `jobs` (`userId`);