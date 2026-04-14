// Package broadcaster provides a lightweight pub/sub hub for Server-Sent Events.
// Each project gets its own fan-out channel; when tasks are mutated the handler
// publishes an event that all connected clients receive in real time.
package broadcaster

import (
	"encoding/json"
	"fmt"
	"net/http"
	"sync"
)

// Event is the JSON payload pushed over the SSE stream.
type Event struct {
	Type    string `json:"type"`    // task_created | task_updated | task_deleted
	Payload any    `json:"payload"` // full task or {"id":"…"} for deletes
}

// Hub manages per-project SSE subscriber channels.
type Hub struct {
	mu   sync.RWMutex
	subs map[string]map[chan Event]struct{}
}

// NewHub creates a ready-to-use Hub.
func NewHub() *Hub {
	return &Hub{subs: make(map[string]map[chan Event]struct{})}
}

// Subscribe registers a new buffered channel for projectID and returns it.
func (h *Hub) Subscribe(projectID string) chan Event {
	ch := make(chan Event, 64)
	h.mu.Lock()
	if h.subs[projectID] == nil {
		h.subs[projectID] = make(map[chan Event]struct{})
	}
	h.subs[projectID][ch] = struct{}{}
	h.mu.Unlock()
	return ch
}

// Unsubscribe removes ch from projectID's subscriber list and closes it.
func (h *Hub) Unsubscribe(projectID string, ch chan Event) {
	h.mu.Lock()
	if subs, ok := h.subs[projectID]; ok {
		delete(subs, ch)
		if len(subs) == 0 {
			delete(h.subs, projectID)
		}
	}
	h.mu.Unlock()
	close(ch)
}

// Publish sends ev to every subscriber watching projectID.
// Slow clients are skipped (non-blocking send).
func (h *Hub) Publish(projectID string, ev Event) {
	h.mu.RLock()
	defer h.mu.RUnlock()
	for ch := range h.subs[projectID] {
		select {
		case ch <- ev:
		default: // drop for slow client rather than block
		}
	}
}

// ServeSSE streams events to a single HTTP client until it disconnects.
// It reads projectID from the URL and uses an already-authenticated request
// (the auth middleware must run before this handler).
func (h *Hub) ServeSSE(projectID string, w http.ResponseWriter, r *http.Request) {
	flusher, ok := w.(http.Flusher)
	if !ok {
		http.Error(w, `{"error":"streaming unsupported"}`, http.StatusInternalServerError)
		return
	}

	w.Header().Set("Content-Type", "text/event-stream")
	w.Header().Set("Cache-Control", "no-cache")
	w.Header().Set("Connection", "keep-alive")
	w.Header().Set("X-Accel-Buffering", "no") // prevent nginx buffering

	ch := h.Subscribe(projectID)
	defer h.Unsubscribe(projectID, ch)

	// Initial comment so EventSource knows the connection is alive
	fmt.Fprintf(w, ": connected to project %s\n\n", projectID)
	flusher.Flush()

	for {
		select {
		case ev, ok := <-ch:
			if !ok {
				return
			}
			data, _ := json.Marshal(ev)
			fmt.Fprintf(w, "data: %s\n\n", data)
			flusher.Flush()
		case <-r.Context().Done():
			return
		}
	}
}
