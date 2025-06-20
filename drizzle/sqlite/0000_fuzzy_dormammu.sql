CREATE TABLE `case_discount_rules` (
	`id` text PRIMARY KEY NOT NULL,
	`name` text NOT NULL,
	`category` text NOT NULL,
	`size` text NOT NULL,
	`units_per_case` integer NOT NULL,
	`discount_percent` real NOT NULL,
	`is_active` integer DEFAULT true,
	`created_at` text DEFAULT 'CURRENT_TIMESTAMP'
);
--> statement-breakpoint
CREATE TABLE `customer_product_history` (
	`customer_id` text NOT NULL,
	`product_id` text NOT NULL,
	`first_purchased` text NOT NULL,
	`last_purchased` text NOT NULL,
	`purchase_count` integer DEFAULT 1 NOT NULL,
	`total_quantity` integer NOT NULL,
	`avg_quantity` real,
	`product_name` text NOT NULL,
	`product_category` text NOT NULL,
	`updated_at` text DEFAULT 'CURRENT_TIMESTAMP',
	PRIMARY KEY(`customer_id`, `product_id`),
	FOREIGN KEY (`customer_id`) REFERENCES `customers`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`product_id`) REFERENCES `products`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX `customer_product_history_customer_idx` ON `customer_product_history` (`customer_id`);--> statement-breakpoint
CREATE INDEX `customer_product_history_last_purchased_idx` ON `customer_product_history` (`customer_id`,`last_purchased`);--> statement-breakpoint
CREATE INDEX `customer_product_history_count_idx` ON `customer_product_history` (`customer_id`,`purchase_count`);--> statement-breakpoint
CREATE TABLE `customers` (
	`id` text PRIMARY KEY NOT NULL,
	`phone` text(20) NOT NULL,
	`email` text(255),
	`first_name` text NOT NULL,
	`last_name` text NOT NULL,
	`zinrelo_id` text(100),
	`loyalty_points` integer DEFAULT 0,
	`loyalty_tier` text(20) DEFAULT 'bronze',
	`rfid_card_id` text(100),
	`created_at` text DEFAULT 'CURRENT_TIMESTAMP',
	`updated_at` text DEFAULT 'CURRENT_TIMESTAMP'
);
--> statement-breakpoint
CREATE UNIQUE INDEX `customers_phone_unique` ON `customers` (`phone`);--> statement-breakpoint
CREATE UNIQUE INDEX `customers_zinrelo_id_unique` ON `customers` (`zinrelo_id`);--> statement-breakpoint
CREATE UNIQUE INDEX `customers_rfid_card_id_unique` ON `customers` (`rfid_card_id`);--> statement-breakpoint
CREATE INDEX `customers_phone_idx` ON `customers` (`phone`);--> statement-breakpoint
CREATE INDEX `customers_rfid_idx` ON `customers` (`rfid_card_id`);--> statement-breakpoint
CREATE TABLE `discount_rules` (
	`id` text PRIMARY KEY NOT NULL,
	`scope` text NOT NULL,
	`category` text,
	`size` text,
	`percent` real,
	`fixed_amount` real,
	`employee_approval_required` integer DEFAULT false,
	`is_active` integer DEFAULT true,
	`updated_at` text DEFAULT 'CURRENT_TIMESTAMP'
);
--> statement-breakpoint
CREATE TABLE `employees` (
	`id` text PRIMARY KEY NOT NULL,
	`employee_code` text(20) NOT NULL,
	`first_name` text NOT NULL,
	`last_name` text NOT NULL,
	`pin` text(60) NOT NULL,
	`is_active` integer DEFAULT true,
	`can_override_price` integer DEFAULT false,
	`can_void_transaction` integer DEFAULT false,
	`is_manager` integer DEFAULT false,
	`created_at` text DEFAULT 'CURRENT_TIMESTAMP',
	`updated_at` text DEFAULT 'CURRENT_TIMESTAMP'
);
--> statement-breakpoint
CREATE UNIQUE INDEX `employees_employee_code_unique` ON `employees` (`employee_code`);--> statement-breakpoint
CREATE TABLE `gift_cards` (
	`id` text PRIMARY KEY NOT NULL,
	`card_number` text(20) NOT NULL,
	`pin` text(10) NOT NULL,
	`initial_balance` real NOT NULL,
	`current_balance` real NOT NULL,
	`issued_by` text,
	`purchase_transaction_id` text,
	`is_active` integer DEFAULT true,
	`expires_at` text,
	`created_at` text DEFAULT 'CURRENT_TIMESTAMP',
	`last_used_at` text,
	FOREIGN KEY (`issued_by`) REFERENCES `employees`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`purchase_transaction_id`) REFERENCES `transactions`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE UNIQUE INDEX `gift_cards_card_number_unique` ON `gift_cards` (`card_number`);--> statement-breakpoint
