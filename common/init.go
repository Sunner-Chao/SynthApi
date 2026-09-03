package common

import (
	"flag"
	"fmt"
	"log"
	"net/http"
	"os"
	"path/filepath"
	"strconv"
	"strings"
	"time"

	"github.com/QuantumNous/new-api/constant"
)

var (
	Port         = flag.Int("port", 3000, "the listening port")
	PrintVersion = flag.Bool("version", false, "print version and exit")
	PrintHelp    = flag.Bool("help", false, "print help and exit")
	LogDir       = flag.String("log-dir", "./logs", "specify the log directory")
)

func printHelp() {
	fmt.Println("NewAPI(Based OneAPI) " + Version + " - The next-generation LLM gateway and AI asset management system supports multiple languages.")
	fmt.Println("Original Project: OneAPI by JustSong - https://github.com/songquanpeng/one-api")
	fmt.Println("Maintainer: QuantumNous - https://github.com/QuantumNous/new-api")
	fmt.Println("Usage: newapi [--port <port>] [--log-dir <log directory>] [--version] [--help]")
}

func InitEnv() {
	flag.Parse()

	envVersion := os.Getenv("VERSION")
	if envVersion != "" {
		Version = envVersion
	}

	if *PrintVersion {
		fmt.Println(Version)
		os.Exit(0)
	}

	if *PrintHelp {
		printHelp()
		os.Exit(0)
	}

	if os.Getenv("SESSION_SECRET") != "" {
		ss := os.Getenv("SESSION_SECRET")
		if ss == "random_string" {
			log.Println("WARNING: SESSION_SECRET is set to the default value 'random_string', please change it to a random string.")
			log.Println("警告：SESSION_SECRET被设置为默认值'random_string'，请修改为随机字符串。")
			log.Fatal("Please set SESSION_SECRET to a random string.")
		} else {
			SessionSecret = ss
		}
	}
	if os.Getenv("CRYPTO_SECRET") != "" {
		CryptoSecret = os.Getenv("CRYPTO_SECRET")
	} else {
		CryptoSecret = SessionSecret
	}
	if os.Getenv("SQLITE_PATH") != "" {
		SQLitePath = os.Getenv("SQLITE_PATH")
	}
	if *LogDir != "" {
		var err error
		*LogDir, err = filepath.Abs(*LogDir)
		if err != nil {
			log.Fatal(err)
		}
		if _, err := os.Stat(*LogDir); os.IsNotExist(err) {
			err = os.Mkdir(*LogDir, 0777)
			if err != nil {
				log.Fatal(err)
			}
		}
	}

	// Initialize variables from constants.go that were using environment variables
	DebugEnabled = os.Getenv("DEBUG") == "true"
	MemoryCacheEnabled = os.Getenv("MEMORY_CACHE_ENABLED") == "true"
	IsMasterNode = os.Getenv("NODE_TYPE") != "slave"
	NodeName = os.Getenv("NODE_NAME")
	TLSInsecureSkipVerify = GetEnvOrDefaultBool("TLS_INSECURE_SKIP_VERIFY", false)
	if TLSInsecureSkipVerify {
		if tr, ok := http.DefaultTransport.(*http.Transport); ok && tr != nil {
			if tr.TLSClientConfig != nil {
				tr.TLSClientConfig.InsecureSkipVerify = true
			} else {
				tr.TLSClientConfig = InsecureTLSConfig
			}
		}
	}

	// Parse requestInterval and set RequestInterval
	requestInterval, _ = strconv.Atoi(os.Getenv("POLLING_INTERVAL"))
	RequestInterval = time.Duration(requestInterval) * time.Second

	// Initialize variables with GetEnvOrDefault
	SyncFrequency = GetEnvOrDefault("SYNC_FREQUENCY", 60)
	BatchUpdateInterval = GetEnvOrDefault("BATCH_UPDATE_INTERVAL", 5)
	RelayTimeout = GetEnvOrDefault("RELAY_TIMEOUT", 0)
	RelayMaxIdleConns = GetEnvOrDefault("RELAY_MAX_IDLE_CONNS", 500)
	RelayMaxIdleConnsPerHost = GetEnvOrDefault("RELAY_MAX_IDLE_CONNS_PER_HOST", 100)
	RelayIdleConnTimeout = GetEnvOrDefault("RELAY_IDLE_CONN_TIMEOUT", 120)
	RelayDialTimeout = GetEnvOrDefault("RELAY_DIAL_TIMEOUT", 10)
	RelayDialKeepAlive = GetEnvOrDefault("RELAY_DIAL_KEEP_ALIVE", 30)
	RelayTLSHandshakeTimeout = GetEnvOrDefault("RELAY_TLS_HANDSHAKE_TIMEOUT", 10)
	RelayExpectContinueTimeout = GetEnvOrDefault("RELAY_EXPECT_CONTINUE_TIMEOUT", 1)
	RelayStageLogThresholdMs = GetEnvOrDefault("RELAY_STAGE_LOG_THRESHOLD_MS", 8000)
	RelayForceHTTP2 = GetEnvOrDefaultBool("RELAY_FORCE_HTTP2", true)
	ModelRequestMaxConcurrencyPerUser = GetEnvOrDefault("MODEL_REQUEST_MAX_CONCURRENCY_PER_USER", 10)
	ModelRequestMaxConcurrencyPerToken = GetEnvOrDefault("MODEL_REQUEST_MAX_CONCURRENCY_PER_TOKEN", 5)
	ModelRequestMaxConcurrencyPerPromptCacheKey = GetEnvOrDefault("MODEL_REQUEST_MAX_CONCURRENCY_PER_PROMPT_CACHE_KEY", 1)
	ModelRequestChannelCapacityQueueTimeoutMs = GetEnvOrDefault("MODEL_REQUEST_CHANNEL_CAPACITY_QUEUE_TIMEOUT_MS", 3000)
	ModelRequestAffinityCapacityQueueTimeoutMs = GetEnvOrDefault("MODEL_REQUEST_AFFINITY_CAPACITY_QUEUE_TIMEOUT_MS", 8000)
	ModelRequestDefaultChannelMaxConcurrency = GetEnvOrDefault("MODEL_REQUEST_DEFAULT_CHANNEL_MAX_CONCURRENCY", 15)
	ModelRequestDefaultChannelMaxConcurrencyPerUser = GetEnvOrDefault("MODEL_REQUEST_DEFAULT_CHANNEL_MAX_CONCURRENCY_PER_USER", 6)
	ModelRequestLargeBodyThresholdMB = GetEnvOrDefault("MODEL_REQUEST_LARGE_BODY_THRESHOLD_MB", 10)
	ModelRequestMaxLargeConcurrencyPerUser = GetEnvOrDefault("MODEL_REQUEST_MAX_LARGE_CONCURRENCY_PER_USER", 2)
	ModelRequestConcurrencyLeaseSeconds = GetEnvOrDefault("MODEL_REQUEST_CONCURRENCY_LEASE_SECONDS", 7200)
	if ModelRequestConcurrencyLeaseSeconds < 60 {
		ModelRequestConcurrencyLeaseSeconds = 60
	}
	ModelRequestConcurrencyExemptUserIDs = make(map[int]struct{})
	for _, rawUserID := range strings.Split(os.Getenv("MODEL_REQUEST_CONCURRENCY_EXEMPT_USER_IDS"), ",") {
		userID, err := strconv.Atoi(strings.TrimSpace(rawUserID))
		if err == nil && userID > 0 {
			ModelRequestConcurrencyExemptUserIDs[userID] = struct{}{}
		}
	}
	ModelTextRequestBodyMB = GetEnvOrDefault("MODEL_TEXT_REQUEST_BODY_MB", 0)
	ModelTextRequestBodyReadTimeout = GetEnvOrDefault("MODEL_TEXT_REQUEST_BODY_READ_TIMEOUT", 0)

	// Initialize string variables with GetEnvOrDefaultString
	GeminiSafetySetting = GetEnvOrDefaultString("GEMINI_SAFETY_SETTING", "BLOCK_NONE")
	CohereSafetySetting = GetEnvOrDefaultString("COHERE_SAFETY_SETTING", "NONE")

	// Initialize rate limit variables
	GlobalApiRateLimitEnable = GetEnvOrDefaultBool("GLOBAL_API_RATE_LIMIT_ENABLE", true)
	GlobalApiRateLimitNum = GetEnvOrDefault("GLOBAL_API_RATE_LIMIT", 180)
	GlobalApiRateLimitDuration = int64(GetEnvOrDefault("GLOBAL_API_RATE_LIMIT_DURATION", 180))

	GlobalWebRateLimitEnable = GetEnvOrDefaultBool("GLOBAL_WEB_RATE_LIMIT_ENABLE", true)
	GlobalWebRateLimitNum = GetEnvOrDefault("GLOBAL_WEB_RATE_LIMIT", 60)
	GlobalWebRateLimitDuration = int64(GetEnvOrDefault("GLOBAL_WEB_RATE_LIMIT_DURATION", 180))

	CriticalRateLimitEnable = GetEnvOrDefaultBool("CRITICAL_RATE_LIMIT_ENABLE", true)
	CriticalRateLimitNum = GetEnvOrDefault("CRITICAL_RATE_LIMIT", 20)
	CriticalRateLimitDuration = int64(GetEnvOrDefault("CRITICAL_RATE_LIMIT_DURATION", 20*60))

	SearchRateLimitEnable = GetEnvOrDefaultBool("SEARCH_RATE_LIMIT_ENABLE", true)
	SearchRateLimitNum = GetEnvOrDefault("SEARCH_RATE_LIMIT", 10)
	SearchRateLimitDuration = int64(GetEnvOrDefault("SEARCH_RATE_LIMIT_DURATION", 60))

	// Registration is deliberately rate-limited separately from login and
	// password-reset traffic. The subnet limit is a conservative /24 (IPv4)
	// guard; IPv6 uses exact-IP checks unless a future network prefix is added.
	RegistrationRateLimitEnable = GetEnvOrDefaultBool("REGISTER_RATE_LIMIT_ENABLE", true)
	RegistrationRateLimitNum = GetEnvOrDefault("REGISTER_RATE_LIMIT", 5)
	RegistrationRateLimitDuration = int64(GetEnvOrDefault("REGISTER_RATE_LIMIT_DURATION", 3600))
	RegistrationGlobalRateLimitEnable = GetEnvOrDefaultBool("REGISTER_GLOBAL_RATE_LIMIT_ENABLE", true)
	RegistrationGlobalRateLimitNum = GetEnvOrDefault("REGISTER_GLOBAL_RATE_LIMIT", 5)
	RegistrationGlobalRateLimitDuration = int64(GetEnvOrDefault("REGISTER_GLOBAL_RATE_LIMIT_DURATION", 3600))
	RegisterSubnetLimitEnable = GetEnvOrDefaultBool("REGISTER_SUBNET_LIMIT_ENABLE", true)
	RegisterSubnetLimitMaxAccounts = GetEnvOrDefault("REGISTER_SUBNET_LIMIT", 3)
	if RegisterSubnetLimitMaxAccounts < 1 {
		RegisterSubnetLimitMaxAccounts = 1
	}
	CheckinMinAccountAgeSeconds = int64(GetEnvOrDefault("CHECKIN_MIN_ACCOUNT_AGE_SECONDS", 0))
	if CheckinMinAccountAgeSeconds < 0 {
		CheckinMinAccountAgeSeconds = 0
	}
	AffiliateRewardAfterPayment = GetEnvOrDefaultBool("AFFILIATE_REWARD_AFTER_PAYMENT", true)
	// Rewards require a real payment by default. Set to 0 only when the
	// operator explicitly wants the old zero-value threshold.
	if raw := os.Getenv("AFFILIATE_REWARD_MIN_PAYMENT"); raw != "" {
		if value, err := strconv.ParseFloat(raw, 64); err == nil && value >= 0 {
			AffiliateRewardMinPayment = value
		} else {
			AffiliateRewardMinPayment = 1
			SysError(fmt.Sprintf("failed to parse AFFILIATE_REWARD_MIN_PAYMENT: %q, using default value: %.2f", raw, AffiliateRewardMinPayment))
		}
	} else {
		AffiliateRewardMinPayment = 1
	}
	initConstantEnv()
}

