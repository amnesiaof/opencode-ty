# opencode-ty

Ultra-fast Python static type checking and LSP code intelligence for [OpenCode](https://opencode.ai), powered by Astral's [ty](https://docs.astral.sh/ty/).

Brings sub-millisecond static type checking (`ty check`) and real-time LSP symbol inspection (`ty server`) back to OpenCode v2 without heavy background daemons or window flickering.

---

## ⚡ Features

- **🚀 Ultra-Fast Type Checking (`ty_check`)**  
  Runs `ty check` via Astral's Rust-based type checker in milliseconds. Returns concise, structured diagnostics that preserve the LLM's context window.
  
- **🔍 Native LSP Hover & Signatures (`ty_hover`)**  
  Spawns a lightweight, zero-overhead `ty server` over JSON-RPC. The AI agent can query function signatures, return types, and docstrings without reading hundreds of lines of source code.

- **🤖 Autonomous Self-Correction**  
  Injects context instructions into the agent session, guiding the model to automatically verify and fix Python type errors after making code edits.

- **🔕 Silent Background Execution**  
  Zero terminal/console window flickering on Windows (`windowsHide` enabled).

- **📦 Zero Dependencies**  
  Built strictly on native Node.js / Bun modules. Instant installation (< 50ms) without heavy `node_modules`.

---

## 📋 Prerequisites

Make sure you have [uv](https://docs.astral.sh/uv/) installed:

```bash
# Verify uv is installed
uv --version