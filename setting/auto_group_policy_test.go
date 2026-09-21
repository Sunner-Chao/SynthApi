package setting

import (
	"fmt"
	"testing"

	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

func TestUpdateMaxTokenAutoGroupsValidation(t *testing.T) {
	original := GetMaxTokenAutoGroups()
	t.Cleanup(func() {
		require.NoError(t, UpdateMaxTokenAutoGroups(fmt.Sprintf("%d", original)))
	})

	require.NoError(t, UpdateMaxTokenAutoGroups("8"))
	assert.Equal(t, 8, GetMaxTokenAutoGroups())
	for _, value := range []string{"", "0", "-1", "1.5", "invalid"} {
		assert.Error(t, UpdateMaxTokenAutoGroups(value))
		assert.Equal(t, 8, GetMaxTokenAutoGroups())
	}
}

func TestAutoCrossGroupRetryGlobalSwitch(t *testing.T) {
	original := IsAutoCrossGroupRetryEnabled()
	t.Cleanup(func() { SetAutoCrossGroupRetryEnabled(original) })

	SetAutoCrossGroupRetryEnabled(false)
	assert.False(t, IsAutoCrossGroupRetryEnabled())
	SetAutoCrossGroupRetryEnabled(true)
	assert.True(t, IsAutoCrossGroupRetryEnabled())
}
