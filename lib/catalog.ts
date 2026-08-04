import { BigQuery } from "@google-cloud/bigquery";
import type { GradePlan, Meal, School } from "@/lib/meals";

export type Catalog = {
  cities: string[];
  schools: School[];
  meals: Meal[];
  gradePlans: Record<string, GradePlan>;
  source: "bigquery";
};

const projectId = process.env.GCP_PROJECT_ID;
const datasetId = process.env.BIGQUERY_DATASET || "school_lunch";

function requiredIdentifier(value: string | undefined, name: string) {
  if (!value || !/^[A-Za-z0-9_-]+$/.test(value)) throw new Error(`${name} is not configured correctly.`);
  return value;
}

function dateValue(value: unknown) {
  if (typeof value === "string") return value;
  if (value && typeof value === "object" && "value" in value) return String((value as { value: unknown }).value);
  return String(value || "");
}

async function rows(bigquery: BigQuery, sql: string) {
  const [result] = await bigquery.query({ query: sql, location: "asia-south1" });
  return result as Record<string, unknown>[];
}

export async function getCatalog(): Promise<Catalog> {
  const project = requiredIdentifier(projectId, "GCP_PROJECT_ID");
  const dataset = requiredIdentifier(datasetId, "BIGQUERY_DATASET");
  const bigquery = new BigQuery({ projectId: project });
  const prefix = `\`${project}.${dataset}`;
  const [cityRows, schoolRows, mealRows, gradeRows] = await Promise.all([
    rows(bigquery, `SELECT city_id, city_name FROM ${prefix}.cities\` WHERE active ORDER BY city_name`),
    rows(bigquery, `SELECT s.school_id, s.school_name, s.area, s.kitchen_id, c.city_name FROM ${prefix}.schools\` s JOIN ${prefix}.cities\` c USING (city_id) WHERE s.active AND c.active ORDER BY c.city_name, s.school_name`),
    rows(bigquery, `SELECT meal_id, service_date, day_label, short_date, meal_name, description, tags, protein_g, calories, price_inr, rating, color, emoji, nutrition_status FROM ${prefix}.menu_items\` WHERE is_available AND service_date >= CURRENT_DATE("Asia/Kolkata") ORDER BY service_date, meal_id`),
    rows(bigquery, `SELECT grade_band, label, target_calories, target_protein_g, nutrition_status FROM ${prefix}.grade_nutrition_plans\` WHERE active ORDER BY sort_order`),
  ]);

  if (!cityRows.length || !schoolRows.length || !mealRows.length || !gradeRows.length) {
    throw new Error("BigQuery catalogue is incomplete; cities, schools, meals and grade plans are required.");
  }

  const schools = schoolRows.map((row) => ({
    id: String(row.school_id),
    name: String(row.school_name),
    city: String(row.city_name),
    area: String(row.area),
    kitchenId: String(row.kitchen_id),
  }));
  const meals = mealRows.map((row) => ({
    id: String(row.meal_id),
    serviceDate: dateValue(row.service_date),
    day: String(row.day_label),
    shortDate: String(row.short_date),
    name: String(row.meal_name),
    description: String(row.description),
    tags: Array.isArray(row.tags) ? row.tags.map(String) : [],
    protein: Number(row.protein_g),
    calories: Number(row.calories),
    price: Number(row.price_inr),
    rating: Number(row.rating),
    color: String(row.color),
    emoji: String(row.emoji),
    nutritionStatus: String(row.nutrition_status) as Meal["nutritionStatus"],
  }));
  const gradePlans = Object.fromEntries(gradeRows.map((row) => {
    const id = String(row.grade_band);
    return [id, {
      id,
      label: String(row.label),
      targetCalories: Number(row.target_calories),
      targetProteinG: Number(row.target_protein_g),
      nutritionStatus: String(row.nutrition_status) as GradePlan["nutritionStatus"],
    }];
  }));

  return { cities: cityRows.map((row) => String(row.city_name)), schools, meals, gradePlans, source: "bigquery" };
}
