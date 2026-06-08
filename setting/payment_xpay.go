package setting

var (
	XPayEnabled       bool
	XPayApiBase       string
	XPayAppID         string
	XPayAppSecret     string
	XPayPaymentType   string = "alipay"
	XPayReturnURL     string
	XPayNotifyURL     string
	XPayUnitPrice     float64 = 7.3
	XPayMinTopUp      float64 = 1
	XPayGatewayPath   string  = "/alipay/precreate"
	XPayNotifySuccess string  = "OK"
)
