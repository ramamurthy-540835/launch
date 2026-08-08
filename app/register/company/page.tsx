import type { Metadata } from "next";
import EntityRegistrationForm from "@/components/EntityRegistrationForm";
export const metadata: Metadata = { title: "Company Registration | LunchBox", robots: { index: false, follow: false } };
export default function CompanyRegistrationPage() { return <EntityRegistrationForm entityType="company" />; }
