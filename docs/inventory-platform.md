# Multi-Location Kitchen Inventory Platform

This document is the implementation contract. Geography, location count, route, transport mode, cadence, demand, unit, price, formula, threshold and role notification lists are data. None is a program constant. Field names below use Firestore `snake_case`; REST payloads use `camelCase`.

## 1. GCP architecture

```text
 Browser/PWA (Next.js, Firebase Auth)
       | HTTPS + Firebase JWT
       v
 Global HTTPS LB / Cloud Run: lunchbox-web-api
       |-- RBAC + location scope + Zod validation
       |-- Inventory transaction service ------------+
       |-- Planning/forecast/cost service             |
       |-- Pricing feed adapter -> external APIs      |
       |-- Signed upload/download -> Cloud Storage    |
       +----------------------------------------------v
                                                  Firestore
  Cloud Scheduler -> Cloud Run Jobs/Tasks          operational truth
       | alert evaluation / escalation               |
       | forecast / replenishment                     | change stream/export
       | analytics export                             v
       +------------------------------------------> BigQuery -> Looker Studio

 Secret Manager -> API keys/webhook secrets; Cloud Logging/Audit Logs -> monitoring;
 Pub/Sub/Cloud Tasks -> reliable notification and analytics outbox delivery.
```

Deploy separate staging and production projects. Cloud Run uses a user-managed service account with only Firestore, scoped GCS, Pub/Sub, BigQuery job/data writer, logging and named-secret access. Browser Firestore access is denied.

## 2. Firestore database schema

All mutable documents carry `created_at`, `created_by`, `updated_at`, `updated_by`, `version`; financial and movement records are never physically deleted.

| Collection | Document ID and essential fields |
|---|---|
| `inventory_categories` | category ID; `category_name`, `active` |
| `inventory_locations` | location ID; location name/type, free-text geography/address, capacity/unit, default planning period, primary/fallback warehouses, status |
| `inventory_items` | item ID; name, category, unit/base unit/conversion, default supplier, batch/expiry flags, shelf life, condition, reorder method, status |
| `suppliers`, `transporters` | ID; identity, contacts, tax/compliance references, status |
| `inventory_balances` | `{location}_{item}_{batch}`; item/location/batch/expiry, current/reserved/available/in-transit, WAC/landed cost, min/max/safety/reorder/threshold base, percentage/color |
| `stock_transactions` | generated ID; immutable movement, before/after, costs, source/destination, reference, batch/expiry, actor/time |
| `demand_plans` | plan ID; location, date range, consumer counts, service days, servings/day, menu, approval state/users/times |
| `consumption_formulas` | formula ID; item/menu consumption, unit, waste %, effective dates, approval state |
| `purchase_orders` | PO ID; supplier/destination, lines, estimated material/freight/landed cost, dates, approval/status |
| `goods_receipts` | GRN ID; PO/shipment/location, received lines, quality/batch/expiry, actual cost/variance, documents |
| `daily_expenses` | ID; location/date/category (`MILK`, `VEGETABLES`, packaging etc.), amount, supplier, receipt URL, approval |
| `daily_stock_closures` | `{location}_{date}`; system opening/movements/expected close, counted close, variance, approval |
| `stock_transfer_orders` | transfer ID; number/source/destination, item array, approvals, dispatch/receipt quantities, mode/transporter/cost/status |
| `inbound_shipments` | shipment ID; PO/origin/destination, rate, estimate/actual charges, carrier receipt, status |
| `outbound_dispatches` | dispatch ID; transfer/transporter/vehicle/driver/route/times/all charges, bills/POD, status |
| `transportation_rate_master` | rate ID; effective-dated route/mode/commodity/carrier unit/rate type and all charge inputs |
| `landed_cost_allocations` | allocation ID; GRN/dispatch/items, basis (`QUANTITY`, `WEIGHT`, `VOLUME`, `VALUE`, `MANUAL`), inputs/results/approval |
| `supplier_item_rates` | rate ID; supplier/item/unit/rate/currency/source/ref/fetch time/effective dates/MOQ/lead time/status/version |
| `online_price_feed_log` | log ID; provider request/response timing, raw GCS payload URI/hash, parsed rate, applied state/actor |
| `purchase_cost_history` | ID; supplier/item/PO/GRN, old/new rate, amount/% variance, date/source/actor |
| `price_variance_alerts` | ID; supplier/item old/new/threshold variance, state/times |
| `forecast_runs` | run ID; location/date/period/method/generator/status/model version |
| `forecast_items` | `{run}_{location}_{item}`; consumption/demand/stocks/safety/reorder/depletion/recommendations/color |
| `alert_rule_config` | rule ID; type, optional location/category scope, green/red limits, expiry/escalation, roles/channels, active/version |
| `inventory_alerts` | deterministic condition ID; type/severity/item/location/values/action/state/times/resolver |
| `alert_notifications` | ID; alert/recipient role/user/channel, provider message ID, send/ack/failure times |
| `inventory_audit_logs` | generated ID; actor/action/entity/before/after/metadata/time/correlation ID |
| `inventory_outbox` | event ID; aggregate/type/payload/status/attempts/next attempt; drives BigQuery and notifications idempotently |

