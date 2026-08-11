-- Replace YOUR_PROJECT_ID and optionally the dataset name before deployment.
CREATE SCHEMA IF NOT EXISTS `YOUR_PROJECT_ID.inventory_analytics` OPTIONS(location="asia-south1");

CREATE TABLE IF NOT EXISTS `YOUR_PROJECT_ID.inventory_analytics.bq_inventory_balances_daily` (
  snapshot_date DATE NOT NULL, location_id STRING NOT NULL, item_id STRING NOT NULL, batch_number STRING,
  current_stock NUMERIC NOT NULL, available_stock NUMERIC NOT NULL, in_transit_stock NUMERIC NOT NULL,
  stock_availability_percent NUMERIC NOT NULL, alert_color STRING NOT NULL, landed_cost_per_unit NUMERIC NOT NULL, stock_value NUMERIC NOT NULL,
  exported_at TIMESTAMP NOT NULL
) PARTITION BY snapshot_date CLUSTER BY location_id, item_id, alert_color;

CREATE TABLE IF NOT EXISTS `YOUR_PROJECT_ID.inventory_analytics.bq_stock_transactions` (
  transaction_id STRING NOT NULL, transaction_type STRING NOT NULL, item_id STRING NOT NULL, location_id STRING NOT NULL,
  source_location_id STRING, destination_location_id STRING, quantity NUMERIC NOT NULL, unit STRING NOT NULL,
  cost_per_unit NUMERIC, landed_cost_per_unit NUMERIC, total_cost NUMERIC, reference_id STRING, reference_type STRING,
  batch_number STRING, expiry_date DATE, performed_by STRING, performed_at TIMESTAMP NOT NULL, exported_at TIMESTAMP NOT NULL
) PARTITION BY DATE(performed_at) CLUSTER BY location_id, item_id, transaction_type;

CREATE TABLE IF NOT EXISTS `YOUR_PROJECT_ID.inventory_analytics.bq_stock_transfers` (
  transfer_id STRING NOT NULL, source_location_id STRING NOT NULL, destination_location_id STRING NOT NULL, status STRING NOT NULL,
  requested_quantity NUMERIC, received_quantity NUMERIC, variance NUMERIC, transport_cost NUMERIC,
  dispatch_date DATE, receipt_date DATE, exported_at TIMESTAMP NOT NULL
) PARTITION BY dispatch_date CLUSTER BY source_location_id, destination_location_id, status;

CREATE TABLE IF NOT EXISTS `YOUR_PROJECT_ID.inventory_analytics.bq_transportation_costs` (
  shipment_id STRING NOT NULL, mode STRING NOT NULL, origin_location_id STRING NOT NULL, destination_location_id STRING NOT NULL,
  route_distance_km NUMERIC, estimated_cost NUMERIC, actual_cost NUMERIC, cost_variance NUMERIC, dispatch_date DATE, exported_at TIMESTAMP NOT NULL
) PARTITION BY dispatch_date CLUSTER BY origin_location_id, destination_location_id, mode;

CREATE TABLE IF NOT EXISTS `YOUR_PROJECT_ID.inventory_analytics.bq_landed_cost` (
  grn_id STRING NOT NULL, item_id STRING NOT NULL, location_id STRING NOT NULL, material_cost NUMERIC NOT NULL,
  allocated_freight NUMERIC NOT NULL, allocated_handling NUMERIC NOT NULL, landed_cost_per_unit NUMERIC NOT NULL,
  received_quantity NUMERIC NOT NULL, receipt_date DATE NOT NULL, allocation_basis STRING NOT NULL, exported_at TIMESTAMP NOT NULL
) PARTITION BY receipt_date CLUSTER BY location_id, item_id;

CREATE TABLE IF NOT EXISTS `YOUR_PROJECT_ID.inventory_analytics.bq_purchase_cost_history` (
  history_id STRING NOT NULL, supplier_id STRING NOT NULL, item_id STRING NOT NULL, old_rate NUMERIC, new_rate NUMERIC NOT NULL,
  variance_percent NUMERIC, effective_date DATE NOT NULL, price_source STRING NOT NULL, po_id STRING, grn_id STRING, exported_at TIMESTAMP NOT NULL
) PARTITION BY effective_date CLUSTER BY supplier_id, item_id;

