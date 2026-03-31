# Slopshop + OpenFang Integration

Minimal HTTP integration for Rust-based OpenFang agents.

## Cargo.toml

```toml
[dependencies]
reqwest = { version = "0.11", features = ["json"] }
serde_json = "1"
tokio = { version = "1", features = ["rt-multi-thread", "macros"] }
```

## Client

```rust
use reqwest::Client;
use serde_json::{json, Value};

const SLOP_BASE: &str = "https://slopshop.gg";

pub struct SlopshopClient {
    client: Client,
    api_key: String,
}

impl SlopshopClient {
    pub fn new(api_key: impl Into<String>) -> Self {
        Self { client: Client::new(), api_key: api_key.into() }
    }

    pub async fn remember(&self, key: &str, value: Value, namespace: &str)
        -> Result<Value, reqwest::Error>
    {
        self.client
            .post(format!("{}/v1/memory-set", SLOP_BASE))
            .bearer_auth(&self.api_key)
            .json(&json!({"key": key, "value": value, "namespace": namespace}))
            .send().await?
            .json().await
    }

    pub async fn recall(&self, key: &str, namespace: &str)
        -> Result<Option<Value>, reqwest::Error>
    {
        let resp: Value = self.client
            .post(format!("{}/v1/memory-get", SLOP_BASE))
            .bearer_auth(&self.api_key)
            .json(&json!({"key": key, "namespace": namespace}))
            .send().await?
            .json().await?;
        Ok(resp.get("value").cloned())
    }
}

#[tokio::main]
async fn main() {
    let slop = SlopshopClient::new("sk-slop-your-key-here");

    let result = slop.remember("task-result", json!({"status": "done"}), "openfang")
        .await.unwrap();

    let proof = result["proof_hash"].as_str().unwrap_or("");
    println!("Stored with proof: {}...", &proof[..16.min(proof.len())]);
}
```

## Links
- [Full guide](https://slopshop.gg/integrate-openfang)
