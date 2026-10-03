package emitters

import "github.com/wailsapp/wails/v3/pkg/application"

type UpdaterProgressPayload struct {
	Downloaded int64 `json:"downloaded"`
	Total      int64 `json:"total"`
	Percent    uint  `json:"percent"`
}

const (
	UpdaterProgressEvent = "updater:progress"
)

type WailsUpdaterEmitter struct {
	app *application.App
}

func NewWailsUpdaterEmitter(app *application.App) *WailsUpdaterEmitter {
	return &WailsUpdaterEmitter{app: app}
}

func (e *WailsUpdaterEmitter) EmitProgress(downloaded int64, total int64, percent uint) {
	e.app.Event.Emit(UpdaterProgressEvent, UpdaterProgressPayload{
		Downloaded: downloaded,
		Total:      total,
		Percent:    percent,
	})
}

// Quit closes the application so that an installer can replace its files.
func (e *WailsUpdaterEmitter) Quit() {
	e.app.Quit()
}
