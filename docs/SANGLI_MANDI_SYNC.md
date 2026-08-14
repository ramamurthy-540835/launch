# Sangli daily mandi-price sync

The Gen2 Cloud Function in functions/sangli-mandi-sync retrieves Maharashtra/Sangli records from the official data.gov.in Agmarknet resource, retains food-grain commodities, converts rupees per quintal to rupees per kilogram, and idempotently merges them into BigQuery.

- Secret Manager variable: DATA_GOV_API_KEY
- Dataset: school_lunch
- History table: sangli_mandi_prices
- Agent-facing view: sangli_mandi_price_current
- Target schedule: daily at 06:15 in Asia/Kolkata

The API key must never be committed or stored in GCS. Cloud Scheduler must invoke the authenticated function with OIDC. Repeated execution updates the same deterministic daily row instead of creating duplicates.

Agmarknet prices are rupees per quintal. The function keeps the source values and divides them by 100 for the per-kilogram fields. An empty food-grain day is valid: the source table and view remain available, and no vegetable row is relabelled as a grain.

The related costing and benchmarking contract is in `infrastructure/grain-costing.sql`. Government mandi wholesale observations belong in `sangli_mandi_prices`; they must not be inserted into `competitor_prices`, which requires shelf-price provenance.

## Production status (14 August 2026)

- Function `sangli-mandi-sync` is deployed privately in `asia-south1`.
- Secret `data-gov-api-key` is in Secret Manager and is available only to the function runtime.
- BigQuery source, costing, competitor, purchase-lot tables, and views are deployed in `chennaifood.school_lunch`.
- Today the official Sangli feed contains four vegetables and zero food grains.
- data.gov.in resets connections from Cloud Run shared egress. The function therefore cannot complete until it uses an approved VPC/NAT static egress path or another approved proxy.
- Do not enable the daily Scheduler job while the egress path is unresolved; repeated calls would only generate failed executions.
