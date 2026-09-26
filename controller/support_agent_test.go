package controller

import (
	"errors"
	"io"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"

	"github.com/QuantumNous/new-api/common"
	"github.com/QuantumNous/new-api/model"
	"github.com/gin-gonic/gin"
)

func TestSupportBridgeUsesAuthenticatedIdentity(t *testing.T) {
	upstream := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if r.Header.Get("Authorization") != "Bearer server-only" || r.Header.Get("X-Support-User") != "42" || r.Header.Get("X-Support-Role") != "user" {
			t.Errorf("incorrect trusted identity")
		}
		if r.URL.RawQuery != "conversation=thread" {
			t.Errorf("unexpected query: %s", r.URL.RawQuery)
		}
		_, _ = io.WriteString(w, `{"turns":[]}`)
	}))
	defer upstream.Close()
	t.Setenv("SUPPORT_AGENT_URL", upstream.URL)
	t.Setenv("SUPPORT_AGENT_SECRET", "server-only")
	gin.SetMode(gin.TestMode)
	r := gin.New()
	r.GET("/history", func(c *gin.Context) { c.Set("id", 42); c.Set("role", common.RoleCommonUser); SupportAgentHistory(c) })
	req := httptest.NewRequest("GET", "/history?conversation=thread&user=1", nil)
	req.Header.Set("X-Support-Role", "admin")
	req.Header.Set("X-Support-User", "1")
	w := httptest.NewRecorder()
	r.ServeHTTP(w, req)
	if w.Code != 200 || !strings.Contains(w.Body.String(), `"success":true`) {
		t.Fatalf("bridge failed %d %s", w.Code, w.Body.String())
	}
}

func TestSupportBridgeSeparatesDeviceCredential(t *testing.T) {
	upstream := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if r.Header.Get("Authorization") != "Bearer device-only" || r.Header.Get("X-Support-User") != "" {
			t.Error("device must not inherit web identity")
		}
		_, _ = io.WriteString(w, `{"verified":false}`)
	}))
	defer upstream.Close()
	t.Setenv("SUPPORT_AGENT_URL", upstream.URL)
	t.Setenv("SUPPORT_AGENT_SECRET", "server-only")
	r := gin.New()
	r.POST("/verify", SupportAgentVerify)
	req := httptest.NewRequest("POST", "/verify", strings.NewReader(`{}`))
	req.Header.Set("Authorization", "Bearer device-only")
	w := httptest.NewRecorder()
	r.ServeHTTP(w, req)
	if w.Code != 200 {
		t.Fatal(w.Code)
	}
}

func TestSupportBridgeUnavailableDoesNotLeakUpstream(t *testing.T) {
	t.Setenv("SUPPORT_AGENT_URL", "")
	t.Setenv("SUPPORT_AGENT_SECRET", "private")
	r := gin.New()
	r.POST("/chat", SupportAgentChat)
	w := httptest.NewRecorder()
	r.ServeHTTP(w, httptest.NewRequest("POST", "/chat", strings.NewReader(`{}`)))
	if w.Code != 503 || strings.Contains(w.Body.String(), "private") {
		t.Fatal("unsafe unavailable response")
	}
}

