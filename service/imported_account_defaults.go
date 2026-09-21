package service

import (
	"strings"

	"github.com/QuantumNous/new-api/constant"
	"github.com/QuantumNous/new-api/model"
)

// ImportedAccountDefaultProxy is intentionally a channel-level proxy. It keeps
// imported accounts on the dedicated local mihomo listener instead of falling
// back to the process-wide proxy environment.
const ImportedAccountDefaultProxy = "http://127.0.0.1:7892"

const ImportedAccountDefaultModelGroup = "Plus线路四"

// ApplyImportedAccountDefaults fills only omitted defaults. An administrator
// can still override the proxy or model list later from the channel editor.
func ApplyImportedAccountDefaults(channel *model.Channel) {
	if channel == nil || !IsImportedAccountChannel(channel) {
		return
	}

	settings := channel.GetSetting()
	if strings.TrimSpace(settings.Proxy) == "" {
		settings.Proxy = ImportedAccountDefaultProxy
		channel.SetSetting(settings)
	}

	// Plus线路四 is the maintained Codex model catalog. Do not apply Codex
	// model names to imported Anthropic/OpenAI-compatible accounts.
	if channel.Type != constant.ChannelTypeCodex || strings.TrimSpace(channel.Models) != "" {
		return
	}

	models := model.GetGroupEnabledModels(ImportedAccountDefaultModelGroup)
	if len(models) == 0 {
		return
	}
	channel.Models = strings.Join(models, ",")
}
