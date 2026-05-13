CREATE TABLE `component_migrations` (
	`id` integer PRIMARY KEY,
	`componentId` integer NOT NULL,
	`name` text NOT NULL,
	`success` integer,
	`error` text,
	`attemptedAt` number NOT NULL,
	CONSTRAINT `fk_component_migrations_componentId_components_id_fk` FOREIGN KEY (`componentId`) REFERENCES `components`(`id`) ON UPDATE CASCADE ON DELETE CASCADE
);
