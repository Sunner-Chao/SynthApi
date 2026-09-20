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

import { useState, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { Modal } from '@douyinfe/semi-ui';
import {
  API,
  getTodayStartTimestamp,
  isAdmin,
  showError,
  showSuccess,
  timestamp2string,
  renderQuota,
  renderNumber,
  getLogOther,
  copy,
  renderClaudeLogContent,
  renderLogContent,
  renderAudioModelPrice,
  renderClaudeModelPrice,
  renderModelPrice,
  renderTieredModelPrice,
  renderTaskBillingProcess,
} from '../../helpers';
import { ITEMS_PER_PAGE } from '../../constants';
import { useTableCompactMode } from '../common/useTableCompactMode';
import ParamOverrideEntry from '../../components/table/usage-logs/components/ParamOverrideEntry';

const TRACE_EMPTY_VALUE = '-';
const TRACE_SERVER_TIMING_NAME_PATTERN = /^[A-Za-z][A-Za-z0-9_.-]{0,63}$/;
const TRACE_IPV4_TEXT_PATTERN =
  /(?:^|[^0-9])(?:[0-9]{1,3}\.){3}[0-9]{1,3}(?:$|[^0-9])/;
const TRACE_HTTP_PROTOCOLS = new Set([
  'HTTP/1.0',
  'HTTP/1.1',
  'HTTP/2.0',
  'HTTP/3.0',
]);
const TRACE_COVERAGE_VALUES = new Set(['central_http', 'unavailable']);
const TRACE_ROUTE_VALUES = new Set([
  'direct',
  'channel_socks_proxy',
  'channel_http_proxy',
  'environment_proxy',
  'unknown',
]);

const isTraceRecord = (value) =>
  value !== null && typeof value === 'object' && !Array.isArray(value);

const hasTraceValue = (value) =>
  value !== undefined && value !== null && value !== '';

const safeTraceText = (value, maxLength = 512) => {
  if (typeof value !== 'string') return '';
  return value
    .replace(/[\u0000-\u001f\u007f]/g, ' ')
    .trim()
    .slice(0, maxLength);
};

const safeTraceToken = (value, pattern, maxLength) => {
  const text = safeTraceText(value, maxLength);
  return text && pattern.test(text) ? text : '';
};

const formatTraceDuration = (value) => {
  if (!hasTraceValue(value)) return TRACE_EMPTY_VALUE;
  const milliseconds = Number(value);
  if (!Number.isFinite(milliseconds) || milliseconds < 0) {
    return TRACE_EMPTY_VALUE;
  }
  if (milliseconds < 1000) {
    const formatted = Number.isInteger(milliseconds)
      ? String(milliseconds)
      : milliseconds.toFixed(2).replace(/\.?0+$/, '');
    return `${formatted} ms`;
  }
  return `${(milliseconds / 1000).toFixed(2)} s`;
};

const formatTraceBytes = (value) => {
  if (!hasTraceValue(value)) return TRACE_EMPTY_VALUE;
  const bytes = Number(value);
  if (!Number.isFinite(bytes) || bytes < 0) return TRACE_EMPTY_VALUE;
  if (bytes < 1024) return `${Math.round(bytes)} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KiB`;
  return `${(bytes / (1024 * 1024)).toFixed(2)} MiB`;
};

const formatTraceCount = (value, fallback = 0) => {
  const count = Number(value);
  if (!Number.isFinite(count) || count < 0) return fallback;
  return Math.trunc(count);
};

const formatTraceHTTPProtocol = (value) => {
  const protocol = safeTraceText(value, 16);
  return TRACE_HTTP_PROTOCOLS.has(protocol) ? protocol : TRACE_EMPTY_VALUE;
};

const formatTraceIdentifier = (value, allowlist) => {
  const identifier = safeTraceText(value, 64);
  return allowlist.has(identifier) ? identifier : 'unknown';
};

const formatTraceStorage = (value, t) => {
  if (value === 'memory') return t('内存');
  if (value === 'disk') return t('磁盘');
  return TRACE_EMPTY_VALUE;
};

const formatObservedDuration = (observed, value, t) =>
  observed === true ? formatTraceDuration(value) : t('未观测');

const formatServerTiming = (value) => {
  if (!Array.isArray(value)) return '';
  return value
    .slice(0, 16)
    .map((metric) => {
      if (!isTraceRecord(metric)) return null;
      const name = safeTraceText(metric.name, 64);
      if (
        !TRACE_SERVER_TIMING_NAME_PATTERN.test(name) ||
        TRACE_IPV4_TEXT_PATTERN.test(name)
      ) {
        return null;
      }
      if (!hasTraceValue(metric.duration_ms)) return name;
      const duration = Number(metric.duration_ms);
      if (!Number.isFinite(duration) || duration < 0 || duration > 86400000) {
        return name;
      }
      return `${name}=${formatTraceDuration(duration)}`;
    })
    .filter(Boolean)
    .join(', ');
};

const renderTraceLines = (lines) => (
  <div
    style={{
      maxWidth: 760,
      whiteSpace: 'pre-line',
      wordBreak: 'break-word',
      lineHeight: 1.6,
    }}
  >
    {lines.filter(Boolean).join('\n')}
  </div>
);

const appendRelayTraceDetails = (details, log, trace, t) => {
  if (!isTraceRecord(trace)) return;

  const allAttempts = Array.isArray(trace.attempts)
    ? trace.attempts.filter(isTraceRecord)
    : [];
  const attempts = allAttempts.slice(0, 8);
  const overflow =
    formatTraceCount(trace.attempt_overflow) +
    Math.max(0, allAttempts.length - attempts.length);
  const version = formatTraceCount(trace.version, 1);
  const coverage = formatTraceIdentifier(trace.coverage, TRACE_COVERAGE_VALUES);
  const overviewLines = [
    t('版本 {{version}}；覆盖 {{coverage}}；总耗时 {{total}}', {
      version,
      coverage,
      total: formatTraceDuration(trace.total_ms),
    }),
  ];
  const affinityFingerprint = safeTraceToken(
    trace.affinity_fingerprint,
    /^[A-Fa-f0-9]{8}$/,
    8,
  );
  if (affinityFingerprint) {
    overviewLines.push(
      t('亲和指纹 {{fingerprint}}', { fingerprint: affinityFingerprint }),
    );
  }
  if (overflow > 0) {
    overviewLines.push(t('省略 {{count}} 次上游尝试', { count: overflow }));
  }
  details.push({
    key: t('请求链路'),
    value: renderTraceLines(overviewLines),
  });

  const clientIp = safeTraceText(log?.ip, 128);
  if (isTraceRecord(trace.client) || clientIp) {
    const client = isTraceRecord(trace.client) ? trace.client : {};
    const clientLines = [];
    const identity = [
      clientIp ? `IP ${clientIp}` : '',
      safeTraceText(client.user_agent, 512)
        ? `UA ${safeTraceText(client.user_agent, 512)}`
        : '',
      formatTraceHTTPProtocol(client.http_protocol) !== TRACE_EMPTY_VALUE
        ? `HTTP ${formatTraceHTTPProtocol(client.http_protocol)}`
        : '',
    ]
      .filter(Boolean)
      .join(' · ');
    if (identity) clientLines.push(identity);

    const location = [
      safeTraceText(client.city, 80),
      safeTraceText(client.region, 80),
      safeTraceToken(client.region_code, /^[A-Za-z0-9_-]{1,16}$/, 16),
      safeTraceToken(client.country, /^[A-Za-z0-9]{1,8}$/, 8),
    ]
      .filter(Boolean)
      .join(', ');
    const timezone = safeTraceText(client.timezone, 80);
    if (location || timezone) {
      clientLines.push(
        t('位置 {{location}}；时区 {{timezone}}', {
          location: location || TRACE_EMPTY_VALUE,
          timezone: timezone || TRACE_EMPTY_VALUE,
        }),
      );
    }

    const clientRay = safeTraceToken(
      client.cf_ray,
      /^[A-Za-z0-9_-]{1,64}$/,
      64,
    );
    const clientColo = safeTraceToken(client.cf_colo, /^[A-Za-z0-9]{1,8}$/, 8);
    if (clientRay || clientColo) {
      clientLines.push(
        t('Cloudflare Ray {{ray}}；机房 {{colo}}', {
          ray: clientRay || TRACE_EMPTY_VALUE,
          colo: clientColo || TRACE_EMPTY_VALUE,
        }),
      );
    }

    if (
      client.body_observed === true ||
      hasTraceValue(client.body_read_ms) ||
      hasTraceValue(client.request_bytes) ||
      hasTraceValue(client.body_storage)
    ) {
      clientLines.push(
        t('上传 {{upload}}；请求 {{requestBytes}}；存储 {{storage}}', {
          upload: formatTraceDuration(client.body_read_ms),
          requestBytes: formatTraceBytes(client.request_bytes),
          storage: formatTraceStorage(client.body_storage, t),
        }),
      );
    }

    if (
      hasTraceValue(client.first_write_ms) ||
      hasTraceValue(client.stream_span_ms) ||
      hasTraceValue(client.write_blocked_ms) ||
      hasTraceValue(client.response_bytes)
    ) {
      clientLines.push(
        t(
          '首写 {{firstWrite}}；流跨度 {{streamSpan}}；写阻塞 {{blocked}}；响应 {{responseBytes}}',
          {
            firstWrite: formatTraceDuration(client.first_write_ms),
            streamSpan: formatTraceDuration(client.stream_span_ms),
            blocked: formatTraceDuration(client.write_blocked_ms),
            responseBytes: formatTraceBytes(client.response_bytes),
          },
        ),
      );
    }

    if (clientLines.length > 0) {
      details.push({
        key: t('客户端信息'),
        value: renderTraceLines(clientLines),
      });
    }
  }

  if (isTraceRecord(trace.gateway)) {
    const gateway = trace.gateway;
    details.push({
      key: t('网关阶段'),
      value: renderTraceLines([
        t('入口 {{ingress}}；校验 {{validation}}；Relay 信息 {{relayInfo}}', {
          ingress: formatTraceDuration(gateway.ingress_before_relay_ms),
          validation: formatTraceDuration(gateway.validate_ms),
          relayInfo: formatTraceDuration(gateway.relay_info_ms),
        }),
        t('预处理 {{preprocess}}；计价 {{pricing}}；预扣 {{preConsume}}', {
          preprocess: formatTraceDuration(gateway.preprocess_ms),
          pricing: formatTraceDuration(gateway.pricing_ms),
          preConsume: formatTraceDuration(gateway.pre_consume_ms),
        }),
        t('选渠道 {{selection}}；刷新计费 {{billing}}；存储 {{storage}}', {
          selection: formatTraceDuration(gateway.select_channel_ms),
          billing: formatTraceDuration(gateway.refresh_billing_ms),
          storage: formatTraceDuration(gateway.body_storage_ms),
        }),
        t('上游 Relay {{upstream}}；首事件 {{firstEvent}}；尝试 {{attempts}}', {
          upstream: formatTraceDuration(gateway.upstream_relay_ms),
          firstEvent: formatTraceDuration(gateway.first_event_ms),
          attempts: formatTraceCount(gateway.attempts, attempts.length),
        }),
      ]),
    });
  }

  attempts.forEach((attempt, index) => {
    const attemptNumber = Math.max(
      1,
      formatTraceCount(attempt.attempt, index + 1),
    );
    const gotConnEvents = formatTraceCount(attempt.got_conn_events);
    const connection =
      gotConnEvents === 0
        ? t('未观测')
        : attempt.conn_reused === true
          ? t('已复用')
          : t('新连接');
    const idle =
      gotConnEvents === 0
        ? t('未观测')
        : attempt.conn_was_idle === true
          ? formatTraceDuration(attempt.conn_idle_ms)
          : t('否');
    const serverTiming = formatServerTiming(attempt.server_timing);
    const attemptLines = [
      t('路由 {{route}}；连接 {{connection}}；空闲 {{idle}}', {
        route: formatTraceIdentifier(attempt.route, TRACE_ROUTE_VALUES),
        connection,
        idle,
      }),
      t('DNS {{dns}}；TCP {{tcp}}；TLS {{tls}}；恢复 {{resumed}}', {
        dns: formatObservedDuration(attempt.dns_observed, attempt.dns_ms, t),
        tcp: formatObservedDuration(attempt.tcp_observed, attempt.tcp_ms, t),
        tls: formatObservedDuration(attempt.tls_observed, attempt.tls_ms, t),
        resumed:
          attempt.tls_observed === true
            ? attempt.tls_resumed === true
              ? t('是')
              : t('否')
            : TRACE_EMPTY_VALUE,
      }),
      t('近似写入 {{write}}；TTFB {{ttfb}}；首响应体 {{firstBody}}', {
        write: formatTraceDuration(attempt.request_write_approx_ms),
        ttfb: formatTraceDuration(attempt.ttfb_ms),
        firstBody: formatTraceDuration(attempt.application_first_body_read_ms),
      }),
      t(
        '上游到首事件 {{firstEvent}}；读取跨度 {{readSpan}}；首事件后流跨度 {{streamSpan}}',
        {
          firstEvent: formatTraceDuration(attempt.upstream_to_first_event_ms),
          readSpan: formatTraceDuration(attempt.application_body_read_span_ms),
          streamSpan: formatTraceDuration(
            attempt.application_stream_after_first_event_ms,
          ),
        },
      ),
      t('请求 {{requestBytes}}；响应 {{responseBytes}}；HTTP {{protocol}}', {
        requestBytes: formatTraceBytes(attempt.request_bytes_total),
        responseBytes: formatTraceBytes(attempt.response_bytes),
        protocol: formatTraceHTTPProtocol(attempt.http_protocol),
      }),
    ];

    const upstreamRay = safeTraceToken(
      attempt.cf_ray,
      /^[A-Za-z0-9-]{1,64}$/,
      64,
    );
    const upstreamColo = safeTraceToken(
      attempt.cf_colo,
      /^[A-Za-z0-9]{1,8}$/,
      8,
    );
    if (upstreamRay || upstreamColo) {
      attemptLines.push(
        t('Cloudflare Ray {{ray}}；上游机房 {{colo}}', {
          ray: upstreamRay || TRACE_EMPTY_VALUE,
          colo: upstreamColo || TRACE_EMPTY_VALUE,
        }),
      );
    }
    if (serverTiming) {
      attemptLines.push(
        t('Server Timing：{{timing}}', { timing: serverTiming }),
      );
    }

    details.push({
      key: t('上游尝试 #{{attempt}}', { attempt: attemptNumber }),
      value: renderTraceLines(attemptLines),
    });
  });
};

export const useLogsData = () => {
  const { t } = useTranslation();

  // Define column keys for selection
  const COLUMN_KEYS = {
    TIME: 'time',
    CHANNEL: 'channel',
    USERNAME: 'username',
    TOKEN: 'token',
    GROUP: 'group',
    TYPE: 'type',
    MODEL: 'model',
    USE_TIME: 'use_time',
    PROMPT: 'prompt',
    COMPLETION: 'completion',
    COST: 'cost',
    RETRY: 'retry',
    IP: 'ip',
    DETAILS: 'details',
  };

  // Basic state
  const [logs, setLogs] = useState([]);
  const [expandData, setExpandData] = useState({});
  const [showStat, setShowStat] = useState(false);
  const [loading, setLoading] = useState(false);
  const [loadingStat, setLoadingStat] = useState(false);
  const [activePage, setActivePage] = useState(1);
  const [logCount, setLogCount] = useState(0);
  const [pageSize, setPageSize] = useState(ITEMS_PER_PAGE);
  const [logType, setLogType] = useState(0);

  // User and admin
  const isAdminUser = isAdmin();
  // Role-specific storage key to prevent different roles from overwriting each other
  const STORAGE_KEY = isAdminUser
    ? 'logs-table-columns-admin'
    : 'logs-table-columns-user';
  const BILLING_DISPLAY_MODE_STORAGE_KEY = isAdminUser
    ? 'logs-billing-display-mode-admin'
    : 'logs-billing-display-mode-user';

  // Statistics state
  const [stat, setStat] = useState({
    quota: 0,
    token: 0,
  });

  // Form state
  const [formApi, setFormApi] = useState(null);
  let now = new Date();
  const formInitValues = {
    username: '',
    token_name: '',
    model_name: '',
    channel: '',
    group: '',
    request_id: '',
    dateRange: [
      timestamp2string(getTodayStartTimestamp()),
      timestamp2string(now.getTime() / 1000 + 3600),
    ],
    logType: '0',
  };

  // Get default column visibility based on user role
  const getDefaultColumnVisibility = () => {
    return {
      [COLUMN_KEYS.TIME]: true,
      [COLUMN_KEYS.CHANNEL]: isAdminUser,
      [COLUMN_KEYS.USERNAME]: isAdminUser,
      [COLUMN_KEYS.TOKEN]: true,
      [COLUMN_KEYS.GROUP]: true,
      [COLUMN_KEYS.TYPE]: true,
      [COLUMN_KEYS.MODEL]: true,
      [COLUMN_KEYS.USE_TIME]: true,
      [COLUMN_KEYS.PROMPT]: true,
      [COLUMN_KEYS.COMPLETION]: true,
      [COLUMN_KEYS.COST]: true,
      [COLUMN_KEYS.RETRY]: isAdminUser,
      [COLUMN_KEYS.IP]: true,
      [COLUMN_KEYS.DETAILS]: true,
    };
  };

  const getInitialVisibleColumns = () => {
    const defaults = getDefaultColumnVisibility();
    const savedColumns = localStorage.getItem(STORAGE_KEY);

    if (!savedColumns) {
      return defaults;
    }

    try {
      const parsed = JSON.parse(savedColumns);
      const merged = { ...defaults, ...parsed };

      if (!isAdminUser) {
        merged[COLUMN_KEYS.CHANNEL] = false;
        merged[COLUMN_KEYS.USERNAME] = false;
        merged[COLUMN_KEYS.RETRY] = false;
      }

      return merged;
    } catch (e) {
      console.error('Failed to parse saved column preferences', e);
      return defaults;
    }
  };

  const getInitialBillingDisplayMode = () => {
    const savedMode = localStorage.getItem(BILLING_DISPLAY_MODE_STORAGE_KEY);
    if (savedMode === 'price' || savedMode === 'ratio') {
      return savedMode;
    }
    return localStorage.getItem('quota_display_type') === 'TOKENS'
      ? 'ratio'
      : 'price';
  };

  // Column visibility state
  const [visibleColumns, setVisibleColumns] = useState(
    getInitialVisibleColumns,
  );
  const [showColumnSelector, setShowColumnSelector] = useState(false);
  const [billingDisplayMode, setBillingDisplayMode] = useState(
    getInitialBillingDisplayMode,
  );

  // Compact mode
  const [compactMode, setCompactMode] = useTableCompactMode('logs');

  // User info modal state
  const [showUserInfo, setShowUserInfoModal] = useState(false);
  const [userInfoData, setUserInfoData] = useState(null);

  // Channel affinity usage cache stats modal state (admin only)
  const [
    showChannelAffinityUsageCacheModal,
    setShowChannelAffinityUsageCacheModal,
  ] = useState(false);
  const [channelAffinityUsageCacheTarget, setChannelAffinityUsageCacheTarget] =
    useState(null);
  const [showParamOverrideModal, setShowParamOverrideModal] = useState(false);
  const [paramOverrideTarget, setParamOverrideTarget] = useState(null);

  // Initialize default column visibility
  const initDefaultColumns = () => {
    const defaults = getDefaultColumnVisibility();
    setVisibleColumns(defaults);
    localStorage.setItem(STORAGE_KEY, JSON.stringify(defaults));
  };

  // Handle column visibility change
  const handleColumnVisibilityChange = (columnKey, checked) => {
    const updatedColumns = { ...visibleColumns, [columnKey]: checked };
    setVisibleColumns(updatedColumns);
  };

  // Handle "Select All" checkbox
  const handleSelectAll = (checked) => {
    const allKeys = Object.keys(COLUMN_KEYS).map((key) => COLUMN_KEYS[key]);
    const updatedColumns = {};

    allKeys.forEach((key) => {
      if (
        (key === COLUMN_KEYS.CHANNEL ||
          key === COLUMN_KEYS.USERNAME ||
          key === COLUMN_KEYS.RETRY) &&
        !isAdminUser
      ) {
        updatedColumns[key] = false;
      } else {
        updatedColumns[key] = checked;
      }
    });

    setVisibleColumns(updatedColumns);
  };

  // Persist column settings to the role-specific STORAGE_KEY
  useEffect(() => {
    if (Object.keys(visibleColumns).length > 0) {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(visibleColumns));
    }
  }, [visibleColumns]);

  useEffect(() => {
    localStorage.setItem(BILLING_DISPLAY_MODE_STORAGE_KEY, billingDisplayMode);
  }, [BILLING_DISPLAY_MODE_STORAGE_KEY, billingDisplayMode]);

  // 获取表单值的辅助函数，确保所有值都是字符串
  const getFormValues = () => {
    const formValues = formApi ? formApi.getValues() : {};

    let start_timestamp = timestamp2string(getTodayStartTimestamp());
    let end_timestamp = timestamp2string(now.getTime() / 1000 + 3600);

    if (
      formValues.dateRange &&
      Array.isArray(formValues.dateRange) &&
      formValues.dateRange.length === 2
    ) {
      start_timestamp = formValues.dateRange[0];
      end_timestamp = formValues.dateRange[1];
    }

    return {
      username: formValues.username || '',
      token_name: formValues.token_name || '',
      model_name: formValues.model_name || '',
      start_timestamp,
      end_timestamp,
      channel: formValues.channel || '',
      group: formValues.group || '',
      request_id: formValues.request_id || '',
      logType: formValues.logType ? parseInt(formValues.logType) : 0,
    };
  };

  // Statistics functions
  const getLogSelfStat = async () => {
    const {
      token_name,
      model_name,
      start_timestamp,
      end_timestamp,
      group,
      logType: formLogType,
    } = getFormValues();
    const currentLogType = formLogType !== undefined ? formLogType : logType;
    let localStartTimestamp = Date.parse(start_timestamp) / 1000;
    let localEndTimestamp = Date.parse(end_timestamp) / 1000;
    let url = `/api/log/self/stat?type=${currentLogType}&token_name=${token_name}&model_name=${model_name}&start_timestamp=${localStartTimestamp}&end_timestamp=${localEndTimestamp}&group=${group}`;
    url = encodeURI(url);
    let res = await API.get(url);
    const { success, message, data } = res.data;
    if (success) {
      setStat(data);
    } else {
      showError(message);
    }
  };

  const getLogStat = async () => {
    const {
      username,
      token_name,
      model_name,
      start_timestamp,
      end_timestamp,
      channel,
      group,
      logType: formLogType,
    } = getFormValues();
    const currentLogType = formLogType !== undefined ? formLogType : logType;
    let localStartTimestamp = Date.parse(start_timestamp) / 1000;
    let localEndTimestamp = Date.parse(end_timestamp) / 1000;
    let url = `/api/log/stat?type=${currentLogType}&username=${username}&token_name=${token_name}&model_name=${model_name}&start_timestamp=${localStartTimestamp}&end_timestamp=${localEndTimestamp}&channel=${channel}&group=${group}`;
    url = encodeURI(url);
    let res = await API.get(url);
    const { success, message, data } = res.data;
    if (success) {
      setStat(data);
    } else {
      showError(message);
    }
  };

  const handleEyeClick = async () => {
    if (loadingStat) {
      return;
    }
    setLoadingStat(true);
    if (isAdminUser) {
      await getLogStat();
    } else {
      await getLogSelfStat();
    }
    setShowStat(true);
    setLoadingStat(false);
  };

  // User info function
  const showUserInfoFunc = async (userId) => {
    if (!isAdminUser) {
      return;
    }
    const [res, rewardRes] = await Promise.all([
      API.get(`/api/user/${userId}`),
      API.get(`/api/user/rewards/admin/users/${userId}/summary`).catch(
        () => null,
      ),
    ]);
    const { success, message, data } = res.data;
    if (success) {
      setUserInfoData({
        ...data,
        reward_summary: rewardRes?.data?.success ? rewardRes.data.data : null,
      });
      setShowUserInfoModal(true);
    } else {
      showError(message);
    }
  };

  const openChannelAffinityUsageCacheModal = (affinity) => {
    const a = affinity || {};
    setChannelAffinityUsageCacheTarget({
      rule_name: a.rule_name || a.reason || '',
      using_group: a.using_group || '',
      key_hint: a.key_hint || '',
      key_fp: a.key_fp || '',
    });
    setShowChannelAffinityUsageCacheModal(true);
  };

  const openParamOverrideModal = (log, other) => {
    const lines = Array.isArray(other?.po) ? other.po.filter(Boolean) : [];
    if (lines.length === 0) {
      return;
    }
    setParamOverrideTarget({
      lines,
      modelName: log?.model_name || '',
      requestId: log?.request_id || '',
      requestPath: other?.request_path || '',
    });
    setShowParamOverrideModal(true);
  };

  // Format logs data
  const setLogsFormat = (logs) => {
    const requestConversionDisplayValue = (conversionChain) => {
      const chain = Array.isArray(conversionChain)
        ? conversionChain.filter(Boolean)
        : [];
      if (chain.length <= 1) {
        return t('原生格式');
      }
      return `${chain.join(' -> ')}`;
    };

    let expandDatesLocal = {};
    for (let i = 0; i < logs.length; i++) {
      logs[i].timestamp2string = timestamp2string(logs[i].created_at);
      logs[i].key = logs[i].id;
      let other = getLogOther(logs[i].other);
      let expandDataLocal = [];

      if (
        isAdminUser &&
        (logs[i].type === 0 || logs[i].type === 2 || logs[i].type === 6)
      ) {
        expandDataLocal.push({
          key: t('渠道信息'),
          value: `${logs[i].channel} - ${logs[i].channel_name || '[未知]'}`,
        });
      }
      if (logs[i].request_id) {
        expandDataLocal.push({
          key: t('Request ID'),
          value: logs[i].request_id,
        });
      }
      appendRelayTraceDetails(expandDataLocal, logs[i], other?.relay_trace, t);
      if (other?.ws || other?.audio) {
        expandDataLocal.push({
          key: t('语音输入'),
          value: other.audio_input,
        });
        expandDataLocal.push({
          key: t('语音输出'),
          value: other.audio_output,
        });
        expandDataLocal.push({
          key: t('文字输入'),
          value: other.text_input,
        });
        expandDataLocal.push({
          key: t('文字输出'),
          value: other.text_output,
        });
      }
      if (other?.cache_tokens > 0) {
        expandDataLocal.push({
          key: t('缓存 Tokens'),
          value: other.cache_tokens,
        });
      }
      if (other?.cache_creation_tokens > 0) {
        expandDataLocal.push({
          key: t('缓存创建 Tokens'),
          value: other.cache_creation_tokens,
        });
      }
      if (logs[i].type === 2) {
        if (other?.billing_mode !== 'tiered_expr') {
          expandDataLocal.push({
            key: t('日志详情'),
            value: other?.claude
              ? renderClaudeLogContent({
                  ...other,
                  displayMode: billingDisplayMode,
                })
              : renderLogContent({ ...other, displayMode: billingDisplayMode }),
          });
        }
        if (logs[i]?.content) {
          expandDataLocal.push({
            key: t('其他详情'),
            value: logs[i].content,
          });
        }
        if (isAdminUser && other?.reject_reason) {
          expandDataLocal.push({
            key: t('拦截原因'),
            value: other.reject_reason,
          });
        }
      }
      if (logs[i].type === 2) {
        let modelMapped =
          other?.is_model_mapped &&
          other?.upstream_model_name &&
          other?.upstream_model_name !== '';
        if (modelMapped) {
          expandDataLocal.push({
            key: t('请求并计费模型'),
            value: logs[i].model_name,
          });
          expandDataLocal.push({
            key: t('实际模型'),
            value: other.upstream_model_name,
          });
        }

        const isViolationFeeLog =
          other?.violation_fee === true ||
          Boolean(other?.violation_fee_code) ||
          Boolean(other?.violation_fee_marker);

        let content = '';
        if (!isViolationFeeLog && other?.billing_mode !== 'tiered_expr') {
          const logOpts = {
            ...other,
            prompt_tokens: logs[i].prompt_tokens,
            completion_tokens: logs[i].completion_tokens,
            displayMode: billingDisplayMode,
          };
          const isTaskLog = other?.is_task === true || other?.task_id != null;
          if (isTaskLog && other?.model_price === -1) {
            content = renderTaskBillingProcess(other, logs[i].content);
          } else if (other?.ws || other?.audio) {
            content = renderAudioModelPrice(logOpts);
          } else if (other?.claude) {
            content = renderClaudeModelPrice(logOpts);
          } else {
            content = renderModelPrice(logOpts);
          }
          expandDataLocal.push({
            key: t('计费过程'),
            value: content,
          });
        }
        if (other?.reasoning_effort) {
          expandDataLocal.push({
            key: t('Reasoning Effort'),
            value: other.reasoning_effort,
          });
        }
        if (other?.billing_mode === 'tiered_expr' && other?.expr_b64) {
          expandDataLocal.push({
            key: t('计费过程'),
            value: renderTieredModelPrice({
              ...other,
              prompt_tokens: logs[i].prompt_tokens,
              completion_tokens: logs[i].completion_tokens,
              displayMode: billingDisplayMode,
            }),
          });
        }
      }
      if (logs[i].type === 6) {
        if (other?.task_id) {
          expandDataLocal.push({
            key: t('任务ID'),
            value: other.task_id,
          });
        }
        if (other?.reason) {
          expandDataLocal.push({
            key: t('失败原因'),
            value: (
              <div
                style={{
                  maxWidth: 600,
                  whiteSpace: 'normal',
                  wordBreak: 'break-word',
                  lineHeight: 1.6,
                }}
              >
                {other.reason}
              </div>
            ),
          });
        }
      }
      if (other?.request_path) {
        expandDataLocal.push({
          key: t('请求路径'),
          value: other.request_path,
        });
      }
      if (isAdminUser && other?.stream_status) {
        const ss = other.stream_status;
        const isOk = ss.status === 'ok';
        const statusLabel = isOk ? '✓ ' + t('正常') : '✗ ' + t('异常');
        let streamValue =
          statusLabel + ' (' + (ss.end_reason || 'unknown') + ')';
        if (ss.error_count > 0) {
          streamValue += ` [${t('软错误')}: ${ss.error_count}]`;
        }
        if (ss.end_error) {
          streamValue += ` - ${ss.end_error}`;
        }
        expandDataLocal.push({
          key: t('流状态'),
          value: streamValue,
        });
        if (Array.isArray(ss.errors) && ss.errors.length > 0) {
          expandDataLocal.push({
            key: t('流错误详情'),
            value: (
              <div
                style={{
                  maxWidth: 600,
                  whiteSpace: 'pre-line',
                  wordBreak: 'break-word',
                  lineHeight: 1.6,
                }}
              >
                {ss.errors.join('\n')}
              </div>
            ),
          });
        }
      }
      if (Array.isArray(other?.po) && other.po.length > 0) {
        expandDataLocal.push({
          key: t('参数覆盖'),
          value: (
            <ParamOverrideEntry
              count={other.po.length}
              t={t}
              onOpen={(event) => {
                event.stopPropagation();
                openParamOverrideModal(logs[i], other);
              }}
            />
          ),
        });
      }
      if (other?.billing_source === 'subscription') {
        const planId = other?.subscription_plan_id;
        const planTitle = other?.subscription_plan_title || '';
        const subscriptionId = other?.subscription_id;
        const unit = t('额度');
        const pre = other?.subscription_pre_consumed ?? 0;
        const postDelta = other?.subscription_post_delta ?? 0;
        const finalConsumed = other?.subscription_consumed ?? pre + postDelta;
        const remain = other?.subscription_remain;
        const total = other?.subscription_total;
        // Use multiple Description items to avoid an overlong single line.
        if (planId) {
          expandDataLocal.push({
            key: t('订阅套餐'),
            value: `#${planId} ${planTitle}`.trim(),
          });
        }
        if (subscriptionId) {
          expandDataLocal.push({
            key: t('订阅实例'),
            value: `#${subscriptionId}`,
          });
        }
        const settlementLines = [
          `${t('预扣')}：${pre} ${unit}`,
          `${t('结算差额')}：${postDelta > 0 ? '+' : ''}${postDelta} ${unit}`,
          `${t('最终抵扣')}：${finalConsumed} ${unit}`,
        ]
          .filter(Boolean)
          .join('\n');
        expandDataLocal.push({
          key: t('订阅结算'),
          value: (
            <div style={{ whiteSpace: 'pre-line' }}>{settlementLines}</div>
          ),
        });
        if (remain !== undefined && total !== undefined) {
          expandDataLocal.push({
            key: t('订阅剩余'),
            value: `${remain}/${total} ${unit}`,
          });
        }
        expandDataLocal.push({
          key: t('订阅说明'),
          value: t(
            'token 会按倍率换算成“额度/次数”，请求结束后再做差额结算（补扣/返还）。',
          ),
        });
      }
      if (isAdminUser && logs[i].type !== 6 && logs[i].type !== 1) {
        expandDataLocal.push({
          key: t('请求转换'),
          value: requestConversionDisplayValue(other?.request_conversion),
        });
      }
      if (isAdminUser && logs[i].type !== 6 && logs[i].type !== 1) {
        let localCountMode = '';
        if (other?.admin_info?.local_count_tokens) {
          localCountMode = t('本地计费');
        } else {
          localCountMode = t('上游返回');
        }
        expandDataLocal.push({
          key: t('计费模式'),
          value: localCountMode,
        });
      }
      if (isAdminUser && logs[i].type === 1) {
        const adminInfo = other?.admin_info;
        if (adminInfo) {
          if (adminInfo.event) {
            expandDataLocal.push({
              key: t('支付事件'),
              value: adminInfo.event,
            });
          }
          if (adminInfo.trade_no) {
            expandDataLocal.push({
              key: t('订单号'),
              value: adminInfo.trade_no,
            });
          }
          if (adminInfo.provider_trade_no) {
            expandDataLocal.push({
              key: t('平台订单号'),
              value: adminInfo.provider_trade_no,
            });
          }
          if (adminInfo.reference_id) {
            expandDataLocal.push({
              key: t('参考编号'),
              value: adminInfo.reference_id,
            });
          }
          if (adminInfo.payment_method) {
            expandDataLocal.push({
              key: t('订单支付方式'),
              value: adminInfo.payment_method,
            });
          }
          if (adminInfo.payment_provider) {
            expandDataLocal.push({
              key: t('支付网关'),
              value: adminInfo.payment_provider,
            });
          }
          if (adminInfo.callback_payment_method) {
            expandDataLocal.push({
              key: t('回调支付方式'),
              value: adminInfo.callback_payment_method,
            });
          }
          if (adminInfo.caller_ip) {
            expandDataLocal.push({
              key: t('回调调用者IP'),
              value: adminInfo.caller_ip,
            });
          }
          if (adminInfo.server_ip) {
            expandDataLocal.push({
              key: t('服务器IP'),
              value: adminInfo.server_ip,
            });
          }
          if (adminInfo.node_name) {
            expandDataLocal.push({
              key: t('节点名称'),
              value: adminInfo.node_name,
            });
          }
          if (adminInfo.version) {
            expandDataLocal.push({
              key: t('系统版本'),
              value: adminInfo.version,
            });
          }
          if (adminInfo.source) {
            expandDataLocal.push({
              key: t('支付来源'),
              value: adminInfo.source,
            });
          }
          if (adminInfo.audit_schema_version) {
            expandDataLocal.push({
              key: t('审计版本'),
              value: String(adminInfo.audit_schema_version),
            });
          }
        } else if (
          !/^(使用余额购买订阅成功|通过兑换码充值|退订订阅成功)/.test(
            String(logs[i].content || '').trim(),
          )
        ) {
          expandDataLocal.push({
            key: t('审计信息'),
            value: (
              <span style={{ color: 'var(--semi-color-warning)' }}>
                {t(
                  '该历史支付记录未包含审计元数据，无法还原原始服务器与回调来源。',
                )}
              </span>
            ),
          });
        }
      }
      if (isAdminUser && logs[i].type === 3 && other?.admin_info) {
        const adminInfo = other.admin_info;
        const hasUsername =
          adminInfo.admin_username !== undefined &&
          adminInfo.admin_username !== null &&
          adminInfo.admin_username !== '';
        const hasId =
          adminInfo.admin_id !== undefined &&
          adminInfo.admin_id !== null &&
          adminInfo.admin_id !== '';
        if (hasUsername || hasId) {
          let operatorValue = '';
          if (hasUsername && hasId) {
            operatorValue = `${adminInfo.admin_username} (ID: ${adminInfo.admin_id})`;
          } else if (hasUsername) {
            operatorValue = String(adminInfo.admin_username);
          } else {
            operatorValue = `ID: ${adminInfo.admin_id}`;
          }
          expandDataLocal.push({
            key: t('操作管理员'),
            value: operatorValue,
          });
        }
      }
      expandDatesLocal[logs[i].key] = expandDataLocal;
    }

    setExpandData(expandDatesLocal);
    setLogs(logs);
  };

  // Load logs function
  const loadLogs = async (startIdx, pageSize, customLogType = null) => {
    setLoading(true);

    let url = '';
    const {
      username,
      token_name,
      model_name,
      start_timestamp,
      end_timestamp,
      channel,
      group,
      request_id,
      logType: formLogType,
    } = getFormValues();

    const currentLogType =
      customLogType !== null
        ? customLogType
        : formLogType !== undefined
          ? formLogType
          : logType;

    let localStartTimestamp = Date.parse(start_timestamp) / 1000;
    let localEndTimestamp = Date.parse(end_timestamp) / 1000;
    if (isAdminUser) {
      url = `/api/log/?p=${startIdx}&page_size=${pageSize}&type=${currentLogType}&username=${username}&token_name=${token_name}&model_name=${model_name}&start_timestamp=${localStartTimestamp}&end_timestamp=${localEndTimestamp}&channel=${channel}&group=${group}&request_id=${request_id}`;
    } else {
      url = `/api/log/self/?p=${startIdx}&page_size=${pageSize}&type=${currentLogType}&token_name=${token_name}&model_name=${model_name}&start_timestamp=${localStartTimestamp}&end_timestamp=${localEndTimestamp}&group=${group}&request_id=${request_id}`;
    }
    url = encodeURI(url);
    const res = await API.get(url);
    const { success, message, data } = res.data;
    if (success) {
      const newPageData = data.items;
      setActivePage(data.page);
      setPageSize(data.page_size);
      setLogCount(data.total);

      setLogsFormat(newPageData);
    } else {
      showError(message);
    }
    setLoading(false);
  };

  // Page handlers
  const handlePageChange = (page) => {
    setActivePage(page);
    loadLogs(page, pageSize).then((r) => {});
  };

  const handlePageSizeChange = async (size) => {
    localStorage.setItem('page-size', size + '');
    setPageSize(size);
    setActivePage(1);
    loadLogs(activePage, size)
      .then()
      .catch((reason) => {
        showError(reason);
      });
  };

  // Refresh function
  const refresh = async () => {
    setActivePage(1);
    handleEyeClick();
    await loadLogs(1, pageSize);
  };

  // Copy text function
  const copyText = async (e, text) => {
    e.stopPropagation();
    if (await copy(text)) {
      showSuccess('已复制：' + text);
    } else {
      Modal.error({ title: t('无法复制到剪贴板，请手动复制'), content: text });
    }
  };

  // Initialize data
  useEffect(() => {
    const localPageSize =
      parseInt(localStorage.getItem('page-size')) || ITEMS_PER_PAGE;
    setPageSize(localPageSize);
    loadLogs(activePage, localPageSize)
      .then()
      .catch((reason) => {
        showError(reason);
      });
  }, []);

  // Initialize statistics when formApi is available
  useEffect(() => {
    if (formApi) {
      handleEyeClick();
    }
  }, [formApi]);

  // Check if any record has expandable content
  const hasExpandableRows = () => {
    return logs.some(
      (log) => expandData[log.key] && expandData[log.key].length > 0,
    );
  };

  return {
    // Basic state
    logs,
    expandData,
    showStat,
    loading,
    loadingStat,
    activePage,
    logCount,
    pageSize,
    logType,
    stat,
    isAdminUser,

    // Form state
    formApi,
    setFormApi,
    formInitValues,
    getFormValues,

    // Column visibility
    visibleColumns,
    showColumnSelector,
    setShowColumnSelector,
    billingDisplayMode,
    setBillingDisplayMode,
    handleColumnVisibilityChange,
    handleSelectAll,
    initDefaultColumns,
    COLUMN_KEYS,

    // Compact mode
    compactMode,
    setCompactMode,

    // User info modal
    showUserInfo,
    setShowUserInfoModal,
    userInfoData,
    showUserInfoFunc,

    // Channel affinity usage cache stats modal
    showChannelAffinityUsageCacheModal,
    setShowChannelAffinityUsageCacheModal,
    channelAffinityUsageCacheTarget,
    openChannelAffinityUsageCacheModal,
    showParamOverrideModal,
    setShowParamOverrideModal,
    paramOverrideTarget,

    // Functions
    loadLogs,
    handlePageChange,
    handlePageSizeChange,
    refresh,
    copyText,
    handleEyeClick,
    setLogsFormat,
    hasExpandableRows,
    setLogType,
    openParamOverrideModal,

    // Translation
    t,
  };
};
