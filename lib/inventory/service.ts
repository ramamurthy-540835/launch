import { FieldValue, Timestamp, type DocumentData, type Transaction } from "@google-cloud/firestore";
import { firestoreClient } from "@/lib/firestore";
import { alertColor, availabilityPercent, stockMovementSchema, transferSchema, type StockMovementInput } from "@/lib/inventory/domain";

function safeKey(...parts: string[]) { return parts.map((part) => part.replace(/[^A-Za-z0-9_-]/g, "_")).join("_"); }
function asNumber(value: unknown) { const number = Number(value || 0); return Number.isFinite(number) ? number : 0; }
function nowIso() { return new Date().toISOString(); }

export async function writeAudit(actorId: string, action: string, entityType: string, entityId: string, before: unknown, after: unknown, metadata: Record<string, unknown> = {}) {
  await firestoreClient().collection("inventory_audit_logs").add({ actor_id: actorId, action, entity_type: entityType, entity_id: entityId, before, after, metadata, performed_at: FieldValue.serverTimestamp() });
}

async function matchingRule(transaction: Transaction, locationId: string, categoryId?: string) {
  const db = firestoreClient();
  const scoped = await transaction.get(db.collection("alert_rule_config").doc(`LOW_STOCK_${locationId}`));
  if (scoped.exists) return scoped.data()!;
  if (categoryId) {
    const category = await transaction.get(db.collection("alert_rule_config").doc(`LOW_STOCK_CATEGORY_${categoryId}`));
    if (category.exists) return category.data()!;
  }
  const global = await transaction.get(db.collection("alert_rule_config").doc("LOW_STOCK_GLOBAL"));
  return global.exists ? global.data()! : { green_threshold: 50, red_threshold: 25, notify_roles: ["admin", "warehouse_manager", "branch_store_manager", "planning_manager", "procurement_manager"], escalation_delay_minutes: 30 };
}

export async function applyStockMovement(raw: unknown, actorId: string) {
  const movement = stockMovementSchema.parse(raw);
  const db = firestoreClient();
  const balanceId = safeKey(movement.locationId, movement.itemId, movement.batchNumber);
  const balanceRef = db.collection("inventory_balances").doc(balanceId);
  const transactionRef = db.collection("stock_transactions").doc();
  const itemRef = db.collection("inventory_items").doc(movement.itemId);
  const result = await db.runTransaction(async (transaction) => {
    const [balanceSnapshot, itemSnapshot] = await Promise.all([transaction.get(balanceRef), transaction.get(itemRef)]);
    if (!itemSnapshot.exists) throw new Error("Inventory item does not exist.");
    const before = balanceSnapshot.exists ? balanceSnapshot.data()! : {};
    const previousStock = asNumber(before.current_stock);
    const previousReserved = asNumber(before.reserved_stock);
    const increase = movement.transactionType === "RECEIPT" || movement.transactionType === "TRANSFER_IN";
    const closing = movement.transactionType === "CLOSING";
    const adjustment = movement.transactionType === "ADJUSTMENT";
    const newStock = closing ? movement.quantity : adjustment ? previousStock + movement.quantity : previousStock + (increase ? movement.quantity : -movement.quantity);
    if (newStock < 0) throw new Error("Stock movement would create a negative balance.");
    const availableStock = Math.max(0, newStock - previousReserved);
    const thresholdBase = asNumber(before.threshold_base_quantity) || asNumber(before.maximum_stock) || newStock;
    const rule = await matchingRule(transaction, movement.locationId, String(itemSnapshot.get("category_id") || ""));
    const percent = availabilityPercent(availableStock, thresholdBase);
    const color = alertColor(percent, { green: asNumber(rule.green_threshold) || 50, red: asNumber(rule.red_threshold) || 25 });
    const oldCost = asNumber(before.weighted_average_cost);
    const weightedAverageCost = increase && newStock > 0 ? ((previousStock * oldCost) + (movement.quantity * movement.costPerUnit)) / newStock : oldCost;
    const after = { item_id: movement.itemId, location_id: movement.locationId, batch_number: movement.batchNumber, expiry_date: movement.expiryDate || null, current_stock: newStock, reserved_stock: previousReserved, available_stock: availableStock, in_transit_stock: asNumber(before.in_transit_stock), unit: movement.unit, weighted_average_cost: weightedAverageCost, landed_cost_per_unit: movement.landedCostPerUnit || asNumber(before.landed_cost_per_unit), minimum_stock: asNumber(before.minimum_stock), maximum_stock: asNumber(before.maximum_stock), safety_stock: asNumber(before.safety_stock), reorder_point: asNumber(before.reorder_point), threshold_base_quantity: thresholdBase, stock_availability_percent: percent, alert_color: color, last_transaction_at: FieldValue.serverTimestamp(), updated_at: FieldValue.serverTimestamp() };
    transaction.set(balanceRef, after, { merge: true });
    transaction.create(transactionRef, { transaction_id: transactionRef.id, ...snakeMovement(movement), previous_stock: previousStock, new_stock: newStock, total_cost: movement.quantity * movement.costPerUnit, performed_by: actorId, performed_at: FieldValue.serverTimestamp() });
    if (color === "RED") {
      const alertRef = db.collection("inventory_alerts").doc(`STOCKOUT_RISK_${balanceId}`);
      transaction.set(alertRef, { alert_id: alertRef.id, alert_type: "STOCKOUT_RISK", severity: "RED", item_id: movement.itemId, location_id: movement.locationId, trigger_value: percent, threshold_value: asNumber(rule.red_threshold) || 25, recommended_action: { recommended_replenishment_quantity: Math.max(0, thresholdBase - availableStock) }, status: "OPEN", notify_roles: rule.notify_roles || [], escalation_delay_minutes: rule.escalation_delay_minutes || 30, triggered_at: FieldValue.serverTimestamp(), updated_at: FieldValue.serverTimestamp() }, { merge: true });
    }
    return { transactionId: transactionRef.id, balanceId, previousStock, newStock, availableStock, stockAvailabilityPercent: percent, alertColor: color };
  });
  await writeAudit(actorId, `stock.${movement.transactionType.toLowerCase()}`, "stock_transaction", result.transactionId, null, result, { referenceId: movement.referenceId });
  return result;
}

