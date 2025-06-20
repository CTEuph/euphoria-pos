CREATE TABLE `customer_product_history` (
	`customer_id` text NOT NULL,
	`product_id` text NOT NULL,
	`first_purchased` integer NOT NULL,
	`last_purchased` integer NOT NULL,
	`purchase_count` integer DEFAULT 1 NOT NULL,
	`total_quantity` integer NOT NULL,
	`avg_quantity` text,
	`product_name` text NOT NULL,
	`product_category` text NOT NULL,
	`updated_at` integer NOT NULL,
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
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `customers_phone_unique` ON `customers` (`phone`);--> statement-breakpoint
CREATE UNIQUE INDEX `customers_zinrelo_id_unique` ON `customers` (`zinrelo_id`);--> statement-breakpoint
CREATE UNIQUE INDEX `customers_rfid_card_id_unique` ON `customers` (`rfid_card_id`);--> statement-breakpoint
CREATE INDEX `customers_phone_idx` ON `customers` (`phone`);--> statement-breakpoint
CREATE INDEX `customers_rfid_idx` ON `customers` (`rfid_card_id`);--> statement-breakpoint
CREATE TABLE `discounts` (
	`id` text PRIMARY KEY NOT NULL,
	`name` text NOT NULL,
	`category` text NOT NULL,
	`size` text NOT NULL,
	`units_per_case` integer NOT NULL,
	`discount_percent` text NOT NULL,
	`is_active` integer DEFAULT true,
	`created_at` integer NOT NULL
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
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `employees_employee_code_unique` ON `employees` (`employee_code`);--> statement-breakpoint
CREATE TABLE `gift_cards` (
	`id` text PRIMARY KEY NOT NULL,
	`card_number` text(20) NOT NULL,
	`pin` text(10) NOT NULL,
	`initial_balance` text NOT NULL,
	`current_balance` text NOT NULL,
	`issued_by` text,
	`purchase_transaction_id` text,
	`is_active` integer DEFAULT true,
	`expires_at` integer,
	`created_at` integer NOT NULL,
	`last_used_at` integer,
	FOREIGN KEY (`issued_by`) REFERENCES `employees`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`purchase_transaction_id`) REFERENCES `transactions`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE UNIQUE INDEX `gift_cards_card_number_unique` ON `gift_cards` (`card_number`);--> statement-breakpoint
CREATE TABLE `inbox_processed` (
	`message_id` text PRIMARY KEY NOT NULL,
	`from_terminal` text NOT NULL,
	`topic` text NOT NULL,
	`payload` text NOT NULL,
	`processed_at` integer NOT NULL
);
--> statement-breakpoint
CREATE INDEX `inbox_processed_at_idx` ON `inbox_processed` (`processed_at`);--> statement-breakpoint
CREATE TABLE `inventory` (
	`product_id` text PRIMARY KEY NOT NULL,
	`current_stock` integer DEFAULT 0 NOT NULL,
	`reserved_stock` integer DEFAULT 0 NOT NULL,
	`last_updated` integer NOT NULL,
	`last_synced_at` integer,
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
	`created_at` integer NOT NULL,
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
	`topic` text NOT NULL,
	`payload` text NOT NULL,
	`status` text DEFAULT 'pending' NOT NULL,
	`retry_count` integer DEFAULT 0,
	`created_at` integer NOT NULL,
	`peer_acked_at` integer,
	`cloud_acked_at` integer
);
--> statement-breakpoint
CREATE INDEX `outbox_status_idx` ON `outbox` (`status`);--> statement-breakpoint
CREATE INDEX `outbox_created_at_idx` ON `outbox` (`created_at`);--> statement-breakpoint
CREATE TABLE `payments` (
	`id` text PRIMARY KEY NOT NULL,
	`transaction_id` text NOT NULL,
	`payment_method` text NOT NULL,
	`amount` text NOT NULL,
	`card_last_four` text(4),
	`card_type` text(20),
	`authorization_code` text(50),
	`tendered_amount` text,
	`change_amount` text,
	`gift_card_id` text,
	`points_used` integer,
	`created_at` integer NOT NULL,
	FOREIGN KEY (`transaction_id`) REFERENCES `transactions`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`gift_card_id`) REFERENCES `gift_cards`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE TABLE `pos_config` (
	`key` text(50) PRIMARY KEY NOT NULL,
	`value` text NOT NULL,
	`updated_at` integer NOT NULL
);
--> statement-breakpoint
CREATE TABLE `price_history` (
	`id` text PRIMARY KEY NOT NULL,
	`product_id` text NOT NULL,
	`old_price` text NOT NULL,
	`new_price` text NOT NULL,
	`old_cost` text NOT NULL,
	`new_cost` text NOT NULL,
	`changed_by` text,
	`change_reason` text,
	`effective_date` integer NOT NULL,
	`created_at` integer NOT NULL,
	FOREIGN KEY (`product_id`) REFERENCES `products`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`changed_by`) REFERENCES `employees`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE TABLE `product_barcodes` (
	`id` text PRIMARY KEY NOT NULL,
	`product_id` text NOT NULL,
	`barcode` text(50) NOT NULL,
	`is_primary` integer DEFAULT false,
	`created_at` integer NOT NULL,
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
	`cost` text NOT NULL,
	`retail_price` text NOT NULL,
	`parent_product_id` text,
	`units_in_parent` integer DEFAULT 1,
	`loyalty_point_multiplier` text DEFAULT '1.0',
	`is_active` integer DEFAULT true,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
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
	`unit_price` text NOT NULL,
	`discount_amount` text DEFAULT '0.00',
	`total_price` text NOT NULL,
	`discount_reason` text,
	`points_earned` integer DEFAULT 0,
	`is_returned` integer DEFAULT false,
	`returned_at` integer,
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
	`subtotal` text NOT NULL,
	`tax_amount` text NOT NULL,
	`discount_amount` text DEFAULT '0.00',
	`total_amount` text NOT NULL,
	`points_earned` integer DEFAULT 0,
	`points_redeemed` integer DEFAULT 0,
	`status` text DEFAULT 'completed' NOT NULL,
	`sales_channel` text DEFAULT 'pos' NOT NULL,
	`original_transaction_id` text,
	`terminal_id` text(20) NOT NULL,
	`sync_status` text(20) DEFAULT 'synced',
	`zinrelo_sync_status` text(20) DEFAULT 'pending',
	`zinrelo_synced_at` integer,
	`created_at` integer NOT NULL,
	`completed_at` integer,
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