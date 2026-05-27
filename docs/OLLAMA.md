# Running Ollama (and OpenAI-compatible local backends) for Specwright

This document shows quick ways to run a local OpenAI-compatible server so you can point Specwright's desktop app at it via the new LLM Provider settings.

Recommended options:

- Ollama (easy local server with OpenAI-compatible `/v1` endpoint)
- LocalAI (Docker image) — useful on Linux/Windows via Docker

---

## Ollama (macOS / Linux)
Official installers are available at https://ollama.com. After installing, start the Ollama daemon which exposes an OpenAI-compatible endpoint on `http://localhost:11434/v1` by default.

Basic steps (macOS example):

1. Install Ollama (see https://ollama.com/docs/install)
2. Pull or install a model, e.g. `ollama pull ggml/wizardLM` (model names vary)
3. Start the server (daemon):

```bash
# macOS example if Ollama CLI is installed
ollama serve &
```

Verify the OpenAI-compatible `/v1` endpoint is reachable:

```bash
# Example verification (replace MODEL with a model name you have installed)
curl -s -X POST "http://localhost:11434/v1/engines/MODEL/completions" \
  -H "Content-Type: application/json" \
  -d '{"prompt":"say hello","max_tokens":5}'
```

If the endpoint returns JSON, point Specwright's Settings → LLM Provider → Base URL to `http://localhost:11434/v1` and set provider to `Ollama`.

Tip: Ollama accepts any API key string for local usage. Fill `SPECWRIGHT_LLM_API_KEY` with `ollama` in the UI if requested.

---

## LocalAI (Docker) — Alternative
LocalAI provides a Docker image for many models.

```bash
docker run --rm -p 8080:8080 -v /path/to/models:/models ghcr.io/go-skynet/localai/localai:latest localai --model-dir /models --http 8080
```

Then set `Base URL` in Specwright to `http://localhost:8080/v1` and provider to `OpenAI` in the UI.

---

## Notes
- Ollama is easiest if you prefer a straightforward local app. LocalAI is more flexible with Docker and GPU options.
- If you use OpenRouter or another gateway, set `Base URL` to the gateway's OpenAI-compatible endpoint and fill the API key as needed.

If you want, I can add an in-app "Verify endpoint" button to the settings that runs a small health-check POST to the configured base URL. Let me know if you want that UX improvement.
