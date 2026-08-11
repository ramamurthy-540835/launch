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

## Run locally

```bash
npm install
cp .env.example .env.local
npm run dev
```

Open `http://localhost:3000`. Leave the placeholder GCP variables unset to use demo checkout.

### School and apartment marketing map

Open `/marketing`, search for Chennai schools, choose **Use this school**, and select a radius to find nearby apartment communities. Configure a browser-restricted `NEXT_PUBLIC_GOOGLE_MAPS_API_KEY` for the map and a separate server-side `GOOGLE_MAPS_API_KEY` for Places searches. Enable Maps JavaScript API and Places API (New), restrict each key to its intended API and caller, and inject production secrets through Secret Manager.

Discovery runs and saved locations are written to the `marketing_discovery_runs` and `marketing_locations` BigQuery tables when GCP is configured. The tool stores public community/place records only; it does not identify individual parents living in an apartment.

### Reusable school-to-apartment research

The privacy-safe Python research module in [`research/`](research/README.md) produces deduplicated school-to-apartment proximity datasets, locality summaries, Excel exports and source audit logs. It stores completed outputs locally and can automatically copy the same files to timestamped folders under `gs://chennaifood/marketing/research/runs/`. It supports approved school CSV input, configurable Chennai localities/radii and a rate-limited OpenStreetMap/Overpass provider. It does not collect resident- or child-level personal data.

Run `npm test` for the launch-critical unit suite. Cloud Run liveness can use `/api/health`; readiness can use `/api/health?ready=1`, which also checks Firestore access. Rate-limit documents in `rate_limits` should have Firestore TTL enabled on `expires_at`.

## Configure Google Cloud

1. Create a private bucket in `asia-south1` and enable uniform bucket-level access.
2. Replace `YOUR_PROJECT_ID` in `infrastructure/bigquery.sql`, then run it in BigQuery.
3. Replace `YOUR_PROJECT_ID` in `infrastructure/seed.sql` and run it to load the pilot cities, kitchens, schools and delivery routes. The `MERGE` statements are safe to rerun. The capacity and cutoff values are placeholders and must be approved before launch.
4. Create a Firestore Native database in `asia-south1`; use the default database or set `FIRESTORE_DATABASE_ID`.
5. Enable Firebase Phone authentication, register the production domain, configure permitted SMS regions, and create a Firebase Web app.
6. Set the four `NEXT_PUBLIC_FIREBASE_*` Web app values plus `GCP_PROJECT_ID`, `BIGQUERY_DATASET`, `BIGQUERY_ORDERS_TABLE`, `GCS_BUCKET`, `DEFAULT_DAILY_CAPACITY`, and `ORDER_CUTOFF_IST` on Cloud Run.
7. Give the Cloud Run service identity Firestore user access plus the least-privilege BigQuery and Storage roles listed above. Production orders require a valid Firebase ID token whenever `GCP_PROJECT_ID` is configured.
8. Deploy `infrastructure/firestore.rules`. They intentionally deny direct browser access because parent-owned student profiles and orders are accessed only through token-verified server APIs.
9. Deploy from the project directory:

```bash
gcloud run deploy lunchbox --source . --region asia-south1 --allow-unauthenticated
```

### Franchise details from Firebase Storage

Keep the franchise data in the same Firebase Storage bucket configured as `GCS_BUCKET`. The browser calls `/api/franchises`; Cloud Run reads the files using its service identity, so no Storage credentials or bucket access are exposed to visitors.

Set `GCS_FRANCHISES_OBJECT=franchises.json` to use one file. It can contain either an array or an object with a `franchises` array:

```json
{
  "franchises": [
    {
      "id": "chennai-anna-nagar",
      "name": "LunchBox Anna Nagar",
      "city": "Chennai",
      "address": "Anna Nagar, Chennai",
      "phone": "+91 98765 43210",
      "email": "anna-nagar@example.com",
      "description": "Serving schools across Anna Nagar.",
      "imageUrl": "https://...",
      "active": true
    }
  ]
}
```

