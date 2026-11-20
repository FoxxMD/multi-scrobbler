ALTER TABLE `jobs` ADD `importOverlap` text DEFAULT 'skip' NOT NULL;--> statement-breakpoint
ALTER TABLE `jobs` ADD `importReplacedAt` number;--> statement-breakpoint
ALTER TABLE `play_mirrors` ADD `segments` text DEFAULT '[]' NOT NULL;--> statement-breakpoint
ALTER TABLE `plays_historical` ADD `origin` text(50);--> statement-breakpoint
-- hand-added: existing Last.fm mirrors become user (mixed) mirrors. Their names already carry the account
UPDATE `play_mirrors` SET `service` = 'mixed', `account` = NULL WHERE `service` = 'lastfm';--> statement-breakpoint
-- hand-added: one segment per existing coverage range, origin unknown
UPDATE `play_mirrors` SET `segments` = (SELECT json_group_array(json_object('range', json(c.value), 'origin', 'unknown', 'jobId', NULL)) FROM json_each(`play_mirrors`.`coverage`) c);
