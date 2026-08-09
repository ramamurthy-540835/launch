"use client";

import ParentAuth from "@/components/ParentAuth";
import StudentProfiles, { type StudentSelection } from "@/components/StudentProfiles";
import Link from "next/link";
import { FormEvent, useEffect, useMemo, useRef, useState } from "react";
import { cities as fallbackCities, gradePlans as fallbackGradePlans, meals as fallbackMeals, schools as fallbackSchools, type GradePlan, type Meal, type School } from "@/lib/meals";
import { firebaseAuth, isFirebaseClientConfigured } from "@/lib/firebase-client";
import { MARKET_PRICE, schoolMealPrice } from "@/lib/pricing";

type Cart = Record<string, number>;
type CheckoutState = { cart: Cart; city: string; schoolId: string; gradeBand: string };
type RazorpayResult = { razorpay_order_id: string; razorpay_payment_id: string; razorpay_signature: string };
type RazorpayConstructor = new (options: Record<string, unknown>) => { open: () => void };

declare global { interface Window { Razorpay?: RazorpayConstructor } }

async function loadRazorpayCheckout() {
  if (window.Razorpay) return;
  await new Promise<void>((resolve, reject) => {
    const script = document.createElement("script");
    script.src = "https://checkout.razorpay.com/v1/checkout.js";
    script.onload = () => resolve();
    script.onerror = () => reject(new Error("Unable to load secure payment checkout."));
    document.head.appendChild(script);
  });
}

