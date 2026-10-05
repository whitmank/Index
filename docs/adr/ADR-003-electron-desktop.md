# ADR-003: Electron for Desktop Shell

## Status

**ACCEPTED** (carried forward from v0.2)

## Context

Index is a desktop application that needs:
1. Native filesystem access (reading files, watching directories)
2. Native OS integration (file dialogs, system tray, notifications)
3. Cross-platform support (macOS, Windows, Linux)
4. Modern web UI capabilities

The choice is between native development (per-platform) or cross-platform frameworks.

## Decision

Use **Electron** as the desktop application shell.

**Architecture:**
- Main process: Node.js for system operations, IPC handling, service management
- Renderer process: React app for UI
- Preload script: Secure bridge between main and renderer (context isolation)

**Why Electron:**
1. **Full Node.js access**: Can run SurrealDB subprocess, access filesystem, use any npm package
2. **Web tech UI**: React/Vite for fast, modern UI development
3. **Cross-platform**: Single codebase for macOS, Windows, Linux
4. **Mature ecosystem**: Well-documented, large community, good tooling (electron-builder)
5. **Proven at scale**: Used by VS Code, Slack, Discord, etc.

## Consequences

### Positive
- **Rapid development**: Web technologies are fast to iterate with
- **Single codebase**: Don't need to maintain 3 native apps
- **Full system access**: Node.js can do anything native apps can
- **Hot reload in dev**: Fast feedback loop during development

### Negative
- **Bundle size**: Electron apps are large (~150MB+ base)
- **Memory usage**: Chromium overhead (~100MB+ RAM minimum)
- **Not truly native**: UI doesn't feel 100% native (though can be styled to match)
- **Security surface**: Must be careful with context isolation, nodeIntegration

### Neutral
- Requires learning Electron patterns (IPC, preload scripts, packaging)

## Alternatives Considered

### A: Tauri (Rust + WebView)
- Much smaller bundle size
- Uses system WebView instead of bundled Chromium
- **Not chosen**: Less mature, smaller ecosystem, Rust learning curve for main process

### B: Native apps (Swift/Kotlin/C#)
- Best performance and native feel
- **Not chosen**: 3x development effort, team expertise is in web tech

### C: Progressive Web App (PWA)
- No install required, works in browser
- **Not chosen**: Limited filesystem access, can't run subprocess (SurrealDB)

### D: Flutter Desktop
- Single codebase, good performance
- **Not chosen**: Less mature for desktop, different UI paradigm than web

## Security Measures

Given Electron's security considerations, Index implements:
- `contextIsolation: true` — renderer can't access Node.js directly
- `nodeIntegration: false` — no require() in renderer
- Preload script with explicit API surface — only exposed functions are callable
- No remote content loading — all UI is local

---

*Decision date: v0.2 (carried forward)*
*Applies to: v0.2+*
