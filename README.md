# LunchBox — school lunch ordering starter

A responsive Next.js starter for parents ordering balanced vegetarian lunches for students in 6th–12th standard across Chennai, Madurai, Trichy and Coimbatore.
Each lunch packet contains **1 chapati, 1 bowl of rice, sambar, curd, 2 vegetable curries, 1 serving of channa and 1 appalam**. The two vegetable curries rotate daily.

## Product plan

### Users and core journeys

- **Parent:** selects city and grade band, filters dietary preference, chooses meals, provides school details and places an order.
- **School coordinator:** receives a campus/day manifest, verifies student names and delivery windows, and reports exceptions.
- **Kitchen operator:** sees daily totals by city, meal and school; prints tamper-evident labels with allergens and student identity.
- **Admin/dietitian:** publishes weekly packages, marks allergens, reviews nutrition and tracks fulfilment/refunds.

### Recommended phases

1. **Pilot (4–6 weeks):** one kitchen and 2–3 schools per city, preorder only, weekly menu, coordinator-confirmed payment, delivery manifest and support workflow.
2. **MVP (6–10 weeks):** parent authentication/OTP, Razorpay or school billing, subscriptions, holidays/cut-offs, allergen consent, refunds and operations dashboard.
3. **Scale:** route optimization, kitchen capacity, inventory forecasting, audit trails, meal feedback and BigQuery dashboards.

### Nutrition and safety guardrails

The sample menu uses grain/millet, vegetables, protein and fruit/curd with grade-band portion adjustments. Before launch, a qualified pediatric dietitian must approve recipes, portion sizes and nutrition values. Capture allergies explicitly; use separate preparation and packing controls; show ingredients and allergens on every pack. Keep the menu moderate in salt, added sugar and oil, consistent with the ICMR–NIN Dietary Guidelines for Indians (2024). Implement FSSAI licensing, hygiene, temperature, traceability and recall procedures with a food-safety professional.

## GCP architecture

```text
Parent browser
    │ HTTPS
    ▼
Next.js on Cloud Run ── service account / ADC
    ├── BigQuery: meal catalogue + analytics/order event copy
    └── Cloud Storage: immutable JSON order packets, menu images and exports
```

This starter creates orders and reserves per-kitchen daily capacity in one Firestore transaction. An idempotency key protects retries from creating a second order or consuming capacity twice. It then writes an immutable JSON **order packet** to Cloud Storage and a queryable analytics row to BigQuery. With no GCP environment variables, checkout runs safely in demo mode.

Recommended resources:

- Region: `asia-south1` (keep Cloud Run, bucket and BigQuery dataset colocated where supported).
- Private bucket with uniform bucket-level access, public access prevention, versioning/retention as required.
- Cloud Run service account with only `roles/bigquery.dataEditor`, `roles/bigquery.jobUser`, and bucket-level `roles/storage.objectUser`.
- Secret Manager for payment/SMS keys; never place a service-account key in the app or repository.
- Cloud Armor/rate limiting, Cloud Logging alerts and deletion/retention policies for child-related data.

## PWA and school serviceability

The production build generates a versioned Serwist service worker at `public/sw.js`, precaches the application shell and provides `/~offline` as the document fallback. The manifest includes Android, maskable and Apple icons. PWA generation is disabled during `npm run dev` to prevent stale development caches.

Serviceability follows city → onboarded school → grade. The current school names are explicitly labelled pilot placeholders in `lib/meals.ts`; replace them with approved school records before staging. Orders for unknown or cross-city schools are rejected by the server.

## Private School Location Agent

The School Registration page at `/schools/register` uses a server-only location pipeline:

```text
City → Zone → 3-character school prefix
  → Firestore schools directory
  → 14-day Firestore query cache
  → Google Places Text Search
  → SerpAPI Google Maps fallback
  → normalize / private-school filter / zone resolution / rank / deduplicate
  → Firestore operational master
  → deferred BigQuery analytics
```

The centralized territory model in `lib/school-locator/territories.ts` defines exactly four cities and five zones per city. The UI waits 400 ms, cancels stale requests, caps results at ten, supports keyboard selection, can retry across the full city, and provides an unverified manual-entry fallback. Selecting a result auto-fills the normalized address, locality, zone, city, state, pincode, coordinates and provider place ID.

External providers are called only by Cloud Run. Never expose `GOOGLE_MAPS_API_KEY`, `GOOGLE_PLACES_API_KEY`, `SERPAPI_API_KEY`, or `SERP_API_KEY` to browser code. An interactive frontend map requires a separate HTTP-referrer-restricted browser key; the registration page currently uses a keyless Google Maps destination link.

Supported server environment variables:

