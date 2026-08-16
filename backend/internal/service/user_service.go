package service

import (
	"context"

	"closet-backend/internal/models"
	"closet-backend/internal/repository"
)

type UserService struct {
	users repository.UserRepository
}

func NewUserService(users repository.UserRepository) *UserService {
	return &UserService{users: users}
}

// SetEquipped mirrors the old StoreContext.setEquipped(slot, itemId) logic:
// dresses and tops/bottoms are mutually exclusive on the doll.
func (s *UserService) SetEquipped(ctx context.Context, userID, slot string, itemID *string) (map[string]string, error) {
	user, err := s.users.FindByID(ctx, userID)
	if err != nil {
		return nil, err
	}

	equipped := user.Settings.Equipped
	if equipped == nil {
		equipped = map[string]string{}
	}

	if itemID == nil || *itemID == "" {
		delete(equipped, slot)
	} else {
		equipped[slot] = *itemID
		if slot == "dresses" {
			delete(equipped, "tops")
			delete(equipped, "bottoms")
		}
		if slot == "tops" || slot == "bottoms" {
			delete(equipped, "dresses")
		}
	}

	if err := s.users.UpdateSettings(ctx, userID, models.Settings{Equipped: equipped}); err != nil {
		return nil, err
	}
	return equipped, nil
}
