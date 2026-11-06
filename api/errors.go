package main

import (
	"context"
	"errors"
	"log"
	"net/http"
)

var (
	ErrRecordNotFound = errors.New("record not found")
	ErrEditConflict   = errors.New("edit conflict")
)

// errorResponse sends message, a string or a field-to-error map, as {"error": message}.
func (s *server) errorResponse(w http.ResponseWriter, r *http.Request, status int, message any) {
	writeJSON(w, status, envelope{"error": message})
}

// serverErrorResponse logs err and sends a generic 500. The frontend aborts superseded
// GETs, which cancels their queries, so a client that went away is neither logged nor
// answered.
func (s *server) serverErrorResponse(w http.ResponseWriter, r *http.Request, err error) {
	if errors.Is(r.Context().Err(), context.Canceled) {
		return
	}
	log.Printf("%s %s: %v", r.Method, r.URL.RequestURI(), err)
	s.errorResponse(w, r, http.StatusInternalServerError, "the server encountered a problem and could not process your request")
}

func (s *server) notFoundResponse(w http.ResponseWriter, r *http.Request) {
	s.errorResponse(w, r, http.StatusNotFound, "the requested resource could not be found")
}

func (s *server) badRequestResponse(w http.ResponseWriter, r *http.Request, err error) {
	s.errorResponse(w, r, http.StatusBadRequest, err.Error())
}

func (s *server) failedValidationResponse(w http.ResponseWriter, r *http.Request, fieldErrors map[string]string) {
	s.errorResponse(w, r, http.StatusUnprocessableEntity, fieldErrors)
}

func (s *server) editConflictResponse(w http.ResponseWriter, r *http.Request) {
	s.errorResponse(w, r, http.StatusConflict, "unable to update the record due to an edit conflict, please try again")
}
