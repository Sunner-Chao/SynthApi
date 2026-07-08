package setting

import "strings"

var CheckSensitiveEnabled = true
var CheckSensitiveOnPromptEnabled = true
var SensitiveNotifyAdminEmailEnabled = false
var SensitiveNotifyUserEmailEnabled = false
var SensitiveRiskScanEnabled = true
var SensitiveRiskThreshold = 100
var SensitiveRiskAllowRules = DefaultSensitiveRiskAllowRules()

//var CheckSensitiveOnCompletionEnabled = true

// StopOnSensitiveEnabled 如果检测到敏感词，是否立刻停止生成，否则替换敏感词
var StopOnSensitiveEnabled = true

// StreamCacheQueueLength 流模式缓存队列长度，0表示无缓存
var StreamCacheQueueLength = 0

// SensitiveWords 敏感词
// var SensitiveWords []string
var SensitiveWords = []string{
	// High-confidence policy keywords. Broader intent detection lives in
	// SensitiveIntentRules to reduce false positives for legitimate development.
	"儿童色情",
	"未成年人裸照",
	"未成年性内容",
	"萝莉色情",
	"招嫖",
	"卖淫嫖娼",
	"援交",
	"裸聊诈骗",
	"黄播",
	"成人视频引流",
	"博彩平台",
	"网赌平台",
	"私彩平台",
	"六合彩",
	"时时彩",
	"百家乐",
	"赌球盘口",
	"赌博代理",
	"博彩引流",
	"毒品交易",
	"冰毒",
	"海洛因",
	"芬太尼",
	"可卡因",
	"摇头丸",
	"k粉",
	"麻古",
	"甲基苯丙胺",
	"制毒配方",
	"贩毒",
	"洗钱",
	"跑分平台",
	"四方支付",
	"黑产",
	"灰产",
	"接码平台",
	"猫池",
	"卡商",
	"实名号买卖",
	"银行卡买卖",
	"诈骗话术",
	"钓鱼网站",
	"钓鱼邮件",
	"仿冒登录",
	"杀猪盘",
	"刷单返利",
	"虚假投资",
	"短信轰炸",
	"社工库",
	"开盒",
	"人肉搜索",
	"撞库",
	"脱库",
	"数据泄露",
	"窃取密码",
	"窃取token",
	"窃取cookie",
	"窃取私钥",
	"盗取账号",
	"木马",
	"后门程序",
	"勒索病毒",
	"免杀",
	"shellcode",
	"漏洞利用",
	"提权",
	"僵尸网络",
	"ddos攻击",
	"爆破密码",
	"炸药配方",
	"爆炸物制作",
	"枪支改装",
	"管制刀具交易",
	"恐怖袭击",
	"恐怖组织",
	"极端主义宣传",
	"自杀教程",
	"自残教程",
	"无痛自杀",
	"绕过验证码",
	"跳过验证码",
	"绕过风控",
	"绕过封禁",
	"绕过审核",
	"越狱提示词",
	"泄露系统提示词",
	"忽略系统提示",
	"developer mode jailbreak",
	"ignore previous instructions",
}

var SensitiveIntentRules = DefaultSensitiveIntentRules()
var SensitiveRegexRules = DefaultSensitiveRegexRules()

func SensitiveWordsToString() string {
	return strings.Join(SensitiveWords, "\n")
}

func SensitiveWordsFromString(s string) {
	SensitiveWords = []string{}
	sw := strings.Split(s, "\n")
	for _, w := range sw {
		w = strings.TrimSpace(w)
		if w != "" {
			SensitiveWords = append(SensitiveWords, w)
		}
	}
}

