# 平台常见问答 (FAQ) 建议内容

> 添加路径：`/system-settings/content/faq` → 点击 **Add FAQ** 逐条添加 → 全部完成后点击 **Save Settings**。
> 添加前请确认右上角 **Enabled** 开关已启用。

---

### 1. 如何开始使用 API？

**Question:**
```
如何开始使用 API？
```

**Answer:**
```
1. 注册账号并登录
2. 进入 **API 密钥** 页面，创建新的 API Key
3. 复制密钥，在任何兼容 OpenAI 接口格式的客户端中使用
4. 在仪表盘下方的 **API 地址** 面板中查看可用端点

示例：
`curl https://你的域名/v1/chat/completions \
  -H "Authorization: Bearer 你的API密钥" \
  -H "Content-Type: application/json" \
  -d '{"model":"gpt-3.5-turbo","messages":[{"role":"user","content":"你好！"}]}'`
```

---

### 2. 如何获取和配置 API 密钥？

**Question:**
```
如何获取和配置 API 密钥？
```

**Answer:**
```
1. 登录后进入 **API 密钥** 页面
2. 点击 **添加 API 密钥**
3. 设置密钥名称、配额上限、过期时间（可选）
4. 配置 IP 白名单以增强安全性（强烈建议）
5. 点击创建后**立即复制保存**，密钥仅显示一次

> ⚠️ 请勿将 API 密钥提交到公开仓库或分享给他人。
```

---

### 3. 如何充值？费用怎么算？

**Question:**
```
如何充值？费用怎么算？
```

**Answer:**
```
- 进入 **钱包** 页面查看余额和充值
- 支持多种支付方式：**支付宝**、**微信支付**、**Stripe**、**兑换码**
- 按 Token 用量计费，不同模型价格不同，详见 **定价** 页面
- 余额永不过期，订阅套餐享有折扣费率
- 兑换码可在钱包页面的"兑换码"区域输入
```

---

### 4. 平台支持哪些模型？

**Question:**
```
平台支持哪些模型？
```

**Answer:**
```
我们聚合了 **40+ 家模型提供商**，包括：

- **OpenAI**：GPT-4o、GPT-4、GPT-3.5、o1、o3 系列
- **Anthropic**：Claude Opus、Claude Sonnet、Claude Haiku
- **Google**：Gemini Pro、Gemini Flash 系列
- **Meta**：Llama 系列
- **DeepSeek**：DeepSeek-V3、DeepSeek-R1
- **Midjourney**：文生图（需单独配置）

> 📋 完整模型列表及实时可用状态请查看 **模型** 页面。
```

---

### 5. Token 是如何计算的？

**Question:**
```
Token 是如何计算的？
```

**Answer:**
```
- Token 是 AI 模型计费的基本单位，每次请求消耗 Token
- **输入 Token**：你发送的文本，包括系统提示词、对话历史
- **输出 Token**：模型生成的回复文本
- 不同模型的计费单价不同，我们已将各模型价格统一换算为标准计费单位
- 可在 **用量日志** 中查看每次请求的详细 Token 消耗

> 📊 仪表盘展示了聚合用量统计和趋势图表。
```

---

### 6. API 错误码速查表（基于项目实际后端逻辑）

**Question:**
```
请求报错了怎么办？常见 API 错误码含义及处理方法？
```

