# Razorpay payment setup

LunchBox uses a server-created Razorpay Order, hosted Razorpay Checkout, server-side payment verification, and signed webhooks. Card and UPI credentials never pass through or persist in LunchBox.

## 1. Create credentials

In the Razorpay Dashboard, start in **Test Mode** and create an API key. Keep the Key ID and Key Secret private. Create a separate strong webhook secret; do not reuse the API Key Secret.

The application needs these runtime variables:

- `RAZORPAY_KEY_ID`
- `RAZORPAY_KEY_SECRET`
- `RAZORPAY_WEBHOOK_SECRET`
- `RAZORPAY_API_TIMEOUT_MS=8000`
- `ENABLE_PAYMENTS=true`
- `PAYMENT_HOLD_MINUTES=15`
- `PAYMENT_EXPIRY_TASK_SECRET`

Only the Key ID is sent to hosted Checkout. Every secret remains server-side.

## 2. Store secrets in Google Secret Manager

Run these commands interactively from a trusted terminal. They read values without placing them in shell history. Create each secret once; for rotation, add a new secret version instead.

```bash
read -rsp "Razorpay key ID: " VALUE && printf %s "$VALUE" | gcloud secrets create razorpay-key-id --data-file=- --replication-policy=automatic --project=chennaifood
read -rsp "Razorpay key secret: " VALUE && printf %s "$VALUE" | gcloud secrets create razorpay-key-secret --data-file=- --replication-policy=automatic --project=chennaifood
read -rsp "Razorpay webhook secret: " VALUE && printf %s "$VALUE" | gcloud secrets create razorpay-webhook-secret --data-file=- --replication-policy=automatic --project=chennaifood
read -rsp "Payment expiry task secret: " VALUE && printf %s "$VALUE" | gcloud secrets create payment-expiry-task-secret --data-file=- --replication-policy=automatic --project=chennaifood
unset VALUE
```

Grant the Cloud Run service account `roles/secretmanager.secretAccessor` on only these four secrets. Then bind them during deployment:

```bash
gcloud run deploy lunchbox \
  --source . \
  --project chennaifood \
  --region asia-south1 \
  --allow-unauthenticated \
  --set-secrets=RAZORPAY_KEY_ID=razorpay-key-id:latest,RAZORPAY_KEY_SECRET=razorpay-key-secret:latest,RAZORPAY_WEBHOOK_SECRET=razorpay-webhook-secret:latest,PAYMENT_EXPIRY_TASK_SECRET=payment-expiry-task-secret:latest \
  --update-env-vars=ENABLE_PAYMENTS=true,PAYMENT_HOLD_MINUTES=15,RAZORPAY_API_TIMEOUT_MS=8000
```

Do not use `--set-env-vars` for secret values. Do not add them to `.env.example`, GitHub Actions variables, build arguments, or browser-prefixed variables.

## 3. Configure the webhook

Create a Razorpay webhook with this exact production URL:

```text
https://lunchbox-827633400219.asia-south1.run.app/api/webhooks/razorpay
```

Subscribe to:

- `payment.captured`
- `order.paid`
- `refund.created`
- `refund.processed`
- `refund.failed`

Use the same value stored in `razorpay-webhook-secret` as the Dashboard webhook secret. The endpoint uses the exact raw request body for HMAC validation and rejects unsigned requests.

## 4. Expire abandoned payment holds

Deploy `infrastructure/firestore.indexes.json`, then configure Cloud Scheduler to call `POST /api/tasks/expire-payments` every minute with `X-Task-Secret`. This releases pending meal capacity after `PAYMENT_HOLD_MINUTES`.

## 5. Test before live mode

1. Confirm `/api/health?ready=1` returns HTTP 200 and `checks.payments=true`.
2. Sign in as a parent, create a low-value test order, and complete it with Razorpay Test Mode credentials.
3. Confirm the order becomes `CONFIRMED` and `payment_status` becomes `CAPTURED`.
4. Confirm a `payment_events` record exists and the webhook reports HTTP 200 in the Razorpay Dashboard.
5. Confirm a duplicate verification or webhook delivery does not consume capacity twice.
6. Test an abandoned order and verify the scheduler releases its capacity.
7. Test an eligible full refund from the authenticated admin payments screen.

After all checks pass, complete Razorpay KYC/activation, create Live Mode credentials, add them as new Secret Manager versions, configure the same webhook in Live Mode, and deploy a new revision. Never mix Test and Live credentials.

## Rollback

Disable new checkout immediately without deleting payment records or secrets:

```bash
gcloud run services update lunchbox --project chennaifood --region asia-south1 --update-env-vars=ENABLE_PAYMENTS=false
```

Already-received signed webhooks remain safe to process, preserving the final state of in-flight payments.
