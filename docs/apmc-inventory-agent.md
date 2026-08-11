# Government APMC inventory price agent

The agent imports wholesale market observations from the Government of India's data.gov.in AGMARKNET resource. Sangli, Maharashtra is the primary district. Salem, Tamil Nadu is queried for an item only when Sangli has no valid matching observation inside the configured freshness window.

## Safety and accounting behavior

- The AGMARKNET `Modal_Price` is treated as INR per quintal and divided by 100 to produce INR per kg.
- Commodity, optional variety, and optional grade must match the configured item mapping.
- Invalid dates, non-positive prices, and records where `min > modal` or `modal > max` are rejected.
- Stale observations are returned under `unresolved`; the agent never fabricates or carries forward a rate.
- Salem fallback is explicitly recorded in `fallback_used` and `fallback_reason`.
- Imported records are written to `online_price_feed_log` as `PENDING_APPROVAL`. They do not alter active supplier rates or inventory valuation.
- A procurement or finance approver must assign a supplier and use the existing feed-apply endpoint before a rate becomes active.
- Raw government responses can be retained in private Cloud Storage with a SHA-256 hash in Firestore. API keys are not written to logs or raw payload objects.

## Configuration

Copy the variables from `.env.apmc.example` into Secret Manager/Cloud Run configuration. `INVENTORY_APMC_ITEM_MAP_JSON` is required and must use the exact commodity names published by AGMARKNET. Add variety and grade when different market grades must not be compared.

The default official resource ID is `35985678-0d79-46b4-9ed6-6f13308a1d24`. Market locations remain runtime configuration even though the defaults implement the requested Sangli-primary/Salem-fallback policy.

## Run

An authenticated `admin` or `procurement_manager` calls:

```http
POST /api/price-feed/apmc/sync
Authorization: Bearer <Firebase ID token>
```

The response reports `feedRecords`, `unresolved`, and the optional private GCS `payloadUri`. Review each created record before calling `PUT /api/price-feed/{feedLogId}/apply`.
