-- LunchBox grain costing and competitor benchmarking.
-- Replace YOUR_PROJECT_ID before running. Dataset: school_lunch.
-- Provenance is mandatory: untraceable prices must never set shelf prices.

CREATE TABLE IF NOT EXISTS `YOUR_PROJECT_ID.school_lunch.competitor_prices` (
  row_key STRING NOT NULL,
  grain_id STRING NOT NULL,
  platform STRING NOT NULL,
  listing_name STRING NOT NULL,
  brand STRING,
  pack_size_kg NUMERIC NOT NULL,
  pack_price_inr NUMERIC NOT NULL,
  mrp_inr NUMERIC,
  price_per_kg NUMERIC NOT NULL,
  organic_claim BOOL NOT NULL,
  jaivik_bharat_visible BOOL,
  form STRING,
  provenance STRING NOT NULL,
  pincode STRING,
  observed_on DATE NOT NULL,
  recorded_by STRING NOT NULL,
  source_url STRING,
  created_at TIMESTAMP NOT NULL
)
PARTITION BY observed_on
CLUSTER BY grain_id, platform
OPTIONS (description = 'Competitor shelf prices for food grains. No unprovenanced price may drive shelf pricing.');

CREATE TABLE IF NOT EXISTS `YOUR_PROJECT_ID.school_lunch.grain_cost_snapshots` (
  row_key STRING NOT NULL,
  grain_id STRING NOT NULL,
  snapshot_date DATE NOT NULL,
  organic BOOL NOT NULL,
  truck_type STRING NOT NULL,
  load_utilisation NUMERIC NOT NULL,
  delivery_mode STRING NOT NULL,
  marketing_per_kg NUMERIC NOT NULL,
  target_margin_rate NUMERIC NOT NULL,
  sangli_modal_per_kg NUMERIC NOT NULL,
  local_tn_ref_per_kg NUMERIC NOT NULL,
  freight_per_kg NUMERIC NOT NULL,
  landed_per_kg NUMERIC NOT NULL,
  fully_loaded_per_kg NUMERIC NOT NULL,
  break_even_per_kg NUMERIC NOT NULL,
  shelf_price_per_kg NUMERIC NOT NULL,
  profit_per_kg NUMERIC NOT NULL,
  margin_rate NUMERIC NOT NULL,
  input_kg_per_output_kg NUMERIC NOT NULL,
  sourcing_verdict STRING NOT NULL,
  market_median_per_kg NUMERIC,
  headroom_per_kg NUMERIC,
  viable_at_market BOOL,
  created_at TIMESTAMP NOT NULL
)
PARTITION BY snapshot_date
CLUSTER BY grain_id, sourcing_verdict
OPTIONS (description = 'Daily cost and margin snapshot per grain; audit trail for pricing decisions.');

CREATE TABLE IF NOT EXISTS `YOUR_PROJECT_ID.school_lunch.grain_purchase_lots` (
  lot_id STRING NOT NULL,
  grain_id STRING NOT NULL,
  purchase_date DATE NOT NULL,
  supplier_name STRING NOT NULL,
  supplier_type STRING,
  market STRING,
  organic_certified BOOL NOT NULL,
  npop_certificate_no STRING,
  certificate_expiry DATE,
  purchased_kg NUMERIC NOT NULL,
  goods_value_inr NUMERIC NOT NULL,
  mandi_charges_inr NUMERIC,
  freight_inr NUMERIC,
  freight_truck_type STRING,
  other_charges_inr NUMERIC,
  saleable_output_kg NUMERIC,
  actual_recovery_rate NUMERIC,
  residue_test_passed BOOL,
  residue_test_ref STRING,
  created_at TIMESTAMP NOT NULL
)
PARTITION BY purchase_date
CLUSTER BY grain_id, supplier_name
OPTIONS (description = 'Actual purchase lots used to true up modelled landed cost and recovery rate.');

CREATE OR REPLACE VIEW `YOUR_PROJECT_ID.school_lunch.competitor_prices_current` AS
SELECT * EXCEPT (rn)
FROM (
  SELECT *, ROW_NUMBER() OVER (
    PARTITION BY grain_id, platform, listing_name
    ORDER BY observed_on DESC, created_at DESC
  ) AS rn
  FROM `YOUR_PROJECT_ID.school_lunch.competitor_prices`
  WHERE observed_on >= DATE_SUB(CURRENT_DATE('Asia/Kolkata'), INTERVAL 21 DAY)
)
WHERE rn = 1;

