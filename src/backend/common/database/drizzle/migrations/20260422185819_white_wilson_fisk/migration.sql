CREATE TABLE `play_inputs` (
	`id` integer PRIMARY KEY,
	`playId` text(30),
	`data` text,
	`play` text,
	`createdAt` integer,
	CONSTRAINT `fk_play_inputs_playId_plays_id_fk` FOREIGN KEY (`playId`) REFERENCES `plays`(`id`) ON UPDATE CASCADE ON DELETE CASCADE
);
--> statement-breakpoint
CREATE TABLE `plays` (
	`id` text(30) PRIMARY KEY,
	`componentType` text(50) NOT NULL,
	`componentName` text(200) NOT NULL,
	`error` text,
	`playedAt` integer,
	`seenAt` integer,
	`play` text NOT NULL,
	`parentId` text(30)
);
--> statement-breakpoint
CREATE TABLE `play_queue_state` (
	`id` integer PRIMARY KEY,
	`playId` text,
	`queueName` text(200),
	`queueStatus` text(30),
	`error` text,
	`createdAt` integer,
	CONSTRAINT `fk_play_queue_state_playId_plays_id_fk` FOREIGN KEY (`playId`) REFERENCES `plays`(`id`) ON UPDATE CASCADE ON DELETE CASCADE
);
--> statement-breakpoint
CREATE INDEX `play_input_id_idx` ON `play_inputs` (`playId`);--> statement-breakpoint
CREATE INDEX `play_parent_id_idx` ON `plays` (`parentId`);--> statement-breakpoint
CREATE INDEX `play_playedAt_idx` ON `plays` (`playedAt`);--> statement-breakpoint
CREATE INDEX `play_seenAt_idx` ON `plays` (`seenAt`);--> statement-breakpoint
CREATE INDEX `play_queue_state_id_idx` ON `play_queue_state` (`playId`);