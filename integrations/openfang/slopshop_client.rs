//! Minimal Slopshop client for OpenFang (Rust) agents.
//! Add to Cargo.toml: reqwest = { version = "0.11", features = ["json"] }

use reqwest::Client;
use serde_json::{json, Value};

const SLOP_BASE: &str = "https://slopshop.gg";

pub struct SlopshopClient {
    client: Client,
    api_key: String,
}

impl SlopshopClient {
    pub fn new(api_key: impl Into<String>) -> Self {
        Self {
            client: Client::new(),
            api_key: api_key.into(),
        }
    }

    /// Store a value with cryptographic proof.
    /// Returns a Value with proof_hash and merkle_root fields.
    pub async fn remember(
        &self,
        key: &str,
        value: Value,
        namespace: &str,
    ) -> Result<Value, reqwest::Error> {
        self.client
            .post(format!("{}/v1/memory-set", SLOP_BASE))
            .bearer_auth(&self.api_key)
            .json(&json!({
                "key": key,
                "value": value,
                "namespace": namespace
            }))
            .send()
            .await?
            .json()
            .await
    }

    /// Retrieve a stored value. Returns None if not found.
    pub async fn recall(
        &self,
        key: &str,
        namespace: &str,
    ) -> Result<Option<Value>, reqwest::Error> {
        let resp: Value = self
            .client
            .post(format!("{}/v1/memory-get", SLOP_BASE))
            .bearer_auth(&self.api_key)
            .json(&json!({
                "key": key,
                "namespace": namespace
            }))
            .send()
            .await?
            .json()
            .await?;
        Ok(resp.get("value").cloned())
    }

    /// Search memories semantically.
    pub async fn search(
        &self,
        query: &str,
        namespace: &str,
        limit: u32,
    ) -> Result<Vec<Value>, reqwest::Error> {
        let resp: Value = self
            .client
            .post(format!("{}/v1/memory-search", SLOP_BASE))
            .bearer_auth(&self.api_key)
            .json(&json!({
                "query": query,
                "namespace": namespace,
                "limit": limit
            }))
            .send()
            .await?
            .json()
            .await?;
        Ok(resp["results"].as_array().cloned().unwrap_or_default())
    }

    /// Proxy an external API call using a vault credential.
    /// The agent never sees the raw credential.
    pub async fn vault_proxy(
        &self,
        vault_id: &str,
        url: &str,
        method: &str,
        body: Option<Value>,
    ) -> Result<Value, reqwest::Error> {
        self.client
            .post(format!("{}/v1/vault/proxy", SLOP_BASE))
            .bearer_auth(&self.api_key)
            .json(&json!({
                "vault_id": vault_id,
                "url": url,
                "method": method,
                "body": body
            }))
            .send()
            .await?
            .json()
            .await
    }
}
