package cmccseedance

import (
	"bytes"
	"context"
	"crypto/rand"
	"crypto/rsa"
	"crypto/sha256"
	"crypto/x509"
	"encoding/pem"
	"io"
	"net/http"
	"net/http/httptest"
	"sync/atomic"
	"testing"

	"github.com/QuantumNous/new-api/common"
	"github.com/stretchr/testify/require"
)

func TestChannelSecureRequestResponseRoundTripAndCachesAttestation(t *testing.T) {
	privateKey, err := rsa.GenerateKey(rand.Reader, 2048)
	require.NoError(t, err)
	publicDER, err := x509.MarshalPKIXPublicKey(&privateKey.PublicKey)
	require.NoError(t, err)
	publicPEM := string(pem.EncodeToMemory(&pem.Block{Type: "PUBLIC KEY", Bytes: publicDER}))

	var attestationCalls atomic.Int32
	var taskCalls atomic.Int32
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		switch r.URL.Path {
		case "/v1/security/token":
			attestationCalls.Add(1)
			require.Equal(t, "Bearer test-key", r.Header.Get("Authorization"))
			require.NotEmpty(t, r.Header.Get("timestamp"))
			var request map[string]string
			require.NoError(t, common.DecodeJson(r.Body, &request))
			require.Len(t, request["Nonce"], 16)
			writeJSON(t, w, map[string]any{"Result": map[string]any{
				"attestation": map[string]any{"key_info": map[string]any{"pub_key_info": publicPEM}},
			}})
		case "/api/v3/contents/generations/tasks":
			taskCalls.Add(1)
			require.Equal(t, "true", r.Header.Get("X-AICC-Encryption-Enable"))
			require.Equal(t, "aicc", r.Header.Get("X-AICC-Encryption-SDK"))
			require.Equal(t, SDKVersion, r.Header.Get("X-AICC-Encryption-Version"))
			var envelope encryptedMessage
			require.NoError(t, common.DecodeJson(r.Body, &envelope))
			key, decryptErr := rsa.DecryptOAEP(sha256.New(), rand.Reader, privateKey, envelope.Key, nil)
			require.NoError(t, decryptErr)
			plaintext, decryptErr := open(key, envelope.Nonce, envelope.Ciphertext, envelope.MAC)
			require.NoError(t, decryptErr)
			require.JSONEq(t, `{"model":"endpoint-1","content":[{"type":"text","text":"waves"}]}`, string(plaintext))

			nonce, ciphertext, mac, encryptErr := seal(key, []byte(`{"id":"task-1"}`))
			require.NoError(t, encryptErr)
			writeJSON(t, w, encryptedMessage{Nonce: nonce, MAC: mac, Ciphertext: ciphertext})
		default:
			http.NotFound(w, r)
		}
	}))
	defer server.Close()

	channel := &Channel{}
	for range 2 {
		req, err := http.NewRequestWithContext(context.Background(), http.MethodPost,
			server.URL+"/api/v3/contents/generations/tasks",
			bytes.NewBufferString(`{"model":"endpoint-1","content":[{"type":"text","text":"waves"}]}`))
		require.NoError(t, err)
		resp, err := channel.Do(context.Background(), req, server.URL+"/api/v3", "test-key", http.DefaultClient.Do)
		require.NoError(t, err)
		responseBody, err := io.ReadAll(resp.Body)
		require.NoError(t, err)
		require.NoError(t, resp.Body.Close())
		require.JSONEq(t, `{"id":"task-1"}`, string(responseBody))
	}

	require.EqualValues(t, 1, attestationCalls.Load())
	require.EqualValues(t, 2, taskCalls.Load())
}

func TestChannelPassesThroughPlaintextErrorResponses(t *testing.T) {
	privateKey, err := rsa.GenerateKey(rand.Reader, 2048)
	require.NoError(t, err)
	publicDER, err := x509.MarshalPKIXPublicKey(&privateKey.PublicKey)
	require.NoError(t, err)
	publicPEM := string(pem.EncodeToMemory(&pem.Block{Type: "PUBLIC KEY", Bytes: publicDER}))

	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if r.URL.Path == "/v1/security/token" {
			writeJSON(t, w, map[string]any{"pub_key_info": publicPEM})
			return
		}
		w.WriteHeader(http.StatusBadRequest)
		_, _ = w.Write([]byte(`{"error":"bad request"}`))
	}))
	defer server.Close()

	req, err := http.NewRequest(http.MethodGet, server.URL+"/api/v3/task", nil)
	require.NoError(t, err)
	resp, err := (&Channel{}).Do(context.Background(), req, server.URL+"/api/v3", "test-key", http.DefaultClient.Do)
	require.NoError(t, err)
	defer resp.Body.Close()
	body, err := io.ReadAll(resp.Body)
	require.NoError(t, err)
	require.Equal(t, http.StatusBadRequest, resp.StatusCode)
	require.JSONEq(t, `{"error":"bad request"}`, string(body))
}

func writeJSON(t *testing.T, w http.ResponseWriter, value any) {
	t.Helper()
	body, err := common.Marshal(value)
	require.NoError(t, err)
	w.Header().Set("Content-Type", "application/json")
	_, err = w.Write(body)
	require.NoError(t, err)
}
