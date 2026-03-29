# Deploying SlopShop on Vast.ai

## Prerequisites

- A Vast.ai account with credits loaded
- The SlopShop Docker image available in a public registry

## Deployment Steps

### 1. Find an Instance

Browse available machines at [vast.ai/console/create](https://cloud.vast.ai/console/create/) or use the CLI:

```bash
pip install vastai
vastai set api-key <YOUR_API_KEY>

# Search for instances with at least 16 GB RAM and reasonable pricing
vastai search offers 'ram >= 16 disk_space >= 20 inet_down >= 200' -o 'dph asc'
```

### 2. Launch with Docker Image

```bash
vastai create instance <INSTANCE_ID> \
  --image slopshop/slopshop:3.7.0 \
  --env "NODE_ENV=production DB_PATH=/app/data/slopshop.db SLOPSHOP_BASE=https://slopshop.gg" \
  --disk 10 \
  --onstart-cmd "node dist/index.js"
```

Or via the web UI:

1. Select an instance from the marketplace.
2. Set the Docker image to `slopshop/slopshop:3.7.0`.
3. Configure environment variables:
   | Variable | Value |
   |---|---|
   | `NODE_ENV` | `production` |
   | `DB_PATH` | `/app/data/slopshop.db` |
   | `SLOPSHOP_BASE` | Your public URL |
4. Allocate at least 10 GB disk space.
5. Click **Rent**.

### 3. Access Your Instance

After the instance starts:

```bash
# Get connection details
vastai show instances

# SSH into the instance
ssh -p <PORT> root@<HOST> -L 3000:localhost:3000
```

The port-forward (`-L 3000:localhost:3000`) lets you access SlopShop at `http://localhost:3000` from your local machine.

### 4. Running with Ollama

```bash
# Inside the Vast.ai instance:
curl -fsSL https://ollama.com/install.sh | sh
ollama serve &
ollama pull llama3

# SlopShop auto-detects Ollama at localhost:11434
```

## Persistent Storage

Vast.ai instances are ephemeral by default. To preserve your SQLite database:

- **Option A:** Use the instance's local disk at `/app/data` -- data persists as long as the instance is rented.
- **Option B:** Set up periodic backups to S3 or another remote store:
  ```bash
  # Example: backup every hour via cron
  crontab -e
  # Add: 0 * * * * aws s3 cp /app/data/slopshop.db s3://your-bucket/backups/slopshop-$(date +\%F).db
  ```

## Health Check

```bash
curl http://localhost:3000/v1/health
```

## Cost Tips

- **Interruptible instances** are significantly cheaper but may be reclaimed. Good for development and testing.
- **On-demand instances** provide guaranteed uptime for production.
- Use the bid system to set a maximum price per hour.
- Destroy instances when not in use -- you only pay while they are running.
- CPU-only instances are sufficient if you offload inference to an external API.
