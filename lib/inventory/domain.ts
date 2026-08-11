import { z } from "zod";

export const inventoryRoles = ["admin", "warehouse_manager", "branch_store_manager", "kitchen_manager", "logistics_manager", "procurement_manager", "finance_analyst", "planning_manager"] as const;
export type InventoryRole = typeof inventoryRoles[number];

export const locationTypes = ["CENTRAL_WAREHOUSE", "BRANCH_KITCHEN", "SUPPLIER_ORIGIN", "CROSS_DOCK", "EXTERNAL_STORAGE"] as const;
export const movementTypes = ["RECEIPT", "ISSUE", "WASTAGE", "ADJUSTMENT", "CLOSING", "TRANSFER_OUT", "TRANSFER_IN", "TRANSFER_VARIANCE"] as const;
export type MovementType = typeof movementTypes[number];

const id = z.string().trim().min(2).max(120).regex(/^[A-Za-z0-9_-]+$/);
const quantity = z.number().finite().positive();

export const locationSchema = z.object({
  locationId: id.optional(), locationName: z.string().trim().min(2).max(160), locationType: z.enum(locationTypes),
  city: z.string().trim().min(1).max(120), state: z.string().trim().min(1).max(120), address: z.string().trim().min(3).max(500),
  capacity: z.number().finite().nonnegative(), capacityUnit: z.string().trim().min(1).max(30).default("KG"),
  defaultPlanningPeriodDays: z.number().int().min(1).max(730), primaryWarehouseId: id.nullish(), fallbackWarehouseIds: z.array(id).default([]),
  status: z.enum(["ACTIVE", "INACTIVE"]).default("ACTIVE"),
});

export const itemSchema = z.object({
  itemId: id.optional(), itemName: z.string().trim().min(2).max(160), categoryId: id, unit: z.string().trim().min(1).max(30),
  baseUnit: z.string().trim().min(1).max(30), conversionFactor: z.number().finite().positive(), defaultSupplierId: id.nullish(),
  batchTrackingRequired: z.boolean(), expiryTrackingRequired: z.boolean(), shelfLifeDays: z.number().int().positive().nullish(),
  storageCondition: z.string().trim().max(300), reorderMethod: z.enum(["MIN_MAX", "REORDER_POINT", "FORECAST", "MANUAL"]),
  status: z.enum(["ACTIVE", "INACTIVE"]).default("ACTIVE"),
}).superRefine((value, context) => {
  if (value.expiryTrackingRequired && !value.shelfLifeDays) context.addIssue({ code: "custom", path: ["shelfLifeDays"], message: "Shelf life is required for expiry-tracked items." });
});

export const stockMovementSchema = z.object({
  itemId: id, locationId: id, sourceLocationId: id.nullish(), destinationLocationId: id.nullish(),
  transactionType: z.enum(movementTypes), quantity, unit: z.string().trim().min(1).max(30),
  costPerUnit: z.number().finite().nonnegative().default(0), landedCostPerUnit: z.number().finite().nonnegative().default(0),
  referenceId: id, referenceType: z.enum(["GRN", "PO", "TRANSFER", "DAILY_CLOSING", "MANUAL_ADJUSTMENT", "WASTAGE", "ISSUE"]),
  batchNumber: z.string().trim().max(120).default("UNBATCHED"), expiryDate: z.string().date().nullish(), remarks: z.string().trim().max(1000).default(""),
});

export const demandPlanSchema = z.object({
  planId: id.optional(), locationId: id, planningPeriod: z.object({ startDate: z.string().date(), endDate: z.string().date() }),
  periodConsumerCount: z.number().int().nonnegative(), subPeriodConsumerCount: z.number().int().nonnegative(), serviceDays: z.number().int().nonnegative(),
  subPeriodServiceDays: z.number().int().nonnegative(), servingsPerConsumerPerDay: z.number().finite().positive(), menuType: z.string().trim().min(1).max(100),
  status: z.enum(["DRAFT", "SUBMITTED", "APPROVED", "CANCELLED"]).default("DRAFT"),
});

export const consumptionFormulaSchema = z.object({
  formulaId: id.optional(), itemId: id, menuType: z.string().trim().min(1).max(100), consumptionPerConsumer: z.number().finite().nonnegative(),
  unit: z.string().trim().min(1).max(30), wastageBufferPercent: z.number().finite().min(0).max(100), effectiveFrom: z.string().date(), effectiveTo: z.string().date().nullish(),
  status: z.enum(["ACTIVE", "INACTIVE", "PENDING_APPROVAL"]).default("ACTIVE"),
});

