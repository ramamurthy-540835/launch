export type Meal = {
  id: string;
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
};

export const cities = ["Chennai", "Madurai", "Trichy", "Coimbatore"];

export const meals: Meal[] = [
  {
    id: "monday-balanced-meals",
    day: "Monday",
    shortDate: "10 Aug",
    name: "Monday Balanced Meals",
    description: "1 chapati, 1 bowl rice, sambar, curd, beans curry, carrot curry, channa and 1 appalam.",
    tags: ["Vegetarian", "8 items"],
    protein: 20,
    calories: 640,
    price: 129,
    rating: 4.9,
    color: "yellow",
    emoji: "🍱",
  },
  {
    id: "tuesday-balanced-meals",
    day: "Tuesday",
    shortDate: "11 Aug",
    name: "Tuesday Balanced Meals",
    description: "1 chapati, 1 bowl rice, sambar, curd, cabbage curry, beetroot curry, channa and 1 appalam.",
    tags: ["Vegetarian", "8 items"],
    protein: 20,
    calories: 640,
    price: 129,
    rating: 4.8,
    color: "green",
    emoji: "🍱",
  },
  {
    id: "wednesday-balanced-meals",
    day: "Wednesday",
    shortDate: "12 Aug",
    name: "Wednesday Balanced Meals",
    description: "1 chapati, 1 bowl rice, sambar, curd, cauliflower curry, greens curry, channa and 1 appalam.",
    tags: ["Vegetarian", "8 items"],
    protein: 21,
    calories: 645,
    price: 129,
    rating: 4.9,
    color: "orange",
    emoji: "🍱",
  },
  {
    id: "thursday-balanced-meals",
    day: "Thursday",
    shortDate: "13 Aug",
    name: "Thursday Balanced Meals",
    description: "1 chapati, 1 bowl rice, sambar, curd, potato-peas curry, pumpkin curry, channa and 1 appalam.",
    tags: ["Vegetarian", "8 items"],
    protein: 20,
    calories: 650,
    price: 129,
    rating: 4.7,
    color: "red",
    emoji: "🍱",
  },
  {
    id: "friday-balanced-meals",
    day: "Friday",
    shortDate: "14 Aug",
    name: "Friday Balanced Meals",
    description: "1 chapati, 1 bowl rice, sambar, curd, okra curry, mixed-veg curry, channa and 1 appalam.",
    tags: ["Vegetarian", "8 items"],
    protein: 21,
    calories: 645,
    price: 129,
    rating: 4.8,
    color: "purple",
    emoji: "🍱",
  },
];

export const gradeAdjustments: Record<string, { label: string; multiplier: number }> = {
  "6-8": { label: "6th–8th", multiplier: 1 },
  "9-10": { label: "9th–10th", multiplier: 1.08 },
  "11-12": { label: "11th–12th", multiplier: 1.14 },
};

export type School = { id: string; name: string; city: string; area: string; kitchenId: string };

export const schools: School[] = [
  { id: "chn-adyar-01", name: "Adyar Pilot School", city: "Chennai", area: "Adyar", kitchenId: "chn-kitchen-01" },
  { id: "chn-annanagar-01", name: "Anna Nagar Pilot School", city: "Chennai", area: "Anna Nagar", kitchenId: "chn-kitchen-01" },
  { id: "md-annanagar-01", name: "Madurai Pilot School", city: "Madurai", area: "Anna Nagar", kitchenId: "md-kitchen-01" },
  { id: "md-kk-nagar-01", name: "KK Nagar Pilot School", city: "Madurai", area: "KK Nagar", kitchenId: "md-kitchen-01" },
  { id: "try-cantonment-01", name: "Trichy Pilot School", city: "Trichy", area: "Cantonment", kitchenId: "try-kitchen-01" },
  { id: "try-srirangam-01", name: "Srirangam Pilot School", city: "Trichy", area: "Srirangam", kitchenId: "try-kitchen-01" },
  { id: "cbe-rspuram-01", name: "RS Puram Pilot School", city: "Coimbatore", area: "RS Puram", kitchenId: "cbe-kitchen-01" },
  { id: "cbe-peelamedu-01", name: "Peelamedu Pilot School", city: "Coimbatore", area: "Peelamedu", kitchenId: "cbe-kitchen-01" },
];
