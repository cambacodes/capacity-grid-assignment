package main

import "net/http"

// person is a row of the people table as the API exposes it.
type person struct {
	ID          int     `json:"id"`
	Name        string  `json:"name"`
	WeeklyHours float64 `json:"weeklyHours"`
}

// handleUpdatePerson serves PATCH /api/people/{id}
//
// It should update the person's weekly hours. What it returns is yours to
// design - the grid is the consumer, and it has state to keep honest.
//
// TODO: implement.
func (s *server) handleUpdatePerson(w http.ResponseWriter, r *http.Request) {
	http.Error(w, "not implemented", http.StatusNotImplemented)
}
