//go:build embed

package web

import (
	"crypto/sha256"
	"encoding/hex"
	"sync"
)

// HTMLCache manages the cached index.html with injected settings
type HTMLCache struct {
	mu              sync.RWMutex
	cachedHTML      map[string][]byte
	etags           map[string]string
	baseHTMLHash    string // Hash of the original index.html (immutable after build)
	settingsVersion uint64 // Incremented when settings change
}

// CachedHTML represents the cache state
type CachedHTML struct {
	Content []byte
	ETag    string
}

// NewHTMLCache creates a new HTML cache instance
func NewHTMLCache() *HTMLCache {
	return &HTMLCache{
		cachedHTML: make(map[string][]byte),
		etags:      make(map[string]string),
	}
}

// SetBaseHTML initializes the cache with the base HTML template
func (c *HTMLCache) SetBaseHTML(baseHTML []byte) {
	c.mu.Lock()
	defer c.mu.Unlock()

	hash := sha256.Sum256(baseHTML)
	c.baseHTMLHash = hex.EncodeToString(hash[:8]) // First 8 bytes for brevity
}

// Invalidate marks the cache as stale
func (c *HTMLCache) Invalidate() {
	c.mu.Lock()
	defer c.mu.Unlock()

	c.settingsVersion++
	c.cachedHTML = make(map[string][]byte)
	c.etags = make(map[string]string)
}

// Get returns the cached HTML for a route profile or nil if cache is stale.
func (c *HTMLCache) Get(key string) *CachedHTML {
	c.mu.RLock()
	defer c.mu.RUnlock()

	html, ok := c.cachedHTML[key]
	if !ok {
		return nil
	}
	return &CachedHTML{
		Content: html,
		ETag:    c.etags[key],
	}
}

// Set updates the cache with new rendered HTML for a route profile.
func (c *HTMLCache) Set(key string, html []byte, settingsJSON []byte) {
	c.mu.Lock()
	defer c.mu.Unlock()

	if c.cachedHTML == nil {
		c.cachedHTML = make(map[string][]byte)
		c.etags = make(map[string]string)
	}
	c.cachedHTML[key] = html
	c.etags[key] = c.generateETag(key, settingsJSON)
}

// generateETag creates an ETag from base HTML hash + settings hash
func (c *HTMLCache) generateETag(key string, settingsJSON []byte) string {
	settingsHash := sha256.Sum256(append([]byte(key+"\x00"), settingsJSON...))
	return `"` + c.baseHTMLHash + "-" + hex.EncodeToString(settingsHash[:8]) + `"`
}
