import { BigQuery } from "@google-cloud/bigquery";
import { FieldValue } from "@google-cloud/firestore";
import { NextResponse } from "next/server";
import { ParentAuthError, verifyStaffRole } from "@/lib/firebase-admin";
import { firestoreClient } from "@/lib/firestore";
import { writeAuditLog } from "@/lib/hardening";

export const runtime = "nodejs";

const projectId = process.env.GCP_PROJECT_ID;
const datasetId = process.env.BIGQUERY_DATASET || "school_lunch";

function catalogBigQuery() {
  if (!projectId || !/^[A-Za-z0-9_-]+$/.test(projectId) || !/^[A-Za-z0-9_-]+$/.test(datasetId)) throw new Error("BigQuery catalogue is not configured.");
  return new BigQuery({ projectId });
}

function catalogTable(name: "schools" | "menu_items" | "grade_nutrition_plans") {
  return "`" + projectId + "." + datasetId + "." + name + "`";
}

function fail(error: unknown) {
  return NextResponse.json(
    { error: error instanceof Error ? error.message : "Unable to update catalogue." },
    { status: error instanceof ParentAuthError ? 403 : 500 },
  );
}

export async function PUT(request: Request) {
  try {
    const staff = await verifyStaffRole(request, "admin");
    const body = await request.json() as Record<string, unknown>;
    const entity = body.entity;
    const firestore = firestoreClient();
    const bigquery = catalogBigQuery();
    const audit = { updated_at: FieldValue.serverTimestamp(), updated_by: staff.uid };

    if (entity === "school") {
      const id = String(body.schoolId || "").trim();
      const name = String(body.schoolName || "").trim();
      const cityId = String(body.cityId || "");
      const kitchenId = String(body.kitchenId || "").trim();
      const area = String(body.area || "").trim();
      if (!/^[a-z0-9-]{3,60}$/.test(id) || name.length < 3 || !/^[a-z0-9-]{3,40}$/.test(cityId) || !/^[a-z0-9-]{3,50}$/.test(kitchenId) || !area) {
        return NextResponse.json({ error: "Enter valid school, city, kitchen and area values." }, { status: 400 });
      }
      await bigquery.query({ query: "MERGE " + catalogTable("schools") + " T USING (SELECT @id AS school_id, @cityId AS city_id, @kitchenId AS kitchen_id, @name AS school_name, @area AS area, @active AS active) S ON T.school_id=S.school_id WHEN MATCHED THEN UPDATE SET city_id=S.city_id, kitchen_id=S.kitchen_id, school_name=S.school_name, area=S.area, active=S.active, updated_at=CURRENT_TIMESTAMP() WHEN NOT MATCHED THEN INSERT (school_id,city_id,kitchen_id,school_name,area,active,updated_at) VALUES (S.school_id,S.city_id,S.kitchen_id,S.school_name,S.area,S.active,CURRENT_TIMESTAMP())", params: { id, cityId, kitchenId, name, area, active: body.active !== false }, location: "asia-south1" });
      await writeAuditLog(staff.uid, "school.upsert", "school", id, { cityId, kitchenId, active: body.active !== false });
      return NextResponse.json({ id, updated: true });
    }

    if (entity === "meal") {
      const id = String(body.mealId || "").trim();
      const serviceDate = String(body.serviceDate || "");
      const price = Number(body.price);
      const name = String(body.mealName || "").trim();
      if (!/^[a-z0-9-]{3,80}$/.test(id) || !/^\d{4}-\d{2}-\d{2}$/.test(serviceDate) || name.length < 3 || !Number.isFinite(price) || price < 1) {
        return NextResponse.json({ error: "Enter a valid meal ID, service date, name and price." }, { status: 400 });
      }
      const date = new Date(`${serviceDate}T00:00:00+05:30`);
      await bigquery.query({ query: "MERGE " + catalogTable("menu_items") + " T USING (SELECT @id AS meal_id, DATE(@serviceDate) AS service_date) S ON T.meal_id=S.meal_id AND T.service_date=S.service_date WHEN MATCHED THEN UPDATE SET day_label=@day, short_date=@shortDate, meal_name=@name, description=@description, tags=[\"Vegetarian\"], protein_g=@protein, calories=@calories, price_inr=@price, rating=NUMERIC \"0\", color=@color, emoji=\"🍱\", nutrition_status=\"provisional\", is_available=@active, updated_at=CURRENT_TIMESTAMP() WHEN NOT MATCHED THEN INSERT (meal_id,service_date,day_label,short_date,meal_name,description,tags,protein_g,calories,price_inr,rating,color,emoji,nutrition_status,is_available,updated_at) VALUES (@id,DATE(@serviceDate),@day,@shortDate,@name,@description,[\"Vegetarian\"],@protein,@calories,@price,NUMERIC \"0\",@color,\"🍱\",\"provisional\",@active,CURRENT_TIMESTAMP())", params: { id, serviceDate, day: new Intl.DateTimeFormat("en-IN", { weekday: "long", timeZone: "Asia/Kolkata" }).format(date), shortDate: new Intl.DateTimeFormat("en-IN", { day: "numeric", month: "short", timeZone: "Asia/Kolkata" }).format(date), name, description: String(body.description || ""), protein: Number(body.protein || 0), calories: Number(body.calories || 0), price, color: String(body.color || "green"), active: body.active !== false }, location: "asia-south1" });
      await writeAuditLog(staff.uid, "meal.upsert", "meal", id, { serviceDate, price, active: body.active !== false });
      return NextResponse.json({ id, updated: true });
    }

    if (entity === "holiday") {
      const schoolId = String(body.schoolId || "").trim();
      const serviceDate = String(body.serviceDate || "");
      if (!/^[a-z0-9-]{3,60}$/.test(schoolId) || !/^\d{4}-\d{2}-\d{2}$/.test(serviceDate)) {
        return NextResponse.json({ error: "Enter a valid school and holiday date." }, { status: 400 });
      }
      const id = `${schoolId}_${serviceDate}`;
      await firestore.collection("school_holidays").doc(id).set({ school_id: schoolId, service_date: serviceDate, reason: String(body.reason || "School closed"), active: body.active !== false, ...audit }, { merge: true });
      await writeAuditLog(staff.uid, "holiday.upsert", "school_holiday", id, { schoolId, serviceDate, active: body.active !== false });
      return NextResponse.json({ id, updated: true });
    }

    if (entity === "grade") {
      const gradeBand = String(body.gradeBand || "").trim();
      const label = String(body.label || "").trim();
      const targetCalories = Number(body.targetCalories);
      const targetProteinG = Number(body.targetProteinG);
      const sortOrder = Number(body.sortOrder);
      if (!/^[0-9-]{3,10}$/.test(gradeBand) || !label || !Number.isInteger(targetCalories) || targetCalories < 1 || !Number.isFinite(targetProteinG) || targetProteinG < 1 || !Number.isInteger(sortOrder)) return NextResponse.json({ error: "Enter a valid grade nutrition plan." }, { status: 400 });
      await bigquery.query({ query: "MERGE " + catalogTable("grade_nutrition_plans") + " T USING (SELECT @gradeBand AS grade_band) S ON T.grade_band=S.grade_band WHEN MATCHED THEN UPDATE SET label=@label, target_calories=@targetCalories, target_protein_g=@targetProteinG, nutrition_status=\"provisional\", sort_order=@sortOrder, active=@active, updated_at=CURRENT_TIMESTAMP() WHEN NOT MATCHED THEN INSERT (grade_band,label,target_calories,target_protein_g,nutrition_status,sort_order,active,updated_at) VALUES (@gradeBand,@label,@targetCalories,@targetProteinG,\"provisional\",@sortOrder,@active,CURRENT_TIMESTAMP())", params: { gradeBand, label, targetCalories, targetProteinG, sortOrder, active: body.active !== false }, location: "asia-south1" });
      await writeAuditLog(staff.uid, "grade.upsert", "grade_nutrition_plan", gradeBand, { targetCalories, targetProteinG, active: body.active !== false });
      return NextResponse.json({ id: gradeBand, updated: true });
    }
    return NextResponse.json({ error: "Unsupported catalogue entity." }, { status: 400 });
  } catch (error) {
    return fail(error);
  }
}
