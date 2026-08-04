MERGE `YOUR_PROJECT_ID.school_lunch.cities` T
USING UNNEST([
  STRUCT("chennai" AS city_id, "Chennai" AS city_name),
  STRUCT("madurai", "Madurai"),
  STRUCT("trichy", "Trichy"),
  STRUCT("coimbatore", "Coimbatore")
]) S
ON T.city_id = S.city_id
WHEN MATCHED THEN
  UPDATE SET city_name = S.city_name, active = TRUE, updated_at = CURRENT_TIMESTAMP()
WHEN NOT MATCHED THEN
  INSERT (city_id, city_name, active, launch_date, updated_at)
  VALUES (S.city_id, S.city_name, TRUE, CURRENT_DATE("Asia/Kolkata"), CURRENT_TIMESTAMP());

MERGE `YOUR_PROJECT_ID.school_lunch.kitchens` T
USING UNNEST([
  STRUCT("chn-kitchen-01" AS kitchen_id, "chennai" AS city_id, "Chennai Central Kitchen" AS kitchen_name),
  STRUCT("md-kitchen-01", "madurai", "Madurai Central Kitchen"),
  STRUCT("try-kitchen-01", "trichy", "Trichy Central Kitchen"),
  STRUCT("cbe-kitchen-01", "coimbatore", "Coimbatore Central Kitchen")
]) S
ON T.kitchen_id = S.kitchen_id
WHEN MATCHED THEN
  UPDATE SET city_id = S.city_id, kitchen_name = S.kitchen_name, updated_at = CURRENT_TIMESTAMP()
WHEN NOT MATCHED THEN
  INSERT (kitchen_id, city_id, kitchen_name, daily_capacity, order_cutoff, prep_lead_minutes, active, updated_at)
  VALUES (S.kitchen_id, S.city_id, S.kitchen_name, 500, TIME "09:00:00", 180, TRUE, CURRENT_TIMESTAMP());

MERGE `YOUR_PROJECT_ID.school_lunch.schools` T
USING UNNEST([
  STRUCT("chn-adyar-01" AS school_id, "chennai" AS city_id, "chn-kitchen-01" AS kitchen_id, "Adyar Pilot School" AS school_name, "Adyar" AS area),
  STRUCT("chn-annanagar-01", "chennai", "chn-kitchen-01", "Anna Nagar Pilot School", "Anna Nagar"),
  STRUCT("md-annanagar-01", "madurai", "md-kitchen-01", "Madurai Pilot School", "Anna Nagar"),
  STRUCT("md-kk-nagar-01", "madurai", "md-kitchen-01", "KK Nagar Pilot School", "KK Nagar"),
  STRUCT("try-cantonment-01", "trichy", "try-kitchen-01", "Trichy Pilot School", "Cantonment"),
  STRUCT("try-srirangam-01", "trichy", "try-kitchen-01", "Srirangam Pilot School", "Srirangam"),
  STRUCT("cbe-rspuram-01", "coimbatore", "cbe-kitchen-01", "RS Puram Pilot School", "RS Puram"),
  STRUCT("cbe-peelamedu-01", "coimbatore", "cbe-kitchen-01", "Peelamedu Pilot School", "Peelamedu")
]) S
ON T.school_id = S.school_id
WHEN MATCHED THEN
  UPDATE SET city_id = S.city_id, kitchen_id = S.kitchen_id, school_name = S.school_name, area = S.area, active = TRUE, updated_at = CURRENT_TIMESTAMP()
WHEN NOT MATCHED THEN
  INSERT (school_id, city_id, kitchen_id, school_name, area, active, updated_at)
  VALUES (S.school_id, S.city_id, S.kitchen_id, S.school_name, S.area, TRUE, CURRENT_TIMESTAMP());

MERGE `YOUR_PROJECT_ID.school_lunch.delivery_routes` T
USING UNNEST([
  STRUCT("chn-route-01" AS route_id, "chn-kitchen-01" AS kitchen_id, "Chennai Pilot Route" AS route_name),
  STRUCT("md-route-01", "md-kitchen-01", "Madurai Pilot Route"),
  STRUCT("try-route-01", "try-kitchen-01", "Trichy Pilot Route"),
  STRUCT("cbe-route-01", "cbe-kitchen-01", "Coimbatore Pilot Route")
]) S
ON T.route_id = S.route_id
WHEN MATCHED THEN
  UPDATE SET kitchen_id = S.kitchen_id, route_name = S.route_name, active = TRUE, updated_at = CURRENT_TIMESTAMP()
WHEN NOT MATCHED THEN
  INSERT (route_id, kitchen_id, route_name, driver_id, active, updated_at)
  VALUES (S.route_id, S.kitchen_id, S.route_name, NULL, TRUE, CURRENT_TIMESTAMP());
