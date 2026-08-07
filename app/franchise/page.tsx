"use client";

import Link from "next/link";
import Image from "next/image";
import { FormEvent, useState } from "react";
import "./photo.css";

const cities = [
  { name: "Chennai", areas: "OMR · Anna Nagar · Tambaram", status: "Priority market" },
  { name: "Coimbatore", areas: "RS Puram · Peelamedu · Saravanampatti", status: "Applications open" },
  { name: "Madurai", areas: "KK Nagar · Anna Nagar · Thirunagar", status: "Applications open" },
  { name: "Trichy", areas: "Thillai Nagar · Srirangam · Cantonment", status: "Applications open" },
];

const benefits = [
  ["◎", "A school-first brand", "Build around a focused student lunch model with clear nutrition and food-safety standards."],
  ["♨", "Kitchen playbook", "Get operating checklists, menu planning guidance, portion standards and dispatch workflows."],
  ["▣", "Ordering technology", "Use the LunchBox ordering experience for school, student, menu and delivery coordination."],
  ["↗", "Launch support", "Receive onboarding, team training and a structured local launch plan for your territory."],
  ["◇", "Vendor guidance", "Start with procurement specifications and local vendor selection guidelines."],
  ["♥", "Purpose-led business", "Serve balanced weekday meals while building long-term school and parent relationships."],
];

