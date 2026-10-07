# Subscription payment repair — 2026-10-07

## Deployed behavior

The original wallet subscription purchase dialog now offers WeChat beside Alipay for CNY plans. WeChat uses the existing SynthPay receipt gateway, opens its hosted cashier (including its unique amount instructions), and activates the selected subscription after a verified callback. It does not credit wallet quota or apply wallet recharge promotions. Existing balance purchase and Alipay profile selection remain intact.

Alipay direct subscriptions previously rolled back during audit creation because an empty Go string was written to PostgreSQL's DATE promotion_day field. Subscription audit rows now omit the empty date, preserve saved PaymentProfile and provider reference, and complete transactionally. The affected paid subscription was restored after verification with Alipay, with its full validity period starting at recovery. Detailed reconciliation evidence remains in the protected deployment backup.

## Callback checks

POST /api/subscription/mpay/pay creates an authenticated plan-specific order. Signed MPay callbacks with the MPSUBUSR prefix go to subscription completion. Validation requires merchant identity, local order number, provider reference, WeChat method, successful status and exact plan amount. Transactional completion and provider-reference validation make repeated callbacks idempotent. Invalid callbacks are rejected. Logs no longer expose signed callback parameter maps.

## Verification

- Shanghai-only TypeScript check passed; targeted ESLint passed with the two pre-existing hooks rules excluded (set-state-in-effect and purity); Prettier passed.
- Focused model/service tests passed: Alipay subscription audit date handling and rollback, WeChat amount/merchant/method validation, repeat callback, one subscription only and no wallet credit.
- Production frontend and Go binary built in isolated /home/ubuntu/demo/SynthApi-subscription-fix-20261007. Shared Shanghai frontend was not changed or deployed.
- Production synthapi.service active and /api/status HTTP 200.
- Public admin HTML matches the release; referenced subscription JS returns HTTP 200.
- One unpaid administrator checkout returned a valid pay.synthapi.asia cashier, HTTP 200, wxpay details and a configured QR. The test order was expired locally. No real payment or fabricated successful callback was sent. Real scan-to-pay acceptance remains a manual user check.
- V5 MP4/DOCX/SRT match reviewed checksums, and public tutorial assets remain accessible. Support knowledge data is independent of the frontend release and untouched.

## Artifacts and rollback

Binary SHA256: 679843d620f3b2aa4ddf817898c6fcc4b4155b61c30fa2e63b1e19dd79c57771

Production binary: /home/ubuntu/demo/SynthApi/synthapi-server-new
Frontend release: /var/www/synthapi-web/releases/20261007-subscription-wechat
Main JS: index.0e124348f0.js
Backups/evidence: /home/ubuntu/demo/SynthApi-build-backups/subscription-wechat-20261007

Rollback binary synthapi-server-new.before has the Alipay subscription fix already deployed (SHA256 4d928bf89fad0cc672383c1f830b308cda2b417d7bbbc9fb0a5a00ecf45ba8bc). Atomically restore it and restart synthapi.service if required. Frontend rollback target: /var/www/synthapi-web/releases/20261006-v5-payment-recovery. Keep persistent /var/www/synthapi-resources and support databases. The current frontend retains previous immutable chunks for already-open browser tabs.
