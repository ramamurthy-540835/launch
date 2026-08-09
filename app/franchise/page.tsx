import Link from "next/link";
import FranchiseRegistration from "@/components/FranchiseRegistration";

export default function FranchisePage() {
  return <main className="franchise-page">
    <header className="topbar franchise-topbar"><Link className="brand" href="/"><span className="brand-mark">L</span><span>Lunch<span>Box</span></span></Link><Link className="franchise-back" href="/#franchises">View Chennai opportunities</Link></header>
    <section className="franchise-page-hero"><div><span className="kicker">LUNCHBOX PARTNER NETWORK</span><h1>Build a better lunch business in Chennai.</h1><p>Apply for a LunchBox territory. We review every application before confirming territory availability and commercial terms.</p><div className="franchise-page-points"><span>✓ Chennai territory review</span><span>✓ Kitchen &amp; dispatch playbook</span><span>✓ School-focused operating model</span></div></div><aside><span>PLANNED INVESTMENT</span><b>₹5,00,000</b><p>Indicative package. Final terms are shared only after application review.</p></aside></section>
    <section className="franchise-page-form"><div><span className="kicker">STEP 1 OF 2</span><h2>Tell us about your business.</h2><p>After submitting, you’ll see the payment and investment process. No payment is collected at this stage.</p></div><FranchiseRegistration redirectToPayment /></section>
  </main>;
}