function snakeMovement(movement: StockMovementInput) {
  return { item_id: movement.itemId, location_id: movement.locationId, source_location_id: movement.sourceLocationId || null, destination_location_id: movement.destinationLocationId || null, transaction_type: movement.transactionType, quantity: movement.quantity, unit: movement.unit, cost_per_unit: movement.costPerUnit, landed_cost_per_unit: movement.landedCostPerUnit, reference_id: movement.referenceId, reference_type: movement.referenceType, batch_number: movement.batchNumber, expiry_date: movement.expiryDate || null, remarks: movement.remarks };
}

export async function createTransfer(raw: unknown, actorId: string) {
  const transfer = transferSchema.parse(raw); const db = firestoreClient(); const ref = db.collection("stock_transfer_orders").doc();
  const record = { transfer_id: ref.id, transfer_number: `STO-${Date.now()}-${ref.id.slice(0, 5).toUpperCase()}`, source_location_id: transfer.sourceLocationId, destination_location_id: transfer.destinationLocationId, requested_by: actorId, approved_by: null, request_date: nowIso().slice(0, 10), approved_date: null, planned_dispatch_date: transfer.plannedDispatchDate, status: "REQUESTED", transport_mode: transfer.transportMode, transporter_id: transfer.transporterId || null, estimated_transport_cost: transfer.estimatedTransportCost, actual_transport_cost: 0, remarks: transfer.remarks, items: transfer.items.map((item) => ({ item_id: item.itemId, requested_quantity: item.requestedQuantity, approved_quantity: 0, issued_quantity: 0, received_quantity: 0, unit: item.unit, source_batch_number: item.sourceBatchNumber, expiry_date: item.expiryDate || null, unit_cost: 0, transfer_cost_allocation: 0, remarks: item.remarks })), created_at: FieldValue.serverTimestamp(), updated_at: FieldValue.serverTimestamp() };
  await ref.create(record); await writeAudit(actorId, "transfer.request", "stock_transfer", ref.id, null, { ...record, created_at: null, updated_at: null }); return { transferId: ref.id, transferNumber: record.transfer_number, status: record.status };
}

async function getTransfer(transaction: Transaction, transferId: string) { const ref = firestoreClient().collection("stock_transfer_orders").doc(transferId); const snapshot = await transaction.get(ref); if (!snapshot.exists) throw new Error("Stock transfer does not exist."); return { ref, data: snapshot.data()! }; }

