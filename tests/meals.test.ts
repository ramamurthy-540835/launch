import { describe, expect, it } from "vitest";
import { meals } from "@/lib/meals";

describe("launch meal catalogue", () => {
  it("has unique IDs and service dates", () => {
    expect(new Set(meals.map((meal) => meal.id)).size).toBe(meals.length);
    expect(new Set(meals.map((meal) => meal.serviceDate)).size).toBe(meals.length);
  });

  it("keeps the pilot price at ₹39", () => {
    expect(meals.every((meal) => meal.price === 39)).toBe(true);
  });

  it("uses ISO service dates", () => {
    expect(meals.every((meal) => /^\d{4}-\d{2}-\d{2}$/.test(meal.serviceDate))).toBe(true);
  });
});