CREATE TABLE `inbox_processed` (
	`id` text PRIMARY KEY NOT NULL,
	`created_at` text DEFAULT 'CURRENT_TIMESTAMP'
);
--> statement-breakpoint
CREATE TABLE `inventory` (
	`product_id` text PRIMARY KEY NOT NULL,
	`current_stock` integer DEFAULT 0 NOT NULL,
	`reserved_stock` integer DEFAULT 0 NOT NULL,
	`last_updated` text DEFAULT 'CURRENT_TIMESTAMP',
	`last_synced_at` text,
	FOREIGN KEY (`product_id`) REFERENCES `products`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE TABLE `inventory_changes` (
	`id` text PRIMARY KEY NOT NULL,
	`product_id` text NOT NULL,
	`change_type` text NOT NULL,
	`change_amount` integer NOT NULL,
	`new_stock_level` integer NOT NULL,
	`transaction_id` text,
	`transaction_item_id` text,
	`terminal_id` text(20) NOT NULL,
	`employee_id` text,
	`notes` text,
	`created_at` text DEFAULT 'CURRENT_TIMESTAMP',
	FOREIGN KEY (`product_id`) REFERENCES `products`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`transaction_id`) REFERENCES `transactions`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`transaction_item_id`) REFERENCES `transaction_items`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`employee_id`) REFERENCES `employees`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX `inventory_changes_product_idx` ON `inventory_changes` (`product_id`);--> statement-breakpoint