func TestSupportBridgeForwardsHistoryCursorAndConversationSearch(t *testing.T) {
	upstream := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if r.URL.Query().Get("user") != "" {
			t.Error("untrusted identity query forwarded")
		}
		if r.URL.Path == "/v1/history" && r.URL.Query().Get("before") != "cursor" {
			t.Error("missing history cursor")
		}
		if r.URL.Path == "/v1/conversations" && r.URL.Query().Get("include_archived") != "true" {
			t.Error("missing archive query")
		}
		_, _ = io.WriteString(w, `{"items":[]}`)
	}))
	defer upstream.Close()
	t.Setenv("SUPPORT_AGENT_URL", upstream.URL)
	t.Setenv("SUPPORT_AGENT_SECRET", "test-only")
	r := gin.New()
	r.GET("/history", SupportAgentHistory)
	r.GET("/conversations", SupportAgentConversations)
	for _, path := range []string{"/history?conversation=thread&before=cursor&user=99", "/conversations?include_archived=true&q=hello&offset=50&user=99"} {
		w := httptest.NewRecorder()
		r.ServeHTTP(w, httptest.NewRequest("GET", path, nil))
		if w.Code != 200 {
			t.Fatal(w.Code)
		}
	}
}
func TestSupportBridgeRejectsInvalidResourceIDs(t *testing.T) {
	r := gin.New()
	r.PATCH("/conversations/:conversation", SupportAgentConversationRename)
	r.GET("/runs/:id", SupportAgentRun)
	r.POST("/tickets/:id/note", SupportAgentTicketNote)
	r.POST("/tickets/:id/close", SupportAgentTicketClose)
	r.GET("/handoffs/:id/context", SupportAgentHandoffContext)
	for _, c := range []struct{ method, path string }{
		{"PATCH", "/conversations/invalid.id"}, {"GET", "/runs/invalid-id"},
		{"POST", "/tickets/invalid.id/note"}, {"POST", "/tickets/not-a-ticket/close"},
		{"GET", "/handoffs/not-a-ticket/context"},
	} {
		w := httptest.NewRecorder()
		r.ServeHTTP(w, httptest.NewRequest(c.method, c.path, strings.NewReader(`{}`)))
		if w.Code != 400 {
			t.Fatalf("expected invalid ID rejection: %d", w.Code)
		}
	}
}

func TestSupportReplyForwardsTheKnowledgeDraftChoice(t *testing.T) {
	var bodies []string
	upstream := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		raw, _ := io.ReadAll(r.Body)
		bodies = append(bodies, string(raw))
		_, _ = io.WriteString(w, `{"principal":"device:abc","status":"replied"}`)
	}))
	defer upstream.Close()
	t.Setenv("SUPPORT_AGENT_URL", upstream.URL)
	t.Setenv("SUPPORT_AGENT_SECRET", "server-only")
	r := gin.New()
	r.POST("/handoffs/:id/reply", func(c *gin.Context) {
		c.Set("id", 4)
		c.Set("role", common.RoleAdminUser)
		SupportAgentReply(c)
	})
	ticket := "11111111-1111-4111-8111-111111111111"
	for _, body := range []string{
		`{"reply_id":"` + ticket + `","message":" done ","draft":false,"extra":1}`,
		`{"reply_id":"` + ticket + `","message":"done"}`,
	} {
		w := httptest.NewRecorder()
		r.ServeHTTP(w, httptest.NewRequest("POST", "/handoffs/"+ticket+"/reply", strings.NewReader(body)))
		if w.Code != 200 {
			t.Fatalf("reply failed: %d %s", w.Code, w.Body.String())
		}
	}
	want := []string{
		`{"reply_id":"` + ticket + `","message":"done","draft":false}`,
		`{"reply_id":"` + ticket + `","message":"done"}`,
	}
	if strings.Join(bodies, "\n") != strings.Join(want, "\n") {
		t.Fatalf("unexpected upstream bodies: %v", bodies)
	}
}

func TestSupportFeedbackAndTicketsForwardToCustomerEndpoints(t *testing.T) {
	var paths []string
	upstream := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if r.Header.Get("X-Support-User") != "42" || r.Header.Get("X-Support-Role") != "user" {
			t.Errorf("customer identity missing on %s", r.URL.Path)
		}
		paths = append(paths, r.Method+" "+r.URL.Path)
		_, _ = io.WriteString(w, `{"status":"pending"}`)
	}))
	defer upstream.Close()
	t.Setenv("SUPPORT_AGENT_URL", upstream.URL)
	t.Setenv("SUPPORT_AGENT_SECRET", "server-only")
	r := gin.New()
	identity := func(handler gin.HandlerFunc) gin.HandlerFunc {
		return func(c *gin.Context) { c.Set("id", 42); c.Set("role", common.RoleCommonUser); handler(c) }
	}
	r.POST("/feedback", identity(SupportAgentFeedback))
	r.POST("/tickets", identity(SupportAgentTicketRequest))
	r.POST("/tickets/:id/note", identity(SupportAgentTicketNote))
	r.POST("/tickets/:id/close", identity(SupportAgentTicketClose))
	ticket := "11111111-1111-4111-8111-111111111111"
	for _, path := range []string{"/feedback", "/tickets", "/tickets/" + ticket + "/note", "/tickets/" + ticket + "/close"} {
		w := httptest.NewRecorder()
		r.ServeHTTP(w, httptest.NewRequest("POST", path, strings.NewReader(`{}`)))
		if w.Code != 200 {
			t.Fatalf("%s: %d %s", path, w.Code, w.Body.String())
		}
	}
	want := []string{"POST /v1/feedback", "POST /v1/tickets", "POST /v1/tickets/" + ticket + "/note", "POST /v1/tickets/" + ticket + "/close"}
	if strings.Join(paths, ",") != strings.Join(want, ",") {
		t.Fatalf("unexpected upstream paths: %v", paths)
	}
}

