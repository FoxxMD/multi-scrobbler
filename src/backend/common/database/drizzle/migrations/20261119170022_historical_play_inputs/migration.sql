CREATE TABLE `historical_play_inputs` (
	`id` integer PRIMARY KEY,
	`playId` integer NOT NULL,
	`data` text,
	`play` text NOT NULL,
	`playHash` text,
	`createdAt` number,
	CONSTRAINT `fk_historical_play_inputs_playId_plays_historical_id_fk` FOREIGN KEY (`playId`) REFERENCES `plays_historical`(`id`) ON UPDATE CASCADE ON DELETE CASCADE
);
--> statement-breakpoint
CREATE UNIQUE INDEX `historical_play_input_id_idx` ON `historical_play_inputs` (`playId`);