export const transferSchema = z.object({
  transferId: id.optional(), sourceLocationId: id, destinationLocationId: id, plannedDispatchDate: z.string().date(), transportMode: z.string().trim().min(1).max(60),
  transporterId: id.nullish(), estimatedTransportCost: z.number().finite().nonnegative().default(0), remarks: z.string().trim().max(1000).default(""),
  items: z.array(z.object({ itemId: id, requestedQuantity: quantity, unit: z.string().trim().min(1).max(30), sourceBatchNumber: z.string().trim().max(120).default("UNBATCHED"), expiryDate: z.string().date().nullish(), remarks: z.string().trim().max(500).default("") })).min(1),
}).refine((value) => value.sourceLocationId !== value.destinationLocationId, { message: "Source and destination must be different.", path: ["destinationLocationId"] });

export const supplierRateSchema = z.object({
  rateId: id.optional(), supplierId: id, itemId: id, unit: z.string().trim().min(1).max(30), rate: z.number().finite().nonnegative(), currency: z.string().length(3).transform((v) => v.toUpperCase()),
  priceSource: z.enum(["MANUAL", "SUPPLIER_PORTAL_API", "MARKET_PRICE_API", "CONTRACT"]), sourceReferenceId: z.string().trim().max(200).nullish(),
  effectiveFrom: z.string().date(), effectiveTo: z.string().date().nullish(), minimumOrderQuantity: z.number().finite().nonnegative(), leadTimeDays: z.number().int().nonnegative(),
  status: z.enum(["ACTIVE", "EXPIRED", "PENDING_APPROVAL", "REJECTED"]),
});

export const purchaseOrderSchema = z.object({
  poId: id.optional(), supplierId: id, destinationLocationId: id, currency: z.string().length(3).transform((value) => value.toUpperCase()), expectedDeliveryDate: z.string().date(),
  estimatedInboundFreight: z.number().finite().nonnegative(), allocationBasis: z.enum(["QUANTITY", "WEIGHT", "VOLUME", "VALUE", "MANUAL"]), remarks: z.string().trim().max(1000).default(""),
  items: z.array(z.object({ itemId: id, quantity, unit: z.string().trim().min(1).max(30), unitRate: z.number().finite().nonnegative(), supplierRateId: id, taxPercent: z.number().finite().min(0).max(100).default(0) })).min(1),
});

export const goodsReceiptSchema = z.object({
  grnId: id.optional(), poId: id, inboundShipmentId: id.nullish(), locationId: id, receiptDate: z.string().date(), invoiceNumber: z.string().trim().min(1).max(120), freightActual: z.number().finite().nonnegative(), handlingActual: z.number().finite().nonnegative(), allocationBasis: z.enum(["QUANTITY", "WEIGHT", "VOLUME", "VALUE", "MANUAL"]), documentUrls: z.array(z.string().url()).default([]),
  items: z.array(z.object({ itemId: id, receivedQuantity: quantity, acceptedQuantity: z.number().finite().nonnegative(), rejectedQuantity: z.number().finite().nonnegative(), unit: z.string().trim().min(1).max(30), unitRate: z.number().finite().nonnegative(), batchNumber: z.string().trim().min(1).max(120), expiryDate: z.string().date().nullish(), qualityStatus: z.enum(["ACCEPTED", "PARTIALLY_ACCEPTED", "REJECTED"]), manualFreightAllocation: z.number().finite().nonnegative().optional() })).min(1),
}).superRefine((value, context) => value.items.forEach((item, index) => { if (Math.abs(item.acceptedQuantity + item.rejectedQuantity - item.receivedQuantity) > 0.000001) context.addIssue({ code: "custom", path: ["items", index], message: "Accepted plus rejected quantity must equal received quantity." }); }));

