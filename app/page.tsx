"use client";
import InstallAppButton from "@/components/InstallAppButton";
import ParentAuth from "@/components/ParentAuth";
import StudentProfiles, { type StudentSelection } from "@/components/StudentProfiles";

import { FormEvent, useEffect, useMemo, useRef, useState } from "react";
import { mealNutrition, type GradePlan, type Meal, type School } from "@/lib/meals";
import { firebaseAuth, isFirebaseClientConfigured } from "@/lib/firebase-client";
import { MARKET_PRICE, schoolMealPrice } from "@/lib/pricing";

type Cart = Record<string, number>;
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

export default function Home() {
  const [cities, setCities] = useState<string[]>([]);
  const [meals, setMeals] = useState<Meal[]>([]);
  const [schools, setSchools] = useState<School[]>([]);
  const [gradePlans, setGradePlans] = useState<Record<string, GradePlan>>({});
  const [catalogError, setCatalogError] = useState("");
  const [city, setCity] = useState("");
  const [schoolId, setSchoolId] = useState("request");
  const [gradeBand, setGradeBand] = useState("");
  const [cart, setCart] = useState<Cart>({});
  const [cartOpen, setCartOpen] = useState(false);
  const [checkoutOpen, setCheckoutOpen] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [confirmation, setConfirmation] = useState("");
  const [verifiedPhone, setVerifiedPhone] = useState<string | null>(null);
  const [selectedStudent, setSelectedStudent] = useState<StudentSelection | null>(null);
  const idempotencyKey = useRef<string | null>(null);

  useEffect(() => {
    fetch("/api/catalog").then(async (response) => {
      if (!response.ok) throw new Error("Catalogue unavailable");
      return response.json();
    }).then((catalog) => {
      setCities(catalog.cities);
      setMeals(catalog.meals);
      setSchools(catalog.schools);
      setGradePlans(catalog.gradePlans);
      setCatalogError("");
      setCity((current) => catalog.cities.includes(current) ? current : catalog.cities[0]);
      setGradeBand((current) => catalog.gradePlans[current] ? current : Object.keys(catalog.gradePlans)[0]);
      setSchoolId((current) => {
        if (catalog.schools.some((school: School) => school.id === current)) return current;
        return catalog.schools[0]?.id || "request";
      });
    }).catch((error) => setCatalogError(error instanceof Error ? error.message : "Catalogue unavailable"));
  }, []);

  useEffect(() => {
    if (!checkoutOpen) return;
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === "Escape" && !submitting) setCheckoutOpen(false);
    };
    window.addEventListener("keydown", closeOnEscape);
    return () => window.removeEventListener("keydown", closeOnEscape);
  }, [checkoutOpen, submitting]);

  const visibleMeals = meals;

  const citySchools = schools.filter((school) => school.city === city);
  const selectedSchool = schools.find((school) => school.id === schoolId);

  function changeCity(nextCity: string) {
    setCity(nextCity);
    setSchoolId(schools.find((school) => school.city === nextCity)?.id || "request");
  }

  const itemCount = Object.values(cart).reduce((sum, count) => sum + count, 0);
  const unitPrice = selectedSchool ? schoolMealPrice(selectedSchool) : MARKET_PRICE;
  const subtotal = useMemo(
    () => meals.reduce((sum, meal) => sum + unitPrice * (cart[meal.id] || 0), 0),
    [cart, meals, unitPrice],
  );

  function addMeal(id: string) {
    setCart((current) => ({ ...current, [id]: (current[id] || 0) + 1 }));
  }

  function changeQuantity(id: string, amount: number) {
    setCart((current) => {
      const next = Math.max(0, (current[id] || 0) + amount);
      const updated = { ...current, [id]: next };
      if (!next) delete updated[id];
      return updated;
    });
  }

  async function placeOrder(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSubmitting(true);
    const form = new FormData(event.currentTarget);
    const items = Object.entries(cart).map(([mealId, quantity]) => ({ mealId, quantity }));
    const freeMealId = String(form.get("freeMealId") || "");
    const freeMeals = ([["senior", Number(form.get("freeSenior") || 0)], ["parent", Number(form.get("freeParent") || 0)]] as const)
      .filter(([, quantity]) => quantity > 0)
      .map(([type, quantity]) => ({ mealId: freeMealId, type, quantity }));

    try {
      idempotencyKey.current ||= crypto.randomUUID();
      const token = await firebaseAuth()?.currentUser?.getIdToken();
      const response = await fetch("/api/orders", {
        method: "POST",
        headers: { "Content-Type": "application/json", "Idempotency-Key": idempotencyKey.current, ...(token ? { Authorization: `Bearer ${token}` } : {}) },
        body: JSON.stringify({
          studentName: form.get("studentName"),
          studentId: selectedStudent?.id,
          schoolName: selectedSchool?.name,
          parentPhone: verifiedPhone || form.get("parentPhone"),
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
                  headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
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
      setConfirmation(data.orderId);
      idempotencyKey.current = null;
      setCart({});
      setCheckoutOpen(false);
      setCartOpen(false);
    } catch (error) {
      alert(error instanceof Error ? error.message : "Could not place your order");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <main>
      <header className="topbar">
        <a className="brand" href="#top" aria-label="LunchBox home">
          <span className="brand-mark">L</span>
          <span>Lunch<span>Box</span></span>
        </a>
        <nav aria-label="Primary navigation">
          <a href="#menu">Menu</a>
          <a href="/schools/register">Find school</a>
          <a href="#standards">Our promise</a>
          <a href="#how">How it works</a>
        </nav>
        <InstallAppButton />
        <button className="cart-button" onClick={() => setCartOpen(true)}>
          <span>Bag</span>
          <b>{itemCount}</b>
        </button>
      </header>

      <section className="hero" id="top">
        <div className="hero-copy">
          <div className="eyebrow"><span>●</span> Now serving 4 Tamil Nadu cities</div>
          <h1>Big nutrition for<br /><em>bright young minds.</em></h1>
          <p>Freshly cooked, balanced school lunches designed for growing students from 6th to 12th standard.</p>
          <div className="hero-actions">
            <a className="primary-button" href="#menu">Explore this week’s menu <span>→</span></a>
            <div className="parent-proof"><b>4.9 ★</b><span>Loved by 2,000+ parents</span></div>
          </div>
        </div>
        <div className="hero-art" aria-label="Illustration of a balanced lunchbox">
          <div className="sun">✦</div>
          <div className="spark one">✦</div><div className="spark two">✦</div>
          <div className="lunchbox">
            <div className="box-top"><span>🥗</span><span>🍊</span></div>
            <div className="box-bottom"><span>🍚</span><span>🥦</span><span>🥚</span></div>
          </div>
          <div className="nutrition-card"><b>Perfectly balanced</b><span>Protein · Grains · Veggies</span></div>
        </div>
      </section>

      <section className="promise-strip" id="standards">
        <div><i>◒</i><span><b>Nutritionist planned</b><small>Age-appropriate portions</small></span></div>
        <div><i>♨</i><span><b>Fresh every morning</b><small>No reheated leftovers</small></span></div>
        <div><i>◇</i><span><b>Local ingredients</b><small>Seasonal Tamil Nadu produce</small></span></div>
        <div><i>✓</i><span><b>School-safe delivery</b><small>Sealed and labelled packs</small></span></div>
      </section>

      <section className="menu-section" id="menu">
        <div className="section-heading">
          <div><span className="kicker">THIS WEEK</span><h2>Pick their happy lunch.</h2></div>
          <p>Every packet contains 1 chapati, 1 bowl of rice, sambar, curd, 2 vegetable curries, channa and 1 appalam.</p>
        </div>

        <div className="filters">
          <label><span>Delivering to</span><select value={city} onChange={(e) => changeCity(e.target.value)}>{cities.map((item) => <option key={item}>{item}</option>)}</select></label>
          <label><span>Onboarded school</span><select value={schoolId} onChange={(e) => setSchoolId(e.target.value)}>{citySchools.map((school) => <option value={school.id} key={school.id}>{school.name} · {school.area}</option>)}<option value="request">My school is not listed</option></select></label>
          <label><span>Student grade</span><select value={gradeBand} onChange={(e) => setGradeBand(e.target.value)} disabled={!gradeBand}>{Object.entries(gradePlans).map(([id, item]) => <option value={id} key={id}>{item.label} standard</option>)}</select></label>
          <div className="diet-tabs" aria-label="Meal type"><button className="active">100% vegetarian</button></div>
        </div>

        <div className="meal-grid">
          {catalogError && <p role="alert">{catalogError}. Please try again shortly.</p>}
          {gradePlans[gradeBand] && visibleMeals.map((meal) => <MealCard key={meal.id} meal={meal} gradePlan={gradePlans[gradeBand]} price={unitPrice} quantity={cart[meal.id] || 0} onAdd={() => addMeal(meal.id)} />)}
        </div>
      </section>

      <section className="how-section" id="how">
        <div><span>1</span><b>Choose meals</b><p>Select one day or plan the whole week.</p></div>
        <div><span>2</span><b>Tell us the school</b><p>We group deliveries by campus and lunch break.</p></div>
        <div><span>3</span><b>We deliver fresh</b><p>Every pack arrives sealed, named and on time.</p></div>
      </section>

      <footer><a className="brand" href="#top"><span className="brand-mark">L</span><span>Lunch<span>Box</span></span></a><p>Made with care for growing minds in Tamil Nadu.</p><small>Menu is illustrative. Final meal plans should be approved by a qualified pediatric dietitian and the participating school.</small></footer>

      {cartOpen && <div className="overlay" onMouseDown={() => setCartOpen(false)}><aside className="drawer" onMouseDown={(e) => e.stopPropagation()}>
        <div className="drawer-head"><div><span className="kicker">YOUR ORDER</span><h2>Lunch bag</h2></div><button onClick={() => setCartOpen(false)}>×</button></div>
        {itemCount === 0 ? <div className="empty"><span>🥣</span><h3>Your bag is empty</h3><p>Add a wholesome lunch to get started.</p></div> : <>
          <div className="cart-list">{meals.filter((meal) => cart[meal.id]).map((meal) => <div className="cart-row" key={meal.id}><div className={`mini-meal ${meal.color}`}>{meal.emoji}</div><div><b>{meal.name}</b><small>{meal.day} · ₹{unitPrice}</small></div><div className="stepper"><button onClick={() => changeQuantity(meal.id, -1)}>−</button><span>{cart[meal.id]}</span><button onClick={() => changeQuantity(meal.id, 1)}>+</button></div></div>)}</div>
          <div className="cart-total"><span>Total</span><b>₹{subtotal}</b></div>
          <button className="checkout-button" onClick={() => setCheckoutOpen(true)}>Continue to details <span>→</span></button>
        </>}
      </aside></div>}

      {checkoutOpen && <div className="overlay modal-overlay" onMouseDown={() => !submitting && setCheckoutOpen(false)}><form className="checkout-modal" onSubmit={placeOrder} onMouseDown={(event) => event.stopPropagation()}>
        <button type="button" className="close" aria-label="Close checkout" disabled={submitting} onClick={() => setCheckoutOpen(false)}>×</button><span className="kicker">FINAL STEP</span><h2>Where should we deliver?</h2><p>{gradePlans[gradeBand]?.label} standard · {city} · ₹{subtotal}</p>
        {!isFirebaseClientConfigured && <label>Student name<input name="studentName" required minLength={2} placeholder="e.g. Nila Raman" /></label>}
        <label>School<select value={schoolId} onChange={(event) => setSchoolId(event.target.value)}>{citySchools.map((school) => <option value={school.id} key={school.id}>{school.name} · {school.area}</option>)}<option value="request">My school is not listed</option></select></label>
        <label>Meal delivery day<select name="freeMealId">{meals.filter((meal) => cart[meal.id]).map((meal) => <option key={meal.id} value={meal.id}>{meal.day} · {meal.shortDate}</option>)}</select></label>
        <label>Senior free meals (optional, max 2)<input name="freeSenior" type="number" min="0" max="2" defaultValue="0" /></label>
        <label>Parent free meals (optional, max 2)<input name="freeParent" type="number" min="0" max="2" defaultValue="0" /></label>
        {isFirebaseClientConfigured ? <ParentAuth onChange={setVerifiedPhone} /> : <label>Parent mobile<input name="parentPhone" required inputMode="tel" pattern="[6-9][0-9]{9}" placeholder="10-digit mobile number" /></label>}
        {isFirebaseClientConfigured && verifiedPhone && selectedSchool && <StudentProfiles schoolId={selectedSchool.id} gradeBand={gradeBand} onChange={setSelectedStudent} />}
        <button className="checkout-button" disabled={submitting || !selectedSchool || (isFirebaseClientConfigured && (!verifiedPhone || !selectedStudent))}>{submitting ? "Placing order…" : `Place order · ₹${subtotal}`}</button>
        <small>{selectedSchool ? "No payment is collected in this demo." : "Choose an onboarded school to order. School requests will be added next."} The school coordinator confirms the order.</small>
      </form></div>}

      {confirmation && <div className="toast"><span>✓</span><div><b>Lunches booked!</b><small>Order {confirmation.slice(0, 13)} confirmed</small></div><button onClick={() => setConfirmation("")}>×</button></div>}
    </main>
  );
}

function MealCard({ meal, gradePlan, price, quantity, onAdd }: { meal: Meal; gradePlan: GradePlan; price: number; quantity: number; onAdd: () => void }) {
  const nutrition = mealNutrition(meal, gradePlan);
  return <article className="meal-card">
    <div className={`meal-photo ${meal.color}`}><span className="day-pill">{meal.day} · {meal.shortDate}</span><span className="food-emoji">{meal.emoji}</span><span className="rating">★ {meal.rating}</span></div>
    <div className="meal-body"><div className="tags">{meal.tags.map((tag) => <span key={tag}>{tag}</span>)}</div><h3>{meal.name}</h3><p>{meal.description}</p><div className="macros"><span><b>{nutrition.estimatedProteinG}g</b> protein</span><span><b>{nutrition.estimatedCalories}</b> kcal</span><span><b>{nutrition.targetCalories}</b> kcal grade target</span></div><div className="meal-bottom"><strong>₹{price}<small> / meal</small></strong><button onClick={onAdd}>{quantity ? `Add another (${quantity})` : "Add to bag"} <span>+</span></button></div></div>
  </article>;
}
