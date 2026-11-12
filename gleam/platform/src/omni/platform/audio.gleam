//// Audio playback port (FFI-quarantined).

/// Play the standard focus-timer completion chime. No-op when audio is unavailable.
@external(javascript, "./audio.ffi.mjs", "play_chime")
pub fn play_chime() -> Nil
