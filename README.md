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

This starter writes one JSON **order packet** to Cloud Storage and a queryable row to BigQuery. With no GCP environment variables, checkout runs safely in demo mode. For production, use Firestore or Cloud SQL as the transactional order source of truth, publish events through Pub/Sub, and stream an analytics copy into BigQuery; BigQuery alone is not an ideal low-latency transactional database.

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

## Configure Google Cloud

1. Create a private bucket in `asia-south1` and enable uniform bucket-level access.
2. Replace `YOUR_PROJECT_ID` in `infrastructure/bigquery.sql`, then run it in BigQuery.
3. Set `GCP_PROJECT_ID`, `BIGQUERY_DATASET`, `BIGQUERY_ORDERS_TABLE`, and `GCS_BUCKET` on Cloud Run.
4. Give the Cloud Run service identity the least-privilege roles listed above.
5. Deploy from the project directory:

```bash
gcloud run deploy lunchbox --source . --region asia-south1 --allow-unauthenticated
```

## Important production additions

### Automated outreach configuration

The marketing workspace can prepare audience-specific campaigns for schools, colleges, apartment communities and parent hubs. Preview mode works without provider credentials. Live sends require explicit per-channel consent on every recipient and all of these server-side settings:

- `SENDGRID_API_KEY` and a verified `SENDGRID_FROM_EMAIL`
- `WHATSAPP_ACCESS_TOKEN` and `WHATSAPP_PHONE_NUMBER_ID`
- `CAMPAIGN_ADMIN_TOKEN` to prevent public use of the send endpoint
- `NEXT_PUBLIC_APP_URL` so Meta and email recipients can load the public campaign images

Store API keys and the admin token in Google Secret Manager and expose them to Cloud Run as secrets; never use browser-prefixed environment variables for credentials. WhatsApp sends use approved media templates named `lunchbox_school_intro`, `lunchbox_college_intro`, and `lunchbox_community_intro`. The API remains in preview-only operation until the provider secrets exist.

- Authentication and role-based admin access
- School/campus master data and delivery cut-off calendar
- Payment idempotency, webhook verification, cancellation and refund handling
- FSSAI-approved kitchen/transport SOPs and batch/temperature logs
- Allergy acknowledgements and an emergency escalation process
- Consent, encryption, audit logs, data minimization and retention for children’s data
- Tests, monitoring, CI/CD and separate development/staging/production projects
