import { FieldValue } from "@google-cloud/firestore";
import { NextResponse } from "next/server";
import { verifyInventoryAccess } from "@/lib/firebase-admin";
import { firestoreClient } from "@/lib/firestore";
import { apiError, jsonBody } from "@/lib/inventory/api";
import { itemSchema } from "@/lib/inventory/domain";
import { serialize, writeAudit } from "@/lib/inventory/service";

export async function GET(request: Request) { try { await verifyInventoryAccess(request, ["admin", "warehouse_manager", "branch_store_manager", "kitchen_manager", "procurement_manager", "planning_manager", "finance_analyst"]); const snapshot = await firestoreClient().collection("inventory_items").orderBy("item_name").get(); return NextResponse.json({ items: snapshot.docs.map(serialize) }); } catch (error) { return apiError(error); } }
export async function POST(request: Request) { try { const actor = await verifyInventoryAccess(request, ["admin", "procurement_manager"]); const parsed = itemSchema.parse(await jsonBody(request)); const ref = parsed.itemId ? firestoreClient().collection("inventory_items").doc(parsed.itemId) : firestoreClient().collection("inventory_items").doc(); const record = { item_id: ref.id, item_name: parsed.itemName, category_id: parsed.categoryId, unit: parsed.unit, base_unit: parsed.baseUnit, conversion_factor: parsed.conversionFactor, default_supplier_id: parsed.defaultSupplierId || null, batch_tracking_required: parsed.batchTrackingRequired, expiry_tracking_required: parsed.expiryTrackingRequired, shelf_life_days: parsed.shelfLifeDays || null, storage_condition: parsed.storageCondition, reorder_method: parsed.reorderMethod, status: parsed.status, created_at: FieldValue.serverTimestamp(), updated_at: FieldValue.serverTimestamp() }; await ref.create(record); await writeAudit(actor.uid, "item.create", "inventory_item", ref.id, null, record); return NextResponse.json({ itemId: ref.id }, { status: 201 }); } catch (error) { return apiError(error); } }