func initConstantEnv() {
	constant.StreamingTimeout = GetEnvOrDefault("STREAMING_TIMEOUT", 300)
	constant.DifyDebug = GetEnvOrDefaultBool("DIFY_DEBUG", true)
	constant.MaxFileDownloadMB = GetEnvOrDefault("MAX_FILE_DOWNLOAD_MB", 64)
	constant.StreamScannerMaxBufferMB = GetEnvOrDefault("STREAM_SCANNER_MAX_BUFFER_MB", 128)
	// MaxRequestBodyMB 请求体最大大小（解压后），用于防止超大请求/zip bomb导致内存暴涨
	constant.MaxRequestBodyMB = GetEnvOrDefault("MAX_REQUEST_BODY_MB", 128)
	// ForceStreamOption 覆盖请求参数，强制返回usage信息
	constant.ForceStreamOption = GetEnvOrDefaultBool("FORCE_STREAM_OPTION", true)
	constant.CountToken = GetEnvOrDefaultBool("CountToken", true)
	constant.GetMediaToken = GetEnvOrDefaultBool("GET_MEDIA_TOKEN", true)
	constant.GetMediaTokenNotStream = GetEnvOrDefaultBool("GET_MEDIA_TOKEN_NOT_STREAM", false)
	constant.UpdateTask = GetEnvOrDefaultBool("UPDATE_TASK", true)
	constant.AzureDefaultAPIVersion = GetEnvOrDefaultString("AZURE_DEFAULT_API_VERSION", "2025-04-01-preview")
	constant.NotifyLimitCount = GetEnvOrDefault("NOTIFY_LIMIT_COUNT", 2)
	constant.NotificationLimitDurationMinute = GetEnvOrDefault("NOTIFICATION_LIMIT_DURATION_MINUTE", 10)
	// GenerateDefaultToken 是否生成初始令牌，默认关闭。
	constant.GenerateDefaultToken = GetEnvOrDefaultBool("GENERATE_DEFAULT_TOKEN", false)
	// 是否启用错误日志
	constant.ErrorLogEnabled = GetEnvOrDefaultBool("ERROR_LOG_ENABLED", false)
	// 任务轮询时查询的最大数量
	constant.TaskQueryLimit = GetEnvOrDefault("TASK_QUERY_LIMIT", 1000)
	// 异步任务超时时间（分钟），超过此时间未完成的任务将被标记为失败并退款。0 表示禁用。
	constant.TaskTimeoutMinutes = GetEnvOrDefault("TASK_TIMEOUT_MINUTES", 1440)

	soraPatchStr := GetEnvOrDefaultString("TASK_PRICE_PATCH", "")
	if soraPatchStr != "" {
		var taskPricePatches []string
		soraPatches := strings.Split(soraPatchStr, ",")
		for _, patch := range soraPatches {
			trimmedPatch := strings.TrimSpace(patch)
			if trimmedPatch != "" {
				taskPricePatches = append(taskPricePatches, trimmedPatch)
			}
		}
		constant.TaskPricePatches = taskPricePatches
	}

	// Initialize trusted redirect domains for URL validation
	trustedDomainsStr := GetEnvOrDefaultString("TRUSTED_REDIRECT_DOMAINS", "")
	var trustedDomains []string
	domains := strings.Split(trustedDomainsStr, ",")
	for _, domain := range domains {
		trimmedDomain := strings.TrimSpace(domain)
		if trimmedDomain != "" {
			// Normalize domain to lowercase
			trustedDomains = append(trustedDomains, strings.ToLower(trimmedDomain))
		}
	}
	constant.TrustedRedirectDomains = trustedDomains
}
