# Model API request body limits

SynthAPI accepts request bodies up to 256 MiB at Nginx and both Go workers.
Include `scripts/maintenance/nginx/synthapi-model-body-size.conf` at the
SynthAPI IP/public/API/admin server scope and set both `MAX_REQUEST_BODY_MB=256`
and `MODEL_TEXT_REQUEST_BODY_MB=256` in each worker's EnvironmentFile. Nginx
reloads its configuration; Go workers need a rolling restart. SynthPay keeps
its existing limit.

Keep `client_body_buffer_size 1m`, request buffering, the body temporary path,
and the existing concurrency limits. The application already enables disk body
storage above 10 MiB; raising the accepted size does not require allocating a
256 MiB Nginx buffer. The recording proxy spools request bodies above 1 MiB.

On September 24, requests at 08:55 and 08:56 CST contained 79,345,623 bytes
(75.7 MiB) and passed the previous local 100 MiB limits. Channel 72,
`https://api.kk9.in`, returned HTTP 413; the relay propagated that error to the
client. Raising local limits does not change that upstream server's limit.
The upstream operator must increase its limit, or clients must reduce the
payload/use an upstream that accepts it.

Validate with `nginx -t`, live worker environment checks, and an HTTP
`Expect: 100-continue` header probe at exactly 256 MiB and at 256 MiB + 1 byte.
The first should proceed and the second should return 413. No body, credential,
or billable model request needs to be sent for that Nginx boundary check.
