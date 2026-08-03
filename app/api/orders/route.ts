import { NextResponse } from "next/server";
import { cities, gradeAdjustments, meals, schools } from "@/lib/meals";
import { isGcpConfigured, persistOrder, type OrderRecord } from "@/lib/gcp";

export const runtime = "nodejs";

type IncomingOrder = {
  studentName?: unknown;
  schoolName?: unknown;
  parentPhone?: unknown;
  city?: unknown;
  gradeBand?: unknown;
  items?: unknown;
  total?: unknown;
};

export async function POST(request: Request) {
  try {
    const body = (await request.json()) as IncomingOrder;
    if (![body.studentName, body.schoolName, body.parentPhone, body.city, body.gradeBand].every((value) => typeof value === "string" && value.trim())) {
      return NextResponse.json({ error: "Please complete all student and delivery details." }, { status: 400 });
    }
    if (!/^[6-9]\d{9}$/.test(body.parentPhone as string)) {
      return NextResponse.json({ error: "Enter a valid 10-digit mobile number." }, { status: 400 });
    }
    if (!cities.includes(body.city as string) || !(body.gradeBand as string in gradeAdjustments)) {
      return NextResponse.json({ error: "Choose a supported city and grade." }, { status: 400 });
    }
    if (!schools.some((school) => school.name === body.schoolName && school.city === body.city)) {
      return NextResponse.json({ error: "Choose an onboarded school in the selected city." }, { status: 400 });
    }
    if (!Array.isArray(body.items) || body.items.length === 0) {
      return NextResponse.json({ error: "Add at least one meal." }, { status: 400 });
    }

    const hasInvalidItem = body.items.some((item) => {
      const candidate = item as { mealId?: unknown; quantity?: unknown };
      const quantity = Number(candidate.quantity);
      return !meals.some((meal) => meal.id === candidate.mealId) || !Number.isInteger(quantity) || quantity < 1 || quantity > 20;
    });
    if (hasInvalidItem) {
      return NextResponse.json({ error: "Invalid meal selection." }, { status: 400 });
    }

    const sanitizedItems = body.items.map((item) => {
      const candidate = item as { mealId: string; quantity: number };
      const meal = meals.find((entry) => entry.id === candidate.mealId)!;
      return { meal_id: meal.id, meal_name: meal.name, quantity: Number(candidate.quantity), unit_price_inr: meal.price };
    });
    const serverTotal = sanitizedItems.reduce((sum, item) => sum + item.quantity * item.unit_price_inr, 0);
    const orderId = `LB-${crypto.randomUUID()}`;
    const order: OrderRecord = {
      order_id: orderId,
      created_at: new Date().toISOString(),
      student_name: (body.studentName as string).trim(),
      school_name: (body.schoolName as string).trim(),
      parent_phone: body.parentPhone as string,
      city: body.city as string,
      grade_band: body.gradeBand as string,
      items_json: JSON.stringify(sanitizedItems),
      total_inr: serverTotal,
      status: "CONFIRMED",
      receipt_uri: null,
    };

    const stored = await persistOrder(order);
    return NextResponse.json({ orderId, total: serverTotal, storage: stored.mode, configured: isGcpConfigured() }, { status: 201 });
  } catch (error) {
    console.error("Order creation failed", error);
    return NextResponse.json({ error: error instanceof Error ? error.message : "Unable to place order." }, { status: 500 });
  }
}
