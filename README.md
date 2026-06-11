# eonquant-dash

Static shell for the **Eon Quant agent dashboard** — a Three.js scene showing deploy-book and pipeline state as orbital nodes around the Eon mark.

**This repo contains no data and no secrets.** The page is a viewer: all vault data is fetched client-side from a private repository, authenticated with a fine-grained read-only token that the viewer supplies in-browser (stored in that device's localStorage only, never committed, never transmitted anywhere except api.github.com).

- Live: https://salvagraci.github.io/eonquant-dash/
- Source of truth: `Jarvis` vault (private), `01-Meta/agent-dashboard-v1.html` — deployed here by `01-Meta/publish-dashboard.sh`. Do not edit files in this repo directly; they are overwritten on every publish.
- Design doc: `Jarvis` vault, `01-Meta/agent-dashboard-v1-design.md`
