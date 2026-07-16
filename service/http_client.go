package service

import (
	"context"
	"fmt"
	"net"
	"net/http"
	"net/url"
	"sync"
	"time"

	"github.com/QuantumNous/new-api/common"
	"github.com/QuantumNous/new-api/setting/system_setting"

	"golang.org/x/net/proxy"
)

var (
	httpClient      *http.Client
	proxyClientLock sync.Mutex
	proxyClients    = make(map[string]*http.Client)
)

type relaySingleHopContextKey struct{}

func MarkRelayRequestSingleHop(req *http.Request) *http.Request {
	if req == nil {
		return nil
	}
	ctx := context.WithValue(req.Context(), relaySingleHopContextKey{}, true)
	return req.WithContext(ctx)
}

func isRelayRequestSingleHop(req *http.Request) bool {
	return req != nil && req.Context().Value(relaySingleHopContextKey{}) == true
}

func checkRedirect(req *http.Request, via []*http.Request) error {
	if isRelayRequestSingleHop(req) {
		return http.ErrUseLastResponse
	}
	fetchSetting := system_setting.GetFetchSetting()
	urlStr := req.URL.String()
	if err := common.ValidateURLWithFetchSetting(urlStr, fetchSetting.EnableSSRFProtection, fetchSetting.AllowPrivateIp, fetchSetting.DomainFilterMode, fetchSetting.IpFilterMode, fetchSetting.DomainList, fetchSetting.IpList, fetchSetting.AllowedPorts, fetchSetting.ApplyIPFilterForDomain); err != nil {
		return fmt.Errorf("redirect to %s blocked: %v", urlStr, err)
	}
	if len(via) >= 10 {
		return fmt.Errorf("stopped after 10 redirects")
	}
	return nil
}

func InitHttpClient() {
	transport := newRelayTransport(http.ProxyFromEnvironment, nil)

	if common.RelayTimeout == 0 {
		httpClient = &http.Client{
			Transport:     transport,
			CheckRedirect: checkRedirect,
		}
	} else {
		httpClient = &http.Client{
			Transport:     transport,
			Timeout:       time.Duration(common.RelayTimeout) * time.Second,
			CheckRedirect: checkRedirect,
		}
	}
}

func newRelayTransport(proxyFunc func(*http.Request) (*url.URL, error), dialContext func(context.Context, string, string) (net.Conn, error)) *http.Transport {
	if dialContext == nil {
		dialer := &net.Dialer{
			Timeout:   nonNegativeSeconds(common.RelayDialTimeout),
			KeepAlive: seconds(common.RelayDialKeepAlive),
		}
		dialContext = dialer.DialContext
	}
	transport := &http.Transport{
		MaxIdleConns:          common.RelayMaxIdleConns,
		MaxIdleConnsPerHost:   common.RelayMaxIdleConnsPerHost,
		IdleConnTimeout:       nonNegativeSeconds(common.RelayIdleConnTimeout),
		TLSHandshakeTimeout:   nonNegativeSeconds(common.RelayTLSHandshakeTimeout),
		ExpectContinueTimeout: nonNegativeSeconds(common.RelayExpectContinueTimeout),
		ForceAttemptHTTP2:     common.RelayForceHTTP2,
		Proxy:                 proxyFunc,
		DialContext:           dialContext,
	}
	if common.TLSInsecureSkipVerify {
		transport.TLSClientConfig = common.InsecureTLSConfig
	}
	return transport
}

func seconds(value int) time.Duration {
	return time.Duration(value) * time.Second
}

func nonNegativeSeconds(value int) time.Duration {
	if value <= 0 {
		return 0
	}
	return seconds(value)
}

type lookupIPAddrFunc func(context.Context, string) ([]net.IPAddr, error)

func resolveSOCKS5Targets(
	ctx context.Context,
	network string,
	addr string,
	lookup lookupIPAddrFunc,
) ([]string, error) {
	host, port, err := net.SplitHostPort(addr)
	if err != nil {
		return nil, err
	}
	if net.ParseIP(host) != nil {
		return []string{addr}, nil
	}

	addresses, err := lookup(ctx, host)
	if err != nil {
		return nil, fmt.Errorf("resolve SOCKS5 target %s: %w", host, err)
	}
	targets := make([]string, 0, len(addresses))
	seen := make(map[string]struct{}, len(addresses))
	for _, address := range addresses {
		ip := address.IP
		if ip == nil || (network == "tcp4" && ip.To4() == nil) ||
			(network == "tcp6" && (ip.To4() != nil || ip.To16() == nil)) {
			continue
		}
		hostIP := ip.String()
		if address.Zone != "" {
			hostIP += "%" + address.Zone
		}
		target := net.JoinHostPort(hostIP, port)
		if _, ok := seen[target]; ok {
			continue
		}
		seen[target] = struct{}{}
		targets = append(targets, target)
	}
	if len(targets) == 0 {
		return nil, fmt.Errorf("resolve SOCKS5 target %s: no usable addresses", host)
	}
	return targets, nil
}

