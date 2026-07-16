package common

import (
	"bytes"
	"encoding/json"
	"fmt"

	"github.com/jinzhu/copier"
)

var deepCopyConverters = []copier.TypeConverter{
	{
		SrcType: json.RawMessage{},
		DstType: json.RawMessage{},
		Fn: func(src interface{}) (interface{}, error) {
			return json.RawMessage(bytes.Clone(src.(json.RawMessage))), nil
		},
	},
	{
		SrcType: []byte{},
		DstType: []byte{},
		Fn: func(src interface{}) (interface{}, error) {
			return bytes.Clone(src.([]byte)), nil
		},
	},
}

func DeepCopy[T any](src *T) (*T, error) {
	if src == nil {
		return nil, fmt.Errorf("copy source cannot be nil")
	}
	var dst T
	err := copier.CopyWithOption(&dst, src, copier.Option{
		DeepCopy:    true,
		IgnoreEmpty: true,
		Converters:  deepCopyConverters,
	})
	if err != nil {
		return nil, err
	}
	return &dst, nil
}
