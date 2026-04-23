CREATE TABLE `play_inputs` (
	`id` integer PRIMARY KEY,
	`playId` integer,
	`data` text,
	`play` text,
	`createdAt` number,
	CONSTRAINT `fk_play_inputs_playId_plays_id_fk` FOREIGN KEY (`playId`) REFERENCES `plays`(`id`) ON UPDATE CASCADE ON DELETE CASCADE
);
--> statement-breakpoint
CREATE TABLE `plays` (
	`id` integer PRIMARY KEY,
	`uid` text(30) NOT NULL,
	`componentType` text(50) NOT NULL,
	`componentName` text(200) NOT NULL,
	`error` text,
	`playedAt` number,
	`seenAt` number,
	`play` text NOT NULL,
	`state` text NOT NULL,
	`parentId` integer,
	CONSTRAINT `fk_plays_parentId_plays_id_fk` FOREIGN KEY (`parentId`) REFERENCES `plays`(`id`)
);
--> statement-breakpoint
CREATE TABLE `play_queue_state` (
	`id` integer PRIMARY KEY,
	`playId` integer,
	`queueName` text(200),
	`queueStatus` text(30),
	`retries` integer DEFAULT 0 NOT NULL,
	`error` text,
	`createdAt` number,
	`updatedAt` number,
	CONSTRAINT `fk_play_queue_state_playId_plays_id_fk` FOREIGN KEY (`playId`) REFERENCES `plays`(`id`) ON UPDATE CASCADE ON DELETE CASCADE
);
--> statement-breakpoint
CREATE UNIQUE INDEX `play_input_id_idx` ON `play_inputs` (`playId`);--> statement-breakpoint
CREATE INDEX `play_parent_id_idx` ON `plays` (`parentId`);--> statement-breakpoint
CREATE UNIQUE INDEX `play_uid_idx` ON `plays` (`uid`);--> statement-breakpoint
CREATE INDEX `play_playedAt_idx` ON `plays` (`playedAt`);--> statement-breakpoint
CREATE INDEX `play_seenAt_idx` ON `plays` (`seenAt`);--> statement-breakpoint
CREATE INDEX `play_queue_state_id_idx` ON `play_queue_state` (`playId`);