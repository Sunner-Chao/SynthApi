package setting

import "sync/atomic"

var publicBusinessPreviewEnabled atomic.Bool

func IsPublicBusinessPreviewEnabled() bool {
	return publicBusinessPreviewEnabled.Load()
}

func SetPublicBusinessPreviewEnabled(enabled bool) {
	publicBusinessPreviewEnabled.Store(enabled)
}
