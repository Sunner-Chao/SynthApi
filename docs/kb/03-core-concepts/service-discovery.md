# 服务发现与渠道选择

> **摘要**：SynthAPI 的渠道选择系统基于分组、优先级、权重和健康状态的多维选择算法。支持渠道亲和性、智能分组、跨分组重试等高级特性，确保请求总能路由到最优的上游渠道。

## 渠道选择架构

```
请求进入
    │
    ▼
┌─────────────────────────────────────┐
│       Distribute 中间件              │
│  1. 提取模型名                       │
│  2. 检查 Token 模型限制              │
│  3. 检查渠道亲和性缓存               │
│  4. 调用 CacheGetRandomSatisfiedChannel │
│  5. 设置渠道信息到上下文             │
└──────────────────┬──────────────────┘
                   │
                   ▼
┌─────────────────────────────────────┐
│    CacheGetRandomSatisfiedChannel   │
│  1. 确定分组（auto/指定/智能）       │
│  2. 获取分组下支持模型的渠道         │
│  3. 按优先级排序                     │
│  4. 同优先级内按权重随机选择         │
│  5. 返回选中的渠道                   │
└─────────────────────────────────────┘
```

## 分组机制

### 分组类型

| 分组 | 说明 | 使用场景 |
|------|------|----------|
| `default` | 默认分组 | 普通用户 |
| `vip` | VIP 分组 | 付费用户 |
| `auto` | 自动分组 | 智能路由 |
| 自定义 | 管理员创建 | 特殊需求 |

### 分组与用户

每个用户属于一个分组，分组决定了：
- 可以使用哪些渠道
- 模型的价格比率
- 可用的模型列表

### 分组与 Token

Token 可以指定分组，覆盖用户的默认分组：

```json
{
    "name": "my-token",
    "group": "vip"
}
```

### 自动分组 (auto)

当 Token 的分组为 `auto` 时，系统会自动选择最优分组：

1. 获取用户所属分组
2. 查询用户的可用分组列表
3. 遍历每个分组，查找支持目标模型的渠道
4. 使用第一个找到的渠道

```go
// service/channel_select.go
if param.TokenGroup == "auto" {
    autoGroups := GetUserAutoGroup(userGroup)
    for _, group := range autoGroups {
        channel := GetRandomSatisfiedChannel(group, modelName)
        if channel != nil {
            return channel, group, nil
        }
    }
}
```

### 智能分组 (Smart Group)

智能分组是一种高级分组机制，可以将多个基础分组组合成一个逻辑分组：

```json
// 配置示例
{
    "name": "smart-premium",
    "sources": ["vip", "premium", "enterprise"]
}
```

当 Token 使用智能分组时，系统会从所有源分组中选择渠道。

配置位置：系统设置 → 智能分组

## 渠道选择算法

### 选择流程

```go
func CacheGetRandomSatisfiedChannel(param *RetryParam) (*model.Channel, string, error) {
    // 1. 确定分组
    selectGroup := param.TokenGroup

    // 2. 获取分组下支持模型的渠道
    channels := model.GetChannelsByGroupAndModel(selectGroup, modelName)

    // 3. 按优先级排序
    sort.Slice(channels, func(i, j int) bool {
        return *channels[i].Priority < *channels[j].Priority
    })

    // 4. 找到最高优先级
    minPriority := *channels[0].Priority

    // 5. 筛选同优先级的渠道
    samePriorityChannels := filterByPriority(channels, minPriority)

    // 6. 按权重随机选择
    return weightedRandomSelect(samePriorityChannels)
}
```

### 优先级

- 数值越小越优先
- 默认值为 0
- 支持负数

### 权重

- 同优先级内按权重随机选择
- 权重越大，被选中的概率越高
- 默认值为 0（等权重）

### 示例

```
渠道 A：优先级=1，权重=3
渠道 B：优先级=1，权重=1
渠道 C：优先级=2，权重=5

选择顺序：
1. 先比较优先级：A(1) < C(2)，所以 A、B 优先
2. 同优先级内按权重：A 被选中的概率 = 3/(3+1) = 75%
```

## 渠道亲和性

### 原理

渠道亲和性是一种优化机制，将特定用户的请求优先路由到之前成功响应的渠道，减少试错成本。

### 工作流程

1. **记录亲和性**：请求成功后，记录用户-模型-渠道的映射关系
2. **查询亲和性**：下次请求时，优先使用上次成功的渠道
3. **更新亲和性**：如果渠道失败，清除亲和性记录

### 实现

```go
// service/channel_affinity.go

// 记录亲和性
func RecordChannelAffinity(c *gin.Context, channelID int) {
    userId := c.GetInt("id")
    model := c.GetString("model")
    key := fmt.Sprintf("%d:%s", userId, model)
    affinityCache.Set(key, channelID)
}

// 查询亲和性
func GetPreferredChannelByAffinity(c *gin.Context, model string, group string) (int, bool) {
    userId := c.GetInt("id")
    key := fmt.Sprintf("%d:%s", userId, model)
    if channelID, ok := affinityCache.Get(key); ok {
        return channelID.(int), true
    }
    return 0, false
}
```

