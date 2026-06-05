package spinner

import (
	"fmt"
	"time"
)

var frames = []string{
	"⠋", "⠙", "⠹", "⠸", "⠼", "⠴", "⠦", "⠧", "⠇", "⠏",
}

// Spinner displays an animated spinner with a message.
type Spinner struct {
	message string
	done    chan struct{}
}

// New creates a new Spinner with the given message.
func New(message string) *Spinner {
	return &Spinner{
		message: message,
	}
}

// Run starts the spinner animation. It runs until the done channel is closed.
// It should be called in a goroutine.
func (s *Spinner) Run(done chan struct{}) {
	i := 0
	for {
		select {
		case <-done:
			return
		default:
			frame := frames[i%len(frames)]
			fmt.Printf("\r%s %s", frame, s.message)
			i++
			time.Sleep(100 * time.Millisecond)
		}
	}
}