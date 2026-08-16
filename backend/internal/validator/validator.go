// Package validator registers custom struct-tag validators on top of
// go-playground/validator (which gin already uses internally for its
// `binding:"..."` tags), and turns its raw field errors into the
// consistent {field, message} shape the API returns — Phase 1 Step 7.
package validator

import (
	"fmt"
	"regexp"
	"strings"

	"github.com/gin-gonic/gin/binding"
	"github.com/go-playground/validator/v10"
)

var (
	hasUpper   = regexp.MustCompile(`[A-Z]`)
	hasLower   = regexp.MustCompile(`[a-z]`)
	hasDigit   = regexp.MustCompile(`[0-9]`)
	hasSpecial = regexp.MustCompile(`[^A-Za-z0-9]`)
)

// Register wires the custom validators into gin's shared validator engine.
// Call once at startup, before any request comes in.
func Register() {
	v, ok := binding.Validator.Engine().(*validator.Validate)
	if !ok {
		return
	}
	_ = v.RegisterValidation("strongpassword", strongPassword)
}

// strongPassword enforces Phase 2's password rules: 8+ chars, at least one
// uppercase, one lowercase, one digit, one special character.
func strongPassword(fl validator.FieldLevel) bool {
	pw := fl.Field().String()
	if len(pw) < 8 {
		return false
	}
	return hasUpper.MatchString(pw) && hasLower.MatchString(pw) &&
		hasDigit.MatchString(pw) && hasSpecial.MatchString(pw)
}

// FieldError is a single validation failure in the API's own vocabulary,
// not go-playground/validator's internal one.
type FieldError struct {
	Field   string `json:"field"`
	Message string `json:"message"`
}

// Format turns validator.ValidationErrors (or a binding.JSON parse error)
// into a human-readable summary string plus a structured field list, so
// handlers can return exactly the
//
//	{"success": false, "message": "...", "error": "VALIDATION_ERROR"}
//
// shape the brief asks for, with the field-level detail available to log.
func Format(err error) (summary string, fields []FieldError) {
	verrs, ok := err.(validator.ValidationErrors)
	if !ok {
		return err.Error(), nil
	}
	msgs := make([]string, 0, len(verrs))
	for _, fe := range verrs {
		msg := readable(fe)
		fields = append(fields, FieldError{Field: fe.Field(), Message: msg})
		msgs = append(msgs, msg)
	}
	return strings.Join(msgs, "; "), fields
}

func readable(fe validator.FieldError) string {
	field := fe.Field()
	switch fe.Tag() {
	case "required":
		return fmt.Sprintf("%s is required", field)
	case "email":
		return fmt.Sprintf("%s must be a valid email address", field)
	case "strongpassword":
		return "password must be at least 8 characters and include an uppercase letter, a lowercase letter, a number, and a special character"
	case "hexcolor":
		return fmt.Sprintf("%s must be a hex color like #FFD9BE", field)
	case "oneof":
		return fmt.Sprintf("%s must be one of: %s", field, fe.Param())
	case "min":
		return fmt.Sprintf("%s must be at least %s characters", field, fe.Param())
	case "max":
		return fmt.Sprintf("%s must be at most %s characters", field, fe.Param())
	case "gte":
		return fmt.Sprintf("%s must be greater than or equal to %s", field, fe.Param())
	case "lte":
		return fmt.Sprintf("%s must be less than or equal to %s", field, fe.Param())
	default:
		return fmt.Sprintf("%s is invalid", field)
	}
}