Balance documents are projections. The immutable ledger is accounting truth. A reconciliation job recomputes balances from transactions and raises an alert on mismatch. FEFO queries order eligible batch balances by `expiry_date`, then receipt time.

## 3. BigQuery reporting schema

Deploy [inventory-bigquery.sql](../infrastructure/inventory-bigquery.sql). It creates `bq_inventory_balances_daily`, `bq_stock_transactions`, `bq_stock_transfers`, `bq_transportation_costs`, `bq_landed_cost`, `bq_purchase_cost_history`, `bq_demand_forecast`, `bq_alerts`, `bq_cost_per_serving` and the five required Looker views. Tables are date-partitioned and location/item clustered. BigQuery is never in the order or stock transaction path.

## 4. Dynamic/online pricing schema

Firestore uses `supplier_item_rates`, `online_price_feed_log`, `purchase_cost_history`, and `price_variance_alerts` above. Raw provider responses belong in private GCS; Firestore stores URI, SHA-256, normalized fields and response metadata to avoid document-size/PII risks. Provider adapters normalize currency/unit but cannot activate a rate. Activation runs in a Firestore transaction: expire overlapping live rate, activate approved rate, append history/audit, create threshold alert and outbox event. PO selection requires `status=ACTIVE`, `effective_from<=order_date`, and absent or inclusive `effective_to`.

Analytical DDL is `bq_purchase_cost_history`; operational collections stay in Firestore. Security rules deny clients; Cloud Run checks procurement/finance/admin roles. Feed credentials are named Secret Manager versions and never stored in Firestore.

## 5. Alert and notification schema

`alert_rule_config` is resolved most-specific-first: location+category, location, category, global. A scheduled/on-transaction inventory agent creates idempotent `inventory_alerts` and `alert_notifications`. Default seed is Green `>50`, Amber `25..50`, Red `<25`, but runtime evaluation reads the rule document. Red alerts contain recommended quantity and notify the configured roles. Cloud Tasks schedules escalation after `escalation_delay_minutes`; the task rechecks state/version before escalation. Price variance uses the same alert/notification pipeline.

## 6. REST API specification

All endpoints require `Authorization: Bearer <Firebase ID token>`, return JSON, accept `X-Request-Id`, and use idempotency keys on financial/movement writes. Collection responses are cursor-paginated in production.

| Domain | Endpoints |
|---|---|
| Items/balances | `GET/POST /api/inventory`, `PUT/DELETE /api/inventory/:itemId`, `GET /api/inventory-balances?locationId=&itemId=` |
| Movement | `POST /api/stock/{receipt|issue|wastage|adjustment}`, `GET /api/stock/ledger/:itemId`, GRN/closure/expense endpoints per Section 11 |
| Locations/planning | `GET/POST /api/locations`, demand-plan/formula generation endpoints |
| Transfers | `GET/POST /api/stock-transfers`, `PUT /api/stock-transfers/:id/{approve|dispatch|receive}` |
| Procurement/pricing | purchase order/GRN, supplier rate, feed sync/apply/history/variance endpoints |
| Transport/cost | rate, inbound shipment, outbound dispatch, landed allocation endpoints |
| Forecast/alerts | run/read forecast; list/ack/resolve alerts; read/update rules |
| Reports | stock, transfers, freight, landed cost, depletion, replenishment, price variance |

