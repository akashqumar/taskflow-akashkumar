package handlers

import (
	"encoding/json"
	"net/http"
	"strconv"
)

// respond writes a JSON response with the given status code.
func respond(w http.ResponseWriter, status int, data any) {
	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(status)
	_ = json.NewEncoder(w).Encode(data)
}

// respondError writes a simple JSON error.
func respondError(w http.ResponseWriter, status int, message string) {
	respond(w, status, map[string]string{"error": message})
}

// respondValidationError writes a 400 with structured field errors.
func respondValidationError(w http.ResponseWriter, fields map[string]string) {
	respond(w, http.StatusBadRequest, map[string]any{
		"error":  "validation failed",
		"fields": fields,
	})
}

// parsePagination extracts page and limit from query params with safe defaults.
func parsePagination(r *http.Request) (page, limit int) {
	page = 1
	limit = 20
	if p, err := strconv.Atoi(r.URL.Query().Get("page")); err == nil && p > 0 {
		page = p
	}
	if l, err := strconv.Atoi(r.URL.Query().Get("limit")); err == nil && l > 0 && l <= 100 {
		limit = l
	}
	return
}
