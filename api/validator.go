package main

// Validator collects one error message per field. The zero value is ready to use.
type Validator struct {
	Errors map[string]string
}

// Valid reports whether no check has failed.
func (v *Validator) Valid() bool {
	return len(v.Errors) == 0
}

// Check records message under key when ok is false. The first failure for a key wins.
func (v *Validator) Check(ok bool, key, message string) {
	if ok {
		return
	}
	if v.Errors == nil {
		v.Errors = make(map[string]string)
	}
	if _, exists := v.Errors[key]; !exists {
		v.Errors[key] = message
	}
}
