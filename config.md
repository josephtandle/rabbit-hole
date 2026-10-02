# Config keys

Rabbit Hole reads `$RABBIT_HOLE_HOME/config.json` (default `~/.rabbit-hole/config.json`). Every key is optional; missing keys fall back to the values in `config.example.json`. Run `rabbit-hole config` to print the effective result.

| Key | Default | Meaning |
|---|---|---|
| `mission` | `""` | A standing default outcome, used when a session has not declared one. Leave empty to let the intake question set it per session. |
| `strictness` | `"mid"` | How hard the guard leans. `strict`: parks tangents and says so in one line. `mid`: asks with a checkpoint. `loose`: logs only, speaks only on loops or fatigue. The intake answer can override this per session. |
| `cadenceMinutes` | `15` | Minimum minutes between unsolicited reminders. Mechanical signals (loops, still-broken, topic-switch budget) can speak between reminders because they rest on evidence, not the clock. |
| `quietHours.start` | `"23:00"` | Local time after which late-night work counts toward the fatigue signal. |
| `quietHours.end` | `"06:00"` | Local time at which quiet hours end. A range that crosses midnight is fine. |
| `timezone` | `""` | An IANA zone such as `Europe/Berlin`. Empty uses the system zone. |
| `parkingLot` | `"PARKING-LOT.md"` | Where `rabbit-hole park` appends. A relative path resolves against the current working directory, so each project gets its own lot. Use an absolute path or `~/...` for one shared lot. |

State files next to the config: `sessions/<session_id>.json` (per session), `log.jsonl` (every trip and checkpoint), `resume.md` (one line per `rabbit-hole done`). All local, nothing leaves the machine.
