export interface CuratedApp {
  id: string;
  name: string;
  version: string;
  description: string;
  category: "Social" | "Productivity" | "Games" | "Utilities";
  icon: string;
  author: string;
  viewport: "main" | "sidebar";
  views?: Array<{ id: string; title: string; path: string }>;
  htmlContent: string;
}

export const CURATED_APPS: CuratedApp[] = [
  {
    id: "org.omni.nsite.wisdom",
    name: "Cypherpunk Wisdom",
    version: "1.0.0",
    description: "Decentralized cryptographic maxims and sovereignty quotes.",
    category: "Social",
    icon: "document",
    author: "cypherpunks@nostr",
    viewport: "sidebar",
    views: [
      { id: "main", title: "All Maxims", path: "" },
      { id: "widget", title: "Daily Quote Card", path: "?view=widget" }
    ],
    htmlContent: `<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <title>Cypherpunk Wisdom</title>
  <style>
    body {
      margin: 0;
      padding: 16px;
      font-family: system-ui, -apple-system, sans-serif;
      color: #ede8df;
      background: #191816;
      box-sizing: border-box;
    }
    .wisdom-card {
      border: 1px solid #3a3732;
      border-radius: 8px;
      padding: 16px;
      background: #22201d;
    }
    .wisdom-title {
      font-size: 0.95rem;
      font-weight: 600;
      color: #d4a373;
      margin: 0 0 8px 0;
      display: flex;
      align-items: center;
      gap: 6px;
    }
    .wisdom-quote {
      font-size: 0.88rem;
      font-style: italic;
      line-height: 1.5;
      color: #ede8df;
      margin: 0 0 8px 0;
    }
    .wisdom-author {
      font-size: 0.75rem;
      color: #9e988f;
      text-align: right;
    }
    .btn-next {
      background: #191816;
      border: 1px solid #3a3732;
      color: #ede8df;
      padding: 4px 10px;
      border-radius: 4px;
      font-size: 0.75rem;
      cursor: pointer;
      margin-top: 10px;
    }
    .btn-next:hover { border-color: #d4a373; }
  </style>
</head>
<body>
  <div class="wisdom-card">
    <h4 class="wisdom-title">✦ Cypherpunk Maxim</h4>
    <p class="wisdom-quote" id="quote-text">“Don't trust, verify.”</p>
    <div class="wisdom-author" id="quote-author">— Cypherpunk Maxim</div>
    <button class="btn-next" id="btn-next-quote">Next Maxim</button>
  </div>
  <script>
    const quotes = [
      { q: "“Don't trust, verify.”", a: "Cypherpunk Maxim" },
      { q: "“Privacy is necessary for an open society in the electronic age.”", a: "Eric Hughes (1993)" },
      { q: "“We cannot expect governments, corporations, or other large, faceless organizations to grant us privacy out of their beneficence.”", a: "A Cypherpunk's Manifesto" },
      { q: "“The computer can be used as a tool to liberate and protect people, rather than to control them.”", a: "Hal Finney (1992)" }
    ];
    let idx = 0;
    const qEl = document.getElementById("quote-text");
    const aEl = document.getElementById("quote-author");
    document.getElementById("btn-next-quote").addEventListener("click", () => {
      idx = (idx + 1) % quotes.length;
      qEl.textContent = quotes[idx].q;
      aEl.textContent = "— " + quotes[idx].a;
    });
  </script>
</body>
</html>`
  },
  {
    id: "org.omni.nsite.zappolls",
    name: "ZapPolls",
    version: "1.0.0",
    description: "Decentralized consensus polling and multi-choice voting widget.",
    category: "Utilities",
    icon: "widgets",
    author: "polls@nostr",
    viewport: "sidebar",
    views: [
      { id: "main", title: "Live Poll", path: "" },
      { id: "widget", title: "Poll Card", path: "?view=widget" }
    ],
    htmlContent: `<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <title>ZapPolls</title>
  <style>
    body {
      margin: 0;
      padding: 16px;
      font-family: system-ui, -apple-system, sans-serif;
      color: #ede8df;
      background: #191816;
      box-sizing: border-box;
    }
    .poll-card {
      border: 1px solid #3a3732;
      border-radius: 8px;
      padding: 14px;
      background: #22201d;
    }
    .poll-question {
      font-size: 0.92rem;
      font-weight: 600;
      margin: 0 0 12px 0;
      color: #ede8df;
    }
    .poll-option {
      background: #191816;
      border: 1px solid #2d2b27;
      border-radius: 6px;
      padding: 8px 12px;
      margin-bottom: 8px;
      display: flex;
      justify-content: space-between;
      align-items: center;
      cursor: pointer;
      font-size: 0.82rem;
      transition: all 0.15s;
    }
    .poll-option:hover {
      border-color: #d4a373;
    }
    .poll-votes {
      font-size: 0.75rem;
      color: #d4a373;
      font-weight: 600;
    }
  </style>
</head>
<body>
  <div class="poll-card">
    <div class="poll-question">Which protocol architecture is best for sovereign apps?</div>
    <div class="poll-option" id="opt-1">
      <span>Local-First Nsites (NIP-5A)</span>
      <span class="poll-votes" id="v-1">42 votes</span>
    </div>
    <div class="poll-option" id="opt-2">
      <span>Centralized Web2 Clouds</span>
      <span class="poll-votes" id="v-2">1 vote</span>
    </div>
    <div class="poll-option" id="opt-3">
      <span>Decentralized Relay Mesh</span>
      <span class="poll-votes" id="v-3">28 votes</span>
    </div>
  </div>
  <script>
    let v1 = 42, v2 = 1, v3 = 28;
    document.getElementById("opt-1").addEventListener("click", () => {
      v1++;
      document.getElementById("v-1").textContent = v1 + " votes";
    });
    document.getElementById("opt-2").addEventListener("click", () => {
      v2++;
      document.getElementById("v-2").textContent = v2 + " votes";
    });
    document.getElementById("opt-3").addEventListener("click", () => {
      v3++;
      document.getElementById("v-3").textContent = v3 + " votes";
    });
  </script>
</body>
</html>`
  },
  {
    id: "org.omni.nsite.chess",
    name: "Nostr Chess",
    version: "1.0.0",
    description: "Compact micro-chess board with interactive move tracking.",
    category: "Games",
    icon: "widgets",
    author: "chess@nostr",
    viewport: "main",
    views: [
      { id: "main", title: "Chessboard", path: "" }
    ],
    htmlContent: `<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <title>Nostr Chess</title>
  <style>
    body {
      margin: 0;
      padding: 20px;
      font-family: system-ui, -apple-system, sans-serif;
      color: #ede8df;
      background: #141312;
      display: flex;
      flex-direction: column;
      align-items: center;
    }
    .board {
      display: grid;
      grid-template-columns: repeat(4, 50px);
      grid-template-rows: repeat(4, 50px);
      border: 2px solid #3a3732;
      border-radius: 6px;
      overflow: hidden;
      margin-top: 12px;
    }
    .sq {
      display: flex;
      align-items: center;
      justify-content: center;
      font-size: 1.6rem;
      cursor: pointer;
      user-select: none;
    }
    .sq.light { background: #d4a373; color: #191816; }
    .sq.dark { background: #8b6239; color: #ede8df; }
    .status { font-size: 0.85rem; color: #9e988f; margin-top: 10px; }
  </style>
</head>
<body>
  <h3 style="margin: 0; font-size: 1rem; color: #d4a373;">✦ Nostr Micro Chess</h3>
  <div class="board" id="board"></div>
  <div class="status" id="status">White to move. Click a piece then target square.</div>
  <script>
    const b = document.getElementById("board");
    const pieces = ["♜", "♞", "♝", "♛", "", "", "", "", "", "", "", "", "♙", "♘", "♗", "♔"];
    let sel = null;
    function render() {
      b.innerHTML = "";
      for (let i = 0; i < 16; i++) {
        const sq = document.createElement("div");
        const isDark = (Math.floor(i / 4) + (i % 4)) % 2 === 1;
        sq.className = "sq " + (isDark ? "dark" : "light");
        sq.textContent = pieces[i];
        if (sel === i) sq.style.outline = "3px solid #00a4ef";
        sq.addEventListener("click", () => {
          if (sel === null) {
            if (pieces[i]) { sel = i; render(); }
          } else {
            pieces[i] = pieces[sel];
            pieces[sel] = "";
            sel = null;
            render();
          }
        });
        b.appendChild(sq);
      }
    }
    render();
  </script>
</body>
</html>`
  }
];
