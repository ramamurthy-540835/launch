import type { Metadata } from "next";
import PrivateSchoolSearch from "@/components/PrivateSchoolSearch";

export const metadata: Metadata = { title: "Private School Registration | LunchBox", description: "Find private schools in Tamil Nadu for LunchBox registration.", robots: { index: false, follow: false } };
export default function SchoolRegistrationPage() {
  return <PrivateSchoolSearch />;
}
