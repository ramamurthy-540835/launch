import { describe, expect, it } from "vitest";
import { dashboardMetrics, itemNameMap, latestMarketRates, normalizeBalance } from "@/lib/inventory/dashboard";

describe("inventory dashboard normalization", () => {
  it("normalizes live camelCase Firestore records and calculates stock value", () => {
    const names = itemNameMap([{ itemId: "rice", itemName: "Rice" }]);
    const balance = normalizeBalance({
      id: "cbe-central_rice_opening",
      itemId: "rice",
      locationId: "cbe-central",
      batchNumber: "OPENING",
      currentStock: 400,
      availableStock: 390,
      stockAvailabilityPercent: 78,
      alertColor: "AMBER",
      landedCostPerUnit: 54,
    }, names);
    const metrics = dashboardMetrics([balance], [], [{ status: "IN_TRANSIT" }], new Map());

    expect(balance).toMatchObject({ itemName: "Rice", locationName: "Coimbatore Central", availableStock: 390, alertColor: "AMBER" });
    expect(metrics).toMatchObject({ stockValue: 21600, amberItems: 1, redItems: 0, inTransitTransfers: 1, estimatedProfit: null });
  });

  it("calculates estimated margin only from actual market feed rates", () => {
    const balance = normalizeBalance({ item_id: "rice", location_id: "chn-branch", current_stock: 100, available_stock: 80, landed_cost_per_unit: 50, alert_color: "GREEN" }, new Map());
    const rates = latestMarketRates([
      { itemId: "rice", parsedRate: 62, sourceDistrict: "Sangli", sourceMarket: "Sangli APMC", sourceArrivalDate: "2026-08-12" },
    ]);
    const metrics = dashboardMetrics([balance], [], [], rates);

    expect(metrics).toMatchObject({ stockValue: 5000, estimatedMarketValue: 4960, estimatedProfit: 960, pricedItems: 1, unpricedItems: 0, priceSource: "Sangli APMC" });
  });
});
