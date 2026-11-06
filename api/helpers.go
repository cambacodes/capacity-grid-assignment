package main

import (
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"net/http"
	"net/url"
	"strconv"
	"strings"
	"time"
)

const (
	maxBodyBytes = 1 << 20
	queryTimeout = 3 * time.Second
)

// envelope wraps every JSON response under a named top-level key.
type envelope map[string]any

// readJSON decodes a body holding exactly one JSON value into dst. Its errors are
// written for the client, so handlers can pass them straight to badRequestResponse.
func readJSON(w http.ResponseWriter, r *http.Request, dst any) error {
	r.Body = http.MaxBytesReader(w, r.Body, maxBodyBytes)

	dec := json.NewDecoder(r.Body)
	dec.DisallowUnknownFields()

	if err := dec.Decode(dst); err != nil {
		return friendlyJSONError(err)
	}

	// Only a second decode that hits EOF proves nothing follows the first value.
	if err := dec.Decode(&struct{}{}); !errors.Is(err, io.EOF) {
		return errors.New("body must only contain a single JSON value")
	}
	return nil
}

func friendlyJSONError(err error) error {
	if e, ok := errors.AsType[*json.SyntaxError](err); ok {
		return fmt.Errorf("body contains badly-formed JSON (at character %d)", e.Offset)
	}
	if e, ok := errors.AsType[*json.UnmarshalTypeError](err); ok {
		if e.Field != "" {
			return fmt.Errorf("body contains incorrect JSON type for field %q", e.Field)
		}
		return fmt.Errorf("body contains incorrect JSON type (at character %d)", e.Offset)
	}
	if e, ok := errors.AsType[*http.MaxBytesError](err); ok {
		return fmt.Errorf("body must not be larger than %d bytes", e.Limit)
	}
	if errors.Is(err, io.ErrUnexpectedEOF) {
		return errors.New("body contains badly-formed JSON")
	}
	if errors.Is(err, io.EOF) {
		return errors.New("body must not be empty")
	}
	// The decoder has no typed error for this case (golang/go#29035).
	if field, ok := strings.CutPrefix(err.Error(), "json: unknown field "); ok {
		return fmt.Errorf("body contains unknown key %s", field)
	}
	return err
}

// readIDParam returns the positive {id} path value. Ids are int4 serials, so parsing
// at 32 bits turns an impossible id into a 404 instead of a pgx encoding failure.
func readIDParam(r *http.Request) (int, error) {
	id, err := strconv.ParseInt(r.PathValue("id"), 10, 32)
	if err != nil || id < 1 {
		return 0, errors.New("invalid id parameter")
	}
	return int(id), nil
}

// readDate returns the date in query parameter key, recording an error in v if it
// is not one.
func readDate(qs url.Values, key string, v *Validator) time.Time {
	date, err := time.Parse(time.DateOnly, qs.Get(key))
	v.Check(err == nil, key, "must be a date in YYYY-MM-DD format")
	return date
}