Implemented core endpoints are discoverable under `app/api`. Remaining endpoint contracts use the same schemas and service boundary; no route may update balances directly.

## 7. Next.js folder structure

```text
app/inventory/page.tsx                 dashboard shell
components/inventory/                  cards, filters, stock/transfer forms, ledgers
app/api/inventory*                     item/balance APIs
app/api/stock*                         ledger/movement APIs
app/api/stock-transfers*               workflow APIs
lib/inventory/domain.ts                schemas and pure calculations
lib/inventory/service.ts               Firestore transactions/audit
docs/inventory-platform.md             architecture/operating contract
infrastructure/inventory-*             DDL, seed, indexes, deployment
```

## 8. Cloud Run backend folder structure

The Next.js Node runtime is the Cloud Run API container. Domain modules follow `route -> authentication/validation -> service transaction -> audit/outbox`. For independent scaling, move `lib/inventory` and API handlers unchanged into `services/inventory-api`, while `jobs/inventory-agent`, `jobs/forecast`, `jobs/analytics-export` become Cloud Run Jobs. Never duplicate balance mutation logic.

## 9. React screens and components

Dashboard: consolidated/location KPIs, alert distribution, depletion, stock value, transfer pipeline and freight. Masters: locations/categories/items/suppliers/formulas/rates/rules. Operations: GRN, FEFO issue, wastage, count/closure, request/approve/pick/dispatch/receive transfer, shipment/POD. Planning: demand inputs, calculated requirements, forecast comparison/recommendations. Finance: PO/GRN variance, landed allocation, rate history, cost/serving. Audit: ledger, document timeline and immutable before/after log. Mobile actions use barcode-friendly item/batch inputs and large touch targets.

## 10. Firebase Authentication role logic

Custom claims contain `roles: string[]` and `location_ids: string[]`; `admin=true` bypasses location scope. Each API declares allowed roles and verifies location scope before query/mutation. Admin assigns claims through a privileged administration process and writes a mirrored user profile for UI display. Token refresh is required after claim change. Segregation of duties: requester cannot approve own PO/transfer above configurable limit; finance cost correction needs reason and second approval. Service accounts have no UI role claims.

## 11. Firestore security rules

The deployed rule intentionally denies every browser read/write. All access flows through JWT-secured Cloud Run APIs. This prevents clients bypassing validation, balance transactions, approvals or audit logs. IAM grants the runtime service account `roles/datastore.user`; humans do not receive Firestore data-plane write roles. Index definitions are in `firestore.indexes.json`.

## 12. Looker Studio dashboard design

Pages: Executive overview; stock/aging; procurement/rate variance; transfers/logistics; forecast/replenishment; alerts/SLA; cost per serving. Global controls: date, location hierarchy, item/category, supplier, route/mode. KPI cards and charts use the required views; row access uses authorized viewer email mapping or separate location-scoped data sources. Refresh follows exported snapshot SLA, not operational Firestore reads.

## 13. Sample seed data

See [inventory-seed.json](../infrastructure/inventory-seed.json). It uses deliberately generic example locations and draft rates. Import is environment-explicit and idempotent. Production deployment must replace address, capacity, demand, routes, modes, tariffs, thresholds and notification recipients through admin approval.

## 14. Sample requests/responses

```http
POST /api/stock/receipt
Idempotency-Key: grn-example-0001
Authorization: Bearer <token>
{"itemId":"rice","locationId":"warehouse_example_01","quantity":1000,"unit":"KG","costPerUnit":52,"landedCostPerUnit":54.3,"referenceId":"grn_0001","referenceType":"GRN","batchNumber":"RICE-2609","expiryDate":"2027-03-01"}
```

