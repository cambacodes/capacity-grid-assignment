package main

import (
	"context"
	"net/http"
	"testing"
)

func TestUpdatePerson(t *testing.T) {
	s := newTestServer(t)
	t.Cleanup(func() {
		if _, err := s.db.Exec(context.Background(), `UPDATE people SET weekly_hours = 20 WHERE id = 3`); err != nil {
			t.Errorf("restore Cem Aydin: %v", err)
		}
	})

	gridHours := func(t *testing.T) float64 {
		t.Helper()
		return findPerson(t, getCapacity(t, s, "from=2026-01-05&to=2026-01-11"), "Cem Aydin").WeeklyHours
	}

	// The steps run in order: each starts from the hours the previous one left behind.
	for _, step := range []struct {
		name       string
		target     string
		body       string
		wantStatus int
		wantError  string  // exact JSON, when the step checks it
		wantHours  float64 // what the grid must show after the step
	}{
		{
			name:       "valid save",
			target:     "/api/people/3",
			body:       `{"weeklyHours":32.5,"expectedWeeklyHours":20}`,
			wantStatus: http.StatusOK,
			wantHours:  32.5,
		},
		{
			name:       "repeating the same request succeeds",
			target:     "/api/people/3",
			body:       `{"weeklyHours":32.5,"expectedWeeklyHours":20}`,
			wantStatus: http.StatusOK,
			wantHours:  32.5,
		},
		{
			name:       "stale expected value conflicts",
			target:     "/api/people/3",
			body:       `{"weeklyHours":25,"expectedWeeklyHours":20}`,
			wantStatus: http.StatusConflict,
			wantHours:  32.5,
		},
		{
			name:       "zero is valid",
			target:     "/api/people/3",
			body:       `{"weeklyHours":0,"expectedWeeklyHours":32.5}`,
			wantStatus: http.StatusOK,
			wantHours:  0,
		},
		{
			name:       "negative hours",
			target:     "/api/people/3",
			body:       `{"weeklyHours":-1,"expectedWeeklyHours":0}`,
			wantStatus: http.StatusUnprocessableEntity,
			wantError:  `{"weeklyHours":"must be between 0 and 168"}`,
			wantHours:  0,
		},
		{
			name:       "more hours than a week has",
			target:     "/api/people/3",
			body:       `{"weeklyHours":168.5,"expectedWeeklyHours":0}`,
			wantStatus: http.StatusUnprocessableEntity,
			wantError:  `{"weeklyHours":"must be between 0 and 168"}`,
			wantHours:  0,
		},
		{
			name:       "missing expected value",
			target:     "/api/people/3",
			body:       `{"weeklyHours":10}`,
			wantStatus: http.StatusUnprocessableEntity,
			wantError:  `{"expectedWeeklyHours":"must be provided"}`,
			wantHours:  0,
		},
		{
			name:       "missing new value",
			target:     "/api/people/3",
			body:       `{"expectedWeeklyHours":0}`,
			wantStatus: http.StatusUnprocessableEntity,
			wantError:  `{"weeklyHours":"must be provided"}`,
			wantHours:  0,
		},
		{
			name:       "unknown key",
			target:     "/api/people/3",
			body:       `{"weeklyHours":10,"expectedWeeklyHours":0,"name":"Cem"}`,
			wantStatus: http.StatusBadRequest,
			wantError:  `"body contains unknown key \"name\""`,
			wantHours:  0,
		},
		{
			name:       "unknown id",
			target:     "/api/people/999999",
			body:       `{"weeklyHours":10,"expectedWeeklyHours":0}`,
			wantStatus: http.StatusNotFound,
			wantHours:  0,
		},
		{
			name:       "id beyond the int4 serial range",
			target:     "/api/people/99999999999",
			body:       `{"weeklyHours":10,"expectedWeeklyHours":0}`,
			wantStatus: http.StatusNotFound,
			wantHours:  0,
		},
	} {
		t.Run(step.name, func(t *testing.T) {
			status, res := send(t, s, http.MethodPatch, step.target, step.body)

			if status != step.wantStatus {
				t.Fatalf("status = %d, want %d, error %s", status, step.wantStatus, res.Error)
			}
			if step.wantError != "" && string(res.Error) != step.wantError {
				t.Errorf("error = %s, want %s", res.Error, step.wantError)
			}
			if want := (person{ID: 3, Name: "Cem Aydin", WeeklyHours: step.wantHours}); status == http.StatusOK && res.Person != want {
				t.Errorf("person = %+v, want %+v", res.Person, want)
			}
			if got := gridHours(t); got != step.wantHours {
				t.Errorf("grid shows %v hours, want %v", got, step.wantHours)
			}
		})
	}
}
