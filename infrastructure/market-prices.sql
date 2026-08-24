-- Agmarknet/data.gov.in append-only market-price cache.
-- Replace YOUR_PROJECT_ID before running.

CREATE TABLE IF NOT EXISTS `YOUR_PROJECT_ID.school_lunch.market_prices` (
  item_id STRING NOT NULL,
  item_name STRING,
  state STRING,
  district STRING,
  market STRING,
  commodity STRING,
  variety STRING,
  grade STRING,
  arrival_date DATE NOT NULL,
  modal_per_quintal NUMERIC,
  modal_per_kg NUMERIC NOT NULL,
  min_per_kg NUMERIC,
  max_per_kg NUMERIC,
  source STRING NOT NULL,
  fetched_at TIMESTAMP NOT NULL
)
PARTITION BY arrival_date
CLUSTER BY item_id, market;

CREATE OR REPLACE VIEW `YOUR_PROJECT_ID.school_lunch.market_price_current` AS
WITH ranked AS (
  SELECT *, ROW_NUMBER() OVER (PARTITION BY item_id ORDER BY arrival_date DESC, fetched_at DESC) AS row_number
  FROM `YOUR_PROJECT_ID.school_lunch.market_prices`
)
SELECT
  item_id, item_name, state, district, market, commodity, variety, grade, arrival_date,
  modal_per_quintal, modal_per_kg, min_per_kg, max_per_kg, source,
  DATE_DIFF(CURRENT_DATE("Asia/Kolkata"), arrival_date, DAY) AS days_stale,
  CASE
    WHEN DATE_DIFF(CURRENT_DATE("Asia/Kolkata"), arrival_date, DAY) <= 2 THEN "fresh"
    WHEN DATE_DIFF(CURRENT_DATE("Asia/Kolkata"), arrival_date, DAY) <= 7 THEN "stale"
    ELSE "expired"
  END AS freshness,
  fetched_at
FROM ranked
WHERE row_number = 1;

CREATE OR REPLACE VIEW `YOUR_PROJECT_ID.school_lunch.market_price_usable` AS
SELECT * FROM `YOUR_PROJECT_ID.school_lunch.market_price_current`
WHERE freshness IN ("fresh", "stale");

CREATE OR REPLACE VIEW `YOUR_PROJECT_ID.school_lunch.market_price_trend_7d` AS
SELECT
  item_id,
  ANY_VALUE(item_name) AS item_name,
  COUNT(DISTINCT arrival_date) AS reporting_days,
  ROUND(AVG(modal_per_kg), 2) AS avg_per_kg,
  ROUND(MIN(modal_per_kg), 2) AS low_per_kg,
  ROUND(MAX(modal_per_kg), 2) AS high_per_kg
FROM `YOUR_PROJECT_ID.school_lunch.market_prices`
WHERE arrival_date >= DATE_SUB(CURRENT_DATE("Asia/Kolkata"), INTERVAL 7 DAY)
GROUP BY item_id;

CREATE OR REPLACE VIEW `YOUR_PROJECT_ID.school_lunch.market_price_gaps` AS
SELECT item_id, item_name, market, arrival_date, days_stale, freshness
FROM `YOUR_PROJECT_ID.school_lunch.market_price_current`
WHERE freshness = "expired"
ORDER BY days_stale DESC;
