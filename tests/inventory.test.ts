import { describe, expect, it } from "vitest";
import { alertColor, availabilityPercent, calculateDemand, forecastReplenishment, freightCost } from "@/lib/inventory/domain";

describe("inventory domain calculations", () => {
  it("calculates configurable demand without geography assumptions", () => expect(calculateDemand(1000, 1, 0.08, 5, 10)).toBeCloseTo(440));
  it("evaluates configurable stock colors", () => {
    expect(alertColor(availabilityPercent(60, 100))).toBe("GREEN");
    expect(alertColor(40)).toBe("AMBER");
    expect(alertColor(24.99)).toBe("RED");
  });
  it("calculates formula and manual-reference freight", () => {
    expect(freightCost({ rateType: "PER_TON_KM", chargeableUnits: 2, routeDistanceKm: 100, baseRate: 3, minimumCharge: 100, loadingCharge: 20 })).toBe(620);
    expect(freightCost({ rateType: "MANUAL_REFERENCE", chargeableUnits: 0, routeDistanceKm: 0, baseRate: 0, minimumCharge: 0, enteredCarrierFreightAmount: 500, taxPercent: 10 })).toBe(550);
  });
  it("generates a replenishment recommendation", () => {
    const result = forecastReplenishment({ availableStock: 100, inTransitStock: 20, averageDailyConsumption: 10, maximumDailyConsumption: 15, averageLeadTimeDays: 5, maximumLeadTimeDays: 7, targetStock: 300, asOf: new Date("2026-08-11T00:00:00Z") });
    expect(result).toMatchObject({ safetyStock: 55, reorderPoint: 105, stockCoverageDays: 10, recommendedQuantity: 230, forecastedDepletionDate: "2026-08-21" });
  });
});
