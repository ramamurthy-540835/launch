"use client";

import InstallAppButton from "@/components/InstallAppButton";
import AudienceCategorySelector from "@/components/AudienceCategorySelector";
import FranchiseLocationDashboard from "@/components/FranchiseLocationDashboard";
import FranchiseNetworkExplorer from "@/components/franchises/FranchiseNetworkExplorer";
import type { Franchise } from "@/lib/franchises";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { cities as fallbackCities, gradePlans as fallbackGradePlans, mealNutrition, meals as fallbackMeals, schools as fallbackSchools, type GradePlan, type Meal, type School } from "@/lib/meals";
import { mealAudiencePrice, type MealAudience } from "@/lib/pricing";
import { getFruitOfTheDay } from "@/lib/lunchbox/fruit-of-the-day";

type Cart = Record<string, number>;

export default function Home() {
  const [meals, setMeals] = useState<Meal[]>(fallbackMeals);
  const [gradePlans, setGradePlans] = useState<Record<string, GradePlan>>(fallbackGradePlans);
  const [catalogError, setCatalogError] = useState("");
  const [franchises, setFranchises] = useState<Franchise[]>([]);
  const [franchiseError, setFranchiseError] = useState("");
  const [city, setCity] = useState(fallbackCities[0]);
  const [schoolId, setSchoolId] = useState(fallbackSchools[0]?.id || "request");
  const [gradeBand, setGradeBand] = useState(Object.keys(fallbackGradePlans)[0]);
  const [audience, setAudience] = useState<MealAudience>("school");
  const [cart, setCart] = useState<Cart>({});
  const [cartOpen, setCartOpen] = useState(false);
  const [storyStep, setStoryStep] = useState<number | null>(null);
  const [storySoundOn, setStorySoundOn] = useState(true);
  const storyAudio = useRef<AudioContext | null>(null);
  const storyHandoff = useRef(false);
  const storyMealId = useRef<string | null>(null);

  useEffect(() => {
    fetch("/api/catalog").then(async (response) => {
      if (!response.ok) throw new Error("Catalogue unavailable");
      return response.json();
    }).then((catalog) => {
      setMeals(catalog.meals);
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

  const itemCount = Object.values(cart).reduce((sum, count) => sum + count, 0);
  const unitPrice = mealAudiencePrice(audience);
  const subtotal = useMemo(
    () => meals.reduce((sum, meal) => sum + unitPrice * (cart[meal.id] || 0), 0),
    [cart, meals, unitPrice],
  );

  const todayMeal = meals[new Date().getDay() % meals.length] || meals[0];
  const storyMeal = meals.find((meal) => meal.id === storyMealId.current) || todayMeal;
  const fruitKey = getFruitOfTheDay();
  const fruitOfTheDay = { mango: { name: "Mango", emoji: "🥭" }, apple: { name: "Apple", emoji: "🍎" }, orange: { name: "Orange", emoji: "🍊" }, guava: { name: "Guava", emoji: "🍐" }, banana: { name: "Banana", emoji: "🍌" }, pomegranate: { name: "Pomegranate", emoji: "🔴" }, grapes: { name: "Grapes", emoji: "🍇" } }[fruitKey];

  const finishLunchStory = useCallback(() => {
    if (storyHandoff.current) return;
    storyHandoff.current = true;
    const mealId = storyMealId.current || todayMeal?.id;
    if (mealId) setCart((current) => ({ ...current, [mealId]: (current[mealId] || 0) + 1 }));
    storyMealId.current = null;
    setStoryStep(null);
    setCartOpen(true);
  }, [todayMeal]);

  const playStoryTone = useCallback((step: number) => {
    if (!storySoundOn) return;
    const Audio = window.AudioContext;
    storyAudio.current ||= new Audio();
    const context = storyAudio.current;
    const oscillator = context.createOscillator();
    const gain = context.createGain();
    oscillator.type = step === 4 ? "sine" : "triangle";
    oscillator.frequency.setValueAtTime([220, 330, 440, 294, 660, 523][step] || 330, context.currentTime);
    gain.gain.setValueAtTime(0.0001, context.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.08, context.currentTime + 0.03);
    gain.gain.exponentialRampToValueAtTime(0.0001, context.currentTime + 0.8);
    oscillator.connect(gain).connect(context.destination); oscillator.start(); oscillator.stop(context.currentTime + 0.85);
  }, [storySoundOn]);

  function startLunchStory(mealId = todayMeal?.id) {
    storyHandoff.current = false;
    storyMealId.current = mealId || null;
    if (audience !== "school") return finishLunchStory();
    setStoryStep(0);
    playStoryTone(0);
  }

  function addMeal(id: string) {
    if (audience === "school") return startLunchStory(id);
    setCart((current) => ({ ...current, [id]: (current[id] || 0) + 1 }));
  }

  useEffect(() => {
    if (storyStep === null) return;
    if (storyStep >= 5) {
      const timer = window.setTimeout(() => {
        finishLunchStory();
      }, 1100);
      return () => window.clearTimeout(timer);
    }
    playStoryTone(storyStep);
    const timer = window.setTimeout(() => setStoryStep((step) => step === null ? null : step + 1), 1500);
    return () => window.clearTimeout(timer);
  }, [storyStep, todayMeal, playStoryTone, finishLunchStory]);

  function changeQuantity(id: string, amount: number) {
    setCart((current) => {
      const next = Math.max(0, (current[id] || 0) + amount);
      const updated = { ...current, [id]: next };
      if (!next) delete updated[id];
      return updated;
    });
  }

  function continueToCheckout() {
    sessionStorage.setItem("lunchbox_checkout", JSON.stringify({ cart, city, schoolId, gradeBand, audience }));
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
          <a href="/franchise">Franchise</a>
        </nav>
        <InstallAppButton />
        <button className="cart-button" onClick={() => setCartOpen(true)}>
          <span>Bag</span>
          <b>{itemCount}</b>
        </button>
        <a className="profile-button" href="/checkout" aria-label="Login or open your profile"><svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="8" r="3.5"/><path d="M4.5 20c.8-4 3.1-6 7.5-6s6.7 2 7.5 6"/></svg><span>Login</span></a>
      </header>

      <section className="hero" id="top">
        <div className="hero-copy">
          <div className="eyebrow"><span>●</span> Now serving 4 Tamil Nadu cities</div>
          <h1>Big nutrition for<br /><em>bright young minds.</em></h1>
          <p>Freshly cooked, balanced school lunches designed for growing students from 6th to 12th standard.</p>
          <div className="hero-actions">
            <button className="primary-button story-order-button" onClick={() => startLunchStory()}>Order ₹{unitPrice} Lunch <span>→</span></button>
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

        <AudienceCategorySelector value={audience} onChange={setAudience} />

        <div className="menu-diet" aria-label="Meal type"><span>100% vegetarian</span></div>

        <div className="meal-grid">
          {catalogError && <p role="alert">{catalogError}. Please try again shortly.</p>}
          {gradePlans[gradeBand] && meals.map((meal) => <MealCard key={meal.id} meal={meal} gradePlan={gradePlans[gradeBand]} price={unitPrice} quantity={cart[meal.id] || 0} storyEnabled={audience === "school"} onAdd={() => addMeal(meal.id)} />)}
        </div>
      </section>

      <section className="how-section" id="how">
        <div><span>1</span><b>Choose meals</b><p>Select one day or plan the whole week.</p></div>
        <div><span>2</span><b>Tell us the school</b><p>We group deliveries by campus and lunch break.</p></div>
        <div><span>3</span><b>We deliver fresh</b><p>Every pack arrives sealed, named and on time.</p></div>
      </section>
      <section className="franchise-section" id="franchises"><div className="section-heading"><div><span className="kicker">TAMIL NADU FRANCHISE DIRECTORY</span><h2>Explore the LunchBox partner network.</h2></div><p>Compare approved franchise partners across Chennai, Madurai, Trichy, and Coimbatore.</p></div><FranchiseNetworkExplorer />{franchiseError && <p className="franchise-message" role="alert">{franchiseError}</p>}{!franchiseError && <FranchiseLocationDashboard franchises={franchises} />}</section>

      <footer><a className="brand" href="#top"><span className="brand-mark">L</span><span>Lunch<span>Box</span></span></a><p>Made with care for growing minds in Tamil Nadu.</p><small>Menu is illustrative. Final meal plans should be approved by a qualified pediatric dietitian and the participating school.</small></footer>

      {storyStep !== null && storyMeal && <div className="lunch-story" role="dialog" aria-modal="true" aria-label="A magical Lunchbox story">
        <div className={`story-card step-${storyStep}`}>
          <button className="story-skip" onClick={finishLunchStory}>Skip story</button>
          <button className="story-sound" onClick={() => setStorySoundOn((on) => !on)} aria-label={storySoundOn ? "Mute sound" : "Turn on sound"}>{storySoundOn ? "Sound on" : "Sound off"}</button>
          <div className="story-sky"><span className="story-cloud cloud-a" /><span className="story-cloud cloud-b" /><span className="story-sparkle">✦</span></div>
          <div className="story-scene">
            <div className="story-school"><span>⌂</span><small>SCHOOL</small></div><div className="story-boy"><span>🧒</span><i /></div><div className="story-angel"><span>😇</span><i>🪽</i></div>
            <div className="story-fruit">{fruitOfTheDay.emoji}</div><div className="story-tree"><span>🌳</span><i>{fruitOfTheDay.emoji}</i><b>{fruitOfTheDay.emoji}</b></div>
            <div className="story-lunchbox"><span>🍱</span><div><i>{storyMeal.emoji}</i><i>🥗</i><i>🍚</i></div></div>
          </div>
          <div className="story-copy" aria-live="polite">
            {storyStep === 0 && <><b>01 / The school day ends</b><span>Fresh energy for the next big thing. Sound design begins.</span></>}
            {storyStep === 1 && <><b>02 / Your food, your fuel</b><span>Real ingredients. Made for busy, brilliant days.</span></>}
            {storyStep === 2 && <><b>03 / A choice in your hands</b><span>Explore today&apos;s meal in a cinematic, spatial view.</span></>}
            {storyStep === 3 && <><b>04 / Freshness, unlocked</b><span>Every lunch is packed to power school, sport, and play.</span></>}
            {storyStep === 4 && <><b>05 / Look closer</b><span>Chapati, rice, vegetables, sambar, curd and more — all together.</span></>}
            {storyStep === 5 && <><b>06 / Today&apos;s Lunchbox is ready</b><span>{storyMeal.description}</span></>}
          </div>
          <div className="story-dots" aria-hidden="true">{[0, 1, 2, 3, 4, 5].map((step) => <i className={step <= storyStep ? "active" : ""} key={step} />)}</div>
        </div>
      </div>}

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

function MealCard({ meal, gradePlan, price, quantity, storyEnabled, onAdd }: { meal: Meal; gradePlan: GradePlan; price: number; quantity: number; storyEnabled: boolean; onAdd: () => void }) {
  const nutrition = mealNutrition(meal, gradePlan);
  return <article className="meal-card">
    <div className={`meal-photo ${meal.color}`}><span className="day-pill">{meal.day} · {meal.shortDate}</span><span className="food-emoji">{meal.emoji}</span><span className="rating">★ {meal.rating}</span></div>
    <div className="meal-body"><div className="tags">{meal.tags.map((tag) => <span key={tag}>{tag}</span>)}</div><h3>{meal.name}</h3><p>{meal.description}</p><div className="macros"><span><b>{nutrition.estimatedProteinG}g</b> protein</span><span><b>{nutrition.estimatedCalories}</b> kcal</span><span><b>{nutrition.targetCalories}</b> kcal grade target</span></div><div className="meal-bottom"><strong>₹{price}<small> / meal</small></strong><button onClick={onAdd}>{storyEnabled ? (quantity ? `Watch story & add (${quantity})` : "Watch story & add") : (quantity ? `Add another (${quantity})` : "Add to bag")} <span>+</span></button></div></div>
  </article>;
}
