# Slopshop Edge / TinyML (Roadmap)

Run Slopshop on Raspberry Pi, edge devices, and IoT.

## Status: Planned

## Architecture
- Minimal Node.js runtime (server-v2.js runs on any Node 18+)
- SQLite works on ARM (Raspberry Pi 4/5)
- Ollama runs on ARM for local LLM
- Docker ARM images planned

## Quick Start (works today on Pi 4+)
```bash
# On Raspberry Pi with Node.js 18+
git clone https://github.com/slopshop/slopshop.git
cd slopshop && npm install
node server-v2.js  # runs on port 3000
# Install Ollama for ARM
curl -fsSL https://ollama.ai/install.sh | sh
ollama pull tinyllama  # 1.1B model fits in 2GB RAM
```

## Limitations
- LLM-powered endpoints need Ollama (CPU inference is slow)
- Army Mode limited by RAM (10-50 agents on 4GB Pi)
- No GPU acceleration on Pi (CPU only)