### 配置

渠道亲和性通过系统选项控制：
- 启用/禁用
- 缓存过期时间
- 失败后跳过重试

## 跨分组重试

### 原理

当 Token 使用 `auto` 分组时，如果某个分组的渠道全部不可用，系统会自动尝试其他分组的渠道。

### 配置

Token 的 `cross_group_retry` 字段控制是否启用跨分组重试：

```json
{
    "name": "my-token",
    "group": "auto",
    "cross_group_retry": true
}
```

### 重试流程

```
Retry=0: GroupA, priority0
Retry=1: GroupA, priority1
Retry=2: GroupA 用完 → GroupB, priority0
Retry=3: GroupB, priority1
```

### 实现

```go
// service/channel_select.go
if param.TokenGroup == "auto" && token.CrossGroupRetry {
    autoGroups := GetUserAutoGroup(userGroup)

    // 记录当前分组索引
    groupIndex := getContextKeyInt(c, constant.ContextKeyAutoGroupIndex)
    startRetryIndex := getContextKeyInt(c, constant.ContextKeyAutoGroupRetryIndex)

    // 计算当前分组内的重试次数
    priorityRetry := retry - startRetryIndex

    // 尝试当前分组
    channel := GetRandomSatisfiedChannel(autoGroups[groupIndex], modelName, priorityRetry)

    if channel == nil {
        // 当前分组用完，切换到下一个分组
        groupIndex++
        startRetryIndex = retry
        channel = GetRandomSatisfiedChannel(autoGroups[groupIndex], modelName, 0)
    }

    return channel
}
```

## 渠道健康检查

### 自动禁用

当渠道连续失败时，系统会自动禁用该渠道：

```go
// model/channel.go
func (channel *Channel) AutoBan() {
    if channel.AutoBan != nil && *channel.AutoBan == 1 {
        channel.Status = common.ChannelStatusDisabled
    }
}
```

### 自动测试

系统定期测试渠道的可用性：

```go
// controller/channel-test.go
func AutomaticallyTestChannels() {
    // 定期测试所有渠道
    // 更新渠道的响应时间和状态
}
```

### 手动测试

管理员可以手动测试渠道：

```bash
# 测试单个渠道
GET /api/channel/test/:id

# 测试所有渠道
GET /api/channel/test
```

## 渠道缓存

### 内存缓存

渠道信息缓存在内存中，减少数据库查询：

```go
// model/channel_cache.go
var channelCache sync.Map

func CacheGetChannel(id int) (*Channel, error) {
    if cached, ok := channelCache.Load(id); ok {
        return cached.(*Channel), nil
    }
    // 从数据库加载
    channel, err := GetChannelById(id)
    if err == nil {
        channelCache.Store(id, channel)
    }
    return channel, err
}
```

### 缓存同步

多节点部署时，通过 Redis 同步缓存：

```go
// model/channel_cache.go
func SyncChannelCache(frequency int) {
    ticker := time.NewTicker(time.Duration(frequency) * time.Second)
    for range ticker.C {
        // 从数据库重新加载所有渠道
        // 更新本地缓存
    }
}
```

## Ability 表

Ability 表记录了渠道与模型的映射关系：

```go
// model/ability.go
type Ability struct {
    Model    string `json:"model" gorm:"index"`
    Group    string `json:"group" gorm:"index"`
    ChannelId int   `json:"channel_id" gorm:"index"`
    Enabled  bool   `json:"enabled"`
}
```

### 查询

```go
// 获取支持指定模型的渠道
func GetChannelsByModel(model string, group string) []int {
    var abilities []Ability
    DB.Where("model = ? AND group = ? AND enabled = ?", model, group, true).Find(&abilities)
    var channelIds []int
    for _, a := range abilities {
        channelIds = append(channelIds, a.ChannelId)
    }
    return channelIds
}
```

## 负载均衡策略

### 加权随机

同优先级内的渠道按权重随机选择：

```go
func weightedRandomSelect(channels []*Channel) *Channel {
    totalWeight := 0
    for _, ch := range channels {
        totalWeight += int(*ch.Weight)
    }

    r := rand.Intn(totalWeight)
    for _, ch := range channels {
        r -= int(*ch.Weight)
        if r < 0 {
            return ch
        }
    }
    return channels[0]
}
```

### 响应时间加权

> ⚠️ 待验证：未来可能支持基于响应时间的动态权重调整。

## 最佳实践

1. **合理设置优先级**：将稳定的渠道设置更高优先级
2. **使用权重**：根据渠道容量设置权重
3. **启用亲和性**：减少试错成本
4. **配置跨分组重试**：提高可用性
5. **定期测试渠道**：及时发现和修复问题
6. **监控渠道状态**：设置告警，及时处理故障
