ALTER TABLE `users` ADD `publicId` text;--> statement-breakpoint
-- backfill existing users. New users get an id from generatePublicId() (schema/auth.ts $defaultFn), these are just hex
UPDATE `users` SET `publicId` = lower(hex(randomblob(5))) WHERE `publicId` IS NULL;--> statement-breakpoint
CREATE UNIQUE INDEX `users_publicId_idx` ON `users` (`publicId`);
