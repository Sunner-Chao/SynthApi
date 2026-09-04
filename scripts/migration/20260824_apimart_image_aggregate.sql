BEGIN;

DO $migration$
DECLARE
  old_group text := 'gpt-image-2(可自定义图像参数)';
  new_group text := '图像模型聚合(可自定义图像参数)';
  image_models text := 'flux-2-flex,flux-2-max,flux-2-pro,flux-kontext-max,flux-kontext-pro,gemini-2.5-flash-image-preview,gemini-3-pro-image-preview,gemini-3.1-flash-image-preview,gemini-3.1-flash-lite-image,gpt-image-2,gpt-image-2-ext,gpt-image-2-official,grok-imagine-1.5-apimart,grok-imagine-2.0-ext,grok-imagine-image,grok-imagine-image-2.0,grok-imagine-image-quality,imagen-4.0-apimart,qwen-image-2.0,qwen-image-2.0-pro,qwen-image-3.0,qwen-image-3.0-pro,seedream-4.0,seedream-4.5,seedream-5-0-lite,seedream-5-0-pro,wan2.7-image,wan2.7-image-pro,z-image-turbo';
BEGIN
  IF (SELECT count(*) FROM channels WHERE id = 26 AND base_url = 'https://api.apimart.ai') <> 1 THEN
    RAISE EXCEPTION 'APIMart image channel #26 was not found';
  END IF;

  UPDATE channels
  SET name = 'APIMart 图像模型聚合',
      "group" = new_group,
      models = image_models
  WHERE id = 26 AND base_url = 'https://api.apimart.ai';

  UPDATE tokens SET "group" = new_group WHERE "group" = old_group;
  UPDATE tokens
  SET auto_groups = replace(auto_groups, old_group, new_group)
  WHERE auto_groups LIKE '%' || old_group || '%';

  UPDATE options
  SET value = ((value::jsonb - old_group) || jsonb_build_object(new_group, 0.07))::text
  WHERE key = 'GroupRatio';

  UPDATE options
  SET value = ((value::jsonb - old_group) || jsonb_build_object(
    new_group,
    'APIMart 图像聚合 · 模型参数与价格随所选模型动态展示'
  ))::text
  WHERE key = 'UserUsableGroups';

  UPDATE options
  SET value = (value::jsonb || $prices${
    "flux-2-flex": 1.314285714,
    "flux-2-max": 1.314285714,
    "flux-2-pro": 0.591428571,
    "flux-kontext-max": 1.051428571,
    "flux-kontext-pro": 0.525714286,
    "gemini-2.5-flash-image-preview": 0.205357143,
    "gemini-3-pro-image-preview": 0.492857143,
    "gemini-3.1-flash-image-preview": 0.246428571,
    "gemini-3.1-flash-lite-image": 0.552,
    "gpt-image-2": 0.136986,
    "gpt-image-2-ext": 0.139642857,
    "gpt-image-2-official": 0.078725714,
    "grok-imagine-1.5-apimart": 0.246428571,
    "grok-imagine-2.0-ext": 1.314285714,
    "grok-imagine-image": 0.262857143,
    "grok-imagine-image-2.0": 0.788571429,
    "grok-imagine-image-quality": 0.657142857,
    "imagen-4.0-apimart": 0.657142857,
    "qwen-image-2.0": 0.328571429,
    "qwen-image-2.0-pro": 0.821428571,
    "qwen-image-3.0": 0.337955429,
    "qwen-image-3.0-pro": 0.469384,
    "seedream-4.0": 0.299,
    "seedream-4.5": 0.374571429,
    "seedream-5-0-lite": 0.374571429,
    "seedream-5-0-pro": 0.739285714,
    "wan2.7-image": 0.450097847,
    "wan2.7-image-pro": 1.125244619,
    "z-image-turbo": 0.164285714
  }$prices$::jsonb)::text
  WHERE key = 'ModelPrice';

  INSERT INTO options (key, value)
  VALUES ('performance_setting.disk_cache_path', '/home/ubuntu/demo/SynthApi/data/cache')
  ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value;

  DELETE FROM abilities WHERE channel_id = 26;
  INSERT INTO abilities ("group", model, channel_id, enabled, priority, weight)
  SELECT new_group, model_name, 26, true, 0, 0
  FROM unnest(string_to_array(image_models, ',')) AS model_name;
END
$migration$;

COMMIT;
