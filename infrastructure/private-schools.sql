CREATE SCHEMA IF NOT EXISTS `YOUR_PROJECT_ID.school_lunch`
OPTIONS(location = "asia-south1");

CREATE TABLE IF NOT EXISTS `YOUR_PROJECT_ID.school_lunch.private_schools` (
  school_id STRING NOT NULL,
  school_name STRING NOT NULL,
  normalized_name STRING NOT NULL,
  name_prefix_3 STRING NOT NULL,
  address STRING NOT NULL,
  district STRING NOT NULL,
  state STRING NOT NULL,
  latitude FLOAT64,
  longitude FLOAT64,
  phone STRING,
  website STRING,
  rating NUMERIC,
  review_count INT64,
  school_type STRING,
  google_place_id STRING,
  google_data_id STRING,
  google_data_cid STRING,
  ownership STRING NOT NULL,
  verification_status STRING NOT NULL,
  source STRING NOT NULL,
  discovered_at TIMESTAMP NOT NULL,
  last_seen_at TIMESTAMP NOT NULL,
  last_run_id STRING NOT NULL,
  active BOOL NOT NULL
)
CLUSTER BY name_prefix_3, district, verification_status, active;

CREATE TABLE IF NOT EXISTS `YOUR_PROJECT_ID.school_lunch.private_school_discovery_runs` (
  run_id STRING NOT NULL,
  started_at TIMESTAMP NOT NULL,
  completed_at TIMESTAMP,
  districts ARRAY<STRING>,
  max_pages INT64 NOT NULL,
  schools_discovered INT64 NOT NULL,
  status STRING NOT NULL,
  error_message STRING
)
PARTITION BY DATE(started_at)
CLUSTER BY status;
