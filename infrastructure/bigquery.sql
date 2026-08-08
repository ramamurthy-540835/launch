CREATE SCHEMA IF NOT EXISTS `YOUR_PROJECT_ID.school_lunch`
OPTIONS(location = "asia-south1");

CREATE TABLE IF NOT EXISTS `YOUR_PROJECT_ID.school_lunch.orders` (
  order_id STRING NOT NULL,
  created_at TIMESTAMP NOT NULL,
  student_name STRING NOT NULL,
  school_name STRING NOT NULL,
  parent_phone STRING NOT NULL,
  city STRING NOT NULL,
  grade_band STRING NOT NULL,
  items_json JSON NOT NULL,
  total_inr NUMERIC NOT NULL,
  status STRING NOT NULL,
  receipt_uri STRING
)
PARTITION BY DATE(created_at)
CLUSTER BY city, school_name, status;

CREATE TABLE IF NOT EXISTS `YOUR_PROJECT_ID.school_lunch.meal_packages` (
  meal_id STRING NOT NULL,
  service_date DATE NOT NULL,
  city STRING NOT NULL,
  grade_band STRING NOT NULL,
  meal_name STRING NOT NULL,
  diet_type STRING NOT NULL,
  allergens ARRAY<STRING>,
  calories INT64,
  protein_g NUMERIC,
  price_inr NUMERIC NOT NULL,
  image_gcs_uri STRING,
  is_available BOOL NOT NULL,
  updated_at TIMESTAMP NOT NULL
)
PARTITION BY service_date
CLUSTER BY city, grade_band, diet_type;

CREATE TABLE IF NOT EXISTS `YOUR_PROJECT_ID.school_lunch.marketing_locations` (
  location_id STRING NOT NULL,
  place_id STRING,
  name STRING NOT NULL,
  location_type STRING NOT NULL,
  address STRING NOT NULL,
  city STRING NOT NULL,
  latitude FLOAT64,
  longitude FLOAT64,
  phone STRING,
  website STRING,
  rating FLOAT64,
  reviews INT64,
  related_school_place_id STRING,
  distance_km FLOAT64,
  status STRING NOT NULL,
  saved_at TIMESTAMP NOT NULL
)
PARTITION BY DATE(saved_at)
CLUSTER BY city, location_type, related_school_place_id;

CREATE TABLE IF NOT EXISTS `YOUR_PROJECT_ID.school_lunch.marketing_discovery_runs` (
  search_id STRING NOT NULL,
  searched_at TIMESTAMP NOT NULL,
  school_place_id STRING NOT NULL,
  school_name STRING NOT NULL,
  school_latitude FLOAT64,
  school_longitude FLOAT64,
  radius_km FLOAT64 NOT NULL,
  result_count INT64 NOT NULL
)
PARTITION BY DATE(searched_at)
CLUSTER BY school_place_id;
