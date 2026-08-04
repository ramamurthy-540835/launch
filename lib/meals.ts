export type Meal = {
  id: string;
  serviceDate: string;
  day: string;
  shortDate: string;
  name: string;
  description: string;
  tags: string[];
  protein: number;
  calories: number;
  price: number;
  rating: number;
  color: string;
  emoji: string;
  nutritionStatus: "provisional" | "dietitian-approved";
};

export type School = {
  id: string;
  name: string;
  city: string;
  area: string;
  kitchenId: string;
};

export type GradePlan = {
  id: string;
  label: string;
  targetCalories: number;
  targetProteinG: number;
  nutritionStatus: "provisional" | "dietitian-approved";
};

export function mealNutrition(meal: Meal, gradePlan: GradePlan) {
  return {
    estimatedCalories: meal.calories,
    estimatedProteinG: meal.protein,
    targetCalories: gradePlan.targetCalories,
    targetProteinG: gradePlan.targetProteinG,
    status: meal.nutritionStatus,
  };
}
