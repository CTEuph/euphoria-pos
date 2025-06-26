CREATE TABLE `master_data_versions` (
	`data_type` text PRIMARY KEY NOT NULL,
	`version` integer DEFAULT 0 NOT NULL,
	`last_synced_at` integer,
	`record_count` integer DEFAULT 0 NOT NULL,
	`checksum` text
);
--> statement-breakpoint
CREATE TABLE `sync_queue` (
	`id` text PRIMARY KEY NOT NULL,
	`operation` text NOT NULL,
	`entity_type` text NOT NULL,
	`entity_id` text NOT NULL,
	`payload` text NOT NULL,
	`priority` integer DEFAULT 5 NOT NULL,
	`retry_count` integer DEFAULT 0 NOT NULL,
	`max_retries` integer DEFAULT 5 NOT NULL,
	`status` text DEFAULT 'pending' NOT NULL,
	`error` text,
	`created_at` integer NOT NULL,
	`scheduled_for` integer NOT NULL,
	`processed_at` integer
);
--> statement-breakpoint
CREATE INDEX `sync_queue_status_idx` ON `sync_queue` (`status`);--> statement-breakpoint
CREATE INDEX `sync_queue_priority_idx` ON `sync_queue` (`priority`,`scheduled_for`);--> statement-breakpoint
CREATE INDEX `sync_queue_entity_idx` ON `sync_queue` (`entity_type`,`entity_id`);--> statement-breakpoint
CREATE TABLE `sync_status` (
	`id` text PRIMARY KEY NOT NULL,
	`last_transaction_sync` integer,
	`last_inventory_sync` integer,
	`last_master_data_sync` integer,
	`pending_transaction_count` integer DEFAULT 0 NOT NULL,
	`pending_inventory_count` integer DEFAULT 0 NOT NULL,
	`queue_depth` integer DEFAULT 0 NOT NULL,
	`is_online` integer DEFAULT false,
	`last_heartbeat` integer,
	`terminal_id` text NOT NULL,
	`sync_errors` text,
	`updated_at` integer NOT NULL
);
--> statement-breakpoint
CREATE TABLE `transaction_queue` (
	`id` text PRIMARY KEY NOT NULL,
	`transaction_id` text NOT NULL,
	`status` text DEFAULT 'pending' NOT NULL,
	`upload_attempts` integer DEFAULT 0 NOT NULL,
	`last_attempt_at` integer,
	`created_at` integer NOT NULL,
	`uploaded_at` integer
);
--> statement-breakpoint
CREATE INDEX `transaction_queue_status_idx` ON `transaction_queue` (`status`);--> statement-breakpoint
CREATE INDEX `transaction_queue_transaction_idx` ON `transaction_queue` (`transaction_id`);