func TestSupportConsoleForwardsAsAdministrator(t *testing.T) {
	var paths []string
	upstream := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if r.Header.Get("X-Support-Role") != "admin" {
			t.Errorf("administrator role missing on %s", r.URL.Path)
		}
		target := r.Method + " " + r.URL.Path
		if r.URL.RawQuery != "" {
			target += "?" + r.URL.RawQuery
		}
		paths = append(paths, target)
		_, _ = io.WriteString(w, `{"items":[{"principal":"device:abc"}],"turns":[]}`)
	}))
	defer upstream.Close()
	t.Setenv("SUPPORT_AGENT_URL", upstream.URL)
	t.Setenv("SUPPORT_AGENT_SECRET", "server-only")
	r := gin.New()
	admin := func(handler gin.HandlerFunc) gin.HandlerFunc {
		return func(c *gin.Context) { c.Set("id", 4); c.Set("role", common.RoleAdminUser); handler(c) }
	}
	r.GET("/handoffs/:id/context", admin(SupportAgentHandoffContext))
	r.GET("/admin/unresolved", admin(SupportAgentUnresolved))
	r.GET("/admin/overview", admin(SupportAgentOverview))
	r.GET("/settings", admin(SupportAgentSettings))
	r.PUT("/admin/settings", admin(SupportAgentSaveSettings))
	ticket := "11111111-1111-4111-8111-111111111111"
	requests := [][2]string{{"GET", "/handoffs/" + ticket + "/context"}, {"GET", "/admin/unresolved?days=30&x=1"},
		{"GET", "/admin/unresolved"}, {"GET", "/admin/overview"}, {"GET", "/settings"}, {"PUT", "/admin/settings"}}
	for _, request := range requests {
		w := httptest.NewRecorder()
		r.ServeHTTP(w, httptest.NewRequest(request[0], request[1], strings.NewReader(`{"starters":{}}`)))
		if w.Code != 200 {
			t.Fatalf("%s: %d %s", request[1], w.Code, w.Body.String())
		}
	}
	want := []string{"GET /v1/handoffs/" + ticket + "/context", "GET /v1/admin/unresolved?days=30",
		"GET /v1/admin/unresolved?days=7", "GET /v1/admin/overview", "GET /v1/settings", "PUT /v1/admin/settings"}
	if strings.Join(paths, ",") != strings.Join(want, ",") {
		t.Fatalf("unexpected upstream paths: %v", paths)
	}
	for _, period := range []string{"0", "91", "week"} {
		w := httptest.NewRecorder()
		r.ServeHTTP(w, httptest.NewRequest("GET", "/admin/unresolved?days="+period, nil))
		if w.Code != 400 {
			t.Fatalf("days=%s should be rejected, got %d", period, w.Code)
		}
	}
}

