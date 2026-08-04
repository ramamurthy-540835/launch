import { FieldValue } from "@google-cloud/firestore";
import { NextResponse } from "next/server";
import { ParentAuthError, verifyStaffRole } from "@/lib/firebase-admin";
import { firestoreClient } from "@/lib/firestore";
import { gradeAdjustments } from "@/lib/meals";
import { writeAuditLog } from "@/lib/hardening";

export const runtime = "nodejs";

const cityIds = new Set(["chennai", "madurai", "trichy", "coimbatore"]);

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
    const audit = { updated_at: FieldValue.serverTimestamp(), updated_by: staff.uid };

    if (entity === "school") {
      const id = String(body.schoolId || "").trim();
      const name = String(body.schoolName || "").trim();
      const cityId = String(body.cityId || "");
      const kitchenId = String(body.kitchenId || "").trim();
      const area = String(body.area || "").trim();
      if (!/^[a-z0-9-]{3,60}$/.test(id) || name.length < 3 || !cityIds.has(cityId) || !/^[a-z0-9-]{3,50}$/.test(kitchenId) || !area) {
        return NextResponse.json({ error: "Enter valid school, city, kitchen and area values." }, { status: 400 });
      }
      await firestore.collection("schools").doc(id).set({ school_name: name, city_id: cityId, kitchen_id: kitchenId, area, active: body.active !== false, ...audit }, { merge: true });
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
      await firestore.collection("meal_packages").doc(id).set({
        service_date: serviceDate,
        day: new Intl.DateTimeFormat("en-IN", { weekday: "long", timeZone: "Asia/Kolkata" }).format(date),
        short_date: new Intl.DateTimeFormat("en-IN", { day: "numeric", month: "short", timeZone: "Asia/Kolkata" }).format(date),
        meal_name: name,
        description: String(body.description || ""),
        tags: ["Vegetarian"],
        protein_g: Number(body.protein || 0),
        calories: Number(body.calories || 0),
        price_inr: price,
        color: String(body.color || "green"),
        emoji: "🍱",
        is_available: body.active !== false,
        ...audit,
      }, { merge: true });
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

    if (entity === "grade" && typeof body.gradeBand === "string" && body.gradeBand in gradeAdjustments) {
      return NextResponse.json({ error: "Grade configuration is not editable in this release." }, { status: 400 });
    }
    return NextResponse.json({ error: "Unsupported catalogue entity." }, { status: 400 });
  } catch (error) {
    return fail(error);
  }
}
