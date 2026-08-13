type RecordValue = Record<string, unknown>;

function value(record: RecordValue, camel: string, snake: string) {
  return record[camel] ?? record[snake];
}

function text(record: RecordValue, camel: string, snake: string) {
  const result = value(record, camel, snake);
  return result == null ? "" : String(result).trim();
}

function number(record: RecordValue, camel: string, snake: string) {
  const result = Number(value(record, camel, snake) ?? 0);
  return Number.isFinite(result) ? result : 0;
}

function words(identifier: string) {
  const cityNames: Record<string, string> = { cbe: "Coimbatore", chn: "Chennai" };
  return identifier.split(/[-_]+/).filter(Boolean).map((part, index) => {
    const lower = part.toLowerCase();
    if (index === 0 && cityNames[lower]) return cityNames[lower];
    return lower.charAt(0).toUpperCase() + lower.slice(1);
  }).join(" ");
}

export function itemNameMap(records: RecordValue[]) {
  return new Map<string, string>(records.map((record): [string, string] => [text(record, "itemId", "item_id"), text(record, "itemName", "item_name")]).filter(([id]) => Boolean(id)));
}

export function normalizeBalance(record: RecordValue, names: Map<string, string>) {
  const itemId = text(record, "itemId", "item_id");
  const locationId = text(record, "locationId", "location_id");
  return {
    ...record,
    itemId,
    itemName: names.get(itemId) || words(itemId),
    locationId,
    locationName: words(locationId),
    batchNumber: text(record, "batchNumber", "batch_number"),
    currentStock: number(record, "currentStock", "current_stock"),
    availableStock: number(record, "availableStock", "available_stock"),
    stockAvailabilityPercent: number(record, "stockAvailabilityPercent", "stock_availability_percent"),
    alertColor: text(record, "alertColor", "alert_color") || "GREEN",
    landedCostPerUnit: number(record, "landedCostPerUnit", "landed_cost_per_unit"),
    weightedAverageCost: number(record, "weightedAverageCost", "weighted_average_cost"),
  };
}

export function normalizeAlert(record: RecordValue, names: Map<string, string>) {
  const itemId = text(record, "itemId", "item_id");
  const locationId = text(record, "locationId", "location_id");
  return {
    ...record,
    itemId,
    itemName: names.get(itemId) || words(itemId),
    locationId,
    locationName: words(locationId),
    alertType: text(record, "alertType", "alert_type"),
    recommendedAction: value(record, "recommendedAction", "recommended_action"),
  };
}

export function latestMarketRates(records: RecordValue[]) {
  const rates = new Map<string, { rate: number; district: string; market: string; date: string }>();
  for (const record of records) {
    const itemId = text(record, "itemId", "item_id");
    const rate = number(record, "parsedRate", "parsed_rate");
    const date = text(record, "sourceArrivalDate", "source_arrival_date") || text(record, "respondedAt", "responded_at");
    if (!itemId || rate <= 0 || (rates.get(itemId)?.date || "") >= date) continue;
    rates.set(itemId, { rate, district: text(record, "sourceDistrict", "source_district"), market: text(record, "sourceMarket", "source_market"), date });
  }
  return rates;
}

export function dashboardMetrics(
  balances: ReturnType<typeof normalizeBalance>[],
  alerts: RecordValue[],
  transfers: RecordValue[],
  marketRates: ReturnType<typeof latestMarketRates>,
) {
  let stockValue = 0; let estimatedMarketValue = 0; let estimatedProfit = 0; const pricedItems = new Set<string>();
  for (const balance of balances) {
    const cost = balance.landedCostPerUnit || balance.weightedAverageCost;
    stockValue += balance.currentStock * cost;
    const market = marketRates.get(balance.itemId);
    if (market) {
      estimatedMarketValue += balance.availableStock * market.rate;
      estimatedProfit += balance.availableStock * (market.rate - cost);
      pricedItems.add(balance.itemId);
    }
  }
  const transferStatus = (record: RecordValue) => text(record, "status", "status");
  return {
    stockValue,
    estimatedMarketValue: pricedItems.size ? estimatedMarketValue : null,
    estimatedProfit: pricedItems.size ? estimatedProfit : null,
    pricedItems: pricedItems.size,
    unpricedItems: new Set(balances.map((balance) => balance.itemId)).size - pricedItems.size,
    priceSource: [...marketRates.values()].some((rate) => rate.district.toLowerCase() === "sangli") ? "Sangli APMC" : pricedItems.size ? "APMC market feed" : null,
    itemBatches: balances.length,
    redItems: balances.filter((balance) => balance.alertColor === "RED").length,
    amberItems: balances.filter((balance) => balance.alertColor === "AMBER").length,
    openAlerts: alerts.length,
    inTransitTransfers: transfers.filter((transfer) => transferStatus(transfer) === "IN_TRANSIT").length,
  };
}