func TestSupportHandoffsShowSiteAccountIdentity(t *testing.T) {
	data := map[string]interface{}{"items": []interface{}{
		map[string]interface{}{"principal": "web:17"},
		map[string]interface{}{"principal": "device:abc123"},
		map[string]interface{}{"principal": "web:17"},
		map[string]interface{}{"principal": "web:18"},
		map[string]interface{}{"principal": "web:18"},
	}}
	lookups := 0
	got := enrichSupportHandoffUsersWith(data, func(id int, selectAll bool) (*model.User, error) {
		lookups++
		if selectAll {
			t.Fatalf("unexpected full account lookup: id=%d", id)
		}
		if id == 18 {
			return nil, errors.New("record not found")
		}
		return &model.User{Id: id, Username: "ada", DisplayName: "Ada", Email: "ada@example.com", Quota: 500000,
			CreatedAt: 1700000000}, nil
	})
	items := got.(map[string]interface{})["items"].([]interface{})
	for _, index := range []int{0, 2} {
		requester := items[index].(map[string]interface{})["requester"].(map[string]interface{})
		if requester["id"] != 17 || requester["username"] != "Ada" || requester["email"] != "ada@example.com" ||
			requester["quota"] != 500000 || requester["created_at"] != int64(1700000000) {
			t.Fatalf("account identity was not attached: %#v", requester)
		}
	}
	// A device ticket, and two tickets of an account whose lookup failed (looked up once, not retried).
	for _, index := range []int{1, 3, 4} {
		if _, exists := items[index].(map[string]interface{})["requester"]; exists {
			t.Fatalf("item %d must not be mapped to a site user", index)
		}
	}
	if lookups != 2 {
		t.Fatalf("each account should be looked up once, got %d lookups", lookups)
	}
}

func TestSupportReplyEmailSendsEscapedNoticeWithConversationLink(t *testing.T) {
	var sent bool
	got := queueSupportReplyEmail(map[string]interface{}{
		"principal": "web:17", "reply_id": "11111111-1111-4111-8111-111111111111", "conversation": "c-demo_1",
		"question": "<script>question</script>", "message": "<script>reply</script>\nNext step",
	}, func(id int, selectAll bool) (*model.User, error) {
		if id != 17 || selectAll {
			t.Fatalf("unexpected account lookup: id=%d selectAll=%t", id, selectAll)
		}
		return &model.User{Id: id, Username: "ada", DisplayName: "<Ada & Co>", Email: "ada@example.com"}, nil
	}, func(receiver, subject, content string) error {
		sent = true
		if receiver != "ada@example.com" || subject == "" {
			t.Fatalf("unexpected email envelope: %q %q", receiver, subject)
		}
		if strings.Contains(content, "<script>") || !strings.Contains(content, "&lt;script&gt;reply&lt;/script&gt;<br>Next step") {
			t.Fatalf("reply was not escaped: %s", content)
		}
		if !strings.Contains(content, "&lt;Ada &amp; Co&gt;") || !strings.Contains(content, "/?assistant=c-demo_1") {
			t.Fatalf("missing name or conversation link: %s", content)
		}
		return nil
	})
	result := got.(map[string]interface{})
	if !sent || result["email_sent"] != false || result["email_status"] != "queued" {
		t.Fatalf("expected queued email result: %#v", result)
	}
}

func TestSupportReplyEmailSkipsAccountsWithoutEmail(t *testing.T) {
	got := queueSupportReplyEmail(map[string]interface{}{"principal": "web:17"}, func(int, bool) (*model.User, error) {
		return &model.User{Id: 17, Username: "ada"}, nil
	}, func(string, string, string) error {
		t.Fatal("email must not be sent for an account without an email")
		return nil
	})
	result := got.(map[string]interface{})
	if result["email_status"] != "no_email" || result["email_sent"] != false {
		t.Fatalf("unexpected missing-email result: %#v", result)
	}
}

func TestSupportReplyEmailReportsMissingMailSettings(t *testing.T) {
	got := queueSupportReplyEmail(map[string]interface{}{"principal": "web:17", "conversation": "../bad"}, func(int, bool) (*model.User, error) {
		return &model.User{Id: 17, Username: "ada", Email: "ada@example.com"}, nil
	}, func(string, string, string) error {
		return errSupportMailUnavailable
	})
	result := got.(map[string]interface{})
	if result["email_status"] != "not_configured" {
		t.Fatalf("expected not_configured when SMTP is missing: %#v", result)
	}
	if link := supportReplyLink("../bad"); strings.Contains(link, "assistant=") {
		t.Fatalf("invalid conversation ids must not reach the link: %s", link)
	}
}