export const transportationRateSchema = z.object({
  rateId: id.optional(), mode: z.string().trim().min(1).max(60), originLocationId: id, destinationLocationId: id, originPoint: z.string().trim().min(1).max(200), destinationPoint: z.string().trim().min(1).max(200), routeDistanceKm: z.number().finite().nonnegative(), commodityName: z.string().trim().max(160).default(""), commodityClass: z.string().trim().max(120).default(""), carrierUnitType: z.string().trim().min(1).max(60), rateType: z.enum(["PER_TON", "PER_TON_KM", "PER_UNIT", "PER_TRIP", "MANUAL_REFERENCE"]), baseRate: z.number().finite().nonnegative(), minimumCharge: z.number().finite().nonnegative(), loadingCharge: z.number().finite().nonnegative().default(0), unloadingCharge: z.number().finite().nonnegative().default(0), terminalCharge: z.number().finite().nonnegative().default(0), handlingCharge: z.number().finite().nonnegative().default(0), insurancePercent: z.number().finite().min(0).max(100).default(0), taxPercent: z.number().finite().min(0).max(100).default(0), effectiveFrom: z.string().date(), effectiveTo: z.string().date().nullish(), sourceReference: z.string().trim().max(300), status: z.enum(["DRAFT", "PENDING_APPROVAL", "ACTIVE", "EXPIRED", "REJECTED"]),
}).refine((value) => value.originLocationId !== value.destinationLocationId, { path: ["destinationLocationId"], message: "Route endpoints must differ." });

export const dailyExpenseSchema = z.object({ expenseId: id.optional(), locationId: id, expenseDate: z.string().date(), category: z.string().trim().min(1).max(100), description: z.string().trim().min(2).max(500), supplierId: id.nullish(), amount: z.number().finite().nonnegative(), currency: z.string().length(3), receiptUrl: z.string().url().nullish(), status: z.enum(["DRAFT", "SUBMITTED", "APPROVED", "REJECTED"]).default("SUBMITTED") });

export type StockMovementInput = z.infer<typeof stockMovementSchema>;

export function calculateDemand(consumerCount: number, servingsPerDay: number, consumptionPerConsumer: number, serviceDays: number, wastagePercent: number) {
  return consumerCount * servingsPerDay * consumptionPerConsumer * serviceDays * (1 + wastagePercent / 100);
}

export function availabilityPercent(availableStock: number, thresholdBaseQuantity: number) {
  return thresholdBaseQuantity <= 0 ? 0 : Math.max(0, availableStock / thresholdBaseQuantity * 100);
}

export function alertColor(percent: number, thresholds = { green: 50, red: 25 }) {
  if (percent > thresholds.green) return "GREEN" as const;
  if (percent < thresholds.red) return "RED" as const;
  return "AMBER" as const;
}

export function freightCost(input: { rateType: string; chargeableUnits: number; routeDistanceKm: number; baseRate: number; minimumCharge: number; enteredCarrierFreightAmount?: number; loadingCharge?: number; unloadingCharge?: number; terminalCharge?: number; handlingCharge?: number; insurancePercent?: number; taxPercent?: number; otherCharges?: number }) {
  const extras = (input.loadingCharge || 0) + (input.unloadingCharge || 0) + (input.terminalCharge || 0) + (input.handlingCharge || 0) + (input.otherCharges || 0);
  const base = input.rateType === "MANUAL_REFERENCE" ? (input.enteredCarrierFreightAmount || 0)
    : input.rateType === "PER_TRIP" ? input.baseRate
    : input.rateType === "PER_UNIT" || input.rateType === "PER_TON" ? input.chargeableUnits * input.baseRate
    : input.chargeableUnits * input.routeDistanceKm * input.baseRate;
  const beforePercent = Math.max(input.minimumCharge, base) + extras;
  const insurance = beforePercent * (input.insurancePercent || 0) / 100;
  return beforePercent + insurance + (beforePercent + insurance) * (input.taxPercent || 0) / 100;
}

export function forecastReplenishment(input: { availableStock: number; inTransitStock: number; averageDailyConsumption: number; maximumDailyConsumption: number; averageLeadTimeDays: number; maximumLeadTimeDays: number; targetStock: number; asOf: Date }) {
  const safetyStock = Math.max(0, input.maximumDailyConsumption * input.maximumLeadTimeDays - input.averageDailyConsumption * input.averageLeadTimeDays);
  const reorderPoint = input.averageDailyConsumption * input.averageLeadTimeDays + safetyStock;
  const coverageDays = input.averageDailyConsumption > 0 ? input.availableStock / input.averageDailyConsumption : null;
  const forecastedDepletionDate = coverageDays === null ? null : new Date(input.asOf.getTime() + coverageDays * 86_400_000).toISOString().slice(0, 10);
  const recommendedQuantity = Math.max(0, input.targetStock - input.availableStock - input.inTransitStock + input.averageDailyConsumption * input.averageLeadTimeDays);
  return { safetyStock, reorderPoint, stockCoverageDays: coverageDays, forecastedDepletionDate, recommendedQuantity };
}
