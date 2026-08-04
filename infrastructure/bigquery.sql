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

CREATE TABLE IF NOT EXISTS `YOUR_PROJECT_ID.school_lunch.cities` (
  city_id STRING NOT NULL,
  city_name STRING NOT NULL,
  active BOOL NOT NULL,
  launch_date DATE,
  updated_at TIMESTAMP NOT NULL
)
CLUSTER BY active, city_id;

CREATE TABLE IF NOT EXISTS `YOUR_PROJECT_ID.school_lunch.kitchens` (
  kitchen_id STRING NOT NULL,
  city_id STRING NOT NULL,
  kitchen_name STRING NOT NULL,
  daily_capacity INT64 NOT NULL,
  order_cutoff TIME NOT NULL,
  prep_lead_minutes INT64 NOT NULL,
  active BOOL NOT NULL,
  updated_at TIMESTAMP NOT NULL
)
CLUSTER BY city_id, active;

CREATE TABLE IF NOT EXISTS `YOUR_PROJECT_ID.school_lunch.schools` (
  school_id STRING NOT NULL,
  city_id STRING NOT NULL,
  kitchen_id STRING NOT NULL,
  school_name STRING NOT NULL,
  area STRING NOT NULL,
  active BOOL NOT NULL,
  updated_at TIMESTAMP NOT NULL
)
CLUSTER BY city_id, kitchen_id, active;

CREATE TABLE IF NOT EXISTS `YOUR_PROJECT_ID.school_lunch.delivery_routes` (
  route_id STRING NOT NULL,
  kitchen_id STRING NOT NULL,
  route_name STRING NOT NULL,
  driver_id STRING,
  active BOOL NOT NULL,
  updated_at TIMESTAMP NOT NULL
)
CLUSTER BY kitchen_id, active;

CREATE TABLE IF NOT EXISTS `YOUR_PROJECT_ID.school_lunch.route_stops_daily` (
  service_date DATE NOT NULL,
  route_id STRING NOT NULL,
  stop_sequence INT64 NOT NULL,
  school_id STRING NOT NULL,
  planned_arrival TIME,
  delivered_at TIMESTAMP,
  proof_uri STRING,
  status STRING NOT NULL,
  updated_at TIMESTAMP NOT NULL
)
PARTITION BY service_date
CLUSTER BY route_id, school_id, status;

CREATE TABLE IF NOT EXISTS `YOUR_PROJECT_ID.school_lunch.kitchen_capacity_daily` (
  service_date DATE NOT NULL,
  kitchen_id STRING NOT NULL,
  capacity_meals INT64 NOT NULL,
  confirmed_meals INT64 NOT NULL,
  waitlisted_meals INT64 NOT NULL,
  cutoff_at TIMESTAMP NOT NULL,
  status STRING NOT NULL,
  updated_at TIMESTAMP NOT NULL
)
PARTITION BY service_date
CLUSTER BY kitchen_id, status;