export default function CheckoutPage() {
  const [cities, setCities] = useState<string[]>(fallbackCities);
  const [meals, setMeals] = useState<Meal[]>(fallbackMeals);
  const [schools, setSchools] = useState<School[]>(fallbackSchools);
  const [gradePlans, setGradePlans] = useState<Record<string, GradePlan>>(fallbackGradePlans);
  const [city, setCity] = useState(fallbackCities[0]);
  const [schoolId, setSchoolId] = useState(fallbackSchools[0]?.id || "request");
  const [gradeBand, setGradeBand] = useState(Object.keys(fallbackGradePlans)[0]);
  const [cart, setCart] = useState<Cart>({});
  const [verifiedPhone, setVerifiedPhone] = useState<string | null>(null);
  const [selectedStudent, setSelectedStudent] = useState<StudentSelection | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [message, setMessage] = useState("");
  const [confirmation, setConfirmation] = useState("");
  const idempotencyKey = useRef<string | null>(null);

  useEffect(() => {
    const stored = sessionStorage.getItem("lunchbox_checkout");
    if (!stored) return;
    try {
      const parsed = JSON.parse(stored) as CheckoutState;
      setCart(parsed.cart || {});
      setCity(parsed.city || fallbackCities[0]);
      setSchoolId(parsed.schoolId || fallbackSchools[0]?.id || "request");
      setGradeBand(parsed.gradeBand || Object.keys(fallbackGradePlans)[0]);
    } catch {
      setMessage("Your lunch bag could not be restored. Please choose meals again.");
    }
  }, []);

  useEffect(() => {
    fetch("/api/catalog").then(async (response) => {
      if (!response.ok) throw new Error("Catalogue unavailable");
      return response.json();
    }).then((catalog) => {
      setCities(catalog.cities);
      setMeals(catalog.meals);
      setSchools(catalog.schools);
      setGradePlans(catalog.gradePlans);
      setCity((current) => catalog.cities.includes(current) ? current : catalog.cities[0]);
      setGradeBand((current) => catalog.gradePlans[current] ? current : Object.keys(catalog.gradePlans)[0]);
      setSchoolId((current) => {
        if (catalog.schools.some((school: School) => school.id === current)) return current;
        return catalog.schools[0]?.id || "request";
      });
    }).catch((error) => setMessage(error instanceof Error ? error.message : "Catalogue unavailable"));
  }, []);

  const citySchools = schools.filter((school) => school.city === city);
  const selectedSchool = schools.find((school) => school.id === schoolId);
  const selectedMeals = meals.filter((meal) => cart[meal.id]);
  const itemCount = Object.values(cart).reduce((sum, count) => sum + count, 0);
  const unitPrice = selectedSchool ? schoolMealPrice(selectedSchool) : MARKET_PRICE;
  const subtotal = useMemo(
    () => selectedMeals.reduce((sum, meal) => sum + unitPrice * (cart[meal.id] || 0), 0),
    [cart, selectedMeals, unitPrice],
  );

  function changeCity(nextCity: string) {
    setCity(nextCity);
    setSchoolId(schools.find((school) => school.city === nextCity)?.id || "request");
    setSelectedStudent(null);
  }

  async function placeOrder(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSubmitting(true);
    setMessage("");
    const form = new FormData(event.currentTarget);
    const items = Object.entries(cart).map(([mealId, quantity]) => ({ mealId, quantity }));
    const freeMealId = String(form.get("freeMealId") || "");
    const freeMeals = ([["senior", Number(form.get("freeSenior") || 0)], ["parent", Number(form.get("freeParent") || 0)]] as const)
      .filter(([, quantity]) => quantity > 0)
      .map(([type, quantity]) => ({ mealId: freeMealId, type, quantity }));

    try {
      if (!selectedSchool) throw new Error("Choose an onboarded school before placing the order.");
      if (items.length === 0) throw new Error("Your lunch bag is empty.");
      if (!isFirebaseClientConfigured) throw new Error("Parent phone verification is not configured. Please contact LunchBox support.");
      if (!verifiedPhone || !selectedStudent) throw new Error("Verify the parent mobile number and select a saved student profile.");
      idempotencyKey.current ||= crypto.randomUUID();
      const token = await firebaseAuth()?.currentUser?.getIdToken();
      if (!token) throw new Error("Your parent session has expired. Verify the mobile number again.");
      const response = await fetch("/api/orders", {
        method: "POST",
        headers: { "Content-Type": "application/json", "Idempotency-Key": idempotencyKey.current, ...(token ? { Authorization: `Bearer ${token}` } : {}) },
        body: JSON.stringify({
          studentId: selectedStudent?.id,
          schoolName: selectedSchool.name,
          parentPhone: verifiedPhone,
          city,
          gradeBand,
          items,
          freeMeals,
        }),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || "Order failed");
      if (data.payment) {
        await loadRazorpayCheckout();
        await new Promise<void>((resolve, reject) => {
          const checkout = new window.Razorpay!({
            key: data.payment.keyId,
            amount: data.payment.amount,
            currency: data.payment.currency,
            name: "LunchBox",
            description: "School lunch order",
            order_id: data.payment.id,
            prefill: { contact: `+91${verifiedPhone}` },
            handler: async (result: RazorpayResult) => {
              try {
                const verification = await fetch("/api/payments/verify", {
                  method: "POST",
                  headers: { "Content-Type": "application/json", ...(token ? { Authorization: `Bearer ${token}` } : {}) },
                  body: JSON.stringify(result),
                });
                const verified = await verification.json();
                if (!verification.ok) throw new Error(verified.error || "Payment verification failed.");
                resolve();
              } catch (error) { reject(error); }
            },
            modal: { ondismiss: () => reject(new Error("Payment was not completed.")) },
          });
          checkout.open();
        });
      }
      sessionStorage.removeItem("lunchbox_checkout");
      setConfirmation(data.orderId);
      setCart({});
      idempotencyKey.current = null;
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Could not place your order.");
    } finally {
      setSubmitting(false);
    }
  }

  if (confirmation) {
    return <main className="checkout-page">
      <header className="checkout-topbar"><Link className="brand" href="/"><span className="brand-mark">L</span><span>Lunch<span>Box</span></span></Link></header>
      <section className="checkout-success">
        <span>✓</span>
        <h1>Lunches booked</h1>
        <p>Order {confirmation.slice(0, 13)} is confirmed. The school coordinator will receive the delivery details.</p>
        <Link className="primary-button" href="/">Back to menu <span>→</span></Link>
      </section>
    </main>;
  }

  return <main className="checkout-page">
    <header className="checkout-topbar">
      <Link className="brand" href="/"><span className="brand-mark">L</span><span>Lunch<span>Box</span></span></Link>
      <Link className="checkout-back" href="/#menu">Back to menu</Link>
    </header>

    <section className="checkout-shell">
      <div className="checkout-heading">
        <span className="kicker">FINAL STEP</span>
        <h1>Register student</h1>
        <p>Confirm the school lunch details and register the student profile used for this order.</p>
      </div>

      <form className="checkout-form" onSubmit={placeOrder}>
        <section className="checkout-panel">
          <div className="panel-heading"><span>1</span><div><h2>School details</h2><p>These details route the lunch to the correct campus.</p></div></div>
          <div className="form-grid">
            <label>City<select value={city} onChange={(event) => changeCity(event.target.value)}>{cities.map((item) => <option key={item}>{item}</option>)}</select></label>
            <label>School<select value={schoolId} onChange={(event) => { setSchoolId(event.target.value); setSelectedStudent(null); }}>{citySchools.map((school) => <option value={school.id} key={school.id}>{school.name} · {school.area}</option>)}<option value="request">My school is not listed</option></select></label>
          </div>
          <label>Student grade<select value={gradeBand} onChange={(event) => { setGradeBand(event.target.value); setSelectedStudent(null); }}>{Object.entries(gradePlans).map(([id, item]) => <option value={id} key={id}>{item.label} standard</option>)}</select></label>
        </section>

        <section className="checkout-panel">
          <div className="panel-heading"><span>2</span><div><h2>Parent and student</h2><p>Home address is kept for parent records. Lunch delivery remains school-based.</p></div></div>
          {isFirebaseClientConfigured ? <>
            <ParentAuth onChange={setVerifiedPhone} />
            {verifiedPhone && selectedSchool && <StudentProfiles schoolId={selectedSchool.id} gradeBand={gradeBand} onChange={setSelectedStudent} />}
          </> : <p className="checkout-message" role="alert">Parent phone verification is not configured. Student registration and ordering are unavailable until Firebase is configured.</p>}
        </section>

        <section className="checkout-panel">
          <div className="panel-heading"><span>3</span><div><h2>Optional free meals</h2><p>Add sponsored meals for a senior or parent if approved by the school.</p></div></div>
          <label>Meal delivery day<select name="freeMealId">{selectedMeals.map((meal) => <option key={meal.id} value={meal.id}>{meal.day} · {meal.shortDate}</option>)}</select></label>
          <div className="form-grid">
            <label>Senior free meals<input name="freeSenior" type="number" min="0" max="2" defaultValue="0" /></label>
            <label>Parent free meals<input name="freeParent" type="number" min="0" max="2" defaultValue="0" /></label>
          </div>
        </section>

        {message && <p className="checkout-message" role="alert">{message}</p>}
        <button className="checkout-button checkout-submit" disabled={submitting || itemCount === 0 || !selectedSchool || !isFirebaseClientConfigured || !verifiedPhone || !selectedStudent}>{submitting ? "Placing order..." : `Place order · ₹${subtotal}`}</button>
      </form>

      <aside className="checkout-summary" aria-label="Order summary">
        <span className="kicker">ORDER SUMMARY</span>
        <h2>Lunch bag</h2>
        {selectedMeals.length === 0 ? <div className="summary-empty"><p>Your bag is empty.</p><Link href="/#menu">Choose meals</Link></div> : <>
          <div className="summary-list">{selectedMeals.map((meal) => <div className="summary-row" key={meal.id}><div><b>{meal.name}</b><small>{meal.day} · {meal.shortDate}</small></div><span>{cart[meal.id]} × ₹{unitPrice}</span></div>)}</div>
          <div className="summary-school"><b>{selectedSchool?.name || "Choose school"}</b><small>{gradePlans[gradeBand]?.label} standard · {city}</small></div>
          <div className="summary-total"><span>Total</span><b>₹{subtotal}</b></div>
        </>}
      </aside>
    </section>
  </main>;
}
