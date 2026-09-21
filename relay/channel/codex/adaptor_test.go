package codex

import (
	"testing"

	"github.com/QuantumNous/new-api/common"
	"github.com/QuantumNous/new-api/dto"
	"github.com/stretchr/testify/require"
)

func TestConvertOpenAIResponsesRequestPreservesStoreChoice(t *testing.T) {
	t.Parallel()

	adaptor := &Adaptor{}
	tests := []struct {
		name        string
		store       string
		expectStore string
	}{
		{name: "explicit true", store: "true", expectStore: "true"},
		{name: "explicit false", store: "false", expectStore: "false"},
		{name: "omitted", expectStore: ""},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			request := dto.OpenAIResponsesRequest{
				Model:              "gpt-5-codex",
				Instructions:       []byte(`""`),
				PreviousResponseID: "resp_previous",
			}
			if tt.store != "" {
				request.Store = []byte(tt.store)
			}

			converted, err := adaptor.ConvertOpenAIResponsesRequest(nil, nil, request)
			require.NoError(t, err)
			convertedRequest, ok := converted.(dto.OpenAIResponsesRequest)
			require.True(t, ok)
			require.Equal(t, "resp_previous", convertedRequest.PreviousResponseID)

			body, err := common.Marshal(convertedRequest)
			require.NoError(t, err)
			if tt.expectStore == "" {
				require.NotContains(t, string(body), `"store"`)
				return
			}
			require.Contains(t, string(body), `"store":`+tt.expectStore)
		})
	}
}
