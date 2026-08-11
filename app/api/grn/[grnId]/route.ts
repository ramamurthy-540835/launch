import { NextResponse } from "next/server";
import { verifyInventoryAccess } from "@/lib/firebase-admin";
import { firestoreClient } from "@/lib/firestore";
import { apiError } from "@/lib/inventory/api";
import { serialize } from "@/lib/inventory/service";
export async function GET(request: Request, { params }: { params: Promise<{ grnId: string }> }) { try { const snapshot = await firestoreClient().collection("goods_receipts").doc((await params).grnId).get(); if (!snapshot.exists) return NextResponse.json({ error: "GRN not found." }, { status: 404 }); await verifyInventoryAccess(request, ["admin", "warehouse_manager", "procurement_manager", "finance_analyst"], String(snapshot.get("location_id"))); return NextResponse.json(serialize(snapshot)); } catch (error) { return apiError(error); } }
