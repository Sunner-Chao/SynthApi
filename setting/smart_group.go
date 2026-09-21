package setting

import (
	"sync"

	"github.com/QuantumNous/new-api/common"
)

var smartGroupRules = map[string][]string{}
var smartGroupRulesMutex sync.RWMutex

func GetSmartGroupRulesCopy() map[string][]string {
	smartGroupRulesMutex.RLock()
	defer smartGroupRulesMutex.RUnlock()

	rules := make(map[string][]string, len(smartGroupRules))
	for group, sources := range smartGroupRules {
		rules[group] = append([]string(nil), sources...)
	}
	return rules
}

func GetSmartGroupSources(group string) ([]string, bool) {
	smartGroupRulesMutex.RLock()
	defer smartGroupRulesMutex.RUnlock()

	sources, ok := smartGroupRules[group]
	if !ok || len(sources) == 0 {
		return nil, false
	}
	return append([]string(nil), sources...), true
}

func UpdateSmartGroupRulesByJSONString(jsonStr string) error {
	next := make(map[string][]string)
	if err := common.Unmarshal([]byte(jsonStr), &next); err != nil {
		return err
	}

	cleaned := make(map[string][]string, len(next))
	for group, sources := range next {
		if group == "" {
			continue
		}
		seen := map[string]struct{}{}
		for _, source := range sources {
			if source == "" {
				continue
			}
			if _, ok := seen[source]; ok {
				continue
			}
			seen[source] = struct{}{}
			cleaned[group] = append(cleaned[group], source)
		}
		if len(cleaned[group]) == 0 {
			delete(cleaned, group)
		}
	}

	smartGroupRulesMutex.Lock()
	defer smartGroupRulesMutex.Unlock()
	smartGroupRules = cleaned
	return nil
}

func SmartGroupRules2JSONString() string {
	smartGroupRulesMutex.RLock()
	defer smartGroupRulesMutex.RUnlock()

	jsonBytes, err := common.Marshal(smartGroupRules)
	if err != nil {
		return "{}"
	}
	return string(jsonBytes)
}
