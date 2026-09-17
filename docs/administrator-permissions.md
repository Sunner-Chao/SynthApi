# Administrator permissions

Both administrator role IDs (`10` and `100`) have the same management capabilities.
The role IDs remain distinct for account identity, existing sessions, and protection
of the bootstrap root account. No database role conversion is required.

- `AdminAuth` and the compatibility middleware `RootAuth` allow both roles.
- Both roles can use settings, OAuth provider management, performance management,
  ratio synchronization, channel management, and user management (including peers).
- Channel key retrieval still requires secure verification and rate limiting.
- The root account cannot be disabled, deleted, or demoted by either role. Creating
  another root account remains unavailable to both roles.
- Ordinary users remain excluded from all administration APIs. Public-host route
  restrictions remain independent of administrator permissions.
- Both frontend themes ignore old per-user sidebar overlays for administrators;
  global sidebar configuration still applies.

## Avoiding incidental credential requests

Key reads happen when a user explicitly views, copies, or uses a credential.
Hovering, focusing the copy button, or opening the row menu must not fetch keys.
Single and batch token key reads share a dedicated per-user limit using the existing
critical-operation budget, separate from IP-based login/reset limits.

HTTP failures are reported once per error instance. Rate limits have a localized
message instead of an additional generic unexpected-error toast. Authentication,
backend authorization, and secure verification remain enforced on the server.

## Regression coverage

Go tests cover signed sessions with roles 0/1/10/100, invalid roles, missing and
mismatched identity headers, ordinary-user isolation, secure verification, user
creation, peer promotion/demotion, root protection, and independent key-read limits.
Frontend tests cover error messages and duplicate notification suppression. Browser
acceptance should cover both administrator roles on subscriptions/settings/users,
and assert that hover/menu interactions send no key requests. Simulate a 429 locally
in the browser to verify the message without consuming production rate-limit budgets.
