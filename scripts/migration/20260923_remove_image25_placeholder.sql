-- PostgreSQL deployment correction for an example name accidentally published
-- as a real model. Exact matches only; valid suffixes and history are retained.
BEGIN;
SET LOCAL lock_timeout = '5s';
SET LOCAL statement_timeout = '30s';

UPDATE channels AS c
SET models = COALESCE((
  SELECT string_agg(name, ',' ORDER BY position)
  FROM unnest(string_to_array(c.models, ',')) WITH ORDINALITY AS entries(name, position)
  WHERE btrim(name) <> 'gpt-image-2.5-x'
), '')
WHERE 'gpt-image-2.5-x' = ANY(string_to_array(replace(models, ' ', ''), ','));

DELETE FROM abilities WHERE model = 'gpt-image-2.5-x';
DELETE FROM models WHERE model_name = 'gpt-image-2.5-x';

UPDATE options
SET value = (value::jsonb - 'gpt-image-2.5-x')::text
WHERE key = 'ModelPrice' AND value::jsonb ? 'gpt-image-2.5-x';

UPDATE tokens AS t
SET model_limits = COALESCE((
  SELECT string_agg(name, ',' ORDER BY position)
  FROM unnest(string_to_array(t.model_limits, ',')) WITH ORDINALITY AS entries(name, position)
  WHERE btrim(name) <> 'gpt-image-2.5-x'
), '')
WHERE 'gpt-image-2.5-x' = ANY(string_to_array(replace(model_limits, ' ', ''), ','));

COMMIT;