```text
GCP_PROJECT_ID=chennaifood
FIREBASE_PROJECT_ID=chennaifood
FIRESTORE_DATABASE_ID=(default)
GOOGLE_MAPS_API_KEY=<Secret Manager>
GOOGLE_PLACES_API_KEY=<optional separate Secret Manager key>
SERPAPI_API_KEY=<Secret Manager>
SCHOOL_DIRECTORY_BIGQUERY_DATASET=school_directory
BIGQUERY_LOCATION=asia-south1
SCHOOL_DISCOVERY_TASK_SECRET=<Secret Manager>
```

`GOOGLE_PLACES_API_KEY` takes precedence over `GOOGLE_MAPS_API_KEY`. `SERP_API_KEY` remains supported as a backwards-compatible alias for `SERPAPI_API_KEY`.

Operational Firestore collections:

- `schools`: normalized school master and bounded search keywords.
- `school_search_cache`: 14-day city/zone/query cache.
- `school_onboarding_requests`: selected-school registration requests.
- `rate_limits`: server-enforced request buckets; enable TTL on `expires_at`.

Deploy the single required school autocomplete composite index and the deny-all browser rules with:

```bash
firebase deploy --only firestore:rules,firestore:indexes --project chennaifood
```

Create the analytics dataset, tables and future-ready views by replacing `YOUR_PROJECT_ID` in `infrastructure/school-directory.sql` with `chennaifood`, then running:

```bash
bq query --project_id=chennaifood --location=asia-south1 --use_legacy_sql=false < infrastructure/school-directory.sql
```

The schema contains `school_master`, `school_search_events`, `school_registration_events`, and `school_provider_usage`, plus city, zone, popularity, registration, student-strength and potential-franchise views. Analytics writes run after the user response and failures never block autocomplete or registration.

Optional directory preload is explicit and never runs at application startup:

```bash
LUNCHBOX_BASE_URL=http://localhost:3000 npm run sync:schools -- --city chennai --zone west
LUNCHBOX_BASE_URL=http://localhost:3000 npm run sync:schools -- --city coimbatore --max-localities 2
```

The preload command reads `SCHOOL_DISCOVERY_TASK_SECRET` from the environment, loads territory data from the application API, and synchronizes one zone at a time. Each locality can call multiple billable provider searches, so start with `--max-localities 1` or `2` and monitor quota before a full-city run.

School locator APIs:

- `GET /api/location/cities`
- `GET /api/location/zones?city=CHENNAI`
- `GET /api/schools/search?city=CHENNAI&zone=CHENNAI_WEST&q=mah&limit=10`
- `GET /api/schools/{schoolId}`
- `POST /api/schools/manual`
- `POST /api/school-registration`

## Office and Company Registration

The partner registration landing page at `/register` now links to the existing school flow plus `/register/office` and `/register/company`. Office represents a physical workplace; company represents the organization. They remain separate Firestore masters, and an office can optionally link to its company with `company_id`.

Both new flows reuse the existing four-city/twenty-zone territory model and server-side provider transport:

```text
City → Zone → 3-character entity prefix
  → Firestore offices/companies master
  → 14-day entity_search_cache
  → Google Places Text Search
  → SerpAPI Google Maps fallback
  → profile filter / normalize / resolve zone / rank / deduplicate
  → Firestore operational master
  → deferred BigQuery analytics
```

`lib/entity-locator/profiles.ts` defines the office and company query templates, preferred categories, and conservative exclusions. The shared provider, repository, search service, autocomplete, timeout, request-deduplication, rate-limiting, and analytics paths are not duplicated between the two modules. A company search is location-aware for discovery but does not claim MCA, GSTIN, or CIN verification.

Operational Firestore collections added:

- `offices`: physical office master; nullable `company_id` supports company-to-many-office relationships.
- `companies`: organization master; nullable `primary_office_id` is future-ready.
- `entity_search_cache`: entity-type/city/zone/query cache with a 14-day expiry.
- `office_registrations` and `company_registrations`: onboarding transactions kept separate from master records.

Entity APIs:

- `GET /api/entities/search?type=office&city=CHENNAI&zone=CHENNAI_WEST&q=dlf&limit=10`
- `GET /api/entities/search?type=company&city=CHENNAI&zone=CHENNAI_WEST&q=tat&limit=10`
- `GET /api/offices/{id}` and `POST /api/offices/manual`
- `GET /api/companies/{id}` and `POST /api/companies/manual`
- `POST /api/office-registration` and `POST /api/company-registration`

The existing server-only `GOOGLE_PLACES_API_KEY`/`GOOGLE_MAPS_API_KEY` and `SERPAPI_API_KEY`/`SERP_API_KEY` variables are reused; no new key is required. Run `infrastructure/school-directory.sql` again to add the office/company analytics tables and views. Deploy the two new Firestore composite indexes in `infrastructure/firestore.indexes.json`, and configure Firestore TTL on `entity_search_cache.expires_at`.

