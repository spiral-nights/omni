//// Message ADT for `plugin_timer`.

import plugin/timer/model.{type TimerPreset}

/// All timer messages handled by `plugin/timer/update`.
pub type Msg {
  Start
  Pause
  Resume
  Reset
  Tick
  Complete
  SelectPreset(TimerPreset)
  SetCustomMinutes(String)
  ApplyCustomDuration
  SetMinutes(Int)
  ToggleFocus
  AdjustMinutes(Int)
}
