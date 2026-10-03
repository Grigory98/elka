package emitters

import (
	"encoding/base64"

	"github.com/wailsapp/wails/v3/pkg/application"
)

type WailsSSHEmitter struct {
	app *application.App
}

type SSHDataPayload struct {
	ID   string `json:"id"`
	Data string `json:"data"`
}

type SSHClosedPayload struct {
	ID string `json:"id"`
}

type SSHMetricsPayload struct {
	ID     string  `json:"id"`
	CPU    float64 `json:"cpu"`
	IOWait float64 `json:"ioWait"`
	Load   float64 `json:"load"`
	Memory float64 `json:"memory"`
}

const (
	SSHDataEvent    = "ssh:data"
	SSHClosedEvent  = "ssh:closed"
	SSHMetricsEvent = "ssh:metrics"
)

func NewWailsSSHEmitter(app *application.App) *WailsSSHEmitter {
	return &WailsSSHEmitter{app: app}
}

func (e *WailsSSHEmitter) EmitData(sessionID string, data []byte) {
	e.app.Event.Emit(SSHDataEvent, SSHDataPayload{
		ID:   sessionID,
		Data: base64.StdEncoding.EncodeToString(data),
	})
}

func (e *WailsSSHEmitter) EmitClosed(sessionID string) {
	e.app.Event.Emit(SSHClosedEvent, SSHClosedPayload{
		ID: sessionID,
	})
}

func (e *WailsSSHEmitter) EmitMetrics(sessionID string, cpu float64, ioWait float64, load float64, memory float64) {
	e.app.Event.Emit(SSHMetricsEvent, SSHMetricsPayload{
		ID:     sessionID,
		CPU:    cpu,
		IOWait: ioWait,
		Load:   load,
		Memory: memory,
	})
}
