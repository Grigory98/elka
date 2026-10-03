package auth

import (
	"context"
	"crypto/rand"
	"database/sql"
	"elka-desktop/backend/internal/apperror"
	"elka-desktop/backend/internal/crypto"
	"elka-desktop/backend/internal/dbgen"
	"elka-desktop/backend/internal/vault"
	"encoding/base64"
	"errors"
	"runtime/debug"

	"github.com/google/uuid"
)

type AuthService struct {
	q     *dbgen.Queries
	vault *vault.Vault
}

type UserInfo struct {
	Username string `json:"username"`
}

const (
	saltLength = 16
	keyLength  = 32
)

func NewAuthService(
	q *dbgen.Queries,
	vault *vault.Vault) *AuthService {
	return &AuthService{
		q:     q,
		vault: vault,
	}
}

// generateSalt returns a new random 16-byte salt, base64 encoded
func generateSalt() (string, error) {
	salt := make([]byte, saltLength)
	if _, err := rand.Read(salt); err != nil {
		return "", err
	}
	return base64.StdEncoding.EncodeToString(salt), nil
}

func (s *AuthService) HasUser(ctx context.Context) (bool, error) {
	count, err := s.q.HasUser(ctx)
	if err != nil {
		return false, err
	}
	return count > 0, nil
}

func (s *AuthService) RegisterLocal(ctx context.Context, username, password string) error {
	masterKey := make([]byte, keyLength)
	if _, err := rand.Read(masterKey); err != nil {
		return err
	}

	keySalt, err := generateSalt()
	if err != nil {
		return err
	}

	authSalt, err := generateSalt()
	if err != nil {
		return err
	}

	kek, err := crypto.DeriveKEK(password, keySalt)
	if err != nil {
		return err
	}

	loginKey, err := crypto.DeriveLoginKey(password, authSalt)
	if err != nil {
		return err
	}

	encryptedMasterKey, err := crypto.EncryptAndPack(masterKey, kek)
	if err != nil {
		return err
	}

	err = s.q.CreateUser(ctx, dbgen.CreateUserParams{
		ID:                 uuid.New().String(),
		Username:           username,
		KeySalt:            keySalt,
		AuthSalt:           sql.NullString{String: authSalt, Valid: true},
		EncryptedMasterKey: encryptedMasterKey,
		ServerUrl:          sql.NullString{Valid: false},
		LastSyncTime:       sql.NullString{Valid: false},
	})
	if err != nil {
		return err
	}

	s.vault.Unlock(masterKey, loginKey)
	return nil
}

// Login - "unlock vault"
func (s *AuthService) Login(ctx context.Context, password string) error {
	dbUser, err := s.q.GetUser(ctx)
	if err != nil {
		if errors.Is(err, sql.ErrNoRows) {
			return apperror.NotFound("User not found", err)
		}
		return err
	}

	kek, err := crypto.DeriveKEK(password, dbUser.KeySalt)
	if err != nil {
		return err
	}

	loginKey := make([]byte, keyLength)
	if dbUser.AuthSalt.Valid {
		loginKey, err = crypto.DeriveLoginKey(password, dbUser.AuthSalt.String)
		if err != nil {
			return err
		}
	}

	masterKey, err := crypto.UnpackAndDecrypt(dbUser.EncryptedMasterKey, kek)
	if err != nil {
		return err
	}

	s.vault.Unlock(masterKey, loginKey)

	go func() {
		debug.FreeOSMemory()
	}()

	return nil
}

func (s *AuthService) WipeData(ctx context.Context) error {
	if err := s.q.WipeBlobs(ctx); err != nil {
		return err
	}
	if err := s.q.WipeUsers(ctx); err != nil {
		return err
	}

	s.vault.Lock()

	return nil
}

func (s *AuthService) LockVault() {
	s.vault.Lock()
}

func (s *AuthService) GetCurrentUser(ctx context.Context) (*UserInfo, error) {
	user, err := s.q.GetUser(ctx)
	if err != nil {
		return nil, err
	}

	return &UserInfo{
		Username: user.Username,
	}, nil
}
