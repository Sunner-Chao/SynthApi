BEGIN;

DO $migration$
DECLARE
  video_group text := '视频模型聚合';
  video_models text := 'minimax-h3,minimax-h3-context-ir,minimax-h3-regeneration,minimax-hailuo-02,minimax-hailuo-2.3,minimax-hailuo-2.3-fast,omni-flash-ext,sora-2,veo3.1-fast,veo3.1-quality,flux-3-video,gemini-omni-flash-preview,grok-imagine-1.5-video-apimart,grok-imagine-video,grok-imagine-video-1.5,happyhorse-1.0,happyhorse-1.1,kling-3.0-turbo,kling-v2-6,kling-v2-6-motion-control,kling-v3,kling-v3-motion-control,kling-v3-omni,kling-video-o1,pixverse-v6,seedance-1-0-pro-fast,seedance-1-0-pro-quality,seedance-1-5-pro,seedance-2.0,seedance-2.0-face,seedance-2.0-fast,seedance-2.0-fast-face,seedance-2.0-mini,seedance-2.5,skyreels-v4-fast,skyreels-v4-std,sora-2-preview,sora-2-pro,veo3.1-fast-official,veo3.1-lite,veo3.1-quality-official,viduq3,viduq3-mix,viduq3-pro,viduq3-turbo,wan2.5-preview,wan2.6,wan2.6-i2v,wan2.6-i2v-flash,wan2.7,wan2.7-r2v,wan2.7-videoedit,wan3.0-video';
BEGIN
  IF (SELECT count(*) FROM channels WHERE id = 26 AND base_url = 'https://api.apimart.ai') <> 1 THEN
    RAISE EXCEPTION 'APIMart channel #26 was not found';
  END IF;

  UPDATE channels
  SET "group" = CASE
        WHEN position(',' || video_group || ',' IN ',' || coalesce("group", '') || ',') > 0 THEN "group"
        ELSE concat_ws(',', nullif(trim(both ',' FROM coalesce("group", '')), ''), video_group)
      END,
      models = CASE
        WHEN position(',minimax-h3,' IN ',' || coalesce(models, '') || ',') > 0 THEN models
        ELSE concat_ws(',', nullif(trim(both ',' FROM coalesce(models, '')), ''), video_models)
      END
  WHERE id = 26 AND base_url = 'https://api.apimart.ai';

  UPDATE options
  SET value = (value::jsonb || jsonb_build_object(video_group, 0.07))::text
  WHERE key = 'GroupRatio';

  UPDATE options
  SET value = (value::jsonb || jsonb_build_object(
    video_group,
    '视频模型聚合 · 文生视频、图生视频与异步任务查询'
  ))::text
  WHERE key = 'UserUsableGroups';

  UPDATE options
  SET value = (value::jsonb || $prices${
    "minimax-h3": 1.502229,
    "minimax-h3-context-ir": 1.314286,
    "minimax-h3-regeneration": 0.563829,
    "minimax-hailuo-02": 1.314286,
    "minimax-hailuo-2.3": 0.801714,
    "minimax-hailuo-2.3-fast": 0.407429,
    "omni-flash-ext": 5.75,
    "sora-2": 1.314286,
    "veo3.1-fast": 2.3,
    "veo3.1-quality": 16.428571,
    "flux-3-video": 2.234286,
    "gemini-omni-flash-preview": 1.445714,
    "grok-imagine-1.5-video-apimart": 0.167571,
    "grok-imagine-video": 0.657143,
    "grok-imagine-video-1.5": 1.051429,
    "happyhorse-1.0": 3.778571,
    "happyhorse-1.1": 2.825714,
    "kling-3.0-turbo": 2.352571,
    "kling-v2-6": 0.604571,
    "kling-v2-6-motion-control": 0.9384,
    "kling-v3": 1.104,
    "kling-v3-motion-control": 1.690171,
    "kling-v3-omni": 1.104,
    "kling-video-o1": 1.104,
    "pixverse-v6": 0.394286,
    "seedance-1-0-pro-fast": 0.683429,
    "seedance-1-0-pro-quality": 1.708571,
    "seedance-1-5-pro": 1.774286,
    "seedance-2.0": 5.822286,
    "seedance-2.0-face": 8.214286,
    "seedance-2.0-fast": 0.654514,
    "seedance-2.0-fast-face": 1.314286,
    "seedance-2.0-mini": 0.173486,
    "seedance-2.5": 3.548571,
    "skyreels-v4-fast": 3.614286,
    "skyreels-v4-std": 4.6,
    "sora-2-preview": 1.314286,
    "sora-2-pro": 9.857143,
    "veo3.1-fast-official": 1.314286,
    "veo3.1-lite": 1.15,
    "veo3.1-quality-official": 2.628571,
    "viduq3": 1.314286,
    "viduq3-mix": 1.642857,
    "viduq3-pro": 2.102857,
    "viduq3-turbo": 0.92,
    "wan2.5-preview": 1.800571,
    "wan2.6": 0.821429,
    "wan2.6-i2v": 1.800571,
    "wan2.6-i2v-flash": 0.46,
    "wan2.7": 1.090857,
    "wan2.7-r2v": 1.090857,
    "wan2.7-videoedit": 1.090857,
    "wan3.0-video": 2.25308
  }$prices$::jsonb)::text
  WHERE key = 'ModelPrice';

  INSERT INTO abilities ("group", model, channel_id, enabled, priority, weight)
  SELECT video_group, lower(model_name), 26, true, 0, 0
  FROM unnest(string_to_array(video_models, ',')) AS model_name
  ON CONFLICT ("group", model, channel_id) DO UPDATE
    SET enabled = EXCLUDED.enabled, priority = EXCLUDED.priority, weight = EXCLUDED.weight;
END
$migration$;

COMMIT;
