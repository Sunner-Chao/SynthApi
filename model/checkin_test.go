package model

import "testing"

func TestCheckinAccountAgeError(t *testing.T) {
	if err := checkinAccountAgeError(100, 100, 86400); err == nil {
		t.Fatal("expected a new account to be held from check-in")
	}
	if err := checkinAccountAgeError(100, 100+86400, 86400); err != nil {
		t.Fatalf("expected an aged account to check in: %v", err)
	}
	if err := checkinAccountAgeError(0, 100, 0); err != nil {
		t.Fatalf("disabled age gate should not reject: %v", err)
	}
}
