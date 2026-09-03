/*
Copyright (C) 2025 QuantumNous

This program is free software: you can redistribute it and/or modify
it under the terms of the GNU Affero General Public License as
published by the Free Software Foundation, either version 3 of the
License, or (at your option) any later version.

This program is distributed in the hope that it will be useful,
but WITHOUT ANY WARRANTY; without even the implied warranty of
MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE. See the
GNU Affero General Public License for more details.

You should have received a copy of the GNU Affero General Public License
along with this program. If not, see <https://www.gnu.org/licenses/>.

For commercial licensing, please contact support@quantumnous.com
*/
import React, { useState, useEffect, useMemo } from 'react';
import {
  Modal,
  RadioGroup,
  Radio,
  Select,
  Input,
  Toast,
  Typography,
} from '@douyinfe/semi-ui';
import { useTranslation } from 'react-i18next';
import { copy, selectFilter } from '../../../../helpers';

const APP_CONFIGS = {
  claude: {
    label: 'Claude',
    defaultName: 'My Claude',
    modelFields: [
      { key: 'model', label: '主模型' },
      { key: 'haikuModel', label: 'Haiku 模型' },
      { key: 'sonnetModel', label: 'Sonnet 模型' },
      { key: 'opusModel', label: 'Opus 模型' },
    ],
  },
  codex: {
    label: 'Codex',
    defaultName: 'My Codex',
    modelFields: [{ key: 'model', label: '主模型' }],
  },
  opencode: {
    label: 'OpenCode',
    defaultName: 'My OpenCode',
    modelFields: [{ key: 'model', label: '主模型' }],
  },
  gemini: {
    label: 'Gemini',
    defaultName: 'My Gemini',
    modelFields: [{ key: 'model', label: '主模型' }],
  },
};

const FAST_API_BASE_URL = 'https://116.62.113.242';
const FAST_OPENAI_BASE_URL = `${FAST_API_BASE_URL}/v1`;
const FAST_ANTHROPIC_COMPAT_BASE_URL = `${FAST_API_BASE_URL}/anthropic/v1`;
const CCSWITCH_USAGE_BASE_URL = FAST_API_BASE_URL;
const SYNTHAPI_USAGE_QUERY_SCRIPT =
  '({request:{url:"{{baseUrl}}/api/usage/ccswitch/",method:"GET",headers:{Authorization:"Bearer {{apiKey}}"}},extractor:function(r){var v=r&&r.data?r.data:r;return v&&typeof v==="object"?v:{isValid:false,invalidMessage:"Invalid usage response"}}})';

function base64EncodeUtf8(value) {
  const bytes = new TextEncoder().encode(value);
  let binary = '';
  bytes.forEach((byte) => {
    binary += String.fromCharCode(byte);
  });
  return window.btoa(binary);
}

function normalizeApiKey(value) {
  const trimmed = String(value || '').trim();
  return trimmed.startsWith('sk-') ? trimmed : `sk-${trimmed}`;
}

function getServerAddress() {
  try {
    const raw = localStorage.getItem('status');
    if (raw) {
      const status = JSON.parse(raw);
      if (status.server_address) return status.server_address;
    }
  } catch (_) {}
  return window.location.origin;
}

function buildCCSwitchURL(app, name, models, apiKey, protocol) {
  const serverAddress = getServerAddress();
  const endpoint =
    app === 'opencode' && protocol === 'anthropic'
      ? FAST_ANTHROPIC_COMPAT_BASE_URL
      : app === 'codex' || app === 'opencode'
      ? FAST_OPENAI_BASE_URL
      : FAST_API_BASE_URL;
  const params = new URLSearchParams();
  params.set('resource', 'provider');
  params.set('app', app);
  params.set('name', name);
  params.set('endpoint', endpoint);
  params.set('apiKey', apiKey);
  for (const [k, v] of Object.entries(models)) {
    if (v) params.set(k, v);
  }
  params.set('homepage', serverAddress);
  params.set('enabled', 'true');
  params.set('usageEnabled', 'true');
  params.set('usageScript', base64EncodeUtf8(SYNTHAPI_USAGE_QUERY_SCRIPT));
  params.set('usageApiKey', apiKey);
  params.set('usageBaseUrl', CCSWITCH_USAGE_BASE_URL);
  params.set('usageAutoInterval', '10');
  return `ccswitch://v1/import?${params.toString()}`;
}

