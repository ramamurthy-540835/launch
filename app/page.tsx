"use client";

import InstallAppButton from "@/components/InstallAppButton";
import FranchiseDirectory from "@/components/FranchiseDirectory";
import FranchiseRegistration from "@/components/FranchiseRegistration";
import FranchiseNetworkExplorer from "@/components/franchises/FranchiseNetworkExplorer";
import type { Franchise } from "@/lib/franchises";
import { useEffect, useMemo, useState } from "react";
import { cities as fallbackCities, gradePlans as fallbackGradePlans, mealNutrition, meals as fallbackMeals, schools as fallbackSchools, type GradePlan, type Meal, type School } from "@/lib/meals";
import { MARKET_PRICE, schoolMealPrice } from "@/lib/pricing";

type Cart = Record<string, number>;

export default function Home() {
  const [cities, setCities] = useState<string[]>(fallbackCities);
  const [meals, setMeals] = useState<Meal[]>(fallbackMeals);
  const [schools, setSchools] = useState<School[]>(fallbackSchools);
  const [gradePlans, setGradePlans] = useState<Record<string, GradePlan>>(fallbackGradePlans);
  const [catalogError, setCatalogError] = useState("");
  const [franchises, setFranchises] = useState<Franchise[]>([]);
  const [franchiseError, setFranchiseError] = useState("");
  const [city, setCity] = useState(fallbackCities[0]);
  const [schoolId, setSchoolId] = useState(fallbackSchools[0]?.id || "request");
  const [gradeBand, setGradeBand] = useState(Object.keys(fallbackGradePlans)[0]);
  const [cart, setCart] = useState<Cart>({});
  const [cartOpen, setCartOpen] = useState(false);

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
  useEffect(() => { fetch("/api/franchises").then(async (response) => { if (!response.ok) throw new Error("Franchise details unavailable"); return response.json(); }).then((data) => { setFranchises(data.franchises || []); setFranchiseError(""); }).catch((error) => setFranchiseError(error instanceof Error ? error.message : "Franchise details unavailable")); }, []);

  const citySchools = schools.filter((school) => school.city === city);
  const selectedSchool = schools.find((school) => school.id === schoolId);
  const itemCount = Object.values(cart).reduce((sum, count) => sum + count, 0);
  const unitPrice = selectedSchool ? schoolMealPrice(selectedSchool) : MARKET_PRICE;
  const subtotal = useMemo(
    () => meals.reduce((sum, meal) => sum + unitPrice * (cart[meal.id] || 0), 0),
    [cart, meals, unitPrice],
  );

  function changeCity(nextCity: string) {
    setCity(nextCity);
    setSchoolId(schools.find((school) => school.city === nextCity)?.id || "request");
  }

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

  function continueToCheckout() {
    sessionStorage.setItem("lunchbox_checkout", JSON.stringify({ cart, city, schoolId, gradeBand }));
    window.location.assign("/checkout");
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
            <a className="primary-button" href="#menu">Explore this week&apos;s menu <span>→</span></a>
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
        <div><i aria-hidden="true">{"\u25A3"}</i><span><b>Trusted by Schools</b><small>Partnered with verified schools across Tamil Nadu.</small></span></div>
        <div><i aria-hidden="true">{"\u23F1"}</i><span><b>Reliable Daily Delivery</b><small>Lunches arrive on time every school day.</small></span></div>
        <div><i aria-hidden="true">{"\u25CE"}</i><span><b>Easy Parent Ordering</b><small>Order, manage, and track in a few taps.</small></span></div>
        <div><i aria-hidden="true">{"\u2665"}</i><span><b>Healthy Kids</b><small>Clear nutrition and quality standards for parents.</small></span></div>
      </section>

      <section className="menu-section" id="menu">
        <div className="section-heading">
          <div><span className="kicker">THIS WEEK</span><h2>Pick their happy lunch.</h2></div>
          <p>Every packet contains 1 chapati, 1 bowl of rice, sambar, curd, 2 vegetable curries, channa and 1 appalam.</p>
        </div>

        <div className="filters">
          <label><span>Delivering to</span><select value={city} onChange={(event) => changeCity(event.target.value)}>{cities.map((item) => <option key={item}>{item}</option>)}</select></label>
          <label><span>Onboarded school</span><select value={schoolId} onChange={(event) => setSchoolId(event.target.value)}>{citySchools.map((school) => <option value={school.id} key={school.id}>{school.name} · {school.area}</option>)}<option value="request">My school is not listed</option></select></label>
          <label><span>Student grade</span><select value={gradeBand} onChange={(event) => setGradeBand(event.target.value)}>{Object.entries(gradePlans).map(([id, item]) => <option value={id} key={id}>{item.label} standard</option>)}</select></label>
          <div className="diet-tabs" aria-label="Meal type"><button className="active">100% vegetarian</button></div>
        </div>

        <div className="meal-grid">
          {catalogError && <p role="alert">{catalogError}. Please try again shortly.</p>}
          {gradePlans[gradeBand] && meals.map((meal) => <MealCard key={meal.id} meal={meal} gradePlan={gradePlans[gradeBand]} price={unitPrice} quantity={cart[meal.id] || 0} onAdd={() => addMeal(meal.id)} />)}
        </div>
      </section>

      <section className="how-section" id="how">
        <div><span>1</span><b>Choose meals</b><p>Select one day or plan the whole week.</p></div>
        <div><span>2</span><b>Tell us the school</b><p>We group deliveries by campus and lunch break.</p></div>
        <div><span>3</span><b>We deliver fresh</b><p>Every pack arrives sealed, named and on time.</p></div>
      </section>
      <section className="franchise-section" id="franchises"><div className="section-heading"><div><span className="kicker">CHENNAI FRANCHISE DIRECTORY</span><h2>Find a franchise in Chennai.</h2></div><p>Explore approved LunchBox franchise partners and Chennai territory opportunities.</p></div><FranchiseNetworkExplorer />{franchiseError && <p className="franchise-message" role="alert">{franchiseError}</p>}{!franchiseError && franchises.length > 0 && <FranchiseDirectory franchises={franchises} />}<FranchiseRegistration /></section>

      <footer><a className="brand" href="#top"><span className="brand-mark">L</span><span>Lunch<span>Box</span></span></a><p>Made with care for growing minds in Tamil Nadu.</p><small>Menu is illustrative. Final meal plans should be approved by a qualified pediatric dietitian and the participating school.</small></footer>

      {cartOpen && <div className="overlay" onMouseDown={() => setCartOpen(false)}><aside className="drawer" onMouseDown={(event) => event.stopPropagation()}>
        <div className="drawer-head"><div><span className="kicker">YOUR ORDER</span><h2>Lunch bag</h2></div><button onClick={() => setCartOpen(false)}>×</button></div>
        {itemCount === 0 ? <div className="empty"><span>🥣</span><h3>Your bag is empty</h3><p>Add a wholesome lunch to get started.</p></div> : <>
          <div className="cart-list">{meals.filter((meal) => cart[meal.id]).map((meal) => <div className="cart-row" key={meal.id}><div className={`mini-meal ${meal.color}`}>{meal.emoji}</div><div><b>{meal.name}</b><small>{meal.day} · ₹{unitPrice}</small></div><div className="stepper"><button onClick={() => changeQuantity(meal.id, -1)}>−</button><span>{cart[meal.id]}</span><button onClick={() => changeQuantity(meal.id, 1)}>+</button></div></div>)}</div>
          <div className="cart-total"><span>Total</span><b>₹{subtotal}</b></div>
          <button className="checkout-button" onClick={continueToCheckout}>Continue to details <span>→</span></button>
        </>}
      </aside></div>}
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
