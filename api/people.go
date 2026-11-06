package main

import (
	"context"
	"errors"
	"fmt"
	"net/http"

	"github.com/jackc/pgx/v5"
)

// maxWeeklyHours is every hour in a week, the most a person can be given.
const maxWeeklyHours = 168

// person is a row of the people table as the API exposes it.
type person struct {
	ID          int     `json:"id"`
	Name        string  `json:"name"`
	WeeklyHours float64 `json:"weeklyHours"`
}

// handleUpdatePerson serves PATCH /api/people/{id}
//
// The body is {"weeklyHours":32,"expectedWeeklyHours":40}, both required, where
// expectedWeeklyHours is the value the client last saw. It responds with the person as
// stored, or 409 when the current value is neither expected nor already the new one.
func (s *server) handleUpdatePerson(w http.ResponseWriter, r *http.Request) {
	id, err := readIDParam(r)
	if err != nil {
		s.notFoundResponse(w, r)
		return
	}

	var input struct {
		WeeklyHours         *float64 `json:"weeklyHours"`
		ExpectedWeeklyHours *float64 `json:"expectedWeeklyHours"`
	}
	if err := readJSON(w, r, &input); err != nil {
		s.badRequestResponse(w, r, err)
		return
	}

	var v Validator
	v.Check(input.WeeklyHours != nil, "weeklyHours", "must be provided")
	v.Check(input.ExpectedWeeklyHours != nil, "expectedWeeklyHours", "must be provided")
	if input.WeeklyHours != nil {
		v.Check(*input.WeeklyHours >= 0 && *input.WeeklyHours <= maxWeeklyHours, "weeklyHours",
			fmt.Sprintf("must be between 0 and %d", maxWeeklyHours))
	}
	if !v.Valid() {
		s.failedValidationResponse(w, r, v.Errors)
		return
	}

	updated, err := s.updateWeeklyHours(r.Context(), id, *input.WeeklyHours, *input.ExpectedWeeklyHours)
	switch {
	case errors.Is(err, ErrRecordNotFound):
		s.notFoundResponse(w, r)
	case errors.Is(err, ErrEditConflict):
		s.editConflictResponse(w, r)
	case err != nil:
		s.serverErrorResponse(w, r, err)
	default:
		writeJSON(w, http.StatusOK, envelope{"person": updated})
	}
}

// updateWeeklyHours stores hours for person id, returning ErrRecordNotFound or
// ErrEditConflict when it cannot.
func (s *server) updateWeeklyHours(ctx context.Context, id int, hours, expected float64) (person, error) {
	ctx, cancel := context.WithTimeout(ctx, queryTimeout)
	defer cancel()

	// The schema has no version column, so the current value is the version. Accepting
	// hours as well as expected makes a retry idempotent: if the first PATCH committed
	// but its response was lost, the retry returns 200 instead of a false conflict.
	rows, _ := s.db.Query(ctx, `
		UPDATE people SET weekly_hours = $2::numeric
		WHERE id = $1 AND weekly_hours IN ($2::numeric, $3::numeric)
		RETURNING id, name, weekly_hours::float8 AS weekly_hours`, id, hours, expected)
	updated, err := pgx.CollectOneRow(rows, pgx.RowToStructByName[person])
	if !errors.Is(err, pgx.ErrNoRows) {
		return updated, err
	}

	// No row matched: the person is gone, or someone else changed the hours.
	var exists bool
	err = s.db.QueryRow(ctx, `SELECT EXISTS (SELECT 1 FROM people WHERE id = $1)`, id).Scan(&exists)
	switch {
	case err != nil:
		return person{}, err
	case !exists:
		return person{}, ErrRecordNotFound
	default:
		return person{}, ErrEditConflict
	}
}
