package model

import (
	"github.com/stretchr/testify/require"
	"testing"
)

func TestAdministratorDefaultSidebarParity(t *testing.T) {
	require.JSONEq(t, generateDefaultSidebarConfigForRole(100), generateDefaultSidebarConfigForRole(10))
	require.NotContains(t, generateDefaultSidebarConfigForRole(1), `"admin"`)
	require.Contains(t, generateDefaultSidebarConfigForRole(10), `"setting":true`)
}
