# APIMart GPT Image 2.5

Verified against APIMart's model list and documentation on 2026-09-22:

- `gpt-image-2.5-ext`: retain the full model name; `version` is `flare` (default) or `sunburst`. Uses 1K/2K/4K pricing per delivered image.
- `gpt-image-2.5-flare` and `gpt-image-2.5-sunburst`: retain the full name; support auto/low/medium/high/xhigh/max quality. Final billing uses the upstream task's actual USD `cost` plus 15%.
- All three support at most four outputs and sixteen references. Flare/Sunburst Data URLs are uploaded server-side through `/v1/uploads/images`; upstream credentials are never exposed to the browser. Ext accepts Data URLs directly.
- Both `/v1/images/generations` (API key) and `/pg/images/generations` (workbench session) use the same adapter. OpenAI `response_format: "url"` must never become `output_format: "url"`; the latter accepts png/jpeg/webp only.
- Tasks are persisted before returning the task ID. Poll `/v1/images/generations/{task_id}` or `/v1/tasks/{task_id}` with the same API key. A submitted task is not yet a completed image.

`gpt-image-2.5-x` was a placeholder used to refer to suffix variants, not an
upstream model or a supported SynthAPI alias. Its mistaken catalog, pricing and
adapter entries have been removed. Use the three explicit names above.
Apply `scripts/migration/20260923_remove_image25_placeholder.sql` once per database;
it is idempotent and preserves generation and billing history.

## Pricing configuration

Configure explicit `ModelPrice` entries for all three names. With the existing image group ratio of 0.07, the reservations are:

| Model | ModelPrice (USD before local group multiplier) | Basis |
| --- | ---: | --- |
| gpt-image-2.5-ext | 0.139642857142857 | APIMart 1K cost 0.0085 × 1.15 ÷ 0.07 |
| gpt-image-2.5-flare | 0.173091428571429 | APIMart 1K/medium output estimate 0.010536 × 1.15 ÷ 0.07 |
| gpt-image-2.5-sunburst | 0.173091428571429 | Same token rates as Flare |

The adapter adjusts reservations by resolution/quality and image count. Token-model reservations use square output estimates; auto reserves max quality and explicit pixel sizes reserve the largest tier. Final settlement includes actual input/output at 15% above upstream task cost. Failed tasks are refunded. Workbench prices explicitly describe the output estimate, not a fixed final bill.

References:
- https://docs.apimart.ai/cn/api-reference/images/gpt-image-2.5/generation
- https://docs.apimart.ai/cn/api-reference/images/gpt-image-2.5-ext/generation
- https://docs.apimart.ai/cn/api-reference/uploads/images
- https://api.apimart.ai/api/pricing/model?model=gpt-image-2.5-flare

Build and validate on Shanghai using `scripts/remote-build-shanghai.sh`; production serves Nginx assets through `/var/www/synthapi-web/current`, so both the binary and the static release must be deployed.