CREATE TABLE IF NOT EXISTS `YOUR_PROJECT_ID.inventory_analytics.bq_demand_forecast` (
  forecast_run_id STRING NOT NULL, item_id STRING NOT NULL, location_id STRING NOT NULL, forecast_date DATE NOT NULL,
  forecasted_demand NUMERIC NOT NULL, average_daily_consumption NUMERIC, forecasted_depletion_date DATE,
  recommended_reorder_quantity NUMERIC, recommended_transfer_quantity NUMERIC, alert_color STRING, exported_at TIMESTAMP NOT NULL
) PARTITION BY forecast_date CLUSTER BY location_id, item_id, alert_color;

CREATE TABLE IF NOT EXISTS `YOUR_PROJECT_ID.inventory_analytics.bq_alerts` (
  alert_id STRING NOT NULL, alert_type STRING NOT NULL, severity STRING NOT NULL, item_id STRING, location_id STRING,
  trigger_value NUMERIC, threshold_value NUMERIC, status STRING NOT NULL, triggered_at TIMESTAMP NOT NULL, resolved_at TIMESTAMP, exported_at TIMESTAMP NOT NULL
) PARTITION BY DATE(triggered_at) CLUSTER BY location_id, severity, status;

CREATE TABLE IF NOT EXISTS `YOUR_PROJECT_ID.inventory_analytics.bq_cost_per_serving` (
  location_id STRING NOT NULL, period_start DATE NOT NULL, period_end DATE NOT NULL, total_material_cost NUMERIC NOT NULL,
  total_transport_cost NUMERIC NOT NULL, total_wastage_cost NUMERIC NOT NULL, servings_produced INT64 NOT NULL, cost_per_serving NUMERIC NOT NULL,
  exported_at TIMESTAMP NOT NULL
) PARTITION BY period_start CLUSTER BY location_id;

CREATE OR REPLACE VIEW `YOUR_PROJECT_ID.inventory_analytics.v_location_stock_summary` AS
SELECT snapshot_date, location_id, COUNT(DISTINCT item_id) item_count, SUM(stock_value) stock_value,
  COUNTIF(alert_color="RED") red_items, COUNTIF(alert_color="AMBER") amber_items
FROM `YOUR_PROJECT_ID.inventory_analytics.bq_inventory_balances_daily` GROUP BY snapshot_date, location_id;

CREATE OR REPLACE VIEW `YOUR_PROJECT_ID.inventory_analytics.v_alert_color_distribution` AS
SELECT snapshot_date, location_id, alert_color, COUNT(*) item_count
FROM `YOUR_PROJECT_ID.inventory_analytics.bq_inventory_balances_daily` GROUP BY snapshot_date, location_id, alert_color;

CREATE OR REPLACE VIEW `YOUR_PROJECT_ID.inventory_analytics.v_transport_cost_trend` AS
SELECT dispatch_date, mode, SUM(estimated_cost) estimated_cost, SUM(actual_cost) actual_cost, SUM(cost_variance) cost_variance
FROM `YOUR_PROJECT_ID.inventory_analytics.bq_transportation_costs` GROUP BY dispatch_date, mode;

CREATE OR REPLACE VIEW `YOUR_PROJECT_ID.inventory_analytics.v_price_variance_trend` AS
SELECT effective_date, item_id, supplier_id, AVG(variance_percent) average_variance_percent, MAX(new_rate) latest_rate
FROM `YOUR_PROJECT_ID.inventory_analytics.bq_purchase_cost_history` GROUP BY effective_date, item_id, supplier_id;

CREATE OR REPLACE VIEW `YOUR_PROJECT_ID.inventory_analytics.v_forecast_depletion_timeline` AS
SELECT forecast_date, location_id, item_id, forecasted_depletion_date, recommended_reorder_quantity, recommended_transfer_quantity, alert_color
FROM `YOUR_PROJECT_ID.inventory_analytics.bq_demand_forecast` WHERE forecasted_depletion_date IS NOT NULL;
