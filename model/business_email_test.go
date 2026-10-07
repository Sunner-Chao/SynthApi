package model

import (
	"strings"
	"testing"
)

func TestAnnouncementIdentityPrefersStableID(t *testing.T) {
	first := map[string]interface{}{"id": "announcement-1", "content": "first", "publishDate": "2026-09-30"}
	changed := map[string]interface{}{"id": "announcement-1", "content": "edited", "publishDate": "2026-10-01"}
	if got, want := announcementIdentity(first), announcementIdentity(changed); got != want {
		t.Fatalf("stable announcement id changed after edit: got %q want %q", got, want)
	}
}

func TestAnnouncementIdentityWithoutIDChangesWithPublishedContent(t *testing.T) {
	first := map[string]interface{}{"content": "first", "publishDate": "2026-09-30"}
	second := map[string]interface{}{"content": "second", "publishDate": "2026-09-30"}
	if announcementIdentity(first) == announcementIdentity(second) {
		t.Fatal("content-only announcements must have different identities")
	}
	if len(announcementIdentity(first)) != 64 {
		t.Fatalf("fallback identity should be a SHA-256 hex digest, got %q", announcementIdentity(first))
	}
}

func TestAnnouncementEmailContentEscapesMarkup(t *testing.T) {
	item := map[string]interface{}{
		"title":   "服务更新",
		"content": `<script>alert("x")</script>\n请查看 <a href="bad">说明</a>`,
		"extra":   "温馨提醒",
	}
	content := announcementEmailContent(item)
	if strings.Contains(content, "<script>") || strings.Contains(content, `<a href="bad">`) {
		t.Fatalf("announcement content contains unescaped markup: %s", content)
	}
	if !strings.Contains(content, "&lt;script&gt;") || !strings.Contains(content, "温馨提醒") {
		t.Fatalf("announcement content lost escaped text or extra note: %s", content)
	}
}

func TestInactiveReminderSignatureIsStableAndUserSpecific(t *testing.T) {
	first := inactiveReminderSignature(308)
	if first == "" || first != inactiveReminderSignature(308) {
		t.Fatal("inactive reminder signature is not stable")
	}
	if first == inactiveReminderSignature(309) {
		t.Fatal("inactive reminder signatures must be user-specific")
	}
}
