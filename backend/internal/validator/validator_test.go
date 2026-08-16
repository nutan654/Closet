package validator

import (
	"testing"

	gvalidator "github.com/go-playground/validator/v10"
)

// TestStrongPassword exercises the validator directly (bypassing gin's
// binding registry) since Register() wires into gin's shared singleton,
// which isn't the unit under test here.
func TestStrongPassword(t *testing.T) {
	v := gvalidator.New()
	_ = v.RegisterValidation("strongpassword", strongPassword)

	type payload struct {
		Password string `validate:"strongpassword"`
	}

	cases := []struct {
		name    string
		pw      string
		wantErr bool
	}{
		{"valid strong password", "Sup3r$ecret", false},
		{"too short", "Sh0rt!", true},
		{"no uppercase", "lowercase1$", true},
		{"no lowercase", "UPPERCASE1$", true},
		{"no digit", "NoDigitsHere$", true},
		{"no special char", "NoSpecial123", true},
		{"empty", "", true},
	}

	for _, tc := range cases {
		t.Run(tc.name, func(t *testing.T) {
			err := v.Struct(payload{Password: tc.pw})
			gotErr := err != nil
			if gotErr != tc.wantErr {
				t.Errorf("password %q: wantErr=%v gotErr=%v (err=%v)", tc.pw, tc.wantErr, gotErr, err)
			}
		})
	}
}
