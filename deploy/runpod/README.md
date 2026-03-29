# Deploying SlopShop on RunPod

## Prerequisites

- A RunPod account with GPU credits
- The SlopShop Docker image pushed to a registry (Docker Hub, GHCR, etc.)

## Quick Start (Serverless)

1. Go to **RunPod Console** > **Serverless** > **New Endpoint**.
2. Select a GPU type (RTX 4090 or A100 recommended for LLM inference).
3. Set the container image:
   ```
   slopshop/slopshop:3.7.0
   ```
4. Configure environment variables:
   | Variable | Value |
   |---|---|
   | `NODE_ENV` | `production` |
   | `SLOPSHOP_BASE` | Your public URL |
   | `DB_PATH` | `/app/data/slopshop.db` |
5. Attach a network volume for persistent SQLite storage (mount at `/app/data`).
6. Set the HTTP port to `3000`.
7. Deploy.

## Pod Deployment (Always-On)

For persistent workloads where you need the server running continuously:

1. Go to **Pods** > **Deploy**.
2. Choose a template or start from a Docker image:
   ```
   slopshop/slopshop:3.7.0
   ```
3. Select your GPU tier.
4. Under **Volume**, create or attach a network volume and mount it at `/app/data`.
5. Expose HTTP port `3000` via the RunPod proxy.
6. Deploy the pod.

### Running with Ollama Sidecar

To run local LLM inference alongside SlopShop:

```bash
# SSH into your RunPod instance, then:
curl -fsSL https://ollama.com/install.sh | sh
ollama serve &
ollama pull llama3

# SlopShop will auto-detect Ollama at localhost:11434
```

## Network Volumes

SQLite requires persistent storage. Always attach a RunPod network volume:

- **Mount path:** `/app/data`
- **Minimum size:** 1 GB (scale based on expected data)
- Network volumes persist across pod restarts and can be reattached to new pods.

## Health Check

Verify the deployment is running:

```bash
curl https://<your-pod-id>-3000.proxy.runpod.net/v1/health
```

## Cost Optimization

- Use **Community Cloud** for development (cheaper GPU rates).
- Use **Secure Cloud** for production workloads.
- For bursty traffic, prefer **Serverless** endpoints with auto-scaling.
- Set idle timeout to stop billing when not in use.
