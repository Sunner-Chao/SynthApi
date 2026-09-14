# Login followed immediately by session expiry

A legacy host-only `session` cookie can coexist with the shared
`Domain=.synthapi.asia` cookie. Chrome sends both cookies, and Go's
`Request.Cookie` reads the first. A successful login previously updated only
the shared cookie; subsequent requests still read the anonymous legacy cookie
and returned 401.

Reproduced on both synthapi.asia and admin.synthapi.asia using an ordinary,
zero-quota test account: login returned 200/success, and /api/user/self returned
401 only when the legacy cookie was present. Clean profiles succeeded.

All successful login methods use setupLogin. That function now expires the
host-only cookie and any cookie explicitly scoped to the current subdomain
before writing the new shared session. Logout performs the same cleanup so
an older local session cannot remain active. Deployments without
SESSION_COOKIE_DOMAIN retain their host-only session behavior. The cleanup
checks the configured domain before modifying cookies.

Validation includes Go tests for cookie expiry order, session decoding, logout,
and deployments without a shared cookie domain. Browser regression checks cover
both domains, clean and legacy-cookie profiles, refresh, navigation between
domains, and logout. Authentication checks and session lifetime are unchanged.

The browser fixture contains only a temporary ordinary account and a signed
Turnstile-verified session; no real user password or session is required. It
reproduces the cookie migration path without automating a real CAPTCHA.
