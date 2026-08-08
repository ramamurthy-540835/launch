import type { Metadata } from "next";
import OfficeCompanyRegistration from "@/components/OfficeCompanyRegistration";

export const metadata: Metadata = { title: "Office & Company Registration | LunchBox", robots: { index: false, follow: false } };
export default function OfficeCompanyRegistrationPage() { return <OfficeCompanyRegistration />; }
