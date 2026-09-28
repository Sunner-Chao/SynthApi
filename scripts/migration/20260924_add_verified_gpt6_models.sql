-- PostgreSQL operational migration; exact per-credential catalog matches.
BEGIN;
SET LOCAL lock_timeout = '5s';
SET LOCAL statement_timeout = '30s';
SELECT pg_advisory_xact_lock(hashtext('synthapi-add-gpt6-20260924'));
CREATE TEMP TABLE target_channels (
 id bigint PRIMARY KEY, base_url text, old_models text, old_group text,
 key_fingerprint text, add_models text[]
) ON COMMIT DROP;
INSERT INTO target_channels VALUES
(26,'https://api.apimart.ai','flux-2-flex,flux-2-max,flux-2-pro,flux-kontext-max,flux-kontext-pro,gemini-2.5-flash-image-preview,gemini-3-pro-image-preview,gemini-3.1-flash-image-preview,gemini-3.1-flash-lite-image,gpt-image-2,gpt-image-2-ext,gpt-image-2-official,grok-imagine-1.5-apimart,grok-imagine-2.0-ext,grok-imagine-image,grok-imagine-image-2.0,grok-imagine-image-quality,imagen-4.0-apimart,qwen-image-2.0,qwen-image-2.0-pro,qwen-image-3.0,qwen-image-3.0-pro,seedream-4.0,seedream-4.5,seedream-5-0-lite,seedream-5-0-pro,wan2.7-image,wan2.7-image-pro,z-image-turbo,minimax-h3,minimax-h3-context-ir,minimax-h3-regeneration,minimax-hailuo-02,minimax-hailuo-2.3,minimax-hailuo-2.3-fast,omni-flash-ext,sora-2,veo3.1-fast,veo3.1-quality,flux-3-video,gemini-omni-flash-preview,grok-imagine-1.5-video-apimart,grok-imagine-video,grok-imagine-video-1.5,happyhorse-1.0,happyhorse-1.1,kling-3.0-turbo,kling-v2-6,kling-v2-6-motion-control,kling-v3,kling-v3-motion-control,kling-v3-omni,kling-video-o1,pixverse-v6,seedance-1-0-pro-fast,seedance-1-0-pro-quality,seedance-1-5-pro,seedance-2.0,seedance-2.0-face,seedance-2.0-fast,seedance-2.0-fast-face,seedance-2.0-mini,seedance-2.5,skyreels-v4-fast,skyreels-v4-std,sora-2-preview,sora-2-pro,veo3.1-fast-official,veo3.1-lite,veo3.1-quality-official,viduq3,viduq3-mix,viduq3-pro,viduq3-turbo,wan2.5-preview,wan2.6,wan2.6-i2v,wan2.6-i2v-flash,wan2.7,wan2.7-r2v,wan2.7-videoedit,wan3.0-video,gpt-image-2.5-sunburst,gpt-image-2.5-ext,gpt-image-2.5-flare','视频模型聚合,图像模型聚合(可自定义图像参数)','9999cecde6483e2f66b924a7dadfba4f',ARRAY['gpt-6-luna','gpt-6-sol']),
(72,'https://api.kk9.in','gpt-5.4,gpt-5.5,gpt-5.4-mini,gpt-5.4-openai-compact,gpt-5.5-openai-compact,gpt-5.6-sol,gpt-5.6-terra,gpt-5.6-luna,codex-auto-review,gpt-6-astra','Plus线路三','72bde24ada9eb280373b4c67bf5f1aea',ARRAY['gpt-6-sol']),
(694,'https://api.kk9.in','gpt-5.6-terra,gpt-5.6-sol,gpt-5.4,gpt-5.5,gpt-5.4-mini,gpt-5.4-openai-compact,gpt-5.5-openai-compact,gpt-5.6-luna,codex-auto-review','Pro20倍兜底','8f585824e256038d2fed620668a2a6b8',ARRAY['gpt-6-sol']),
(699,'https://api.kk9.in','gpt-5.6-terra,gpt-5.6-sol,gpt-5.4,gpt-5.5,gpt-5.4-mini,gpt-5.4-openai-compact,gpt-5.5-openai-compact,gpt-5.6-luna,codex-auto-review,gpt-6-astra','Plus正价,Pro常规,Plus线路四','f8f33ae1fc8cc8cb80f63e4544a1e0f5',ARRAY['gpt-6-sol']),
(706,'https://yujianwudi.top','gpt-5.6-sol,gpt-5.4,gpt-5.5,gpt-5.4-mini,gpt-5.4-openai-compact,gpt-5.5-openai-compact,gpt-5.6-terra,gpt-5.6-luna,codex-auto-review,gpt-6-astra','Pro20倍兜底','5daf7a7e4973025fc5660e7d8bb27b5c',ARRAY['gpt-6-luna','gpt-6-sol']),
(711,'https://codexauv.com','gpt-5.5,gpt-5.6-sol,gpt-5.6-terra,gpt-5.6-luna,gpt-5.5-openai-compact,gpt-5.4-openai-compact,codex-auto-review,gpt-6-astra','Plus线路一','22616acb17c14a8f0abee5bf26e50861',ARRAY['gpt-6-sol']),
(720,'https://ai.xem8k5.top','gpt-5.5,gpt-5.5-openai-compact,gpt-5.4-openai-compact,gpt-5.6-terra,gpt-5.6-luna,gpt-5.6-sol,codex-auto-review,gpt-5.4,gpt-5.4-mini,gpt-6-astra','Plus线路四','b670d0989042baee0a1547e407fa5140',ARRAY['gpt-6-luna','gpt-6-sol']),
(724,'https://tntapi.com','gpt-5.5,gpt-5.6-terra,gpt-5.6-sol,gpt-5.4,gpt-5.4-mini,gpt-5.4-openai-compact,gpt-5.5-openai-compact,gpt-5.6-luna,codex-auto-review,gpt-6-astra','Plus特价,Plus线路一','4fe1180c84f6400e91f5eccccff1ba06',ARRAY['gpt-6-sol']),
(725,'https://tntapi.com','gpt-5.6-terra,gpt-5.6-sol,gpt-5.4,gpt-5.5,gpt-5.4-mini,gpt-5.4-openai-compact,gpt-5.5-openai-compact,gpt-5.6-luna,codex-auto-review,gpt-6-astra','Plus线路一','12eebb4db5fcebcf850467e61570abb2',ARRAY['gpt-6-sol']),
(726,'https://tntapi.com','gpt-5.6-terra,gpt-5.6-sol,gpt-5.4,gpt-5.5,gpt-5.4-mini,gpt-5.4-openai-compact,gpt-5.5-openai-compact,gpt-5.6-luna,codex-auto-review,gpt-6-astra','Pro常规','556263fc2aa7abc9939a7625bc0a55d6',ARRAY['gpt-6-sol']),
(727,'https://tntapi.com','gpt-5.6-terra,gpt-5.6-sol,gpt-5.4,gpt-5.5,gpt-5.4-mini,gpt-5.4-openai-compact,gpt-5.5-openai-compact,gpt-5.6-luna,codex-auto-review,gpt-6-astra','Pro20倍兜底','373181cdaecca83c46b2b94f550f71ca',ARRAY['gpt-6-sol']),
(730,'https://tntapi.com','gpt-5.5,gpt-5.6-terra,gpt-5.6-sol,gpt-5.4,gpt-5.4-mini,gpt-5.4-openai-compact,gpt-5.5-openai-compact,gpt-5.6-luna,codex-auto-review,gpt-6-astra','Pro企业级','3a90479816902f494453bbcdb1d5e446',ARRAY['gpt-6-sol']),
(731,'https://codexauv.com','gpt-5.6-terra,gpt-5.6-sol,gpt-5.4,gpt-5.5,gpt-5.4-mini,gpt-5.4-openai-compact,gpt-5.5-openai-compact,gpt-5.6-luna,codex-auto-review,gpt-6-astra','Plus正价,Pro常规','1500c1a0c956a1bcb6761cd2ece41daa',ARRAY['gpt-6-sol']),
(732,'https://cn.dialoguedui.com','gpt-5.5,gpt-5.6-luna,gpt-5.6-sol,gpt-5.6-terra,codex-auto-review','Plus线路一','e9d2244a30122ce484fbc688ece6a22d',ARRAY['gpt-6-sol']),
(739,'https://www.codexauv.com','gpt-5.5,gpt-5.6-sol,gpt-5.6-terra,gpt-5.6-luna,gpt-5.5-openai-compact,gpt-5.4-openai-compact,codex-auto-review,gpt-6-astra','Plus线路一','eeedc1249f4781a5b72536b150d213e4',ARRAY['gpt-6-sol']),
(741,'https://codexauv.com','gpt-5.6-terra,gpt-5.6-sol,gpt-5.4,gpt-5.5,gpt-5.4-mini,gpt-5.4-openai-compact,gpt-5.5-openai-compact,gpt-5.6-luna,codex-auto-review,gpt-6-astra','Plus正价,Pro常规','1cba055a6c649c2db31c451a2eecaf3c',ARRAY['gpt-6-sol']),
(742,'https://tntapi.com','gpt-5.5,gpt-5.6-terra,gpt-5.6-sol,gpt-5.4,gpt-5.4-mini,gpt-5.4-openai-compact,gpt-5.5-openai-compact,gpt-5.6-luna,codex-auto-review,gpt-6-astra','Pro企业级','3a90479816902f494453bbcdb1d5e446',ARRAY['gpt-6-sol']),
(747,'https://api.kk9.in','gpt-5.4,gpt-5.5,gpt-5.4-mini,gpt-5.4-openai-compact,gpt-5.5-openai-compact,gpt-5.6-sol,gpt-5.6-terra,gpt-5.6-luna,codex-auto-review,gpt-6-astra','Plus正价,Pro常规','b32544c884a8dc1f345543b001d4db9d',ARRAY['gpt-6-sol']);
DO $guard$
BEGIN
 PERFORM c.id FROM channels c JOIN target_channels t USING(id) FOR UPDATE OF c;
 IF (SELECT count(*) FROM channels c JOIN target_channels t USING(id)) <> 18 THEN
  RAISE EXCEPTION 'Expected 18 verified source channels';
 END IF;
 IF EXISTS (
  SELECT 1 FROM channels c JOIN target_channels t USING(id)
  WHERE c.base_url IS DISTINCT FROM t.base_url OR c."group" IS DISTINCT FROM t.old_group
     OR md5(c.key) IS DISTINCT FROM t.key_fingerprint
     OR c.type <> 1
     OR EXISTS (SELECT 1 FROM unnest(t.add_models) m WHERE coalesce(nullif(c.model_mapping,'')::jsonb->>m,m) <> m)
     OR (c.models IS DISTINCT FROM t.old_models AND c.models IS DISTINCT FROM
       t.old_models || ',' || array_to_string(t.add_models, ','))
 ) THEN RAISE EXCEPTION 'Channel configuration changed since catalog verification'; END IF;
