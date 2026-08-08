"use client";
import InstallAppButton from "@/components/InstallAppButton";

import { FormEvent, useMemo, useState } from "react";
import { cities, gradeAdjustments, meals, schools, type Meal } from "@/lib/meals";

type Cart = Record<string, number>;

export default function Home() {
  const [city, setCity] = useState("Chennai");
  const [schoolId, setSchoolId] = useState("chn-adyar-01");
  const [gradeBand, setGradeBand] = useState("6-8");
  const [cart, setCart] = useState<Cart>({ "monday-balanced-meals": 1 });
  const [cartOpen, setCartOpen] = useState(false);
  const [checkoutOpen, setCheckoutOpen] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [confirmation, setConfirmation] = useState("");

  const visibleMeals = meals;

  const citySchools = schools.filter((school) => school.city === city);
  const selectedSchool = schools.find((school) => school.id === schoolId);

  function changeCity(nextCity: string) {
    setCity(nextCity);
    setSchoolId(schools.find((school) => school.city === nextCity)?.id || "request");
  }

  const itemCount = Object.values(cart).reduce((sum, count) => sum + count, 0);
  const subtotal = useMemo(
    () => meals.reduce((sum, meal) => sum + meal.price * (cart[meal.id] || 0), 0),
    [cart],
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

    try {
      const response = await fetch("/api/orders", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          studentName: form.get("studentName"),
          schoolName: selectedSchool?.name,
          parentPhone: form.get("parentPhone"),
          city,
          gradeBand,
          items,
          total: subtotal,
        }),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || "Order failed");
      setConfirmation(data.orderId);
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
          <a href="#standards">Our promise</a>
          <a href="#how">How it works</a>
          <a href="/marketing">Marketing</a>
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
          <label><span>Student grade</span><select value={gradeBand} onChange={(e) => setGradeBand(e.target.value)}>{Object.entries(gradeAdjustments).map(([id, item]) => <option value={id} key={id}>{item.label} standard</option>)}</select></label>
          <div className="diet-tabs" aria-label="Meal type"><button className="active">100% vegetarian</button></div>
        </div>

        <div className="meal-grid">
          {visibleMeals.map((meal) => <MealCard key={meal.id} meal={meal} gradeBand={gradeBand} quantity={cart[meal.id] || 0} onAdd={() => addMeal(meal.id)} />)}
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
          <div className="cart-list">{meals.filter((meal) => cart[meal.id]).map((meal) => <div className="cart-row" key={meal.id}><div className={`mini-meal ${meal.color}`}>{meal.emoji}</div><div><b>{meal.name}</b><small>{meal.day} · ₹{meal.price}</small></div><div className="stepper"><button onClick={() => changeQuantity(meal.id, -1)}>−</button><span>{cart[meal.id]}</span><button onClick={() => changeQuantity(meal.id, 1)}>+</button></div></div>)}</div>
          <div className="cart-total"><span>Total</span><b>₹{subtotal}</b></div>
          <button className="checkout-button" onClick={() => setCheckoutOpen(true)}>Continue to details <span>→</span></button>
        </>}
      </aside></div>}

      {checkoutOpen && <div className="overlay modal-overlay"><form className="checkout-modal" onSubmit={placeOrder}>
        <button type="button" className="close" onClick={() => setCheckoutOpen(false)}>×</button><span className="kicker">FINAL STEP</span><h2>Where should we deliver?</h2><p>{gradeAdjustments[gradeBand].label} standard · {city} · ₹{subtotal}</p>
        <label>Student name<input name="studentName" required minLength={2} placeholder="e.g. Nila Raman" /></label>
        <label>School<input value={selectedSchool?.name || "Not yet onboarded"} readOnly /></label>
        <label>Parent mobile<input name="parentPhone" required inputMode="tel" pattern="[6-9][0-9]{9}" placeholder="10-digit mobile number" /></label>
        <button className="checkout-button" disabled={submitting || !selectedSchool}>{submitting ? "Placing order…" : `Place order · ₹${subtotal}`}</button>
        <small>{selectedSchool ? "No payment is collected in this demo." : "Choose an onboarded school to order. School requests will be added next."} The school coordinator confirms the order.</small>
      </form></div>}

      {confirmation && <div className="toast"><span>✓</span><div><b>Lunches booked!</b><small>Order {confirmation.slice(0, 13)} confirmed</small></div><button onClick={() => setConfirmation("")}>×</button></div>}
    </main>
  );
}

function MealCard({ meal, gradeBand, quantity, onAdd }: { meal: Meal; gradeBand: string; quantity: number; onAdd: () => void }) {
  const calories = Math.round(meal.calories * gradeAdjustments[gradeBand].multiplier);
  const protein = Math.round(meal.protein * gradeAdjustments[gradeBand].multiplier);
  return <article className="meal-card">
    <div className={`meal-photo ${meal.color}`}><span className="day-pill">{meal.day} · {meal.shortDate}</span><span className="food-emoji">{meal.emoji}</span><span className="rating">★ {meal.rating}</span></div>
    <div className="meal-body"><div className="tags">{meal.tags.map((tag) => <span key={tag}>{tag}</span>)}</div><h3>{meal.name}</h3><p>{meal.description}</p><div className="macros"><span><b>{protein}g</b> protein</span><span><b>{calories}</b> kcal</span><span><b>4+</b> food groups</span></div><div className="meal-bottom"><strong>₹{meal.price}<small> / meal</small></strong><button onClick={onAdd}>{quantity ? `Add another (${quantity})` : "Add to bag"} <span>+</span></button></div></div>
  </article>;
}