## Run locally

```bash
npm install
cp .env.example .env.local
npm run dev
```

Open `http://localhost:3000`. Leave the placeholder GCP variables unset to use demo checkout.

Run `npm test` for the launch-critical unit suite. Cloud Run liveness can use `/api/health`; readiness can use `/api/health?ready=1`, which also checks Firestore access. Rate-limit documents in `rate_limits` should have Firestore TTL enabled on `expires_at`.

## Configure Google Cloud

1. Create a private bucket in `asia-south1` and enable uniform bucket-level access.
2. Replace `YOUR_PROJECT_ID` in `infrastructure/bigquery.sql`, then run it in BigQuery.
3. Replace `YOUR_PROJECT_ID` in `infrastructure/school-directory.sql`, then run it to create the school analytics layer.
4. Replace `YOUR_PROJECT_ID` in `infrastructure/seed.sql` and run it to load the pilot cities, kitchens, schools and delivery routes. The `MERGE` statements are safe to rerun. The capacity and cutoff values are placeholders and must be approved before launch.
5. Create a Firestore Native database in `asia-south1`; use the default database or set `FIRESTORE_DATABASE_ID`.
6. Enable Firebase Phone authentication, register the production domain, configure permitted SMS regions, and create a Firebase Web app.
7. Set the four `NEXT_PUBLIC_FIREBASE_*` Web app values plus `GCP_PROJECT_ID`, `BIGQUERY_DATASET`, `BIGQUERY_ORDERS_TABLE`, `GCS_BUCKET`, `DEFAULT_DAILY_CAPACITY`, and `ORDER_CUTOFF_IST` on Cloud Run.
8. Give the Cloud Run service identity Firestore user access plus the least-privilege BigQuery and Storage roles listed above. Production orders require a valid Firebase ID token whenever `GCP_PROJECT_ID` is configured.
9. Deploy `infrastructure/firestore.rules` and `infrastructure/firestore.indexes.json`. They intentionally deny direct browser access because all school and parent data is accessed through server APIs.
10. Deploy from the project directory:

```bash
gcloud run deploy lunchbox --source . --region asia-south1 --allow-unauthenticated
```

### Staff roles

The `/admin` kitchen operations screen requires a Firebase custom claim of `admin: true` or a `roles` array containing `"admin"`. The server revalidates the ID token on every admin API call. Kitchen capacity, active status and cutoff values saved there are enforced by the Firestore order transaction; the environment defaults are used only until a kitchen master record exists.

The `/operations` screen uses `roles` plus scoped custom claims: `kitchen_ids`, `school_ids`, and `route_ids`. Kitchen staff receive meal/school production totals, coordinators receive their student manifest and allergy snapshot, and drivers receive assigned stops and upload private delivery proof. An `admin: true` account can access every scope.

### Payments

When the three `RAZORPAY_*` variables are configured, orders begin as `PENDING_PAYMENT` and consume pending—not confirmed—capacity. Checkout creates a Razorpay Order on the server. Fulfilment requires a captured INR payment with matching amount and a valid signature. Configure the Razorpay Dashboard webhook URL as `/api/webhooks/razorpay` and subscribe to `payment.captured`, `order.paid`, `refund.created`, `refund.processed`, and `refund.failed`. Store API and webhook secrets in Secret Manager; the webhook secret must be separate from the API key secret.

Run `POST /api/tasks/expire-payments` every minute from Cloud Scheduler with the `X-Task-Secret` header. It expires abandoned holds after `PAYMENT_HOLD_MINUTES` and releases pending capacity atomically. Deploy `infrastructure/firestore.indexes.json` before enabling this task. Full refunds are available through the admin payments API only before every selected meal cutoff; they use Razorpay refund idempotency and release confirmed capacity exactly once.

For infrastructure-only staging before Firebase/Razorpay onboarding, set `REQUIRE_FIREBASE_AUTH=false` and `ENABLE_PAYMENTS=false`. This mode must never be used for real parent data or production orders; it exists only for synthetic Firestore, BigQuery, GCS, capacity and deployment validation.

## Important production additions

- Authentication and role-based admin access
- School/campus master data and delivery cut-off calendar
- Payment idempotency, webhook verification, cancellation and refund handling
- FSSAI-approved kitchen/transport SOPs and batch/temperature logs
- Allergy acknowledgements and an emergency escalation process
- Consent, encryption, audit logs, data minimization and retention for children’s data
- Tests, monitoring, CI/CD and separate development/staging/production projects
