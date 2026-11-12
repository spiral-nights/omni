#!/usr/bin/env node
// Network end-to-end smoke test for the relay client path.
//
// Connects to a few public Nostr relays, subscribes to the most recent
// kind:1 note (limit 1), and waits for an EVENT or EOSE. This is a liveness
// probe for the real network, not a unit test: it is intentionally kept out
// of pull-request CI and runs from the nightly "relay-smoke" workflow.
//
// Usage:
//   node scripts/e2e-relay-smoke.mjs                 # best effort, exit 0 offline
//   node scripts/e2e-relay-smoke.mjs --require-network  # exit 1 if no relay answers
//   node scripts/e2e-relay-smoke.mjs --relays=wss://relay.damus.io,wss://nos.lol
//   node scripts/e2e-relay-smoke.mjs --timeout=5000
//
// Exit codes:
//   0  at least one relay answered, or no relay answered without
//      --require-network (reported as a network/offline skip)
//   1  every attempted relay failed while --require-network was set
//   2  invalid command-line arguments
//
// Requires a global WebSocket (Node >= 22). Older runtimes print a skip and
// exit 0 so the script stays harmless wherever it is invoked.

const DEFAULT_RELAYS = [
  "wss://relay.damus.io",
  "wss://nos.lol",
  "wss://relay.primal.net",
];

const DEFAULT_TIMEOUT_MS = 8000;

const HELP = `Usage: node scripts/e2e-relay-smoke.mjs [options]

Probe public Nostr relays with a recent kind:1 subscription (limit 1) and
report whether each relay returns an EVENT or EOSE.

Options:
  --require-network     Exit 1 when no relay responds (used by the nightly job).
                        Without it, an unreachable network is reported and the
                        script exits 0.
  --relays=<url,url>    Comma-separated relay URLs to probe.
                        Default: ${DEFAULT_RELAYS.join(", ")}
  --timeout=<ms>        Per-relay response timeout. Default: ${DEFAULT_TIMEOUT_MS}
  -h, --help            Show this help and exit.

Exit codes:
  0  a relay answered, or none answered without --require-network
  1  no relay answered and --require-network was set
  2  invalid arguments
`;

function parseArgs(argv) {
  const options = {
    help: false,
    requireNetwork: false,
    relays: [...DEFAULT_RELAYS],
    timeoutMs: DEFAULT_TIMEOUT_MS,
  };

  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];

    if (arg === "-h" || arg === "--help") {
      options.help = true;
    } else if (arg === "--require-network") {
      options.requireNetwork = true;
    } else if (arg.startsWith("--relays=")) {
      options.relays = splitRelays(arg.slice("--relays=".length));
    } else if (arg === "--relays") {
      index += 1;
      options.relays = splitRelays(argv[index] ?? "");
    } else if (arg.startsWith("--timeout=")) {
      options.timeoutMs = parseTimeout(arg.slice("--timeout=".length));
    } else if (arg === "--timeout") {
      index += 1;
      options.timeoutMs = parseTimeout(argv[index] ?? "");
    } else {
      throw new Error(`unknown option: ${arg}`);
    }
  }

  if (!options.help && options.relays.length === 0) {
    throw new Error("--relays must contain at least one URL");
  }

  return options;
}

function splitRelays(value) {
  return value
    .split(",")
    .map((relay) => relay.trim())
    .filter((relay) => relay.length > 0);
}

function parseTimeout(value) {
  const timeoutMs = Number(value);
  if (!Number.isFinite(timeoutMs) || timeoutMs <= 0) {
    throw new Error(`--timeout must be a positive number of milliseconds, got: ${value}`);
  }
  return timeoutMs;
}

function isValidRelayUrl(url) {
  try {
    const parsed = new URL(url);
    return parsed.protocol === "ws:" || parsed.protocol === "wss:";
  } catch {
    return false;
  }
}

