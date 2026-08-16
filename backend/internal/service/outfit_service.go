package service

import (
	"context"

	"closet-backend/internal/dto"
	"closet-backend/internal/models"
	"closet-backend/internal/repository"
)

type OutfitService struct {
	outfits repository.OutfitRepository
}

func NewOutfitService(outfits repository.OutfitRepository) *OutfitService {
	return &OutfitService{outfits: outfits}
}

func (s *OutfitService) Create(ctx context.Context, userID string, req dto.OutfitRequest) (*dto.OutfitResponse, error) {
	o := &models.Outfit{
		UserID:  userID,
		Name:    req.Name,
		Emoji:   coalesceStr(req.Emoji, "✨"),
		ItemIDs: req.ItemIDs,
	}
	if o.ItemIDs == nil {
		o.ItemIDs = []string{}
	}
	if err := s.outfits.Create(ctx, o); err != nil {
		return nil, err
	}
	resp := toOutfitResponse(o)
	return &resp, nil
}

func (s *OutfitService) List(ctx context.Context, userID string) ([]dto.OutfitResponse, error) {
	outfits, err := s.outfits.ListByUser(ctx, userID)
	if err != nil {
		return nil, err
	}
	resp := make([]dto.OutfitResponse, len(outfits))
	for i := range outfits {
		resp[i] = toOutfitResponse(&outfits[i])
	}
	return resp, nil
}

func (s *OutfitService) Get(ctx context.Context, userID, id string) (*dto.OutfitResponse, error) {
	o, err := s.outfits.FindByID(ctx, id)
	if err != nil {
		return nil, err
	}
	if o.UserID != userID {
		return nil, ErrForbidden
	}
	resp := toOutfitResponse(o)
	return &resp, nil
}

func (s *OutfitService) Update(ctx context.Context, userID, id string, req dto.OutfitPatchRequest) error {
	o, err := s.outfits.FindByID(ctx, id)
	if err != nil {
		return err
	}
	if o.UserID != userID {
		return ErrForbidden
	}
	return s.outfits.Update(ctx, id, req.Name, req.Emoji, req.ItemIDs)
}

func (s *OutfitService) Delete(ctx context.Context, userID, id string) error {
	o, err := s.outfits.FindByID(ctx, id)
	if err != nil {
		return err
	}
	if o.UserID != userID {
		return ErrForbidden
	}
	return s.outfits.Delete(ctx, id)
}

func toOutfitResponse(o *models.Outfit) dto.OutfitResponse {
	return dto.OutfitResponse{ID: o.ID, Name: o.Name, Emoji: o.Emoji, ItemIDs: o.ItemIDs, CreatedAt: o.CreatedAt}
}
