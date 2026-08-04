import { FieldValue } from "@google-cloud/firestore";
import { NextResponse } from "next/server";
import { ParentAuthError, verifyStaffRole } from "@/lib/firebase-admin";
import { firestoreClient } from "@/lib/firestore";
import { writeAuditLog } from "@/lib/hardening";

export const runtime = "nodejs";

const cities = new Set(["chennai", "madurai", "trichy", "coimbatore"]);

function responseError(error: unknown) {
  const status = error instanceof ParentAuthError ? 403 : 500;
  return NextResponse.json({ error: error instanceof Error ? error.message : "Unable to manage kitchens." }, { status });
}

export async function GET(request: Request) {
  try {
    await verifyStaffRole(request, "admin");
    const snapshot = await firestoreClient().collection("kitchens").orderBy("city_id").get();
    return NextResponse.json({ kitchens: snapshot.docs.map((document) => ({ id: document.id, ...document.data() })) });
  } catch (error) {
    return responseError(error);
  }
}

export async function PUT(request: Request) {
  try {
    const staff = await verifyStaffRole(request, "admin");
    const body = await request.json() as Record<string, unknown>;
    const kitchenId = typeof body.kitchenId === "string" ? body.kitchenId.trim() : "";
    const kitchenName = typeof body.kitchenName === "string" ? body.kitchenName.trim() : "";
    const cityId = typeof body.cityId === "string" ? body.cityId : "";
    const dailyCapacity = Number(body.dailyCapacity);
    const cutoff = typeof body.orderCutoff === "string" ? body.orderCutoff : "";

    if (!/^[a-z0-9-]{3,50}$/.test(kitchenId) || kitchenName.length < 3 || !cities.has(cityId) || !Number.isInteger(dailyCapacity) || dailyCapacity < 1 || dailyCapacity > 100000 || !/^([01]\d|2[0-3]):[0-5]\d$/.test(cutoff)) {
      return NextResponse.json({ error: "Enter a valid kitchen, city, capacity and HH:mm cutoff." }, { status: 400 });
    }

    await firestoreClient().collection("kitchens").doc(kitchenId).set({
      city_id: cityId,
      kitchen_name: kitchenName,
      daily_capacity: dailyCapacity,
      order_cutoff: cutoff,
      active: body.active !== false,
      updated_at: FieldValue.serverTimestamp(),
      updated_by: staff.uid,
    }, { merge: true });
    await writeAuditLog(staff.uid, "kitchen.upsert", "kitchen", kitchenId, { cityId, dailyCapacity, cutoff, active: body.active !== false });
    return NextResponse.json({ id: kitchenId, updated: true });
  } catch (error) {
    return responseError(error);
  }
}