// Probes one relay. Always resolves (never rejects) with
// { url, status: "ok" | "fail", reason, detail? }.
function probeRelay(url, timeoutMs) {
  return new Promise((resolve) => {
    const subId = `omni-smoke-${Math.random().toString(36).slice(2, 10)}`;
    let socket = null;
    let settled = false;

    const finish = (result) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);

      if (socket) {
        try {
          if (socket.readyState === 1) {
            socket.send(JSON.stringify(["CLOSE", subId]));
          }
        } catch {
          // Socket may already be closing; nothing to do.
        }
        try {
          socket.close();
        } catch {
          // Ignore close races.
        }
      }

      resolve({ url, ...result });
    };

    const timer = setTimeout(() => {
      finish({ status: "fail", reason: `no EVENT or EOSE within ${timeoutMs}ms` });
    }, timeoutMs);

    if (!isValidRelayUrl(url)) {
      finish({ status: "fail", reason: "not a ws:// or wss:// URL" });
      return;
    }

    try {
      socket = new WebSocket(url);
    } catch (error) {
      finish({ status: "fail", reason: `could not open socket: ${error.message}` });
      return;
    }

    socket.addEventListener("open", () => {
      try {
        socket.send(
          JSON.stringify(["REQ", subId, { kinds: [1], limit: 1 }]),
        );
      } catch (error) {
        finish({ status: "fail", reason: `could not send REQ: ${error.message}` });
      }
    });

    socket.addEventListener("message", (event) => {
      let frame;
      try {
        const raw = typeof event.data === "string" ? event.data : String(event.data);
        frame = JSON.parse(raw);
      } catch {
        return; // Ignore non-JSON frames.
      }

      if (!Array.isArray(frame) || frame[1] !== subId) return;

      if (frame[0] === "EVENT") {
        const note = frame[2];
        const detail =
          note && typeof note.id === "string" ? `event ${note.id.slice(0, 12)}…` : "event";
        finish({ status: "ok", reason: "received EVENT", detail });
      } else if (frame[0] === "EOSE") {
        finish({ status: "ok", reason: "received EOSE (no recent note)" });
      } else if (frame[0] === "CLOSED") {
        const reason = typeof frame[2] === "string" ? frame[2] : "no reason given";
        finish({ status: "fail", reason: `relay CLOSED the subscription: ${reason}` });
      }
    });

    socket.addEventListener("error", () => {
      finish({ status: "fail", reason: "socket error before a response" });
    });

    socket.addEventListener("close", (event) => {
      finish({
        status: "fail",
        reason: `socket closed before a response (code ${event.code})`,
      });
    });
  });
}

async function main() {
  let options;
  try {
    options = parseArgs(process.argv.slice(2));
  } catch (error) {
    console.error(`relay smoke: ${error.message}`);
    console.error("Run with --help for usage.");
    return 2;
  }

  if (options.help) {
    console.log(HELP);
    return 0;
  }

  if (typeof WebSocket !== "function") {
    console.log(
      "relay smoke: skipped — global WebSocket is unavailable (requires Node >= 22).",
    );
    return 0;
  }

  console.log(
    `relay smoke: probing ${options.relays.length} relay(s) with a ${options.timeoutMs}ms timeout`,
  );

  const results = await Promise.all(
    options.relays.map((relay) => probeRelay(relay, options.timeoutMs)),
  );

  for (const result of results) {
    if (result.status === "ok") {
      const detail = result.detail ? ` (${result.detail})` : "";
      console.log(`  ok    ${result.url} — ${result.reason}${detail}`);
    } else {
      console.log(`  fail  ${result.url} — ${result.reason}`);
    }
  }

  const responded = results.filter((result) => result.status === "ok").length;
  const failed = results.length - responded;

  if (responded > 0) {
    console.log(
      `relay smoke: ${responded}/${results.length} relay(s) responded, ${failed} failed.`,
    );
    return 0;
  }

  if (options.requireNetwork) {
    console.error(
      `relay smoke: no relay responded (${failed}/${results.length} failed) and --require-network is set.`,
    );
    return 1;
  }

  console.log(
    "relay smoke: no relay responded — treating this as an offline/network skip, not a product failure.",
  );
  console.log("relay smoke: pass --require-network to make zero responses a failure.");
  return 0;
}

const exitCode = await main().catch((error) => {
  console.error(`relay smoke: unexpected error: ${error.stack ?? error.message}`);
  return 1;
});

process.exitCode = exitCode;

// Sockets may still be closing; give them a moment and then force the exit so
// a stuck TLS handshake cannot keep the process alive.
setTimeout(() => process.exit(exitCode), 200);