func dialProxyContext(
	ctx context.Context,
	dialer proxy.Dialer,
	network string,
	addr string,
) (net.Conn, error) {
	if contextDialer, ok := dialer.(proxy.ContextDialer); ok {
		return contextDialer.DialContext(ctx, network, addr)
	}
	type dialResult struct {
		conn net.Conn
		err  error
	}
	done := make(chan dialResult, 1)
	go func() {
		conn, err := dialer.Dial(network, addr)
		done <- dialResult{conn: conn, err: err}
	}()
	select {
	case <-ctx.Done():
		return nil, ctx.Err()
	case result := <-done:
		return result.conn, result.err
	}
}

func newSOCKS5DialContext(dialer proxy.Dialer, resolveLocally bool) func(context.Context, string, string) (net.Conn, error) {
	return func(ctx context.Context, network, addr string) (net.Conn, error) {
		targets := []string{addr}
		if resolveLocally {
			var err error
			targets, err = resolveSOCKS5Targets(ctx, network, addr, net.DefaultResolver.LookupIPAddr)
			if err != nil {
				return nil, err
			}
		}

		var lastErr error
		for _, target := range targets {
			conn, err := dialProxyContext(ctx, dialer, network, target)
			if err == nil {
				return conn, nil
			}
			lastErr = err
			if ctx.Err() != nil {
				return nil, ctx.Err()
			}
		}
		return nil, fmt.Errorf("SOCKS5 dial %s failed: %w", addr, lastErr)
	}
}

func GetHttpClient() *http.Client {
	return httpClient
}

// GetHttpClientWithProxy returns the default client or a proxy-enabled one when proxyURL is provided.
func GetHttpClientWithProxy(proxyURL string) (*http.Client, error) {
	if proxyURL == "" {
		if client := GetHttpClient(); client != nil {
			return client, nil
		}
		return http.DefaultClient, nil
	}
	return NewProxyHttpClient(proxyURL)
}

// ResetProxyClientCache 清空代理客户端缓存，确保下次使用时重新初始化
func ResetProxyClientCache() {
	proxyClientLock.Lock()
	defer proxyClientLock.Unlock()
	for _, client := range proxyClients {
		if transport, ok := client.Transport.(*http.Transport); ok && transport != nil {
			transport.CloseIdleConnections()
		}
	}
	proxyClients = make(map[string]*http.Client)
}

// NewProxyHttpClient 创建支持代理的 HTTP 客户端
func NewProxyHttpClient(proxyURL string) (*http.Client, error) {
	if proxyURL == "" {
		if client := GetHttpClient(); client != nil {
			return client, nil
		}
		return http.DefaultClient, nil
	}

	proxyClientLock.Lock()
	if client, ok := proxyClients[proxyURL]; ok {
		proxyClientLock.Unlock()
		return client, nil
	}
	proxyClientLock.Unlock()

	parsedURL, err := url.Parse(proxyURL)
	if err != nil {
		return nil, err
	}

	switch parsedURL.Scheme {
	case "http", "https":
		transport := newRelayTransport(http.ProxyURL(parsedURL), nil)
		client := &http.Client{
			Transport:     transport,
			CheckRedirect: checkRedirect,
		}
		client.Timeout = time.Duration(common.RelayTimeout) * time.Second
		proxyClientLock.Lock()
		proxyClients[proxyURL] = client
		proxyClientLock.Unlock()
		return client, nil

	case "socks5", "socks5h":
		// 获取认证信息
		var auth *proxy.Auth
		if parsedURL.User != nil {
			auth = &proxy.Auth{
				User:     parsedURL.User.Username(),
				Password: "",
			}
			if password, ok := parsedURL.User.Password(); ok {
				auth.Password = password
			}
		}

		// socks5 resolves targets locally; socks5h delegates DNS to the proxy.
		baseDialer := &net.Dialer{
			Timeout:   nonNegativeSeconds(common.RelayDialTimeout),
			KeepAlive: seconds(common.RelayDialKeepAlive),
		}
		dialer, err := proxy.SOCKS5("tcp", parsedURL.Host, auth, baseDialer)
		if err != nil {
			return nil, err
		}

		transport := newRelayTransport(nil, newSOCKS5DialContext(dialer, parsedURL.Scheme == "socks5"))

		client := &http.Client{Transport: transport, CheckRedirect: checkRedirect}
		client.Timeout = time.Duration(common.RelayTimeout) * time.Second
		proxyClientLock.Lock()
		proxyClients[proxyURL] = client
		proxyClientLock.Unlock()
		return client, nil

	default:
		return nil, fmt.Errorf("unsupported proxy scheme: %s, must be http, https, socks5 or socks5h", parsedURL.Scheme)
	}
}