CREATE OR REPLACE VIEW `YOUR_PROJECT_ID.school_lunch.grain_market_band` AS
SELECT
  grain_id,
  organic_claim,
  form,
  COUNT(*) AS sample_count,
  COUNT(DISTINCT platform) AS platforms_seen,
  ARRAY_AGG(DISTINCT platform ORDER BY platform) AS platforms,
  MIN(price_per_kg) AS low_per_kg,
  APPROX_QUANTILES(price_per_kg, 100)[OFFSET(50)] AS median_per_kg,
  MAX(price_per_kg) AS high_per_kg,
  SAFE_DIVIDE(
    AVG(mrp_inr / NULLIF(pack_size_kg, 0)) - AVG(price_per_kg),
    AVG(mrp_inr / NULLIF(pack_size_kg, 0))
  ) AS avg_discount_off_mrp,
  MAX(observed_on) AS freshest_observation
FROM `YOUR_PROJECT_ID.school_lunch.competitor_prices_current`
GROUP BY grain_id, organic_claim, form;

CREATE OR REPLACE VIEW `YOUR_PROJECT_ID.school_lunch.grain_margin_health` AS
WITH latest AS (
  SELECT * EXCEPT (rn) FROM (
    SELECT *, ROW_NUMBER() OVER (PARTITION BY grain_id ORDER BY snapshot_date DESC) AS rn
    FROM `YOUR_PROJECT_ID.school_lunch.grain_cost_snapshots`
  ) WHERE rn = 1
)
SELECT
  s.grain_id,
  s.snapshot_date,
  s.sourcing_verdict,
  s.landed_per_kg,
  s.fully_loaded_per_kg,
  s.break_even_per_kg,
  s.market_median_per_kg,
  s.headroom_per_kg,
  s.margin_rate,
  s.input_kg_per_output_kg,
  ROUND(SAFE_DIVIDE(s.freight_per_kg, s.landed_per_kg) * 100, 1) AS freight_pct_of_landed,
  CASE
    WHEN s.market_median_per_kg IS NULL THEN 'no_benchmark'
    WHEN s.break_even_per_kg > s.market_median_per_kg THEN 'underwater'
    WHEN s.margin_rate < 0.10 THEN 'thin'
    WHEN s.sourcing_verdict = 'source_locally' THEN 'wrong_origin'
    ELSE 'healthy'
  END AS status,
  b.actual_landed_per_kg,
  ROUND(b.actual_landed_per_kg - s.landed_per_kg, 2) AS model_error_per_kg
FROM latest s
LEFT JOIN (
  SELECT
    grain_id,
    SAFE_DIVIDE(
      SUM(goods_value_inr + IFNULL(mandi_charges_inr, 0) + IFNULL(freight_inr, 0) + IFNULL(other_charges_inr, 0)),
      SUM(NULLIF(saleable_output_kg, 0))
    ) AS actual_landed_per_kg
  FROM `YOUR_PROJECT_ID.school_lunch.grain_purchase_lots`
  WHERE purchase_date >= DATE_SUB(CURRENT_DATE('Asia/Kolkata'), INTERVAL 90 DAY)
  GROUP BY grain_id
) b USING (grain_id)
ORDER BY CASE status
  WHEN 'underwater' THEN 1
  WHEN 'wrong_origin' THEN 2
  WHEN 'thin' THEN 3
  WHEN 'no_benchmark' THEN 4
  ELSE 5
END, s.headroom_per_kg;

CREATE OR REPLACE VIEW `YOUR_PROJECT_ID.school_lunch.organic_certificate_watch` AS
SELECT
  grain_id,
  supplier_name,
  npop_certificate_no,
  certificate_expiry,
  DATE_DIFF(certificate_expiry, CURRENT_DATE('Asia/Kolkata'), DAY) AS days_to_expiry,
  SUM(purchased_kg) AS kg_bought_under_this_certificate,
  LOGICAL_AND(IFNULL(residue_test_passed, FALSE)) AS all_lots_residue_clear
FROM `YOUR_PROJECT_ID.school_lunch.grain_purchase_lots`
WHERE organic_certified = TRUE
GROUP BY grain_id, supplier_name, npop_certificate_no, certificate_expiry
HAVING certificate_expiry IS NULL
   OR DATE_DIFF(certificate_expiry, CURRENT_DATE('Asia/Kolkata'), DAY) < 90
ORDER BY days_to_expiry NULLS FIRST;