function buildOpenCodeAnthropicConfig(name, model, apiKey) {
  return JSON.stringify(
    {
      $schema: 'https://opencode.ai/config.json',
      provider: {
        synthapi: {
          npm: '@ai-sdk/anthropic',
          options: { baseURL: FAST_ANTHROPIC_COMPAT_BASE_URL, apiKey },
          models: { [model]: { name: name || model } },
        },
      },
    },
    null,
    2,
  );
}

export default function CCSwitchModal({
  visible,
  onClose,
  tokenKey,
  modelOptions,
}) {
  const { t } = useTranslation();
  const [app, setApp] = useState('claude');
  const [opencodeProtocol, setOpencodeProtocol] = useState('openai-compatible');
  const [name, setName] = useState(APP_CONFIGS.claude.defaultName);
  const [models, setModels] = useState({});

  const currentConfig = APP_CONFIGS[app];

  useEffect(() => {
    if (visible) {
      setModels({});
      setApp('claude');
      setOpencodeProtocol('openai-compatible');
      setName(APP_CONFIGS.claude.defaultName);
    }
  }, [visible]);

  const handleAppChange = (val) => {
    setApp(val);
    setName(APP_CONFIGS[val].defaultName);
    setOpencodeProtocol('openai-compatible');
    setModels({});
  };

  const handleModelChange = (field, value) => {
    setModels((prev) => ({ ...prev, [field]: value }));
  };

  const handleSubmit = () => {
    if (!models.model) {
      Toast.warning(t('请选择主模型'));
      return;
    }
    if (app === 'opencode' && opencodeProtocol === 'anthropic') {
      const config = buildOpenCodeAnthropicConfig(
        name,
        models.model,
        normalizeApiKey(tokenKey),
      );
      copy(config).then((okay) => {
        if (okay) {
          Toast.success(t('已复制 OpenCode Anthropic 配置，请粘贴到 opencode.json'));
          onClose();
        } else {
          Toast.error(t('复制 OpenCode Anthropic 配置失败'));
        }
      });
      return;
    }
    const url = buildCCSwitchURL(
      app,
      name,
      models,
      normalizeApiKey(tokenKey),
      opencodeProtocol,
    );
    window.open(url, '_blank');
    onClose();
  };

  const fieldLabelStyle = useMemo(
    () => ({
      marginBottom: 4,
      fontSize: 13,
      color: 'var(--semi-color-text-1)',
    }),
    [],
  );

  return (
    <Modal
      title={t('填入 CC Switch')}
      visible={visible}
      onCancel={onClose}
      onOk={handleSubmit}
      okText={t('打开 CC Switch')}
      cancelText={t('取消')}
      maskClosable={false}
      width={480}
    >
      <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
        <div>
          <div style={fieldLabelStyle}>{t('应用')}</div>
          <RadioGroup
            type='button'
            value={app}
            onChange={(e) => handleAppChange(e.target.value)}
            style={{ width: '100%' }}
          >
            {Object.entries(APP_CONFIGS).map(([key, cfg]) => (
              <Radio key={key} value={key}>
                {cfg.label}
              </Radio>
            ))}
          </RadioGroup>
        </div>

        {app === 'opencode' && (
          <div>
            <div style={fieldLabelStyle}>{t('OpenCode API 协议')}</div>
            <RadioGroup
              type='button'
              value={opencodeProtocol}
              onChange={(e) => setOpencodeProtocol(e.target.value)}
              style={{ width: '100%' }}
            >
              <Radio value='openai-compatible'>OpenAI Compatible</Radio>
              <Radio value='anthropic'>Anthropic Messages</Radio>
            </RadioGroup>
            {opencodeProtocol === 'anthropic' && (
              <Typography.Text type='tertiary' size='small'>
                {t('将复制 @ai-sdk/anthropic 配置，请粘贴到 opencode.json')}
              </Typography.Text>
            )}
          </div>
        )}

        <div>
          <div style={fieldLabelStyle}>{t('名称')}</div>
          <Input
            value={name}
            onChange={setName}
            placeholder={currentConfig.defaultName}
          />
        </div>

        {currentConfig.modelFields.map((field) => (
          <div key={field.key}>
            <div style={fieldLabelStyle}>
              {t(field.label)}
              {field.key === 'model' && (
                <Typography.Text type='danger'> *</Typography.Text>
              )}
            </div>
            <Select
              placeholder={t('请选择模型')}
              optionList={modelOptions}
              value={models[field.key] || undefined}
              onChange={(val) => handleModelChange(field.key, val)}
              filter={selectFilter}
              style={{ width: '100%' }}
              showClear
              searchable
              emptyContent={t('暂无数据')}
            />
          </div>
        ))}
      </div>
    </Modal>
  );
}