export default function FranchisePage() {
  const [submitting, setSubmitting] = useState(false);
  const [result, setResult] = useState<{ id: string; name: string } | null>(null);
  const [error, setError] = useState("");

  async function submitApplication(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSubmitting(true);
    setError("");
    const form = event.currentTarget;
    const data = Object.fromEntries(new FormData(form).entries());
    try {
      const response = await fetch("/api/franchise-applications", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(data) });
      const payload = await response.json();
      if (!response.ok) throw new Error(payload.error || "We could not submit your application.");
      setResult({ id: payload.applicationId, name: String(data.fullName).split(" ")[0] });
      form.reset();
    } catch (submissionError) {
      setError(submissionError instanceof Error ? submissionError.message : "We could not submit your application.");
    } finally { setSubmitting(false); }
  }

  return <main className="franchise-page">
    <header className="topbar franchise-nav">
      <Link className="brand" href="/" aria-label="LunchBox home"><span className="brand-mark">L</span><span>Lunch<span>Box</span></span></Link>
      <nav aria-label="Franchise navigation"><a href="#opportunity">Opportunity</a><a href="#benefits">Benefits</a><a href="#cities">Cities</a></nav>
      <a className="franchise-nav-cta" href="#apply">Apply now <span>→</span></a>
    </header>

    <section className="franchise-hero" id="opportunity">
      <div className="franchise-hero-copy">
        <div className="franchise-pill"><span>●</span> Franchise applications now open</div>
        <h1>Build a better lunch<br />business in <em>your city.</em></h1>
        <p>Bring fresh, balanced school meals to families in Chennai, Coimbatore, Madurai or Trichy—with a focused ₹5 lakh franchise package.</p>
        <div className="franchise-hero-actions"><a className="primary-button" href="#apply">Start your application <span>→</span></a><a className="text-button" href="#benefits">Explore the benefits ↓</a></div>
        <div className="hero-trust-row"><span><b>4</b> launch cities</span><span><b>₹5L</b> planned investment</span><span><b>End-to-end</b> onboarding</span></div>
      </div>
      <div className="franchise-hero-visual" aria-label="LunchBox franchise growth illustration">
        <div className="territory-card"><span className="territory-label">YOUR TERRITORY</span><div className="map-pin pin-one">●</div><div className="map-pin pin-two">●</div><div className="map-pin pin-three">●</div><div className="territory-route route-one" /><div className="territory-route route-two" /><div className="territory-hub"><span className="brand-mark">L</span><b>Local<br />LunchBox hub</b></div><div className="territory-school">⌂ <span>Partner school</span></div><div className="territory-school second">⌂ <span>Partner school</span></div></div>
        <div className="floating-stat"><span>↗</span><div><b>Ready to grow</b><small>Built for weekday demand</small></div></div><div className="visual-shape shape-one">✦</div><div className="visual-shape shape-two">✦</div>
      </div>
    </section>

    <section className="investment-strip">
      <div><span className="kicker">THE OPPORTUNITY</span><h2>One focused package.<br />A clear way to begin.</h2></div>
      <div className="investment-price"><small>PLANNED INVESTMENT</small><strong>₹5,00,000</strong><span>Final commercials shared after evaluation</span></div>
      <div className="investment-includes"><b>Package designed to include</b><span>✓ Brand &amp; operations onboarding</span><span>✓ Kitchen and dispatch playbook</span><span>✓ Technology setup &amp; training</span><span>✓ Local launch planning support</span></div>
    </section>

    <section className="benefits-section" id="benefits">
      <div className="section-heading franchise-heading"><div><span className="kicker">WHY LUNCHBOX</span><h2>You run the city.<br />We bring the system.</h2></div><p>A practical foundation to help you launch consistently, operate responsibly and grow relationships with local schools.</p></div>
      <div className="benefit-grid">{benefits.map(([icon, title, copy], index) => <article key={title}><span className={`benefit-icon benefit-${index + 1}`}>{icon}</span><h3>{title}</h3><p>{copy}</p></article>)}</div>
    </section>

    <section className="city-section" id="cities">
      <div className="city-intro"><span className="kicker">LAUNCH MARKETS</span><h2>Choose where you want to make an impact.</h2><p>We are reviewing partners with strong local knowledge and a commitment to dependable food operations.</p></div>
      <div className="city-grid">{cities.map((city, index) => <a href="#apply" className="city-card" key={city.name}><span className="city-number">0{index + 1}</span><span className="city-status">● {city.status}</span><h3>{city.name}</h3><p>{city.areas}</p><b>Choose this city <span>→</span></b></a>)}</div>
    </section>

    <section className="partner-profile">
      <div><span className="kicker">WHO WE’RE LOOKING FOR</span><h2>Local drive meets<br />operational discipline.</h2></div>
      <div className="profile-list"><p><span>01</span><b>Hands-on operator</b><small>You can lead daily execution, quality and people.</small></p><p><span>02</span><b>Strong local network</b><small>You understand schools, neighbourhoods and local vendors.</small></p><p><span>03</span><b>Service mindset</b><small>You care about punctuality, consistency and parent trust.</small></p><p><span>04</span><b>Investment readiness</b><small>You can demonstrate access to the planned ₹5 lakh investment.</small></p></div>
    </section>

    <section className="application-section" id="apply">
      <div className="application-copy"><span className="kicker">TAKE THE FIRST STEP</span><h2>Let’s bring LunchBox<br />to your city.</h2><p>Tell us a little about yourself. Our franchise team will review your application and contact shortlisted applicants.</p><div className="application-photo"><Image src="/images/franchise-kitchen-team.png" alt="A LunchBox franchise owner with her kitchen team preparing fresh school meals" width={1536} height={1152} sizes="(max-width: 1000px) 100vw, 38vw" /></div><div className="application-steps"><span><b>1</b>Submit your interest</span><span><b>2</b>Initial discussion</span><span><b>3</b>Territory &amp; business review</span></div><small>Submitting this form does not guarantee franchise approval or territory allocation.</small></div>
      <div className="application-card">
        {result ? <div className="application-success" role="status"><span>✓</span><p className="kicker">APPLICATION RECEIVED</p><h3>Thank you, {result.name}!</h3><p>We’ve received your franchise application. Please save your reference number.</p><strong>{result.id}</strong><button type="button" onClick={() => setResult(null)}>Submit another application</button></div> : <form onSubmit={submitApplication}>
          <div className="form-heading"><span>Franchise interest form</span><small>All fields marked * are required</small></div>
          <div className="form-two-col"><label>Full name *<input name="fullName" required minLength={2} maxLength={80} autoComplete="name" placeholder="Your full name" /></label><label>Mobile number *<div className="phone-input"><span>+91</span><input name="phone" required inputMode="tel" pattern="[6-9][0-9]{9}" maxLength={10} autoComplete="tel" placeholder="10-digit number" /></div></label></div>
          <label>Email address *<input name="email" required type="email" maxLength={120} autoComplete="email" placeholder="you@example.com" /></label>
          <div className="form-two-col"><label>Preferred city *<select name="city" required defaultValue=""><option value="" disabled>Select a city</option>{cities.map((city) => <option key={city.name}>{city.name}</option>)}</select></label><label>Preferred area *<input name="area" required minLength={2} maxLength={100} placeholder="e.g. Anna Nagar" /></label></div>
          <label>Current occupation / business *<input name="occupation" required minLength={2} maxLength={120} placeholder="Tell us what you currently do" /></label>
          <div className="form-two-col"><label>Investment readiness *<select name="investmentReadiness" required defaultValue=""><option value="" disabled>Select readiness</option><option>Funds available now</option><option>Available within 30 days</option><option>Available within 3 months</option><option>Exploring finance options</option></select></label><label>Preferred start timeline *<select name="startTimeline" required defaultValue=""><option value="" disabled>Select timeline</option><option>Within 1 month</option><option>1–3 months</option><option>3–6 months</option><option>Just exploring</option></select></label></div>
          <label>Why are you interested in LunchBox? *<textarea name="motivation" required minLength={20} maxLength={800} placeholder="Share your local experience and why this opportunity fits you." /></label>
          <label className="consent-label"><input name="consent" type="checkbox" value="accepted" required /><span>I agree to be contacted about this franchise opportunity and confirm that the information provided is accurate.</span></label>
          {error && <p className="form-error" role="alert">{error}</p>}<button className="application-submit" disabled={submitting}>{submitting ? "Submitting application…" : <>Submit application <span>→</span></>}</button><p className="form-note">No payment is collected through this form.</p>
        </form>}
      </div>
    </section>
    <footer className="franchise-footer"><Link className="brand" href="/"><span className="brand-mark">L</span><span>Lunch<span>Box</span></span></Link><p>Better lunches. Stronger local businesses.</p><small>Investment details are indicative and subject to due diligence, definitive agreements, taxes and territory availability. No earnings or returns are guaranteed.</small></footer>
  </main>;
}