**Answer:**
```
本表基于项目后端中间件、分发器和错误处理模块的**真实返回逻辑**整理。

#### 一、HTTP 层错误码

| HTTP 状态码 | 含义 | 触发条件 | 解决方法 |
|-------------|------|----------|----------|
| **400 Bad Request** | 请求格式错误 | 请求体 JSON 格式不正确、`model` 字段为空、Playground 请求解析失败、指定了无效的渠道 ID | 检查请求体语法，确保 `model` 字段已填写且渠道 ID 有效 |
| **401 Unauthorized** | 认证失败 | API Key 未提供 / 不存在 / 已过期 / 状态不可用、Access Token 无效、用户信息不合法 | 检查 `Authorization: Bearer <key>` Header，确认 Key 未过期 |
| **403 Forbidden** | 无权限访问 | Key 配额耗尽 - `token.exhausted`、用户被封禁 - `auth.user_banned`、IP 不在白名单中 - `access_denied`、无权访问指定分组、分组已被弃用、渠道已被禁用、Token 未授权该模型、亲和渠道已禁用 | 检查 Key 剩余配额、IP 白名单、分组权限、模型授权 |
| **429 Too Many Requests** | 频率限制 | 触发模型级请求速率限制（N 分钟内最多 M 次）、全局请求数限制（含失败请求） | 降低并发、等待限流窗口结束后重试、升级套餐 |
| **500 Internal Server Error** | 服务器内部错误 | Token 生成/查询失败、速率检查内部错误、上游渠道获取失败 | 稍后重试，若持续出现请联系管理员 |
| **503 Service Unavailable** | 服务不可用 | 指定模型中无可用渠道 - `distributor.no_available_channel`、所有渠道均已禁用或故障 - `ErrorCodeModelNotFound` | 等待渠道恢复或联系管理员启用备用渠道 |

#### 二、应用层错误码 (ErrorCode)

平台内部使用统一 OpenAPI 错误格式返回，包含 `error.code` 字段：

| ErrorCode | 含义 | 触发场景 |
|-----------|------|----------|
| `invalid_request` | 无效请求 | 请求体为空、API 类型不匹配、模型映射失败 |
| `access_denied` | 访问被拒绝 | IP 不在白名单、Token 无权访问模型或分组 |
| `token_not_provided` | 未提供 Token | 请求 Header 中缺少 Authorization |
| `token_invalid` | Token 无效 | API Key 不存在或已被禁用 |
| `token_expired` | Token 已过期 | API Key 超过设定的有效期 |
| `token_exhausted` | Token 配额用尽 | API Key 剩余额度为 0 或负数 |
| `token_status_unavailable` | Token 状态不可用 | API Key 被管理员禁用或状态异常 |
| `model_not_found` | 模型不可用 | 指定模型的所有渠道均已故障/禁用，无可用渠道 |
| `channel_no_available_key` | 渠道无可用密钥 | 上游提供商的 API Key 全部失效 |
| `do_request_failed` | 上游请求失败 | 向上游模型发起 HTTP 请求时网络错误或超时 |
| `bad_response_status_code` | 上游返回异常 | 上游模型返回非 200 状态码 |
| `read_response_body_failed` | 读取响应失败 | 上游返回体无法读取 |
| `json_marshal_failed` | JSON 序列化失败 | 请求转换时 JSON 编码出错 |
| `count_token_failed` | Token 计费失败 | 无法计算本次请求的 Token 消耗 |
| `sensitive_words_detected` | 检测到敏感词 | 请求内容触发敏感词过滤规则 |
| `prompt_blocked` | Prompt 被拦截 | 请求内容被安全策略拦截 |
| `channel_response_time_exceeded` | 渠道响应超时 | 上游模型响应时间超过设定的阈值 |

> 🔍 完整错误日志可在 **用量日志** 页面按时间、模型、状态码筛选查看。
```

---

### 7. 如何保护 API 密钥安全？

**Question:**
```
如何限制 API 密钥的使用范围？
```

**Answer:**
```
创建 API 密钥时可设置以下安全策略：

- **配额上限**：限制该密钥可消耗的 Token 总量
- **过期时间**：密钥到期后自动失效
- **IP 白名单**：仅允许指定 IP 地址发起请求（推荐生产环境开启）
- **模型限制**：限定该密钥可访问的模型列表

> 🔐 生产环境请务必开启 IP 白名单，避免密钥泄露后被盗用。
```

---

### 8. 订阅套餐怎么购买？有什么好处？

**Question:**
```
订阅套餐怎么购买？有什么好处？
```

**Answer:**
```
1. 进入 **钱包** 页面，切换到 **订阅套餐** 标签页
2. 选择适合的套餐，点击 **立即订阅** 完成购买
3. 订阅后自动享受折扣费率，无需额外操作

套餐优势：
- 📉 **折扣费率** — 通常为标准价格的 5-20% 折扣
- 🔄 **自动重置配额** — 按天/周/月自动刷新型号额度
- 🎯 **优先路由** — 享有更快的渠道响应速度
- 💰 **更高并发** — 部分套餐提供更高的请求并发上限

> ⚡ 支持同时持有多个订阅，可随时取消。取消后未用额度按比例退款至钱包。
```

---

### 9. 支持流式输出 (Streaming) 吗？

**Question:**
```
支持流式 (Stream) 输出吗？怎么开启？
```

**Answer:**
```
支持！所有对话补全接口均支持 **SSE (Server-Sent Events)** 流式输出。

用法：在请求体中设置 `"stream": true` 即可：

`{"model": "gpt-3.5-turbo", "messages": [...], "stream": true}`

如果使用本平台的 **Playground（演示场）**，流式输出默认开启，可直接体验。

> 📖 完整的 API 文档请查看 **文档** 页面。
```

---

### 10. 数据隐私如何保障？

**Question:**
```
我的数据隐私安全吗？
```

**Answer:**
```
平台高度重视数据隐私与安全：

- **不用于训练**：你的 API 请求数据不会被用于模型训练
- **不持久存储**：请求/响应内容仅在计费所需范围内保留，不做额外存储
- **传输加密**：所有 API 流量均通过 HTTPS/TLS 加密传输
- **不共享数据**：我们不会将你的数据分享给任何第三方

> 📄 完整条款请阅读 **隐私政策** 和 **用户协议**。
```

---

## 操作步骤

1. 访问 `https://118.25.43.185/system-settings/content/faq`
2. 确认右上角 **Enabled** 开关已启用
3. 点击 **Add FAQ**，逐条粘贴上方的 Question 和 Answer
4. Markdown 表格和格式会自动渲染
5. 全部 10 条添加完成后，点击 **Save Settings** 保存

添加完成后，FAQ 将自动显示在仪表盘概览页的「常见问答」面板中（手风琴折叠样式）。
