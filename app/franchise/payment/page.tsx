import Link from "next/link";
import FranchisePaymentLink from "@/components/FranchisePaymentLink";

type Props = { searchParams: Promise<{ applicationId?: string }> };

export default async function FranchisePaymentPage({ searchParams }: Props) {
  const { applicationId } = await searchParams;
  return <main className="franchise-payment-page"><header className="topbar franchise-topbar"><Link className="brand" href="/"><span className="brand-mark">L</span><span>Lunch<span>Box</span></span></Link></header><section className="franchise-payment-card"><span className="payment-check">✓</span><span className="kicker">APPLICATION RECEIVED</span><h1>Your franchise application is under review.</h1><p>{applicationId ? <>Reference: <b>{applicationId}</b></> : "Your application was received."}</p><div className="payment-detail-grid"><article><small>Application review</small><b>Submitted</b><p>Our team checks your Chennai territory and business information.</p></article><article><small>Indicative investment</small><b>₹5,00,000</b><p>Configure the exact amount, taxes and refund policy before enabling a live link.</p></article><article><small>Secure payment</small><b>Razorpay link</b><p>Payment is completed only on Razorpay’s hosted checkout page.</p></article></div><p className="payment-note">A link is generated only when the production payment configuration has been enabled. Payment completion must be confirmed by the verified Razorpay webhook.</p><FranchisePaymentLink applicationId={applicationId || ""} /><Link className="franchise-return" href="/">Return to LunchBox</Link></section></main>;
}
