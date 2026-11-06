package main

import (
	"context"
	"fmt"
	"net/http"
	"net/url"
	"time"

	"github.com/jackc/pgx/v5"
)

const (
	// maxWeeks bounds one request: two calendar years touch at most 106 Monday-based weeks.
	maxWeeks   = 106
	weekLength = 7 * 24 * time.Hour
)

// capacityView is the grid's data. Weeks holds the Monday of each week, and every
// person's Allocated lines up with it by index.
type capacityView struct {
	From   string           `json:"from"`
	To     string           `json:"to"`
	Weeks  []string         `json:"weeks"`
	People []personCapacity `json:"people"`
}

type personCapacity struct {
	person
	Allocated []float64 `json:"allocated" db:"-"`
}

// handleCapacity serves GET /api/capacity?from=YYYY-MM-DD&to=YYYY-MM-DD
//
// It returns every person's weekly capacity and allocated hours for each week in the
// range. Weeks are always whole: from snaps back to its Monday, to forward to its
// Sunday, and the response carries the snapped values. Allocated is dense, with 0 for
// an empty week.
func (s *server) handleCapacity(w http.ResponseWriter, r *http.Request) {
	var v Validator
	firstWeek, lastWeek := readWeekRange(r.URL.Query(), &v)
	if !v.Valid() {
		s.failedValidationResponse(w, r, v.Errors)
		return
	}

	weeks := []string{}
	for week := firstWeek; !week.After(lastWeek); week = week.AddDate(0, 0, 7) {
		weeks = append(weeks, week.Format(time.DateOnly))
	}

	people, err := s.loadRoster(r.Context(), len(weeks))
	if err != nil {
		s.serverErrorResponse(w, r, err)
		return
	}
	if err := s.fillAllocated(r.Context(), people, firstWeek, lastWeek); err != nil {
		s.serverErrorResponse(w, r, err)
		return
	}

	writeJSON(w, http.StatusOK, envelope{"capacity": capacityView{
		From:   firstWeek.Format(time.DateOnly),
		To:     lastWeek.AddDate(0, 0, 6).Format(time.DateOnly),
		Weeks:  weeks,
		People: people,
	}})
}

// readWeekRange validates from and to, returning the Mondays of the first and last week.
func readWeekRange(qs url.Values, v *Validator) (firstWeek, lastWeek time.Time) {
	from := readDate(qs, "from", v)
	to := readDate(qs, "to", v)
	if !v.Valid() {
		return firstWeek, lastWeek
	}

	firstWeek, lastWeek = mondayOf(from), mondayOf(to)
	v.Check(!to.Before(from), "to", "must not be before from")
	v.Check(lastWeek.Sub(firstWeek) < maxWeeks*weekLength, "to",
		fmt.Sprintf("the range must not exceed %d weeks (about two years)", maxWeeks))
	return firstWeek, lastWeek
}

func mondayOf(date time.Time) time.Time {
	daysSinceMonday := (int(date.Weekday()) + 6) % 7
	return date.AddDate(0, 0, -daysSinceMonday)
}

// loadRoster returns everyone with Allocated zeroed for weekCount weeks, so a person
// with no assignments still appears.
func (s *server) loadRoster(ctx context.Context, weekCount int) ([]personCapacity, error) {
	ctx, cancel := context.WithTimeout(ctx, queryTimeout)
	defer cancel()

	// The default collation on this image sorts "de Almeida" before "Álvarez".
	rows, _ := s.db.Query(ctx, `
		SELECT id, name, weekly_hours::float8 AS weekly_hours
		FROM people
		ORDER BY name COLLATE "und-x-icu", id`)
	people, err := pgx.CollectRows(rows, pgx.RowToStructByName[personCapacity])
	if err != nil {
		return nil, err
	}

	for i := range people {
		people[i].Allocated = make([]float64, weekCount)
	}
	return people, nil
}

// fillAllocated writes each person's allocated hours into Allocated, by week index.
//
// Assumption, not a fact from the data: allocated hours count Monday to Friday. Weekly
// capacity 40 = 5 x 8, and assignments often run through Sat/Sun. Holidays are not in
// the data. Inside a Monday-based week, an assignment's weekdays are then just its
// intersection with Monday..Friday, so no day-by-day expansion is needed.
//
// Seed fact: every real assignment is split into 15 rows whose hours_per_day sum to the
// real value. Plain SUM is correct; never dedupe them.
//
// The weeks come from an integer generate_series because Postgres estimates its row
// count exactly. It plans the date variant as 1000 rows, and that estimate made even a
// one-week request pay about 400 ms of JIT compilation.
func (s *server) fillAllocated(ctx context.Context, people []personCapacity, firstWeek, lastWeek time.Time) error {
	ctx, cancel := context.WithTimeout(ctx, queryTimeout)
	defer cancel()

	allocatedByID := make(map[int][]float64, len(people))
	for _, p := range people {
		allocatedByID[p.ID] = p.Allocated
	}

	rows, _ := s.db.Query(ctx, `
		SELECT a.person_id, w.week_start,
		       sum(a.hours_per_day * (least(a.end_date, w.week_start + 4) - greatest(a.start_date, w.week_start) + 1))::float8 AS allocated
		FROM (SELECT $1::date + 7 * i AS week_start FROM generate_series(0, ($2::date - $1::date) / 7) i) w
		JOIN assignments a ON a.start_date <= w.week_start + 4 AND a.end_date >= w.week_start
		GROUP BY a.person_id, w.week_start`, firstWeek, lastWeek)

	var (
		personID  int
		weekStart time.Time
		hours     float64
	)
	_, err := pgx.ForEachRow(rows, []any{&personID, &weekStart, &hours}, func() error {
		// Someone added after the roster was read has no slice; the next refresh shows them.
		if allocated, ok := allocatedByID[personID]; ok {
			allocated[weekStart.Sub(firstWeek)/weekLength] = hours
		}
		return nil
	})
	return err
}