END $guard$;

-- Append exact upstream names; retain channel status, groups, priorities and prices.
UPDATE channels c SET models = concat_ws(',', nullif(c.models,''),
 (SELECT string_agg(m,',' ORDER BY n) FROM unnest(t.add_models) WITH ORDINALITY a(m,n)
  WHERE NOT EXISTS (SELECT 1 FROM unnest(string_to_array(c.models,',')) old(m0) WHERE btrim(m0)=m)))
FROM target_channels t WHERE c.id=t.id AND c.id<>26
 AND EXISTS (SELECT 1 FROM unnest(t.add_models) m WHERE NOT EXISTS
   (SELECT 1 FROM unnest(string_to_array(c.models,',')) old(m0) WHERE btrim(m0)=m));

-- APIMart source channel 26 belongs to image/video groups. Its text models
-- use a separate channel in the existing Pro group with the same 0.07 ratio.
INSERT INTO channels (
 type,key,open_ai_organization,test_model,status,name,weight,created_time,
 base_url,other,models,"group",model_mapping,status_code_mapping,priority,
 auto_ban,tag,setting,param_override,header_override,remark,channel_info,settings
)
SELECT c.type,c.key,c.open_ai_organization,'gpt-6-sol',c.status,'APIMart 文本模型',
 c.weight,extract(epoch FROM now())::bigint,c.base_url,c.other,
 'gpt-6-luna,gpt-6-sol','Pro常规',NULL,c.status_code_mapping,c.priority,c.auto_ban,
 c.tag,c.setting,c.param_override,c.header_override,
 '2026-09-24: verified gpt-6-luna / gpt-6-sol; API credentials from channel 26; text routing only.',
 c.channel_info,c.settings
