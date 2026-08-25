package cmccseedance

import (
	"bytes"
	"context"
	"crypto/aes"
	"crypto/cipher"
	"crypto/rand"
	"crypto/rsa"
	"crypto/sha256"
	"crypto/x509"
	"encoding/hex"
	"encoding/pem"
	"errors"
	"fmt"
	"io"
	"net/http"
	"net/url"
	"strings"
	"sync"
	"time"

	"github.com/QuantumNous/new-api/common"
)

const (
	SDKVersion  = "0.1.0"
	keySize     = 32
	nonceSize   = 12
	maxBodySize = 32 << 20
)

type DoFunc func(*http.Request) (*http.Response, error)

// Channel implements the AICC secure-channel handshake used by Mobile Cloud.
// The attested public key is cached per API key and endpoint origin.
type Channel struct {
	mu                sync.Mutex
	baseOrigin        string
	credentialDigest  [32]byte
	attestedPublicKey *rsa.PublicKey
}

type encryptedMessage struct {
	Nonce      []byte `json:"nonce"`
	MAC        []byte `json:"mac"`
	Key        []byte `json:"key,omitempty"`
	Ciphertext []byte `json:"ciphertext"`
}

func (c *Channel) Do(ctx context.Context, req *http.Request, baseURL, apiKey string, do DoFunc) (*http.Response, error) {
	if c == nil || req == nil || req.URL == nil {
		return nil, errors.New("cmcc seedance secure request is incomplete")
	}
	if do == nil {
		return nil, errors.New("cmcc seedance HTTP transport is required")
	}
	publicKey, err := c.publicKey(ctx, baseURL, apiKey, do)
	if err != nil {
		return nil, err
	}

	plaintext, err := readAndRestoreRequestBody(req)
	if err != nil {
		return nil, fmt.Errorf("read cmcc seedance request body: %w", err)
	}
	ciphertext, responseKey, err := encryptRequest(plaintext, publicKey)
	if err != nil {
		return nil, fmt.Errorf("encrypt cmcc seedance request: %w", err)
	}
	req.Body = io.NopCloser(bytes.NewReader(ciphertext))
	req.ContentLength = int64(len(ciphertext))
	req.GetBody = func() (io.ReadCloser, error) { return io.NopCloser(bytes.NewReader(ciphertext)), nil }
	req.Header.Del("Content-Length")
	req.Header.Set("Content-Type", "application/json")
	req.Header.Set("X-AICC-Encryption-Enable", "true")
	req.Header.Set("X-AICC-Encryption-SDK", "aicc")
	req.Header.Set("X-AICC-Encryption-Version", SDKVersion)

	resp, err := do(req)
	if err != nil {
		return nil, err
	}
	if resp == nil || resp.Body == nil {
		return resp, nil
	}
	body, err := readBoundedBody(resp.Body, maxBodySize)
	_ = resp.Body.Close()
	if err != nil {
		return nil, fmt.Errorf("read cmcc seedance response: %w", err)
	}
	decrypted, encrypted, err := decryptResponse(body, responseKey)
	if err != nil {
		return nil, fmt.Errorf("decrypt cmcc seedance response: %w", err)
	}
	if encrypted {
		body = decrypted
	}
	resp.Body = io.NopCloser(bytes.NewReader(body))
	resp.ContentLength = int64(len(body))
	resp.Header.Del("Content-Length")
	return resp, nil
}

func (c *Channel) publicKey(ctx context.Context, baseURL, apiKey string, do DoFunc) (*rsa.PublicKey, error) {
	origin, err := baseOrigin(baseURL)
	if err != nil {
		return nil, err
	}
	digest := sha256.Sum256([]byte(apiKey))
	c.mu.Lock()
	defer c.mu.Unlock()
	if c.attestedPublicKey != nil && c.baseOrigin == origin && c.credentialDigest == digest {
		return c.attestedPublicKey, nil
	}
	publicKey, err := attest(ctx, origin, apiKey, do)
	if err != nil {
		return nil, err
	}
	c.baseOrigin = origin
	c.credentialDigest = digest
	c.attestedPublicKey = publicKey
	return publicKey, nil
}

func baseOrigin(raw string) (string, error) {
	parsed, err := url.Parse(strings.TrimSpace(raw))
	if err != nil || parsed.Scheme == "" || parsed.Host == "" {
		return "", errors.New("invalid cmcc seedance base URL")
	}
	if !strings.EqualFold(parsed.Scheme, "https") && !strings.EqualFold(parsed.Scheme, "http") {
		return "", errors.New("invalid cmcc seedance base URL scheme")
	}
	if parsed.User != nil {
		return "", errors.New("cmcc seedance base URL must not contain user info")
	}
	return strings.ToLower(parsed.Scheme) + "://" + parsed.Host, nil
}

