import { NextResponse } from "next/server";
import { verifyInventoryAccess } from "@/lib/firebase-admin";
import { apiError } from "@/lib/inventory/api";
import { syncApmcPriceFeed } from "@/lib/inventory/apmc-price-sync";

export async function POST(request: Request) {
  try {
    const actor = await verifyInventoryAccess(request, ["admin", "procurement_manager"]);
    return NextResponse.json(await syncApmcPriceFeed(actor.uid));
  } catch (error) {
    return apiError(error);
  }
}
