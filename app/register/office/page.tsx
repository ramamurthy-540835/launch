import type { Metadata } from "next";
import EntityRegistrationForm from "@/components/EntityRegistrationForm";
export const metadata: Metadata = { title: "Office Registration | LunchBox", robots: { index: false, follow: false } };
export default function OfficeRegistrationPage() { return <EntityRegistrationForm entityType="office" />; }