FROM channels c WHERE c.id=26 AND NOT EXISTS (
 SELECT 1 FROM channels x WHERE x.name='APIMart 文本模型' AND x.base_url=c.base_url
);
DO $clone$
BEGIN
 IF (SELECT count(*) FROM channels c JOIN channels src ON src.id=26
     WHERE c.name='APIMart 文本模型' AND c.base_url=src.base_url
       AND c.key=src.key AND c.type=1 AND c.models='gpt-6-luna,gpt-6-sol'
       AND c."group"='Pro常规') <> 1 THEN
  RAISE EXCEPTION 'APIMart text channel identity mismatch';
 END IF;
END $clone$;

CREATE TEMP TABLE expected_abilities ON COMMIT DROP AS
SELECT DISTINCT btrim(g) AS "group",m AS model,c.id AS channel_id,
 c.status=1 AS enabled,c.priority,coalesce(c.weight,0) AS weight,c.tag
FROM channels c JOIN target_channels t USING(id)
CROSS JOIN LATERAL unnest(string_to_array(c."group",',')) g
CROSS JOIN LATERAL unnest(t.add_models) m
WHERE c.id<>26 AND btrim(g)<>''
UNION
SELECT c."group",m,c.id,c.status=1,c.priority,coalesce(c.weight,0),c.tag
FROM channels c CROSS JOIN LATERAL unnest(ARRAY['gpt-6-luna','gpt-6-sol']) m
WHERE c.name='APIMart 文本模型' AND c.base_url=(SELECT base_url FROM channels WHERE id=26);
INSERT INTO abilities ("group",model,channel_id,enabled,priority,weight,tag)
SELECT "group",model,channel_id,enabled,priority,weight,tag FROM expected_abilities
ON CONFLICT ("group",model,channel_id) DO UPDATE SET
 enabled=excluded.enabled,priority=excluded.priority,weight=excluded.weight,tag=excluded.tag
WHERE (abilities.enabled,abilities.priority,abilities.weight,abilities.tag)
 IS DISTINCT FROM (excluded.enabled,excluded.priority,excluded.weight,excluded.tag);
DO $verify$
BEGIN
 IF EXISTS (SELECT * FROM expected_abilities EXCEPT
    SELECT "group",model,channel_id,enabled,priority,weight,tag FROM abilities) THEN
  RAISE EXCEPTION 'Missing model routing abilities';
 END IF;
 IF EXISTS (SELECT 1 FROM abilities WHERE model IN ('gpt-6-luna','gpt-6-sol')
    AND ("group" LIKE '%图像%' OR "group" LIKE '%视频%')) THEN
  RAISE EXCEPTION 'Text model leaked into media groups';
 END IF;
END $verify$;
SELECT model,count(DISTINCT channel_id) AS channels,
 count(DISTINCT channel_id) FILTER(WHERE enabled) AS enabled_channels,
 count(*) AS group_routes FROM expected_abilities GROUP BY model ORDER BY model;

COMMIT;
