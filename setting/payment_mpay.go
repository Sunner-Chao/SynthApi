package setting

var (
	MPayEnabled       bool
	MPayApiBase       string
	MPayPid           string
	MPayKey           string
	MPayPaymentType   string = "alipay"
	MPayReturnURL     string
	MPayNotifyURL     string
	MPayUnitPrice     float64 = 7.3
	MPayMinTopUp      float64 = 0.1
	MPayNotifySuccess string  = "success"
)
