package common

import (
	"crypto"
	"crypto/rand"
	"crypto/rsa"
	"crypto/sha256"
	"crypto/x509"
	"encoding/base64"
	"encoding/pem"
	"fmt"
	"log"
	"net/url"
	"sort"
	"strings"
)

// EpayV2Config 易支付 V2 配置
type EpayV2Config struct {
	MerchantNo   string // 商户号
	PrivateKey   string // 商户私钥 (PEM 格式)
	PlatformKey  string // 平台公钥 (PEM 格式，用于验证回调)
	BaseURL      string // 网关地址
}

// EpayV2Client 易支付 V2 客户端
type EpayV2Client struct {
	config *EpayV2Config
}

// NewEpayV2Client 创建易支付 V2 客户端
func NewEpayV2Client(config *EpayV2Config) *EpayV2Client {
	return &EpayV2Client{config: config}
}

// cleanPEMKey cleans up PEM key strings that may have extra whitespace
func cleanPEMKey(key string) string {
	// Remove carriage returns
	key = strings.ReplaceAll(key, "\r\n", "\n")
	key = strings.ReplaceAll(key, "\r", "\n")

	// Split into lines, trim each line, and rejoin
	lines := strings.Split(key, "\n")
	cleanedLines := make([]string, 0, len(lines))
	for _, line := range lines {
		trimmed := strings.TrimSpace(line)
		if trimmed != "" {
			cleanedLines = append(cleanedLines, trimmed)
		}
	}

	return strings.Join(cleanedLines, "\n")
}

// SignWithRSA 使用 RSA 私钥签名
func (c *EpayV2Client) SignWithRSA(data string) (string, error) {
	// Clean up the private key
	privateKeyStr := cleanPEMKey(c.config.PrivateKey)

	block, _ := pem.Decode([]byte(privateKeyStr))
	if block == nil {
		return "", fmt.Errorf("failed to decode private key PEM block")
	}

	// Try PKCS8 first, then PKCS1
	privateKey, err := x509.ParsePKCS8PrivateKey(block.Bytes)
	if err != nil {
		privateKey, err = x509.ParsePKCS1PrivateKey(block.Bytes)
		if err != nil {
			return "", fmt.Errorf("failed to parse private key (tried PKCS8 and PKCS1): %w", err)
		}
	}

	// Type assert to *rsa.PrivateKey
	rsaKey, ok := privateKey.(*rsa.PrivateKey)
	if !ok {
		return "", fmt.Errorf("private key is not an RSA key")
	}

	hash := sha256.Sum256([]byte(data))
	signature, err := rsa.SignPKCS1v15(rand.Reader, rsaKey, crypto.SHA256, hash[:])
	if err != nil {
		return "", fmt.Errorf("failed to sign: %w", err)
	}

	return base64.StdEncoding.EncodeToString(signature), nil
}

// VerifyWithRSA 使用 RSA 公钥验证签名
func (c *EpayV2Client) VerifyWithRSA(data string, signature string) (bool, error) {
	block, _ := pem.Decode([]byte(c.config.PlatformKey))
	if block == nil {
		return false, fmt.Errorf("failed to decode public key")
	}

	pub, err := x509.ParsePKIXPublicKey(block.Bytes)
	if err != nil {
		return false, fmt.Errorf("failed to parse public key: %w", err)
	}

	sigBytes, err := base64.StdEncoding.DecodeString(signature)
	if err != nil {
		return false, fmt.Errorf("failed to decode signature: %w", err)
	}

	hash := sha256.Sum256([]byte(data))
	err = rsa.VerifyPKCS1v15(pub.(*rsa.PublicKey), crypto.SHA256, hash[:], sigBytes)
	return err == nil, nil
}

// GenerateSignString 生成待签名字符串
func GenerateSignString(params map[string]string) string {
	// 过滤空值和 sign/sign_type
	filtered := make(map[string]string)
	for k, v := range params {
		if k == "sign" || k == "sign_type" || v == "" {
			continue
		}
		filtered[k] = v
	}

	// 按 key 排序
	keys := make([]string, 0, len(filtered))
	for k := range filtered {
		keys = append(keys, k)
	}
	sort.Strings(keys)

	// 拼接
	parts := make([]string, 0, len(keys))
	for _, k := range keys {
		parts = append(parts, k+"="+filtered[k])
	}

	return strings.Join(parts, "&")
}

// CreateOrder 创建支付订单 (V2 API)
func (c *EpayV2Client) CreateOrder(params map[string]string) (map[string]string, error) {
	// 添加商户号
	params["merchant_no"] = c.config.MerchantNo

	// 生成签名字符串
	signStr := GenerateSignString(params)
	log.Printf("[EPay V2] Sign string: %s", signStr)

	// RSA 签名
	sign, err := c.SignWithRSA(signStr)
	if err != nil {
		log.Printf("[EPay V2] Sign error: %v", err)
		return nil, fmt.Errorf("failed to sign: %w", err)
	}

	log.Printf("[EPay V2] Signature: %s", sign[:50]+"...")

	params["sign"] = sign
	params["sign_type"] = "SHA256WithRSA"

	return params, nil
}

// CreatePayURL 创建支付 URL
func (c *EpayV2Client) CreatePayURL(params map[string]string) (string, error) {
	signedParams, err := c.CreateOrder(params)
	if err != nil {
		return "", err
	}

	baseURL := strings.TrimRight(c.config.BaseURL, "/")
	values := url.Values{}
	for k, v := range signedParams {
		values.Set(k, v)
	}

	return baseURL + "/api/pay/create?" + values.Encode(), nil
}

// VerifyCallback 验证回调签名
func (c *EpayV2Client) VerifyCallback(params map[string]string) (bool, error) {
	sign := params["sign"]
	if sign == "" {
		return false, fmt.Errorf("missing sign parameter")
	}

	// 生成签名字符串
	signStr := GenerateSignString(params)

	// 验证签名
	return c.VerifyWithRSA(signStr, sign)
}

// QueryOrder 查询订单
func (c *EpayV2Client) QueryOrder(tradeNo string) (map[string]string, error) {
	params := map[string]string{
		"merchant_no": c.config.MerchantNo,
		"trade_no":    tradeNo,
	}

	// 生成签名字符串
	signStr := GenerateSignString(params)

	// RSA 签名
	sign, err := c.SignWithRSA(signStr)
	if err != nil {
		return nil, fmt.Errorf("failed to sign: %w", err)
	}

	params["sign"] = sign
	params["sign_type"] = "SHA256WithRSA"

	return params, nil
}
