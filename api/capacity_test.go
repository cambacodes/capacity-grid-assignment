package main

import (
	"context"
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"os"
	"slices"
	"strings"
	"testing"

	"github.com/jackc/pgx/v5/pgxpool"
)

// response decodes any envelope the API answers with.
type response struct {
	Capacity capacityView    `json:"capacity"`
	Person   person          `json:"person"`
	Error    json.RawMessage `json:"error"`
}

// newTestServer returns a server on the seeded database at DATABASE_URL.
func newTestServer(t *testing.T) *server {
	t.Helper()

	db, err := pgxpool.New(context.Background(), os.Getenv("DATABASE_URL"))
	if err != nil {
		t.Fatalf("connect: %v", err)
	}
	t.Cleanup(db.Close)
	return &server{db: db}
}

// send runs a request through the real mux.
func send(t *testing.T, s *server, method, target, body string) (int, response) {
	t.Helper()

	rec := httptest.NewRecorder()
	s.routes().ServeHTTP(rec, httptest.NewRequest(method, target, strings.NewReader(body)))

	var res response
	if err := json.Unmarshal(rec.Body.Bytes(), &res); err != nil {
		t.Fatalf("%s %s: decode %q: %v", method, target, rec.Body.String(), err)
	}
	return rec.Code, res
}

// getCapacity fetches the query, which must succeed.
func getCapacity(t *testing.T, s *server, query string) capacityView {
	t.Helper()

	status, res := send(t, s, http.MethodGet, "/api/capacity?"+query, "")
	if status != http.StatusOK {
		t.Fatalf("GET %s: status %d, error %s", query, status, res.Error)
	}
	return res.Capacity
}

func findPerson(t *testing.T, view capacityView, name string) personCapacity {
	t.Helper()

	i := slices.IndexFunc(view.People, func(p personCapacity) bool { return p.Name == name })
	if i < 0 {
		t.Fatalf("%s is not in the response", name)
	}
	return view.People[i]
}

func TestCapacity(t *testing.T) {
	s := newTestServer(t)

	t.Run("allocated hours per person and week", func(t *testing.T) {
		got := getCapacity(t, s, "from=2025-12-29&to=2026-01-16")

		if got.From != "2025-12-29" || got.To != "2026-01-18" {
			t.Errorf("range = %s..%s, want 2025-12-29..2026-01-18", got.From, got.To)
		}
		if want := []string{"2025-12-29", "2026-01-05", "2026-01-12"}; !slices.Equal(got.Weeks, want) {
			t.Errorf("weeks = %v, want %v", got.Weeks, want)
		}
		if len(got.People) != 500 {
			t.Errorf("got %d people, want 500", len(got.People))
		}
		for _, p := range got.People {
			if len(p.Allocated) != len(got.Weeks) {
				t.Fatalf("%s has %d allocated values for %d weeks", p.Name, len(p.Allocated), len(got.Weeks))
			}
		}

		for _, want := range []struct {
			name      string
			capacity  float64
			allocated []float64
		}{
			{"Ana Ferreira", 40, []float64{40, 0, 30}},
			{"Bo Lindqvist", 40, []float64{0, 32, 8}},
			{"Cem Aydin", 20, []float64{0, 4, 12}},
			{"Dee Okafor", 40, []float64{0, 45, 40}},
			{"Eli Nakamura", 0, []float64{0, 20, 0}},
		} {
			p := findPerson(t, got, want.name)
			if p.WeeklyHours != want.capacity {
				t.Errorf("%s capacity = %v, want %v", want.name, p.WeeklyHours, want.capacity)
			}
			if !slices.Equal(p.Allocated, want.allocated) {
				t.Errorf("%s allocated = %v, want %v", want.name, p.Allocated, want.allocated)
			}
		}
	})

	t.Run("dates inside a week snap to the whole week", func(t *testing.T) {
		got := getCapacity(t, s, "from=2026-01-07&to=2026-01-08")

		if got.From != "2026-01-05" || got.To != "2026-01-11" {
			t.Errorf("range = %s..%s, want 2026-01-05..2026-01-11", got.From, got.To)
		}
		if want := []string{"2026-01-05"}; !slices.Equal(got.Weeks, want) {
			t.Errorf("weeks = %v, want %v", got.Weeks, want)
		}
		if dee := findPerson(t, got, "Dee Okafor"); !slices.Equal(dee.Allocated, []float64{45}) {
			t.Errorf("Dee allocated = %v, want [45]", dee.Allocated)
		}
	})

	t.Run("exactly 106 weeks is allowed", func(t *testing.T) {
		if got := getCapacity(t, s, "from=2024-01-01&to=2026-01-11"); len(got.Weeks) != maxWeeks {
			t.Errorf("got %d weeks, want %d", len(got.Weeks), maxWeeks)
		}
	})

	for _, tt := range []struct {
		name, query, wantError string
	}{
		{"bad from", "from=2026-13-01&to=2026-01-16", `{"from":"must be a date in YYYY-MM-DD format"}`},
		{"missing to", "from=2026-01-05", `{"to":"must be a date in YYYY-MM-DD format"}`},
		{"to before from", "from=2026-01-08&to=2026-01-07", `{"to":"must not be before from"}`},
		{"107 weeks", "from=2024-01-01&to=2026-01-12", `{"to":"the range must not exceed 106 weeks (about two years)"}`},
	} {
		t.Run(tt.name, func(t *testing.T) {
			status, res := send(t, s, http.MethodGet, "/api/capacity?"+tt.query, "")
			if status != http.StatusUnprocessableEntity {
				t.Errorf("status = %d, want 422", status)
			}
			if string(res.Error) != tt.wantError {
				t.Errorf("error = %s, want %s", res.Error, tt.wantError)
			}
		})
	}
}