CREATE INDEX `inventory_changes_created_at_idx` ON `inventory_changes` (`created_at`);--> statement-breakpoint
CREATE TABLE `outbox` (
	`id` text PRIMARY KEY NOT NULL,
	`type` text NOT NULL,
	`payload` text NOT NULL,
	`status` text NOT NULL,
	`retries` integer DEFAULT 0,
	`created_at` text DEFAULT 'CURRENT_TIMESTAMP'
);
--> statement-breakpoint
CREATE TABLE `payments` (
	`id` text PRIMARY KEY NOT NULL,
	`transaction_id` text NOT NULL,
	`payment_method` text NOT NULL,
	`amount` real NOT NULL,
	`card_last_four` text(4),
	`card_type` text(20),
	`authorization_code` text(50),
	`tendered_amount` real,
	`change_amount` real,
	`gift_card_id` text,
	`points_used` integer,
	`created_at` text DEFAULT 'CURRENT_TIMESTAMP',
	FOREIGN KEY (`transaction_id`) REFERENCES `transactions`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`gift_card_id`) REFERENCES `gift_cards`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE TABLE `pos_config` (
	`key` text(50) PRIMARY KEY NOT NULL,
	`value` text NOT NULL,
	`updated_at` text DEFAULT 'CURRENT_TIMESTAMP'
);
--> statement-breakpoint
CREATE TABLE `price_history` (
	`id` text PRIMARY KEY NOT NULL,
	`product_id` text NOT NULL,
	`old_price` real NOT NULL,
	`new_price` real NOT NULL,
	`old_cost` real NOT NULL,
	`new_cost` real NOT NULL,
	`changed_by` text,
	`change_reason` text,
	`effective_date` text DEFAULT 'CURRENT_TIMESTAMP',
	`created_at` text DEFAULT 'CURRENT_TIMESTAMP',
	FOREIGN KEY (`product_id`) REFERENCES `products`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`changed_by`) REFERENCES `employees`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE TABLE `product_barcodes` (
	`id` text PRIMARY KEY NOT NULL,
	`product_id` text NOT NULL,
	`barcode` text(50) NOT NULL,
	`is_primary` integer DEFAULT false,
	`created_at` text DEFAULT 'CURRENT_TIMESTAMP',
	FOREIGN KEY (`product_id`) REFERENCES `products`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE UNIQUE INDEX `product_barcodes_barcode_unique` ON `product_barcodes` (`barcode`);--> statement-breakpoint
CREATE INDEX `product_barcodes_barcode_idx` ON `product_barcodes` (`barcode`);--> statement-breakpoint
CREATE TABLE `products` (
	`id` text PRIMARY KEY NOT NULL,
	`sku` text(50) NOT NULL,
	`name` text NOT NULL,
	`category` text NOT NULL,
	`size` text NOT NULL,
	`cost` real NOT NULL,
	`retail_price` real NOT NULL,
	`parent_product_id` text,
	`units_in_parent` integer DEFAULT 1,
	`loyalty_point_multiplier` real DEFAULT 1,
	`is_active` integer DEFAULT true,
	`created_at` text DEFAULT 'CURRENT_TIMESTAMP',
	`updated_at` text DEFAULT 'CURRENT_TIMESTAMP',
	FOREIGN KEY (`parent_product_id`) REFERENCES `products`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE UNIQUE INDEX `products_sku_unique` ON `products` (`sku`);--> statement-breakpoint
CREATE INDEX `products_sku_idx` ON `products` (`sku`);--> statement-breakpoint
CREATE INDEX `products_category_idx` ON `products` (`category`);--> statement-breakpoint
CREATE TABLE `transaction_items` (
	`id` text PRIMARY KEY NOT NULL,
	`transaction_id` text NOT NULL,
	`product_id` text NOT NULL,
	`quantity` integer NOT NULL,
	`unit_price` real NOT NULL,
	`discount_amount` real DEFAULT 0,
	`total_price` real NOT NULL,
	`discount_reason` text,
	`points_earned` integer DEFAULT 0,
	`is_returned` integer DEFAULT false,
	`returned_at` text,
	FOREIGN KEY (`transaction_id`) REFERENCES `transactions`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`product_id`) REFERENCES `products`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX `transaction_items_transaction_idx` ON `transaction_items` (`transaction_id`);--> statement-breakpoint
CREATE INDEX `transaction_items_product_idx` ON `transaction_items` (`product_id`);--> statement-breakpoint
CREATE TABLE `transactions` (
	`id` text PRIMARY KEY NOT NULL,
	`transaction_number` text(20) NOT NULL,
	`customer_id` text,
	`employee_id` text NOT NULL,
	`subtotal` real NOT NULL,
	`tax_amount` real NOT NULL,
	`discount_amount` real DEFAULT 0,
	`total_amount` real NOT NULL,
	`points_earned` integer DEFAULT 0,
	`points_redeemed` integer DEFAULT 0,
	`status` text DEFAULT 'completed' NOT NULL,
	`sales_channel` text DEFAULT 'pos' NOT NULL,
	`original_transaction_id` text,
	`terminal_id` text(20) NOT NULL,
	`sync_status` text(20) DEFAULT 'synced',
	`zinrelo_sync_status` text(20) DEFAULT 'pending',
	`zinrelo_synced_at` text,
	`created_at` text DEFAULT 'CURRENT_TIMESTAMP',
	`completed_at` text,
	`metadata` text,
	FOREIGN KEY (`customer_id`) REFERENCES `customers`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`employee_id`) REFERENCES `employees`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`original_transaction_id`) REFERENCES `transactions`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE UNIQUE INDEX `transactions_transaction_number_unique` ON `transactions` (`transaction_number`);--> statement-breakpoint
CREATE INDEX `transactions_number_idx` ON `transactions` (`transaction_number`);--> statement-breakpoint
CREATE INDEX `transactions_created_at_idx` ON `transactions` (`created_at`);--> statement-breakpoint
CREATE INDEX `transactions_customer_idx` ON `transactions` (`customer_id`);--> statement-breakpoint
CREATE INDEX `transactions_customer_date_idx` ON `transactions` (`customer_id`,`created_at`);--> statement-breakpoint
CREATE INDEX `transactions_sync_status_idx` ON `transactions` (`sync_status`);--> statement-breakpoint
CREATE INDEX `transactions_zinrelo_sync_idx` ON `transactions` (`zinrelo_sync_status`);