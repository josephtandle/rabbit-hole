# Rabbit Hole prompt templates

Use these only when an intervention is justified at medium or high confidence. Keep them short. Three choices at most, recommended first.

## Intake (first turn)

```text
Rabbit Hole intake: what does done look like for this session, in one sentence? And how strict should I be: strict / mid / loose (default mid)?
```

If the first prompt already states the outcome:

```text
[outcome: <one line>] Strictness mid unless you say otherwise. Starting.
```

## Drift

```text
Rabbit Hole check:
- Mission: <declared outcome>
- Risk: drift
- Why: this thread does not move the declared outcome forward

Choices:
- Park this and return to <next mission step> (recommended)
- Timebox it for 15 minutes, then return
- Keep going, this is the priority now
```

## Looping

```text
Rabbit Hole check:
- Mission: <declared outcome>
- Risk: looping
- Why: <tool or step> has repeated without new information

Choices:
- Name the assumption that keeps failing and test it directly (recommended)
- Change the approach: <one concrete alternative>
- Keep going, one more attempt with a stated difference
```

## Still broken (after three "still failing" turns)

```text
Three rounds and it still fails, so I am going to stop patching.
The assumption that may be wrong: <one sentence>.
One question to check it: <diagnostic question>?
```

## Thread map (fourth unresolved thread)

```text
Rabbit Hole check:
- Mission: <declared outcome>
- Risk: drift
- Why: four threads open, none closed

Threads:
1. <thread> : <status> : stopped at <where>
2. <thread> : <status> : stopped at <where>
3. <thread> : <status> : stopped at <where>
4. <thread> : <status> : stopped at <where>

Which one is the mission right now?
```

After the budget of two full checkpoints is spent:

```text
Branching again, intentional?
```

## Fatigue (quiet hours plus loop or churn evidence)

```text
It seems like it is getting late and the last stretch has been going in circles. Want to call it for tonight?

Choices:
- Save state and stop here (recommended)
- Wrap up in 15 minutes
- Keep going
```

## Park confirmation

```text
Parked: <idea>. Back to: <current step>.
```

## Override acknowledgement

```text
Noted. Treating this as intentional and carrying on.
```

## Close-out

```text
Done: <outcome delivered or where it stopped>
Duration: <n> min | Checks: <n> | Parked: <n>
Next action: <one line>
```