export async function transitionTransfer(transferId: string, action: "approve" | "dispatch" | "receive", actorId: string, payload: Record<string, unknown>) {
  const db = firestoreClient();
  const result = await db.runTransaction(async (transaction) => {
    const { ref, data } = await getTransfer(transaction, transferId); const items = data.items as DocumentData[];
    if (action === "approve") {
      if (data.status !== "REQUESTED") throw new Error("Only requested transfers can be approved.");
      const balanceRefs = items.map((item) => db.collection("inventory_balances").doc(safeKey(data.source_location_id, item.item_id, item.source_batch_number || "UNBATCHED")));
      const balances = await Promise.all(balanceRefs.map((balanceRef) => transaction.get(balanceRef)));
      items.forEach((item, index) => { const requested = asNumber(item.requested_quantity); if (!balances[index].exists || asNumber(balances[index].get("available_stock")) < requested) throw new Error(`Insufficient available stock for ${item.item_id}.`); item.approved_quantity = requested; });
      transaction.update(ref, { items, status: "APPROVED", approved_by: actorId, approved_date: nowIso().slice(0, 10), updated_at: FieldValue.serverTimestamp() }); return { status: "APPROVED" };
    }
    if (action === "dispatch") {
      if (data.status !== "APPROVED" && data.status !== "PICKED") throw new Error("Only approved transfers can be dispatched.");
      const balanceRefs = items.map((item) => db.collection("inventory_balances").doc(safeKey(data.source_location_id, item.item_id, item.source_batch_number || "UNBATCHED")));
      const balances = await Promise.all(balanceRefs.map((balanceRef) => transaction.get(balanceRef)));
      items.forEach((item, index) => {
        const balanceRef = balanceRefs[index]; const balance = balances[index]; const issued = asNumber(item.approved_quantity); const available = asNumber(balance.get("available_stock")); if (available < issued) throw new Error(`Insufficient available stock for ${item.item_id}.`);
        transaction.update(balanceRef, { current_stock: asNumber(balance.get("current_stock")) - issued, available_stock: available - issued, in_transit_stock: asNumber(balance.get("in_transit_stock")) + issued, updated_at: FieldValue.serverTimestamp() });
        const tx = db.collection("stock_transactions").doc(); transaction.create(tx, { transaction_id: tx.id, item_id: item.item_id, location_id: data.source_location_id, source_location_id: data.source_location_id, destination_location_id: data.destination_location_id, transaction_type: "TRANSFER_OUT", quantity: issued, unit: item.unit, previous_stock: asNumber(balance.get("current_stock")), new_stock: asNumber(balance.get("current_stock")) - issued, reference_id: transferId, reference_type: "TRANSFER", batch_number: item.source_batch_number || "UNBATCHED", performed_by: actorId, performed_at: FieldValue.serverTimestamp() }); item.issued_quantity = issued;
      });
      transaction.update(ref, { items, status: "IN_TRANSIT", actual_dispatch_date: nowIso().slice(0, 10), updated_at: FieldValue.serverTimestamp() }); return { status: "IN_TRANSIT" };
    }
    if (data.status !== "IN_TRANSIT" && data.status !== "PARTIALLY_RECEIVED") throw new Error("Only in-transit stock can be received.");
    const received = (payload.items as Array<{ itemId: string; receivedQuantity: number }> | undefined) || [];
    const destinationRefs = items.map((item) => db.collection("inventory_balances").doc(safeKey(data.destination_location_id, item.item_id, item.source_batch_number || "UNBATCHED")));
    const destinations = await Promise.all(destinationRefs.map((destinationRef) => transaction.get(destinationRef)));
    items.forEach((item, index) => {
      const input = received.find((entry) => entry.itemId === item.item_id); const qty = input ? asNumber(input.receivedQuantity) : asNumber(item.issued_quantity); if (qty < 0 || qty > asNumber(item.issued_quantity)) throw new Error(`Invalid received quantity for ${item.item_id}.`);
      const destinationRef = destinationRefs[index]; const destination = destinations[index]; const previous = asNumber(destination.get("current_stock")); transaction.set(destinationRef, { item_id: item.item_id, location_id: data.destination_location_id, batch_number: item.source_batch_number || "UNBATCHED", expiry_date: item.expiry_date || null, current_stock: previous + qty, available_stock: asNumber(destination.get("available_stock")) + qty, reserved_stock: asNumber(destination.get("reserved_stock")), in_transit_stock: Math.max(0, asNumber(destination.get("in_transit_stock")) - qty), unit: item.unit, updated_at: FieldValue.serverTimestamp(), last_transaction_at: FieldValue.serverTimestamp() }, { merge: true });
      const tx = db.collection("stock_transactions").doc(); transaction.create(tx, { transaction_id: tx.id, item_id: item.item_id, location_id: data.destination_location_id, source_location_id: data.source_location_id, destination_location_id: data.destination_location_id, transaction_type: qty === asNumber(item.issued_quantity) ? "TRANSFER_IN" : "TRANSFER_VARIANCE", quantity: qty, unit: item.unit, previous_stock: previous, new_stock: previous + qty, reference_id: transferId, reference_type: "TRANSFER", batch_number: item.source_batch_number || "UNBATCHED", performed_by: actorId, performed_at: FieldValue.serverTimestamp() }); item.received_quantity = qty;
    });
    const complete = items.every((item) => asNumber(item.received_quantity) === asNumber(item.issued_quantity)); transaction.update(ref, { items, status: complete ? "RECEIVED" : "PARTIALLY_RECEIVED", actual_transport_cost: asNumber(payload.actualTransportCost), actual_arrival_date: nowIso().slice(0, 10), updated_at: FieldValue.serverTimestamp() }); return { status: complete ? "RECEIVED" : "PARTIALLY_RECEIVED" };
  });
  await writeAudit(actorId, `transfer.${action}`, "stock_transfer", transferId, null, result); return { transferId, ...result };
}

export function serialize(document: DocumentData): Record<string, unknown> { const data = document.data(); return { id: document.id, ...Object.fromEntries(Object.entries(data).map(([key, value]) => [key, value instanceof Timestamp ? value.toDate().toISOString() : value])) }; }