```json
{"transactionId":"...","balanceId":"warehouse_example_01_rice_RICE-2609","previousStock":0,"newStock":1000,"availableStock":1000,"stockAvailabilityPercent":100,"alertColor":"GREEN"}
```

```http
PUT /api/stock-transfers/transfer_01/receive
{"items":[{"itemId":"rice","receivedQuantity":248}],"actualTransportCost":14800}
```

## 15. Transportation costing examples

Formula example: 2 chargeable tons x 500 km x configured 3 currency/ton-km = 3,000, then add configured loading/unloading/terminal/handling, insurance and tax, with the minimum charge applied first. Manual-reference example uses carrier receipt freight as base and adds documented charges. Estimate and actual remain separate; actual approved receipt is allocated to landed/distribution cost by quantity, weight, volume, value or approved manual allocation.

## 16. Forecast examples

At 10 units/day, 100 available units give 10 coverage days. With average lead 5 days, max use 15/day, max lead 7 days: safety stock is 55 and reorder point is 105. For target 300 and 20 in transit, recommended quantity is `300-100-20+50=230`. Every run stores inputs, method, model/formula versions and override reason.

## 17. Alert examples

With threshold base 1,000 and 240 available, availability is 24%, which matches the active rule's Red band and produces `STOCKOUT_RISK` with recommendation 760. A supplier rate move from 50 to 56 is 12%; if the active price threshold is 10%, the pending rate creates both a price-variance record and unified `PRICE_VARIANCE` inventory alert. It does not become PO-active without the configured approval/auto-apply rule.

## 18. GCP deployment steps

1. Create separate project/dataset/bucket per environment; enable Run, Build, Artifact Registry, Firestore, Storage, Secret Manager, Scheduler, Tasks/Pub/Sub, BigQuery and Firebase Auth.
2. Create Firestore in the selected region; deploy rules/indexes; import reviewed seed configuration.
3. Create private document bucket with public-access prevention, retention/lifecycle and CORS limited to signed flows.
4. Apply BigQuery DDL after replacing project ID; configure CDC/export job with idempotent event IDs.
5. Create runtime/build/job service accounts and least-privilege IAM; add provider secrets as versioned secrets.
6. Build immutable container, scan it, deploy staging with min instances as needed, health/readiness and structured logging.
7. Configure Firebase providers/domains/claims; create Scheduler/Tasks jobs for alerts, escalation, forecast, snapshots and reconciliation.
8. Run smoke/load/restore tests, approve, promote the same image digest to production; attach domain/LB/WAF and alerts/budgets.

## 19. Testing checklist

- Unit: conversions, demand, freight, allocation, WAC, threshold boundaries, forecast, effective dates.
- Transaction: simultaneous issue/transfer, idempotency, insufficient/negative stock, partial receipt, variance approval, FEFO, expiry.
- Security: every role/location matrix, forged/expired token, direct Firestore denial, object URL expiry, audit immutability.
- Workflow: plan -> PO -> shipment -> GRN -> landed cost -> transfer -> dispatch -> receipt -> production issue -> close.
- Reliability: outbox retry/duplicate, feed timeout/malformed rate, notification failure/escalation, analytics reconciliation.
- Non-functional: peak load, accessibility/mobile, backup restore, disaster recovery, rollback, dependency/container scan.

## 20. Production readiness checklist

- Real masters/rates/routes/formulas reviewed; illustrative seed removed or marked inactive.
- UOM conversions, opening balances and batch/expiry counts independently reconciled and signed off.
- Firebase roles/location claims and segregation-of-duties matrix approved; break-glass account tested.
- FSSAI traceability/recall, GRN quality, expiry/FEFO, wastage and document retention SOPs approved.
- No client Firestore access; least privilege, secret rotation, audit retention, encryption and data classification verified.
- Backups/PITR/export, RPO/RTO restore drill, alert escalation/on-call and reconciliation jobs proven.
- Supplier feed contracts, rate approval limits, freight allocation and finance period-close rules signed off.
- Load/security/UAT passed; dashboards reconciled to ledger; budgets/SLOs/log-based alerts active.
- Pilot begins with controlled locations/items and dual-running stock counts before wider rollout.