Alternatively, leave `GCS_FRANCHISES_OBJECT` unset, set `GCS_FRANCHISES_PREFIX=franchises/`, and upload one JSON file per franchise under that folder. The Cloud Run service account needs `roles/storage.objectViewer` on the bucket; the existing order upload flow additionally needs `roles/storage.objectUser`.

### Staff roles

The `/admin` kitchen operations screen requires a Firebase custom claim of `admin: true` or a `roles` array containing `"admin"`. The server revalidates the ID token on every admin API call. Kitchen capacity, active status and cutoff values saved there are enforced by the Firestore order transaction; the environment defaults are used only until a kitchen master record exists.

The `/operations` screen uses `roles` plus scoped custom claims: `kitchen_ids`, `school_ids`, and `route_ids`. Kitchen staff receive meal/school production totals, coordinators receive their student manifest and allergy snapshot, and drivers receive assigned stops and upload private delivery proof. An `admin: true` account can access every scope.

### Payments

When the three `RAZORPAY_*` variables are configured, orders begin as `PENDING_PAYMENT` and consume pending—not confirmed—capacity. Checkout creates a Razorpay Order on the server. Fulfilment requires a captured INR payment with matching amount and a valid signature. Configure the Razorpay Dashboard webhook URL as `/api/webhooks/razorpay` and subscribe to `payment.captured`, `order.paid`, `refund.created`, `refund.processed`, and `refund.failed`. Store API and webhook secrets in Secret Manager; the webhook secret must be separate from the API key secret.

Run `POST /api/tasks/expire-payments` every minute from Cloud Scheduler with the `X-Task-Secret` header. It expires abandoned holds after `PAYMENT_HOLD_MINUTES` and releases pending capacity atomically. Deploy `infrastructure/firestore.indexes.json` before enabling this task. Full refunds are available through the admin payments API only before every selected meal cutoff; they use Razorpay refund idempotency and release confirmed capacity exactly once.

For infrastructure-only staging before Firebase/Razorpay onboarding, set `REQUIRE_FIREBASE_AUTH=false` and `ENABLE_PAYMENTS=false`. This mode must never be used for real parent data or production orders; it exists only for synthetic Firestore, BigQuery, GCS, capacity and deployment validation.

## Important production additions

### Automated outreach configuration

The marketing workspace can prepare audience-specific campaigns for schools, colleges, apartment communities and parent hubs. Preview mode works without provider credentials. Live sends require explicit per-channel consent on every recipient and all of these server-side settings:

- `SENDGRID_API_KEY` and a verified `SENDGRID_FROM_EMAIL`
- `WHATSAPP_ACCESS_TOKEN` and `WHATSAPP_PHONE_NUMBER_ID`
- `CAMPAIGN_ADMIN_TOKEN` to prevent public use of the send endpoint
- `NEXT_PUBLIC_APP_URL` so Meta and email recipients can load the public campaign images

Store API keys and the admin token in Google Secret Manager and expose them to Cloud Run as secrets; never use browser-prefixed environment variables for credentials. WhatsApp sends use approved media templates named `lunchbox_school_intro`, `lunchbox_college_intro`, and `lunchbox_community_intro`. The API remains in preview-only operation until the provider secrets exist.

### Shared Marketing OS workspace

Marketing leads, scheduled events and outreach activities are stored in Firestore through the authenticated `/api/marketing/workspace` server route. Configure the Firebase web values (`NEXT_PUBLIC_FIREBASE_API_KEY`, `NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN`, `NEXT_PUBLIC_FIREBASE_PROJECT_ID`, and optionally `NEXT_PUBLIC_FIREBASE_APP_ID`), enable email/password sign-in in Firebase Authentication, add the Cloud Run domains to Authorized domains, and set `MARKETING_ADMIN_EMAIL` to the authorized staff account. Existing browser-local Marketing OS records are imported once after the authorized account signs in.

- Authentication and role-based admin access
- School/campus master data and delivery cut-off calendar
- Payment idempotency, webhook verification, cancellation and refund handling
- FSSAI-approved kitchen/transport SOPs and batch/temperature logs
- Allergy acknowledgements and an emergency escalation process
- Consent, encryption, audit logs, data minimization and retention for children’s data
- Tests, monitoring, CI/CD and separate development/staging/production projects
