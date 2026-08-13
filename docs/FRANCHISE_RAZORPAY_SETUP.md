# LunchBox franchise Razorpay production setup

LunchBox creates one Razorpay Payment Link through the Payment Links API only after an administrator moves an application to `APPROVED_FOR_PAYMENT`. Do not create Razorpay Payment Pages and do not pre-create links for the 198 planned franchises.

## Production checklist

1. Activate and complete verification for the LunchBox Razorpay account.
2. Switch the Razorpay Dashboard to **Live Mode**.
3. Open **Account & Settings → API Keys**, create Live API credentials, and store the key ID and key secret in Google Secret Manager. Never paste credentials into this repository.
4. In **Account & Settings → Webhooks**, add `https://<production-domain>/api/webhooks/razorpay`.
5. Subscribe to `payment_link.paid`, `payment_link.expired`, and `payment_link.cancelled`.
6. Create a separate, strong webhook secret and store it in Google Secret Manager.
7. Bind Cloud Run variables `RAZORPAY_KEY_ID`, `RAZORPAY_KEY_SECRET`, and `RAZORPAY_WEBHOOK_SECRET` to those secrets. Do not use `NEXT_PUBLIC_*`.
8. Set `ENABLE_PAYMENTS=true`, `FRANCHISE_PAYMENT_ENABLED=true`, and `FRANCHISE_PAYMENT_AMOUNT_INR=500000` only when Live Mode is ready.

Dashboard **Payment Pages** are unrelated to this integration. API-generated franchise transactions are managed in Razorpay as **Payment Links**.

The amount is server-controlled. The default is ₹5,00,000. If the signed requirement becomes ₹5,00,000 plus applicable tax instead of tax-inclusive, change the configured amount after finance/legal confirmation; the code does not invent tax treatment.

## Safe verification

Use an approved non-production application and Razorpay Test Mode before enabling live franchise payments. Confirm an unapproved application returns HTTP 403, an approved application creates one reusable link, a bad webhook signature returns HTTP 401, and only a correctly signed webhook marks payment paid. Never execute a real ₹5,00,000 charge as an automated test.

## Existing records

Reads support legacy camelCase application and territory documents. New writes use canonical snake_case fields and `FR-XXXXXXXX` document IDs. Migrate old auto-ID applications offline by allocating unique `FR-XXXXXXXX` IDs, writing canonical fields, and retaining the old ID in `legacy_document_id`. Validate counts and references before removing legacy documents; deletion is not part of deployment.
