import React, { useEffect, useState } from 'react';
import { Card, Table, Typography, Tag, Button } from '@douyinfe/semi-ui';
import { API } from '../helpers/api';

export default function R2Monitor() {
  const [data, setData] = useState(null); const [loading, setLoading] = useState(false);
  const load = async () => { setLoading(true); try { const r = await API.get('/api/admin/r2-monitor'); setData(r.data.data); } finally { setLoading(false); } };
  useEffect(() => { load(); const t = setInterval(load, 30000); return () => clearInterval(t); }, []);
  const stats = data?.stats || {};
  const formatBytes = (bytes) => { if (bytes < 1024) return `${bytes} B`; const units = ['KB', 'MB', 'GB', 'TB']; let value = bytes; let i = -1; do { value /= 1024; i++; } while (value >= 1024 && i < units.length - 1); return `${value < 10 ? value.toFixed(2) : value.toFixed(1)} ${units[i]}`; };
  const columns = [{ title: '文件', dataIndex: 'name' }, { title: '大小', dataIndex: 'size', render: v => <span title={`${v} bytes`}>{formatBytes(v)}</span> }, { title: '修改时间', dataIndex: 'modified', render: v => new Date(v).toLocaleString() }];
  return <div style={{padding:24}}><Typography.Title heading={3}>R2 数据监控台</Typography.Title><a href='/r2-monitor'>打开完整监控台</a><Button onClick={load} loading={loading}>刷新</Button><p>{data?.bucket} · {data?.checked_at}</p><p>{data?.r2_error || ''}</p><p>{data?.token_scope}</p><p>Total Tokens: {data?.tokens?.total_tokens?.toLocaleString() ?? '-'}</p><pre>{JSON.stringify(stats, null, 2)}</pre><Table columns={columns} dataSource={(data?.objects || []).map(x => ({...x, name:x.key}))} pagination={{pageSize:25}} /></div>;
}
