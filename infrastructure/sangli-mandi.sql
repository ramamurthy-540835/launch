-- Function-managed BigQuery contract for Sangli food-grain mandi prices.
CREATE TABLE IF NOT EXISTS `YOUR_PROJECT_ID.school_lunch.sangli_mandi_prices` (
  row_key STRING NOT NULL, state STRING NOT NULL, district STRING NOT NULL, market STRING NOT NULL,
  commodity STRING NOT NULL, variety STRING, grade STRING, category STRING NOT NULL, arrival_date DATE NOT NULL,
  min_per_quintal NUMERIC, max_per_quintal NUMERIC, modal_per_quintal NUMERIC NOT NULL,
  min_per_kg NUMERIC, max_per_kg NUMERIC, modal_per_kg NUMERIC NOT NULL,
  source STRING NOT NULL, resource_id STRING NOT NULL, fetched_at TIMESTAMP NOT NULL
) PARTITION BY arrival_date CLUSTER BY commodity, market;

CREATE OR REPLACE VIEW `YOUR_PROJECT_ID.school_lunch.sangli_mandi_price_current` AS
SELECT * EXCEPT (row_number)
FROM (
  SELECT *,
    ROW_NUMBER() OVER (
      PARTITION BY market, commodity, variety, grade
      ORDER BY arrival_date DESC, fetched_at DESC
    ) AS row_number
  FROM `YOUR_PROJECT_ID.school_lunch.sangli_mandi_prices`
) WHERE row_number = 1;
