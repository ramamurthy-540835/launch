import Link from "next/link";

type Props = { searchParams: Promise<{ applicationId?: string }> };

export default async function FranchisePaymentPage({ searchParams }: Props) {
  const { applicationId } = await searchParams;
  return <main className="franchise-payment-page"><header className="topbar franchise-topbar"><Link className="brand" href="/"><span className="brand-mark">L</span><span>Lunch<span>Box</span></span></Link></header><section className="franchise-payment-card"><span className="payment-check">✓</span><span className="kicker">APPLICATION RECEIVED</span><h1>Your franchise application is under review.</h1><p>{applicationId ? <>Reference: <b>{applicationId}</b></> : "Your application was received."}</p><div className="payment-detail-grid"><article><small>Application review</small><b>Submitted</b><p>Our team checks your Chennai territory and business information.</p></article><article><small>Indicative investment</small><b>₹5,00,000</b><p>Commercial terms and payment milestones are shared with shortlisted applicants.</p></article><article><small>Online payment</small><b>Not due yet</b><p>LunchBox will never request an unverified payment through this public page.</p></article></div><p className="payment-note">If shortlisted, you will receive a verified commercial proposal and a secure payment link with the applicable terms, taxes, refund policy and agreement.</p><Link className="primary-button" href="/">Return to LunchBox <span>→</span></Link></section></main>;
}
