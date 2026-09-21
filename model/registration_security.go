package model

import (
	"errors"
	"fmt"
	"net"
	"strings"
	"sync"

	"github.com/QuantumNous/new-api/common"
)

var (
	ErrInvalidRegistrationIP   = errors.New("无法识别注册网络地址，请稍后重试")
	ErrRegistrationIPUsed      = errors.New("当前网络环境已注册过账号，请勿重复注册")
	ErrRegistrationSubnetLimit = errors.New("当前网络环境注册账号数量已达上限，请使用已有账号")
	ErrSelfInvitation          = errors.New("邀请码不能来自同一网络环境")
)

// registrationLockEntry serializes the check-and-create sequence for one
// normalized IP. Without this guard two concurrent requests could both pass
// the database count check before either insert became visible.
type registrationLockEntry struct {
	mu       sync.Mutex
	refCount int
}

var (
	registrationLocksMu sync.Mutex
	registrationLocks   = make(map[string]*registrationLockEntry)
)

// WithRegistrationGuard runs fn while holding the per-IP registration lock.
// The lock is process-local; the public rate limiter and the database checks
// remain active on every node, while this closes the common single-node race.
func WithRegistrationGuard(registerIP string, fn func() error) error {
	normalized, err := normalizeRegistrationIP(registerIP)
	if err != nil {
		return err
	}

	registrationLocksMu.Lock()
	entry, ok := registrationLocks[normalized]
	if !ok {
		entry = &registrationLockEntry{}
		registrationLocks[normalized] = entry
	}
	entry.refCount++
	registrationLocksMu.Unlock()

	entry.mu.Lock()
	err = fn()
	entry.mu.Unlock()

	registrationLocksMu.Lock()
	entry.refCount--
	if entry.refCount == 0 {
		delete(registrationLocks, normalized)
	}
	registrationLocksMu.Unlock()
	return err
}

func normalizeRegistrationIP(registerIP string) (string, error) {
	registerIP = strings.TrimSpace(registerIP)
	parsed := net.ParseIP(registerIP)
	if parsed == nil {
		return "", ErrInvalidRegistrationIP
	}
	// Canonicalize IPv4 and IPv6 textual forms before persisting or comparing.
	return parsed.String(), nil
}

func ipv4SubnetPattern(registerIP string) (string, bool) {
	parsed := net.ParseIP(registerIP)
	if parsed == nil {
		return "", false
	}
	parsed = parsed.To4()
	if parsed == nil {
		return "", false
	}
	return fmt.Sprintf("%d.%d.%d.%%", parsed[0], parsed[1], parsed[2]), true
}

func countRegisteredAccountsInNetwork(registerIP string) (int64, error) {
	pattern, ok := ipv4SubnetPattern(registerIP)
	if !ok {
		// Exact-IP protection still applies to IPv6. We deliberately avoid
		// matching textual IPv6 prefixes because equivalent compressed forms
		// would make a LIKE check unreliable.
		used, err := IsRegisterIPUsed(registerIP)
		if err != nil {
			return 0, err
		}
		if used {
			return 1, nil
		}
		return 0, nil
	}

	var count int64
	err := DB.Unscoped().Model(&User{}).Where("register_ip LIKE ?", pattern).Count(&count).Error
	return count, err
}

// ValidatePublicRegistration validates a newly-created public account and
// returns the safe inviter ID. Invalid/missing invitation codes should be
// treated as no inviter by the caller; a same-network inviter is rejected so
// the registration cannot mint affiliate rewards for itself.
func ValidatePublicRegistration(user *User, registerIP string, inviterID int) (string, int, error) {
	if user == nil {
		return "", 0, errors.New("注册用户为空")
	}
	normalizedIP, err := normalizeRegistrationIP(registerIP)
	if err != nil {
		return "", 0, err
	}

	used, err := IsRegisterIPUsed(normalizedIP)
	if err != nil {
		return "", 0, err
	}
	if used {
		return "", 0, ErrRegistrationIPUsed
	}

	if common.RegisterSubnetLimitEnable {
		count, err := countRegisteredAccountsInNetwork(normalizedIP)
		if err != nil {
			return "", 0, err
		}
		if count >= int64(common.RegisterSubnetLimitMaxAccounts) {
			return "", 0, ErrRegistrationSubnetLimit
		}
	}

	if exists, err := CheckUserExistOrDeleted(user.Username, user.Email); err != nil {
		return "", 0, err
	} else if exists {
		return "", 0, errors.New("用户名或邮箱已被使用")
	}

	if inviterID != 0 {
		var inviter User
		if err := DB.Select("id", "register_ip").Where("id = ?", inviterID).First(&inviter).Error; err != nil {
			// A stale/invalid code must never create a reward relationship.
			inviterID = 0
		} else if inviter.RegisterIP == "" {
			// Legacy/admin-created accounts may not have a registration IP.
			// Keep the registration usable, but do not create an unverified
			// affiliate relationship that could be used for self-referral.
			inviterID = 0
		} else {
			inviterIP, normalizeErr := normalizeRegistrationIP(inviter.RegisterIP)
			if normalizeErr == nil && sameRegistrationNetwork(normalizedIP, inviterIP) {
				return "", 0, ErrSelfInvitation
			}
		}
	}

	return normalizedIP, inviterID, nil
}

func sameRegistrationNetwork(left, right string) bool {
	leftIP := net.ParseIP(left)
	rightIP := net.ParseIP(right)
	if leftIP == nil || rightIP == nil {
		return false
	}
	leftV4, rightV4 := leftIP.To4(), rightIP.To4()
	if leftV4 != nil || rightV4 != nil {
		if leftV4 == nil || rightV4 == nil {
			return false
		}
		return leftV4[0] == rightV4[0] && leftV4[1] == rightV4[1] && leftV4[2] == rightV4[2]
	}
	// IPv6 is compared by /64 (first eight bytes).
	leftV6, rightV6 := leftIP.To16(), rightIP.To16()
	for i := 0; i < 8; i++ {
		if leftV6[i] != rightV6[i] {
			return false
		}
	}
	return true
}

// CreatePublicUser is the shared path for legacy OAuth handlers and password
// registration. Keeping the guard here prevents an entry point from silently
// omitting RegisterIP or the affiliate safety checks.
func CreatePublicUser(user *User, registerIP string, inviterID int) error {
	return WithRegistrationGuard(registerIP, func() error {
		normalizedIP, safeInviterID, err := ValidatePublicRegistration(user, registerIP, inviterID)
		if err != nil {
			return err
		}
		user.RegisterIP = normalizedIP
		user.InviterId = safeInviterID
		return user.Insert(safeInviterID)
	})
}
