package service

import (
	"testing"

	relaycommon "github.com/QuantumNous/new-api/relay/common"
)

func TestAppendAutoGroupLogInfoMarksRequestedAutoRoute(t *testing.T) {
	other := make(map[string]interface{})
	appendAutoGroupLogInfo(&relaycommon.RelayInfo{
		TokenGroup: "auto",
		UsingGroup: "Plus线路一",
	}, other)

	if marked, ok := other["auto_group"].(bool); !ok || !marked {
		t.Fatalf("expected auto_group marker, got %#v", other["auto_group"])
	}
	if requested, ok := other["requested_group"].(string); !ok || requested != "auto" {
		t.Fatalf("expected requested_group=auto, got %#v", other["requested_group"])
	}
}

func TestAppendAutoGroupLogInfoSkipsConcreteRoute(t *testing.T) {
	other := make(map[string]interface{})
	appendAutoGroupLogInfo(&relaycommon.RelayInfo{
		TokenGroup: "Plus线路一",
		UsingGroup: "Plus线路一",
	}, other)

	if _, exists := other["auto_group"]; exists {
		t.Fatalf("concrete route must not be marked as auto: %#v", other)
	}
}
