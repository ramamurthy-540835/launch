import { NextResponse } from "next/server";
import { getCatalog } from "@/lib/catalog";
import { isGcpConfigured, persistOrder, type OrderRecord } from "@/lib/gcp";
import { attachPaymentOrder, getOwnedStudent, isFirestoreConfigured, markOrderSynced, OrderConflictError, reserveOrder } from "@/lib/firestore";
import { ParentAuthError, verifyParent } from "@/lib/firebase-admin";
import { createPaymentOrder, isRazorpayConfigured, paymentCheckoutDetails } from "@/lib/razorpay";
import { enforceRateLimit, RateLimitError } from "@/lib/hardening";
import { logError, requestId } from "@/lib/logging";

export const runtime = "nodejs";

type IncomingOrder = {
  studentId?: unknown;
  studentName?: unknown;
  schoolName?: unknown;
  parentPhone?: unknown;
  city?: unknown;
  gradeBand?: unknown;
  items?: unknown;
  total?: unknown;
};

export async function POST(request: Request) {
  const correlationId = requestId(request);
  try {
    const parent = await verifyParent(request);
    if (parent) await enforceRateLimit("create_order", parent.uid, 10, 60);
    const idempotencyKey = request.headers.get("Idempotency-Key");
    if (isFirestoreConfigured() && (!idempotencyKey || !/^[A-Za-z0-9_-]{16,128}$/.test(idempotencyKey))) {
      return NextResponse.json({ error: "A valid Idempotency-Key header is required." }, { status: 400 });
    }
    const body = (await request.json()) as IncomingOrder;
    const catalog = await getCatalog();
    if (![body.schoolName, body.parentPhone, body.city, body.gradeBand].every((value) => typeof value === "string" && value.trim())) {
      return NextResponse.json({ error: "Please complete all student and delivery details." }, { status: 400 });
    }
    if (!/^[6-9]\d{9}$/.test(body.parentPhone as string)) {
      return NextResponse.json({ error: "Enter a valid 10-digit mobile number." }, { status: 400 });
    }
    if (parent && parent.phone !== body.parentPhone) {
      return NextResponse.json({ error: "Use the verified parent mobile number." }, { status: 403 });
    }
    if (!catalog.cities.includes(body.city as string) || !(body.gradeBand as string in catalog.gradePlans)) {
      return NextResponse.json({ error: "Choose a supported city and grade." }, { status: 400 });
    }
    const school = catalog.schools.find((entry) => entry.name === body.schoolName && entry.city === body.city);
    if (!school) {
      return NextResponse.json({ error: "Choose an onboarded school in the selected city." }, { status: 400 });
    }
    let studentName = typeof body.studentName === "string" ? body.studentName.trim() : "";
    let allergiesJson: string | null = null;
    if (parent) {
      if (typeof body.studentId !== "string") {
        return NextResponse.json({ error: "Choose an authenticated student profile." }, { status: 400 });
      }
      const student = await getOwnedStudent(parent.uid, body.studentId);
      if (!student || !student.allergy_acknowledged) {
        return NextResponse.json({ error: "The student profile is unavailable or missing allergy consent." }, { status: 403 });
      }
      if (student.school_id !== school.id || student.grade_band !== body.gradeBand) {
        return NextResponse.json({ error: "The student profile does not match the selected school and grade." }, { status: 400 });
      }
      studentName = student.student_name;
      allergiesJson = JSON.stringify(student.allergies || []);
    }
    if (studentName.length < 2) {
      return NextResponse.json({ error: "Choose a valid student profile." }, { status: 400 });
    }
    if (!Array.isArray(body.items) || body.items.length === 0) {
      return NextResponse.json({ error: "Add at least one meal." }, { status: 400 });
    }

    const hasInvalidItem = body.items.some((item) => {
      const candidate = item as { mealId?: unknown; quantity?: unknown };
      const quantity = Number(candidate.quantity);
      return !catalog.meals.some((meal) => meal.id === candidate.mealId) || !Number.isInteger(quantity) || quantity < 1 || quantity > 20;
    });
    if (hasInvalidItem) {
      return NextResponse.json({ error: "Invalid meal selection." }, { status: 400 });
    }
    const mealIds = body.items.map((item) => (item as { mealId: string }).mealId);
    if (new Set(mealIds).size !== mealIds.length) {
      return NextResponse.json({ error: "Each meal may appear only once per order." }, { status: 400 });
    }

    const sanitizedItems = body.items.map((item) => {
      const candidate = item as { mealId: string; quantity: number };
      const meal = catalog.meals.find((entry) => entry.id === candidate.mealId)!;
      return { meal_id: meal.id, meal_name: meal.name, service_date: meal.serviceDate, quantity: Number(candidate.quantity), unit_price_inr: meal.price };
    });
    const serverTotal = sanitizedItems.reduce((sum, item) => sum + item.quantity * item.unit_price_inr, 0);
    const orderId = `LB-${crypto.randomUUID()}`;
    const order: OrderRecord = {
      order_id: orderId,
      parent_uid: parent?.uid || null,
      student_id: typeof body.studentId === "string" ? body.studentId : null,
      allergies_json: allergiesJson,
      school_id: school.id,
      kitchen_id: school.kitchenId,
      payment_status: isRazorpayConfigured() ? "PENDING" : "NOT_REQUIRED",
      created_at: new Date().toISOString(),
      student_name: studentName,
      school_name: (body.schoolName as string).trim(),
      parent_phone: body.parentPhone as string,
      city: body.city as string,
      grade_band: body.gradeBand as string,
      items_json: JSON.stringify(sanitizedItems),
      total_inr: serverTotal,
      status: isRazorpayConfigured() ? "PENDING_PAYMENT" : "CONFIRMED",
      receipt_uri: null,
    };

    if (!isFirestoreConfigured()) {
      const stored = await persistOrder(order);
      return NextResponse.json({ orderId, total: serverTotal, storage: stored.mode, configured: isGcpConfigured() }, { status: 201 });
    }

    const reservations = sanitizedItems.map((item) => ({ serviceDate: item.service_date, meals: item.quantity }));
    const reserved = await reserveOrder(order, idempotencyKey!, school.id, school.kitchenId, reservations);
    const authoritativeOrder = reserved.order;
    let paymentOrder = null;
    if (isRazorpayConfigured()) {
      paymentOrder = authoritativeOrder.razorpay_order_id
        ? paymentCheckoutDetails(authoritativeOrder.razorpay_order_id, authoritativeOrder.total_inr)
        : await createPaymentOrder(authoritativeOrder.order_id, authoritativeOrder.total_inr);
      if (!authoritativeOrder.razorpay_order_id) await attachPaymentOrder(authoritativeOrder.order_id, paymentOrder.id);
    }
    if (authoritativeOrder.analytics_status !== "SYNCED") {
      const analyticsOrder: OrderRecord = {
        ...order,
        order_id: authoritativeOrder.order_id,
        parent_uid: authoritativeOrder.parent_uid,
        student_id: authoritativeOrder.student_id,
        created_at: authoritativeOrder.created_at,
        status: authoritativeOrder.status,
        receipt_uri: authoritativeOrder.receipt_uri,
      };
      const stored = await persistOrder(analyticsOrder);
      await markOrderSynced(authoritativeOrder.order_id, stored.receiptUri);
    }

    return NextResponse.json(
      { orderId: authoritativeOrder.order_id, total: authoritativeOrder.total_inr, storage: "firestore", configured: true, duplicate: !reserved.created, payment: paymentOrder },
      { status: reserved.created ? 201 : 200 },
    );
  } catch (error) {
    logError("order.create_failed", error, { correlationId });
    const status = error instanceof RateLimitError ? 429 : error instanceof OrderConflictError ? 409 : error instanceof ParentAuthError ? 401 : 500;
    return NextResponse.json({ error: error instanceof Error ? error.message : "Unable to place order.", correlationId }, { status, headers: { "X-Request-Id": correlationId } });
  }
}