func DefaultSensitiveIntentRules() string {
	return strings.TrimSpace(`
绕过验证与风控@100: 跳过|绕过|绕开|规避|破解|突破|关闭|禁用|bypass|skip|avoid|evade + 验证码|captcha|人机验证|风控|审核|限制|封禁|限流|登录验证|二次验证|2fa|mfa
提示词注入与越狱@110: 忽略|无视|覆盖|泄露|显示|输出|绕过|越狱|jailbreak|prompt injection|ignore previous|developer mode + 系统提示|system prompt|开发者消息|developer message|隐藏指令|安全规则|内部规则|上级指令|策略
凭证窃取与泄露@140: 窃取|盗取|抓取|提取|导出|读取|dump|steal|exfiltrate|extract + 密码|口令|token|api key|apikey|cookie|session|私钥|access key|secret|凭证
恶意代码与入侵@160: 编写|生成|制作|部署|投放|攻击|入侵|利用|绕过|免杀 + 木马|后门|勒索|病毒|蠕虫|shellcode|payload|漏洞利用|提权|反沙箱|持久化|僵尸网络
诈骗与钓鱼@150: 生成|编写|制作|推广|引流|批量发送|自动化|伪造 + 诈骗|钓鱼|杀猪盘|仿冒登录|假冒客服|虚假投资|刷单返利|短信轰炸|社工话术|钓鱼邮件
赌博博彩@150: 搭建|推广|引流|投注|开奖|代理|充值|套利|运营|制作 + 赌博|博彩|网赌|私彩|六合彩|时时彩|百家乐|赌球|私彩平台|盘口|博彩平台
毒品交易与制作@180: 制作|合成|提纯|种植|购买|出售|交易|运输|邮寄|配方 + 毒品|冰毒|海洛因|大麻|k粉|摇头丸|芬太尼|甲基苯丙胺|麻古|可卡因
色情与非法性交易@150: 制作|生成|传播|推广|引流|交易|购买|招募|组织 + 色情|淫秽|卖淫|嫖娼|援交|裸聊|成人视频|黄播|招嫖
未成年性内容@200: 制作|生成|传播|购买|出售|诱导|描写 + 未成年性|儿童色情|幼女|幼童|萝莉色情|未成年人裸照
黑灰产与洗钱@160: 搭建|推广|交易|购买|出售|收购|洗白|套现|跑分|代付|接码 + 黑产|灰产|洗钱|四方支付|银行卡|实名号|料子|卡商|猫池|接码平台|跑分平台
隐私侵犯与开盒@150: 查询|购买|出售|导出|泄露|定位|开盒|人肉|撞库|社工 + 身份证|手机号|住址|户籍|行踪|社工库|个人隐私|个人信息|数据库
武器与危险物@170: 制作|配方|购买|改装|组装|运输|使用|教程 + 枪支|弹药|炸药|爆炸物|燃烧瓶|毒气|管制刀具|武器|雷管
自残自杀指导@170: 方法|教程|步骤|药量|无痛|快速|具体方案 + 自杀|自残|轻生|结束生命
极端暴力与恐怖活动@180: 宣传|招募|策划|制作|袭击|实施|资助|传播 + 恐怖组织|极端主义|暴恐|爆恐|袭击目标|圣战
`)
}

func DefaultSensitiveRegexRules() string {
	return strings.TrimSpace(`
API 密钥泄露: (?i)\b(?:sk-[a-z0-9][a-z0-9_-]{20,}|xox[baprs]-[a-z0-9-]{20,}|AIza[0-9A-Za-z_-]{20,}|AKIA[0-9A-Z]{16})\b
私钥泄露: -----BEGIN (?:RSA |DSA |EC |OPENSSH |PGP )?PRIVATE KEY-----
高风险凭证字段: (?i)\b(?:password|passwd|pwd|secret|access[_-]?token|refresh[_-]?token|private[_-]?key)\s*[:=]\s*['"]?[A-Za-z0-9_./+=@!#$%^&*~-]{8,}
银行卡敏感信息: \b(?:\d[ -]?){13,19}\b
`)
}

func DefaultSensitiveRiskAllowRules() string {
	return strings.TrimSpace(`
防御性安全修复@80: 修复|修补|加固|防护|防御|检测|审计|排查|复现|缓解|remediate|mitigate|patch|fix|detect|audit|harden + 漏洞|代码|项目|本地项目|工程|系统|服务|接口|依赖|配置|验证码|风控|权限|认证|登录|注入|xss|csrf|ssrf|sql injection|rce
授权测试与教学@40: 授权|合法|本地|靶场|ctf|教学|学习|实验|自有|内部测试|安全研究|authorized|lab|local|defensive + 测试|验证|分析|复现|演示|练习|审计|漏洞
工程代理任务@80: 项目|工程|源码|仓库|repo|代码库|实现|修复|优化|重构|测试|编译|构建|审计|验收|证据|evidence|plan|task|runtime|source tree + agent|codex|developer|system|prompt|instructions|tools|skills|plugins|permissions|final response|role
`)
}

func SensitiveIntentRulesFromString(s string) {
	SensitiveIntentRules = strings.TrimSpace(s)
}

func SensitiveRegexRulesFromString(s string) {
	SensitiveRegexRules = strings.TrimSpace(s)
}

func SensitiveRiskAllowRulesFromString(s string) {
	SensitiveRiskAllowRules = strings.TrimSpace(s)
}

func ShouldCheckPromptSensitive() bool {
	return CheckSensitiveEnabled && CheckSensitiveOnPromptEnabled
}

//func ShouldCheckCompletionSensitive() bool {
//	return CheckSensitiveEnabled && CheckSensitiveOnCompletionEnabled
//}
