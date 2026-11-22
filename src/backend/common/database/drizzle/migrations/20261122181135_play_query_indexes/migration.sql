DROP INDEX IF EXISTS `play_component_id_idx`;--> statement-breakpoint
DROP INDEX IF EXISTS `play_job_id_idx`;--> statement-breakpoint
CREATE INDEX `play_component_played_idx` ON `plays` (`componentId`,`playedAt`);--> statement-breakpoint
CREATE INDEX `play_job_component_state_idx` ON `plays` (`jobId`,`componentId`,`state`);--> statement-breakpoint
CREATE INDEX `play_queue_state_component_idx` ON `play_queue_states` (`componentId`,`queueName`,`queueStatus`);