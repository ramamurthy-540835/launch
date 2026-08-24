-- LunchBox franchise payment tracking. Replace YOUR_PROJECT_ID before running.

CREATE TABLE IF NOT EXISTS `YOUR_PROJECT_ID.school_lunch.franchise_payments` (
  application_id       STRING NOT NULL,
  territory_id         STRING NOT NULL,
  payment_link_id      STRING NOT NULL,
  razorpay_reference_id STRING NOT NULL,
  payment_id           STRING,
  stage                STRING NOT NULL,
  amount_paise         INT64 NOT NULL,
  currency             STRING NOT NULL,
  status               STRING NOT NULL,
  is_test              BOOL NOT NULL,
  created_at           TIMESTAMP NOT NULL,
  updated_at           TIMESTAMP NOT NULL
)
PARTITION BY DATE(created_at)
CLUSTER BY territory_id, status, application_id;

CREATE TABLE IF NOT EXISTS `YOUR_PROJECT_ID.school_lunch.franchise_payment_events` (
  event_id        STRING NOT NULL,
  event_type      STRING NOT NULL,
  application_id STRING NOT NULL,
  territory_id   STRING,
  payment_link_id STRING NOT NULL,
  payment_id     STRING,
  status         STRING NOT NULL,
  amount_paise   INT64,
  received_at    TIMESTAMP NOT NULL,
  raw_payload    STRING
)
PARTITION BY DATE(received_at)
CLUSTER BY application_id, payment_link_id, status;

CREATE OR REPLACE VIEW `YOUR_PROJECT_ID.school_lunch.franchise_payment_current` AS
WITH latest AS (
  SELECT *, ROW_NUMBER() OVER (PARTITION BY payment_link_id ORDER BY received_at DESC) AS row_number
  FROM `YOUR_PROJECT_ID.school_lunch.franchise_payment_events`
)
SELECT
  payment.application_id,
  payment.territory_id,
  payment.payment_link_id,
  payment.razorpay_reference_id,
  COALESCE(event.payment_id, payment.payment_id) AS payment_id,
  payment.stage,
  payment.amount_paise,
  payment.currency,
  COALESCE(event.status, payment.status) AS status,
  payment.is_test,
  payment.created_at,
  event.received_at AS settled_at
FROM `YOUR_PROJECT_ID.school_lunch.franchise_payments` AS payment
LEFT JOIN (SELECT * FROM latest WHERE row_number = 1) AS event USING (payment_link_id);

CREATE OR REPLACE VIEW `YOUR_PROJECT_ID.school_lunch.franchise_collections_daily` AS
SELECT
  DATE(created_at) AS day,
  COUNT(*) AS attempts,
  COUNTIF(status = "paid") AS paid_count,
  SUM(IF(status = "paid", amount_paise, 0)) / 100 AS collected_inr
FROM `YOUR_PROJECT_ID.school_lunch.franchise_payment_current`
WHERE is_test = FALSE
GROUP BY day
ORDER BY day DESC;
