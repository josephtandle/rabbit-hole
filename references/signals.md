# Signal catalogue

Every signal Rabbit Hole watches, who measures it (hook or model), the threshold, and what happens when it trips. Mechanical signals are measured by the hooks and logged to `log.jsonl`. Judgement signals are the model's call, guided by these thresholds.

| Signal | Measured by | Threshold | Action |
|---|---|---|---|
| No declared outcome | hook (first prompt) | session has no mission | Intake question, once. Fallback: the reply is stored as the mission. |
| Identical tool call | PreToolUse hook | same tool and same input 3 times in a row | One-line loop advisory, logged as `loop-identical`. Re-plan before the next call. |
| Target churn | PreToolUse hook | a workhorse tool (Bash, Read, Edit, Write, MultiEdit, NotebookEdit, Grep, Glob, LS, WebFetch, WebSearch) aimed at the same target 5 or more times in the last 10 calls. Same target: for Bash the same normalised command (whitespace collapsed, numbers and quoted strings stripped, leading `cd <dir> &&` dropped, first 60 characters); for file tools the same file path; for searches the same pattern or query; for fetches the same URL | One-line advisory naming the target, logged as `loop-churn`. Fires only on a call that hits that target. |
| Tool frequency | PreToolUse hook | a non-workhorse tool (for example an MCP tool) used 5 or more times in the last 10 calls with at least 2 different inputs | One-line advisory, logged as `loop-frequency`. Workhorse tools are exempt: using Bash or Read for most of the work is normal. |
| Alternation | PreToolUse hook | two calls alternating A-B-A-B-A-B, compared as (tool + input) pairs, so the same two calls repeat with no change in input. Two tools taking turns with different input each time is not a trip | One-line advisory, logged as `loop-alternation`. |
| Loop cooldown | PreToolUse hook | same loop kind within 3 calls of the last trip | Silent; avoids repeating the same advisory every call. |
| Still broken | UserPromptSubmit hook and model | 3 user turns in a row that read as "still failing" | Stop iterating, name the possibly wrong assumption, ask one diagnostic question. Logged as `still-broken`. |
| Topic switch | UserPromptSubmit hook (rough) and model (real) | prompt with 5 or more content words sharing under 15 percent with the session so far | Counter only. First 3 free. |
| Thread budget | hook counter and model | 4 unresolved threads | Thread map plus one re-anchor question (a full checkpoint). Logged as `topic-switch`. After 2 full checkpoints per session: one-liners only. |
| Cadence | UserPromptSubmit hook | `cadenceMinutes` since the last reminder (default 15) | Compact reminder with elapsed, local time, quiet hours, mission, strictness, budget used. Silent self-check. |
| Needle-moving | model | work is cosmetic, preference-based or off the critical path while the mission is delivery, proof, sales or a user flow | Drift checkpoint before going deeper. |
| Creative churn | model | 2 or 3 prompt or model attempts with no usable asset, off the critical path | Drift checkpoint; recommend a placeholder. |
| Side thread | model | shopping, purchase research, speculative optimisation, a new build thread the mission does not need | Drift checkpoint. |
| Fatigue | hook (clock) and model (evidence) | local time inside `quietHours` AND (loop trip, edit-revert churn on one file, still-broken rising, or low energy at intake) | Fatigue checkpoint, once per session unless things worsen. |
| Override | model | the person chose keep going or said it is important | Signal goes quiet until new evidence. Log `check --result overridden`. |
| Confidence | model | below medium | Say nothing. |

## Budgets

- One unsolicited reminder per `cadenceMinutes`.
- Mechanical signals may speak between reminders.
- First 3 topic switches are free.
- At most 2 full checkpoints per session, then one-liners.
- At most 3 choices per checkpoint, recommended first.
- One intake question per session.
- One fatigue check per session unless conditions materially worsen.

## Tuning

Raise a threshold when `rabbit-hole stats` shows the same signal overridden more often than accepted. Lower it when parked items keep being resumed late. Change `cadenceMinutes`, `quietHours` and `strictness` in `config.json`; the mechanical thresholds are constants at the top of `lib/pre-tool-use.js`, and the workhorse tool list and target rules live in `lib/common.js`.