func attest(ctx context.Context, origin, apiKey string, do DoFunc) (*rsa.PublicKey, error) {
	nonce := make([]byte, 8)
	if _, err := rand.Read(nonce); err != nil {
		return nil, fmt.Errorf("generate attestation nonce: %w", err)
	}
	body, err := common.Marshal(map[string]string{"Nonce": hex.EncodeToString(nonce)})
	if err != nil {
		return nil, err
	}
	req, err := http.NewRequestWithContext(ctx, http.MethodPost, origin+"/v1/security/token", bytes.NewReader(body))
	if err != nil {
		return nil, err
	}
	req.Header.Set("Content-Type", "application/json")
	req.Header.Set("Accept", "application/json")
	req.Header.Set("Authorization", "Bearer "+apiKey)
	req.Header.Set("timestamp", fmt.Sprintf("%d", time.Now().Unix()))
	resp, err := do(req)
	if err != nil {
		return nil, fmt.Errorf("attest cmcc seedance server: %w", err)
	}
	if resp == nil || resp.Body == nil {
		return nil, errors.New("cmcc seedance attestation returned an empty response")
	}
	defer func() { _ = resp.Body.Close() }()
	responseBody, err := io.ReadAll(io.LimitReader(resp.Body, 4<<20))
	if err != nil {
		return nil, fmt.Errorf("read cmcc seedance attestation response: %w", err)
	}
	if resp.StatusCode < http.StatusOK || resp.StatusCode >= http.StatusMultipleChoices {
		return nil, fmt.Errorf("cmcc seedance attestation returned status %d", resp.StatusCode)
	}
	var response any
	if err := common.Unmarshal(responseBody, &response); err != nil {
		return nil, fmt.Errorf("decode cmcc seedance attestation response: %w", err)
	}
	publicKeyPEM := findStringField(response, "pub_key_info")
	if publicKeyPEM == "" {
		return nil, errors.New("cmcc seedance attestation response has no public key")
	}
	block, _ := pem.Decode([]byte(publicKeyPEM))
	if block == nil || block.Type != "PUBLIC KEY" {
		return nil, errors.New("cmcc seedance attestation returned an invalid public key")
	}
	parsedKey, err := x509.ParsePKIXPublicKey(block.Bytes)
	if err != nil {
		return nil, fmt.Errorf("parse cmcc seedance attestation public key: %w", err)
	}
	publicKey, ok := parsedKey.(*rsa.PublicKey)
	if !ok {
		return nil, errors.New("cmcc seedance attestation key is not RSA")
	}
	return publicKey, nil
}

func findStringField(value any, target string) string {
	switch typed := value.(type) {
	case map[string]any:
		if raw, ok := typed[target].(string); ok && strings.TrimSpace(raw) != "" {
			return raw
		}
		for _, child := range typed {
			if found := findStringField(child, target); found != "" {
				return found
			}
		}
	case []any:
		for _, child := range typed {
			if found := findStringField(child, target); found != "" {
				return found
			}
		}
	}
	return ""
}

func readAndRestoreRequestBody(req *http.Request) ([]byte, error) {
	if req.Body == nil {
		return nil, nil
	}
	body, err := io.ReadAll(req.Body)
	_ = req.Body.Close()
	if err != nil {
		return nil, err
	}
	req.Body = io.NopCloser(bytes.NewReader(body))
	return body, nil
}

func readBoundedBody(body io.Reader, limit int64) ([]byte, error) {
	data, err := io.ReadAll(io.LimitReader(body, limit+1))
	if err != nil {
		return nil, err
	}
	if int64(len(data)) > limit {
		return nil, errors.New("cmcc seedance secure response is too large")
	}
	return data, nil
}

func encryptRequest(plaintext []byte, publicKey *rsa.PublicKey) ([]byte, []byte, error) {
	if publicKey == nil {
		return nil, nil, errors.New("attested public key is required")
	}
	key := make([]byte, keySize)
	if _, err := rand.Read(key); err != nil {
		return nil, nil, err
	}
	nonce, ciphertext, mac, err := seal(key, plaintext)
	if err != nil {
		return nil, nil, err
	}
	encryptedKey, err := rsa.EncryptOAEP(sha256.New(), rand.Reader, publicKey, key, nil)
	if err != nil {
		return nil, nil, err
	}
	message, err := common.Marshal(encryptedMessage{Nonce: nonce, MAC: mac, Key: encryptedKey, Ciphertext: ciphertext})
	if err != nil {
		return nil, nil, err
	}
	return message, key, nil
}

func decryptResponse(body, key []byte) ([]byte, bool, error) {
	var message encryptedMessage
	if err := common.Unmarshal(body, &message); err != nil {
		return nil, false, nil
	}
	if len(message.Nonce) == 0 && len(message.MAC) == 0 && message.Ciphertext == nil {
		return nil, false, nil
	}
	if len(message.Nonce) != nonceSize || len(message.MAC) == 0 || message.Ciphertext == nil {
		return nil, true, errors.New("invalid encrypted response envelope")
	}
	plaintext, err := open(key, message.Nonce, message.Ciphertext, message.MAC)
	if err != nil {
		return nil, true, err
	}
	return plaintext, true, nil
}

func seal(key, plaintext []byte) (nonce, ciphertext, mac []byte, err error) {
	block, err := aes.NewCipher(key)
	if err != nil {
		return nil, nil, nil, err
	}
	aead, err := cipher.NewGCM(block)
	if err != nil {
		return nil, nil, nil, err
	}
	nonce = make([]byte, aead.NonceSize())
	if _, err := rand.Read(nonce); err != nil {
		return nil, nil, nil, err
	}
	sealed := aead.Seal(nil, nonce, plaintext, nil)
	overhead := aead.Overhead()
	return nonce, sealed[:len(sealed)-overhead], sealed[len(sealed)-overhead:], nil
}

func open(key, nonce, ciphertext, mac []byte) ([]byte, error) {
	block, err := aes.NewCipher(key)
	if err != nil {
		return nil, err
	}
	aead, err := cipher.NewGCM(block)
	if err != nil {
		return nil, err
	}
	sealed := make([]byte, 0, len(ciphertext)+len(mac))
	sealed = append(sealed, ciphertext...)
	sealed = append(sealed, mac...)
	return aead.Open(nil, nonce, sealed, nil)
}
