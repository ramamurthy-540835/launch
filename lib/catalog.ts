import { firestoreClient, isFirestoreConfigured } from "@/lib/firestore";
import { cities, meals, schools, type Meal, type School } from "@/lib/meals";

export type Catalog = { cities: string[]; schools: School[]; meals: Meal[] };

const cityNames: Record<string, string> = {
  chennai: "Chennai",
  madurai: "Madurai",
  trichy: "Trichy",
  coimbatore: "Coimbatore",
};

export async function getCatalog(): Promise<Catalog> {
  if (!isFirestoreConfigured()) return { cities, schools, meals };
  const firestore = firestoreClient();
  const [schoolSnapshot, mealSnapshot] = await Promise.all([
    firestore.collection("schools").where("active", "==", true).get(),
    firestore.collection("meal_packages").where("is_available", "==", true).get(),
  ]);

  const managedSchools = schoolSnapshot.docs.map((document) => {
    const data = document.data();
    return {
      id: document.id,
      name: String(data.school_name),
      city: cityNames[String(data.city_id)] || String(data.city),
      area: String(data.area),
      kitchenId: String(data.kitchen_id),
    };
  });
  const managedMeals = mealSnapshot.docs.map((document) => {
    const data = document.data();
    return {
      id: document.id,
      serviceDate: String(data.service_date),
      day: String(data.day),
      shortDate: String(data.short_date),
      name: String(data.meal_name),
      description: String(data.description),
      tags: Array.isArray(data.tags) ? data.tags.map(String) : ["Vegetarian"],
      protein: Number(data.protein_g || 0),
      calories: Number(data.calories || 0),
      price: Number(data.price_inr),
      rating: Number(data.rating || 0),
      color: String(data.color || "green"),
      emoji: String(data.emoji || "🍱"),
    } satisfies Meal;
  });

  const activeSchools = managedSchools.length ? managedSchools : schools;
  const activeMeals = managedMeals.length ? managedMeals : meals;
  return { cities: [...new Set(activeSchools.map((school) => school.city))], schools: activeSchools, meals: activeMeals };
}
