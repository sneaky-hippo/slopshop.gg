"""
Slopshop Memory SDK — Python

Full SDK for the 9 Slopshop memory techniques:
  1. Persistent Memory
  2. Dream Engine
  3. Multiplayer Memory
  4. Snapshot Branching
  5. Bayesian Calibration
  6. Episodic Chains
  7. Memory Triggers
  8. Procedural Memory
  9. Swarm Orchestration

Sync usage:
    from slopshop_memory import SlopshopMemory
    memory = SlopshopMemory('sk-slop-your-key')

    # Store a memory
    memory.store('user-profile', {'name': 'Alice', 'role': 'engineer'})

    # Start a dream synthesis
    job = memory.dream.start(namespace='default', strategy='consolidate')
    print(job['dream_id'])

Async usage:
    from slopshop_memory import AsyncSlopshopMemory
    import asyncio

    async def main():
        memory = AsyncSlopshopMemory('sk-slop-your-key')
        await memory.store('user-profile', {'name': 'Alice'})
    asyncio.run(main())
"""

import json
import requests
from requests.adapters import HTTPAdapter
from urllib3.util.retry import Retry


# ---------------------------------------------------------------------------
# Error class
# ---------------------------------------------------------------------------

class SlopshopError(Exception):
    """Raised when the Slopshop API returns an error response.

    Attributes:
        message (str): Human-readable error message.
        status_code (int | None): HTTP status code, if available.
        body (dict | None): Full parsed response body, if available.
    """

    def __init__(self, message, status_code=None, body=None):
        super().__init__(message)
        self.status_code = status_code
        self.body = body

    def __repr__(self):
        return f"SlopshopError(message={str(self)!r}, status_code={self.status_code})"


# ---------------------------------------------------------------------------
# Method-group helpers (nested namespaces)
# ---------------------------------------------------------------------------

class _MethodGroup:
    """Base class for nested method groups. Holds a reference to the parent client."""

    def __init__(self, client):
        self._client = client

    def _post(self, path, body=None):
        return self._client._request('POST', path, body)

    def _get(self, path):
        return self._client._request('GET', path)


class _PersistentMemory(_MethodGroup):
    """Persistent key-value memory methods (/v1/memory/*)."""

    def store(self, key, value, namespace='default', tags=None, ttl=None):
        """Store a value under *key* in *namespace*.

        Args:
            key (str): Unique memory key.
            value: Any JSON-serialisable value.
            namespace (str): Memory namespace (default: 'default').
            tags (list[str] | None): Optional tags for retrieval filtering.
            ttl (int | None): Time-to-live in seconds. None means no expiry.

        Returns:
            dict: API response with ``id`` and ``created_at`` fields.

        Raises:
            SlopshopError: On API or network error.
        """
        payload = {'key': key, 'value': value, 'namespace': namespace}
        if tags is not None:
            payload['tags'] = tags
        if ttl is not None:
            payload['ttl'] = ttl
        return self._post('/v1/memory/store', payload)

    def retrieve(self, key, namespace='default'):
        """Retrieve a previously stored memory by key.

        Args:
            key (str): Memory key.
            namespace (str): Memory namespace (default: 'default').

        Returns:
            dict: Response containing ``key``, ``value``, ``namespace``, and metadata.

        Raises:
            SlopshopError: If the key is not found (404) or on network error.
        """
        return self._post('/v1/memory/retrieve', {'key': key, 'namespace': namespace})

    def delete(self, key, namespace='default'):
        """Delete a memory by key.

        Args:
            key (str): Memory key to delete.
            namespace (str): Memory namespace (default: 'default').

        Returns:
            dict: Confirmation response with ``deleted: true``.

        Raises:
            SlopshopError: On API or network error.
        """
        return self._post('/v1/memory/delete', {'key': key, 'namespace': namespace})

    def list(self, namespace='default', limit=50, offset=0, tags=None):
        """List stored memories in a namespace.

        Args:
            namespace (str): Memory namespace (default: 'default').
            limit (int): Maximum number of results to return (default: 50).
            offset (int): Pagination offset (default: 0).
            tags (list[str] | None): Filter by tags.

        Returns:
            dict: Response with ``items`` array and ``total`` count.

        Raises:
            SlopshopError: On API or network error.
        """
        payload = {'namespace': namespace, 'limit': limit, 'offset': offset}
        if tags is not None:
            payload['tags'] = tags
        return self._post('/v1/memory/list', payload)

    def search(self, query, namespace='default', top_k=10):
        """Semantic search over stored memories.

        Args:
            query (str): Natural-language search query.
            namespace (str): Memory namespace (default: 'default').
            top_k (int): Number of results to return (default: 10).

        Returns:
            dict: Response with ``results`` array ranked by similarity score.

        Raises:
            SlopshopError: On API or network error.
        """
        return self._post('/v1/memory/search', {
            'query': query,
            'namespace': namespace,
            'top_k': top_k,
        })


class _DreamEngine(_MethodGroup):
    """Dream Engine methods for REM-style memory synthesis."""

    def start(self, namespace='default', strategy='consolidate', model=None):
        """Kick off an asynchronous dream synthesis job.

        The Dream Engine runs overnight-style memory consolidation: it reads
        all memories in *namespace*, synthesises patterns, prunes duplicates,
        and writes compressed insights back.

        Args:
            namespace (str): Memory namespace to synthesise (default: 'default').
            strategy (str): Synthesis strategy. One of ``'consolidate'``,
                ``'compress'``, ``'evolve'``, or ``'prune'`` (default: 'consolidate').
            model (str | None): Optional model override for synthesis (e.g. 'claude-3-5-sonnet').

        Returns:
            dict: Response with ``dream_id`` and ``status: 'queued'``.

        Raises:
            SlopshopError: On API or network error.
        """
        payload = {'namespace': namespace, 'strategy': strategy}
        if model is not None:
            payload['model'] = model
        return self._post('/v1/memory/dream/start', payload)

    def status(self, dream_id):
        """Poll the status of a running or completed dream job.

        Args:
            dream_id (str): The dream job ID returned by :meth:`start`.

        Returns:
            dict: Response with ``status`` (``'queued'``, ``'running'``,
                ``'complete'``, or ``'failed'``), ``progress``, and on
                completion, ``summary`` and ``memories_updated``.

        Raises:
            SlopshopError: On API or network error.
        """
        return self._get(f'/v1/memory/dream/status/{dream_id}')


class _MultiplayerMemory(_MethodGroup):
    """Multiplayer Memory methods for shared team memory spaces."""

    def create_share(self, namespace='default', name=None, permissions='read-write'):
        """Create a shareable memory space from an existing namespace.

        Args:
            namespace (str): Source namespace to share (default: 'default').
            name (str | None): Human-readable name for the shared space.
            permissions (str): Default collaborator permissions.
                One of ``'read-only'``, ``'read-write'``, or ``'admin'``
                (default: 'read-write').

        Returns:
            dict: Response with ``share_id``, ``invite_url``, and ``namespace``.

        Raises:
            SlopshopError: On API or network error.
        """
        payload = {'namespace': namespace, 'permissions': permissions}
        if name is not None:
            payload['name'] = name
        return self._post('/v1/memory/share/create', payload)

    def invite_collaborator(self, share_id, email=None, agent_id=None, permissions='read-write'):
        """Invite a user or agent to a shared memory space.

        Provide either *email* (for human users) or *agent_id* (for AI agents).

        Args:
            share_id (str): The shared space ID returned by :meth:`create_share`.
            email (str | None): Email address of the human collaborator.
            agent_id (str | None): Agent identity ID for AI-to-AI sharing.
            permissions (str): Permission level for this collaborator
                (default: 'read-write').

        Returns:
            dict: Response with ``invite_id`` and ``status: 'invited'``.

        Raises:
            SlopshopError: On API or network error.
        """
        payload = {'share_id': share_id, 'permissions': permissions}
        if email is not None:
            payload['email'] = email
        if agent_id is not None:
            payload['agent_id'] = agent_id
        return self._post('/v1/memory/collaborator/invite', payload)

    def list_collaborators(self, share_id):
        """List all collaborators in a shared memory space.

        Args:
            share_id (str): The shared space ID.

        Returns:
            dict: Response with ``collaborators`` array.

        Raises:
            SlopshopError: On API or network error.
        """
        return self._post('/v1/memory/collaborator/list', {'share_id': share_id})

    def leave(self, share_id):
        """Remove the current agent/user from a shared memory space.

        Args:
            share_id (str): The shared space ID to leave.

        Returns:
            dict: Confirmation response.

        Raises:
            SlopshopError: On API or network error.
        """
        return self._post('/v1/memory/share/leave', {'share_id': share_id})


class _SnapshotBranching(_MethodGroup):
    """Snapshot Branching methods for versioning memory namespaces."""

    def create(self, namespace='default', label=None):
        """Create a snapshot (point-in-time backup) of a namespace.

        Args:
            namespace (str): Memory namespace to snapshot (default: 'default').
            label (str | None): Optional human-readable label for this snapshot.

        Returns:
            dict: Response with ``snapshot_id``, ``namespace``, and ``created_at``.

        Raises:
            SlopshopError: On API or network error.
        """
        payload = {'namespace': namespace}
        if label is not None:
            payload['label'] = label
        return self._post('/v1/memory/snapshot', payload)

    def restore(self, snapshot_id, target_namespace=None):
        """Restore a namespace from a previously created snapshot.

        Args:
            snapshot_id (str): Snapshot ID to restore from.
            target_namespace (str | None): Namespace to restore into. Defaults
                to the namespace the snapshot was taken from.

        Returns:
            dict: Response with ``restored_namespace`` and ``memories_restored``.

        Raises:
            SlopshopError: On API or network error.
        """
        payload = {'snapshot_id': snapshot_id}
        if target_namespace is not None:
            payload['target_namespace'] = target_namespace
        return self._post(f'/v1/memory/restore/{snapshot_id}', payload)

    def merge(self, source_namespace, target_namespace, strategy='union'):
        """Merge two namespace snapshots together.

        Args:
            source_namespace (str): Namespace to merge from.
            target_namespace (str): Namespace to merge into.
            strategy (str): Merge strategy. One of ``'union'`` (keep all),
                ``'intersection'`` (keep common keys only), or ``'source-wins'``
                (source values override target on conflict) (default: 'union').

        Returns:
            dict: Response with ``merged_count``, ``conflicts_resolved``.

        Raises:
            SlopshopError: On API or network error.
        """
        return self._post('/v1/memory/merge', {
            'source_namespace': source_namespace,
            'target_namespace': target_namespace,
            'strategy': strategy,
        })

    def list(self, namespace='default'):
        """List all snapshots for a namespace.

        Args:
            namespace (str): Memory namespace (default: 'default').

        Returns:
            dict: Response with ``snapshots`` array ordered newest-first.

        Raises:
            SlopshopError: On API or network error.
        """
        return self._post('/v1/memory/snapshot/list', {'namespace': namespace})


class _BayesianCalibration(_MethodGroup):
    """Bayesian Calibration methods for confidence-weighted memory updates."""

    def update(self, key, evidence, namespace='default', likelihood=None, prior=None):
        """Update a memory's confidence score using Bayesian inference.

        Applies Bayes' theorem to update the belief (confidence) attached to
        *key* given new *evidence*.

        Args:
            key (str): Memory key to update.
            evidence (str | dict): New evidence to incorporate. Can be a
                natural-language string or a structured dict.
            namespace (str): Memory namespace (default: 'default').
            likelihood (float | None): P(evidence | hypothesis). If omitted,
                the API estimates it from the evidence content.
            prior (float | None): Prior probability override (0.0–1.0). If
                omitted, the current stored confidence is used as the prior.

        Returns:
            dict: Response with ``prior``, ``likelihood``, ``posterior``,
                and the updated ``memory`` object.

        Raises:
            SlopshopError: On API or network error.
        """
        payload = {'key': key, 'evidence': evidence, 'namespace': namespace}
        if likelihood is not None:
            payload['likelihood'] = likelihood
        if prior is not None:
            payload['prior'] = prior
        return self._post('/v1/memory/bayesian/update', payload)

    def query_confidence(self, key, namespace='default'):
        """Retrieve the current Bayesian confidence score for a memory key.

        Args:
            key (str): Memory key.
            namespace (str): Memory namespace (default: 'default').

        Returns:
            dict: Response with ``key``, ``confidence``, and ``evidence_count``.

        Raises:
            SlopshopError: On API or network error.
        """
        return self._post('/v1/memory/bayesian/confidence', {'key': key, 'namespace': namespace})


class _EpisodicChains(_MethodGroup):
    """Episodic Chains methods for linked, time-ordered memory episodes."""

    def create(self, title, entries, namespace='default', metadata=None):
        """Create a new episodic chain from a sequence of events.

        An episodic chain links related memory entries in time order, enabling
        narrative recall and timeline replay.

        Args:
            title (str): Human-readable title for the chain.
            entries (list[dict]): Ordered list of episode entries. Each entry
                should have at least a ``content`` field. Optional fields:
                ``timestamp``, ``role``, ``tags``.
            namespace (str): Memory namespace (default: 'default').
            metadata (dict | None): Additional chain-level metadata.

        Returns:
            dict: Response with ``chain_id``, ``length``, and ``created_at``.

        Raises:
            SlopshopError: On API or network error.
        """
        payload = {'title': title, 'entries': entries, 'namespace': namespace}
        if metadata is not None:
            payload['metadata'] = metadata
        return self._post('/v1/memory/chain', payload)

    def append(self, chain_id, entry):
        """Append a new episode to an existing chain.

        Args:
            chain_id (str): The chain ID to extend.
            entry (dict): Episode entry with at least a ``content`` field.

        Returns:
            dict: Response with updated ``chain_id`` and ``length``.

        Raises:
            SlopshopError: On API or network error.
        """
        return self._post('/v1/memory/chain/append', {'chain_id': chain_id, 'entry': entry})

    def get(self, chain_id, limit=100):
        """Retrieve all episodes in a chain.

        Args:
            chain_id (str): Chain ID to retrieve.
            limit (int): Maximum episodes to return (default: 100).

        Returns:
            dict: Response with ``chain_id``, ``title``, and ``entries`` array.

        Raises:
            SlopshopError: On API or network error.
        """
        return self._post('/v1/memory/chain/get', {'chain_id': chain_id, 'limit': limit})

    def replay(self, chain_id, from_index=0):
        """Replay an episodic chain from a given index position.

        Args:
            chain_id (str): Chain ID to replay.
            from_index (int): Start replay from this episode index (default: 0).

        Returns:
            dict: Response with ``entries`` from *from_index* onward and a
                generated ``narrative`` summary.

        Raises:
            SlopshopError: On API or network error.
        """
        return self._post('/v1/memory/chain/replay', {
            'chain_id': chain_id,
            'from_index': from_index,
        })


class _MemoryTriggers(_MethodGroup):
    """Memory Trigger methods for event-driven memory callbacks."""

    def create(self, event, action, namespace='default', condition=None, payload=None):
        """Register an event-driven trigger on the memory system.

        When *event* fires (e.g. a memory key is updated), the trigger executes
        *action* automatically — enabling reactive, self-updating agents.

        Args:
            event (str): Event type to listen for. Common values:
                ``'memory.write'``, ``'memory.delete'``, ``'dream.complete'``,
                ``'confidence.drop'``, ``'chain.append'``.
            action (str | dict): Action to execute. Can be a webhook URL string
                or a structured dict with ``type`` (``'webhook'``, ``'api_call'``,
                ``'notify'``) and configuration fields.
            namespace (str): Memory namespace to watch (default: 'default').
            condition (dict | None): Optional filter expression. Example:
                ``{'key_pattern': 'user:*', 'confidence_below': 0.5}``.
            payload (dict | None): Extra data to attach to trigger invocations.

        Returns:
            dict: Response with ``trigger_id`` and ``status: 'active'``.

        Raises:
            SlopshopError: On API or network error.
        """
        body = {'event': event, 'action': action, 'namespace': namespace}
        if condition is not None:
            body['condition'] = condition
        if payload is not None:
            body['payload'] = payload
        return self._post('/v1/memory/trigger', body)

    def list(self, namespace='default'):
        """List all triggers registered on a namespace.

        Args:
            namespace (str): Memory namespace (default: 'default').

        Returns:
            dict: Response with ``triggers`` array.

        Raises:
            SlopshopError: On API or network error.
        """
        return self._post('/v1/memory/trigger/list', {'namespace': namespace})

    def delete(self, trigger_id):
        """Delete a registered trigger.

        Args:
            trigger_id (str): Trigger ID to remove.

        Returns:
            dict: Confirmation response with ``deleted: true``.

        Raises:
            SlopshopError: On API or network error.
        """
        return self._post('/v1/memory/trigger/delete', {'trigger_id': trigger_id})


class _ProceduralMemory(_MethodGroup):
    """Procedural Memory methods for learned, reusable tool chains."""

    def learn(self, name, steps, description=None, namespace='default', tags=None):
        """Teach the agent a new procedure (reusable tool chain).

        Procedural memory stores sequences of tool calls as named procedures
        that can be recalled and executed later — the agent learns by doing.

        Args:
            name (str): Unique procedure name (e.g. ``'deploy-to-production'``).
            steps (list[dict]): Ordered steps. Each step should have:
                ``tool`` (tool slug), ``input`` (input dict), and optionally
                ``on_error`` (``'skip'``, ``'retry'``, or ``'abort'``).
            description (str | None): Human-readable description of what the
                procedure does.
            namespace (str): Memory namespace to store in (default: 'default').
            tags (list[str] | None): Tags for procedure discovery.

        Returns:
            dict: Response with ``procedure_id``, ``name``, and ``step_count``.

        Raises:
            SlopshopError: On API or network error.
        """
        payload = {'name': name, 'steps': steps, 'namespace': namespace}
        if description is not None:
            payload['description'] = description
        if tags is not None:
            payload['tags'] = tags
        return self._post('/v1/memory/procedure/learn', payload)

    def recall(self, name=None, procedure_id=None, namespace='default'):
        """Recall a stored procedure by name or ID.

        Args:
            name (str | None): Procedure name.
            procedure_id (str | None): Procedure ID. Either *name* or
                *procedure_id* must be provided.
            namespace (str): Memory namespace (default: 'default').

        Returns:
            dict: Response with the full ``procedure`` object including all steps.

        Raises:
            SlopshopError: On API or network error.
        """
        payload = {'namespace': namespace}
        if name is not None:
            payload['name'] = name
        if procedure_id is not None:
            payload['procedure_id'] = procedure_id
        return self._post('/v1/memory/procedure/recall', payload)

    def run(self, procedure_id, input_data=None, dry_run=False):
        """Execute a stored procedure.

        Args:
            procedure_id (str): Procedure ID to execute.
            input_data (dict | None): Runtime input values to inject into steps.
            dry_run (bool): If True, validate steps without executing them
                (default: False).

        Returns:
            dict: Response with ``run_id``, ``status``, and per-step ``results``.

        Raises:
            SlopshopError: On API or network error.
        """
        payload = {'procedure_id': procedure_id, 'dry_run': dry_run}
        if input_data is not None:
            payload['input'] = input_data
        return self._post('/v1/memory/procedure/run', payload)

    def list(self, namespace='default', tags=None):
        """List all stored procedures in a namespace.

        Args:
            namespace (str): Memory namespace (default: 'default').
            tags (list[str] | None): Filter by tags.

        Returns:
            dict: Response with ``procedures`` array.

        Raises:
            SlopshopError: On API or network error.
        """
        payload = {'namespace': namespace}
        if tags is not None:
            payload['tags'] = tags
        return self._post('/v1/memory/procedure/list', payload)


class _SwarmOrchestration(_MethodGroup):
    """Swarm Orchestration methods for coordinating parallel agent armies."""

    def orchestrate(self, task, agents=10, strategy='parallel', model=None,
                    memory_namespace='default', timeout=300):
        """Orchestrate a swarm of agents to solve a task in parallel.

        Spins up *agents* worker agents, distributes sub-tasks, collects and
        synthesises results. All agents share the given *memory_namespace* so
        findings are pooled in real time.

        Args:
            task (str): High-level task description for the swarm.
            agents (int): Number of parallel agents to deploy (default: 10).
            strategy (str): Orchestration strategy. One of ``'parallel'``
                (all agents run simultaneously), ``'pipeline'`` (agents pass
                output to the next), or ``'vote'`` (agents vote on the best
                answer) (default: 'parallel').
            model (str | None): Model override for worker agents.
            memory_namespace (str): Shared memory namespace for result pooling
                (default: 'default').
            timeout (int): Swarm timeout in seconds (default: 300).

        Returns:
            dict: Response with ``swarm_id``, ``status``, and initial
                ``agent_ids`` list.

        Raises:
            SlopshopError: On API or network error.
        """
        payload = {
            'task': task,
            'agents': agents,
            'strategy': strategy,
            'memory_namespace': memory_namespace,
            'timeout': timeout,
        }
        if model is not None:
            payload['model'] = model
        return self._post('/v1/swarm/orchestrate', payload)

    def status(self, swarm_id):
        """Check the status of a running swarm.

        Args:
            swarm_id (str): Swarm ID returned by :meth:`orchestrate`.

        Returns:
            dict: Response with ``status``, ``completed_agents``, ``total_agents``,
                and on completion, ``result`` and ``synthesis``.

        Raises:
            SlopshopError: On API or network error.
        """
        return self._get(f'/v1/swarm/status/{swarm_id}')

    def stop(self, swarm_id):
        """Gracefully stop a running swarm and collect partial results.

        Args:
            swarm_id (str): Swarm ID to stop.

        Returns:
            dict: Response with ``stopped: true`` and any partial ``results``.

        Raises:
            SlopshopError: On API or network error.
        """
        return self._post('/v1/swarm/stop', {'swarm_id': swarm_id})


# ---------------------------------------------------------------------------
# Main sync client
# ---------------------------------------------------------------------------

class SlopshopMemory:
    """Synchronous Slopshop Memory SDK client.

    Provides access to all 9 memory techniques via typed method groups:

    - ``memory``    — Persistent key-value store
    - ``dream``     — Dream Engine (REM synthesis)
    - ``multiplayer`` — Shared team memory spaces
    - ``snapshot``  — Snapshot branching & versioning
    - ``bayesian``  — Confidence-weighted Bayesian updates
    - ``chain``     — Episodic linked memory chains
    - ``trigger``   — Event-driven memory callbacks
    - ``procedure`` — Learned procedural tool chains
    - ``swarm``     — Swarm orchestration

    Args:
        api_key (str): Your Slopshop API key (``sk-slop-...``).
        base_url (str): API base URL (default: ``'https://slopshop.gg'``).
        timeout (int): Request timeout in seconds (default: 30).
        retries (int): Number of automatic retries on transient errors (default: 3).

    Example:
        >>> from slopshop_memory import SlopshopMemory
        >>> mem = SlopshopMemory('sk-slop-your-key')
        >>> mem.memory.store('greeting', 'hello world')
        >>> job = mem.dream.start(strategy='consolidate')
        >>> print(job['dream_id'])
    """

    def __init__(self, api_key, base_url='https://slopshop.gg', timeout=30, retries=3):
        self.api_key = api_key
        self.base_url = base_url.rstrip('/')
        self.timeout = timeout

        # Build a session with retry logic
        self._session = requests.Session()
        retry_policy = Retry(
            total=retries,
            backoff_factor=0.5,
            status_forcelist=[429, 500, 502, 503, 504],
            allowed_methods=['GET', 'POST'],
        )
        adapter = HTTPAdapter(max_retries=retry_policy)
        self._session.mount('https://', adapter)
        self._session.mount('http://', adapter)
        self._session.headers.update({
            'Authorization': f'Bearer {api_key}',
            'Content-Type': 'application/json',
            'User-Agent': 'slopshop-memory-sdk-python/1.0.0',
        })

        # Attach method groups
        self.memory = _PersistentMemory(self)
        self.dream = _DreamEngine(self)
        self.multiplayer = _MultiplayerMemory(self)
        self.snapshot = _SnapshotBranching(self)
        self.bayesian = _BayesianCalibration(self)
        self.chain = _EpisodicChains(self)
        self.trigger = _MemoryTriggers(self)
        self.procedure = _ProceduralMemory(self)
        self.swarm = _SwarmOrchestration(self)

    def _request(self, method, path, body=None):
        """Internal HTTP request dispatcher.

        Args:
            method (str): HTTP method (``'GET'`` or ``'POST'``).
            path (str): URL path starting with ``/``.
            body (dict | None): JSON request body.

        Returns:
            dict: Parsed JSON response.

        Raises:
            SlopshopError: On HTTP error or network failure.
        """
        url = self.base_url + path
        try:
            resp = self._session.request(
                method=method,
                url=url,
                json=body,
                timeout=self.timeout,
            )
        except requests.exceptions.Timeout:
            raise SlopshopError(f'Request timed out after {self.timeout}s', 408)
        except requests.exceptions.ConnectionError as exc:
            raise SlopshopError(f'Connection error: {exc}')

        try:
            data = resp.json()
        except ValueError:
            data = {}

        if not resp.ok:
            msg = (
                data.get('error', {}).get('message')
                or data.get('message')
                or resp.reason
                or 'API error'
            )
            raise SlopshopError(msg, resp.status_code, data)

        return data

    # Convenience top-level shortcuts
    def store(self, key, value, namespace='default', **kwargs):
        """Shortcut for :meth:`memory.store`.

        Args:
            key (str): Memory key.
            value: Value to store.
            namespace (str): Namespace (default: 'default').
            **kwargs: Extra fields passed through.

        Returns:
            dict: API response.
        """
        return self.memory.store(key, value, namespace=namespace, **kwargs)

    def retrieve(self, key, namespace='default'):
        """Shortcut for :meth:`memory.retrieve`.

        Args:
            key (str): Memory key.
            namespace (str): Namespace (default: 'default').

        Returns:
            dict: API response.
        """
        return self.memory.retrieve(key, namespace=namespace)

    def health(self):
        """Check the Slopshop API health status.

        Returns:
            dict: Response with ``status: 'ok'`` and server metadata.

        Raises:
            SlopshopError: On API or network error.
        """
        return self._request('GET', '/v1/health')


# ---------------------------------------------------------------------------
# Async client
# ---------------------------------------------------------------------------

class AsyncSlopshopMemory:
    """Asynchronous Slopshop Memory SDK client using aiohttp.

    Drop-in async equivalent of :class:`SlopshopMemory`. All method groups
    and methods are identical but must be awaited.

    Args:
        api_key (str): Your Slopshop API key (``sk-slop-...``).
        base_url (str): API base URL (default: ``'https://slopshop.gg'``).
        timeout (int): Request timeout in seconds (default: 30).

    Example:
        >>> import asyncio
        >>> from slopshop_memory import AsyncSlopshopMemory
        >>>
        >>> async def main():
        ...     mem = AsyncSlopshopMemory('sk-slop-your-key')
        ...     await mem.memory.store('greeting', 'hello async')
        ...     job = await mem.dream.start(namespace='default')
        ...     print(job['dream_id'])
        ...     await mem.close()
        >>>
        >>> asyncio.run(main())
    """

    def __init__(self, api_key, base_url='https://slopshop.gg', timeout=30):
        self.api_key = api_key
        self.base_url = base_url.rstrip('/')
        self.timeout = timeout
        self._session = None

        # Attach async-wrapped method groups
        self.memory = _AsyncMethodGroupProxy(self, _PersistentMemory)
        self.dream = _AsyncMethodGroupProxy(self, _DreamEngine)
        self.multiplayer = _AsyncMethodGroupProxy(self, _MultiplayerMemory)
        self.snapshot = _AsyncMethodGroupProxy(self, _SnapshotBranching)
        self.bayesian = _AsyncMethodGroupProxy(self, _BayesianCalibration)
        self.chain = _AsyncMethodGroupProxy(self, _EpisodicChains)
        self.trigger = _AsyncMethodGroupProxy(self, _MemoryTriggers)
        self.procedure = _AsyncMethodGroupProxy(self, _ProceduralMemory)
        self.swarm = _AsyncMethodGroupProxy(self, _SwarmOrchestration)

    async def _get_session(self):
        """Lazily create and return the aiohttp ClientSession."""
        if self._session is None or self._session.closed:
            try:
                import aiohttp
            except ImportError:
                raise ImportError(
                    'aiohttp is required for AsyncSlopshopMemory. '
                    'Install it with: pip install aiohttp'
                )
            import aiohttp
            self._session = aiohttp.ClientSession(
                headers={
                    'Authorization': f'Bearer {self.api_key}',
                    'Content-Type': 'application/json',
                    'User-Agent': 'slopshop-memory-sdk-python/1.0.0',
                },
                timeout=aiohttp.ClientTimeout(total=self.timeout),
            )
        return self._session

    async def _request(self, method, path, body=None):
        """Internal async HTTP request dispatcher.

        Args:
            method (str): HTTP method (``'GET'`` or ``'POST'``).
            path (str): URL path starting with ``/``.
            body (dict | None): JSON request body.

        Returns:
            dict: Parsed JSON response.

        Raises:
            SlopshopError: On HTTP error or network failure.
        """
        import aiohttp
        session = await self._get_session()
        url = self.base_url + path
        try:
            async with session.request(method, url, json=body) as resp:
                try:
                    data = await resp.json(content_type=None)
                except Exception:
                    data = {}
                if resp.status >= 400:
                    msg = (
                        data.get('error', {}).get('message')
                        or data.get('message')
                        or 'API error'
                    )
                    raise SlopshopError(msg, resp.status, data)
                return data
        except aiohttp.ClientConnectionError as exc:
            raise SlopshopError(f'Connection error: {exc}')
        except aiohttp.ServerTimeoutError:
            raise SlopshopError(f'Request timed out after {self.timeout}s', 408)

    async def close(self):
        """Close the underlying aiohttp session.

        Should be called when the client is no longer needed, or use the client
        as an async context manager instead::

            async with AsyncSlopshopMemory('sk-slop-...') as mem:
                await mem.memory.store('key', 'value')
        """
        if self._session and not self._session.closed:
            await self._session.close()

    async def __aenter__(self):
        return self

    async def __aexit__(self, *args):
        await self.close()

    async def health(self):
        """Check the Slopshop API health status (async).

        Returns:
            dict: Response with ``status: 'ok'`` and server metadata.
        """
        return await self._request('GET', '/v1/health')


class _AsyncMethodGroupProxy:
    """Proxy that wraps a sync _MethodGroup so all calls become async.

    Calls the underlying sync group's methods on a throwaway sync client,
    but routes the actual HTTP through the parent AsyncSlopshopMemory._request.
    """

    def __init__(self, async_client, group_class):
        self._async_client = async_client
        # Create a shim sync client whose _request delegates to the async one
        shim = _AsyncShimClient(async_client)
        self._group = group_class(shim)

    def __getattr__(self, name):
        attr = getattr(self._group, name)
        if callable(attr):
            import asyncio
            import functools

            @functools.wraps(attr)
            async def async_wrapper(*args, **kwargs):
                # The shim captures the call args and we replay as a real async call
                # by having the shim store the last request and awaiting it.
                loop = asyncio.get_event_loop()
                shim = self._group._client
                shim.clear_pending()
                attr(*args, **kwargs)  # triggers _request on the shim
                method, path, body = shim.get_pending()
                return await self._async_client._request(method, path, body)

            return async_wrapper
        return attr


class _AsyncShimClient:
    """Intercepts _request calls from a sync _MethodGroup to capture (method, path, body)."""

    def __init__(self, async_client):
        self._async_client = async_client
        self._pending = None

    def clear_pending(self):
        self._pending = None

    def get_pending(self):
        return self._pending

    def _request(self, method, path, body=None):
        self._pending = (method, path, body)
        # Return a dummy so group methods don't crash
        return {}


# ---------------------------------------------------------------------------
# Example usage
# ---------------------------------------------------------------------------

if __name__ == '__main__':
    import os
    import time

    API_KEY = os.environ.get('SLOPSHOP_API_KEY', 'sk-slop-demo')

    print('=== Slopshop Memory SDK — Quick Demo ===\n')

    mem = SlopshopMemory(API_KEY)

    # 1. Persistent Memory
    print('1. Persistent Memory')
    mem.memory.store('agent:goal', 'Build the best memory platform', tags=['goal', 'north-star'])
    result = mem.memory.retrieve('agent:goal')
    print(f"   Retrieved: {result.get('value')}\n")

    # 2. Dream Engine
    print('2. Dream Engine')
    job = mem.dream.start(namespace='default', strategy='consolidate')
    print(f"   Dream job started: {job.get('dream_id')}")
    time.sleep(1)
    status = mem.dream.status(job['dream_id'])
    print(f"   Status: {status.get('status')}\n")

    # 3. Multiplayer Memory
    print('3. Multiplayer Memory')
    share = mem.multiplayer.create_share(namespace='default', name='Team Alpha')
    print(f"   Share created: {share.get('share_id')}")
    invite = mem.multiplayer.invite_collaborator(share['share_id'], email='teammate@example.com')
    print(f"   Invited collaborator: {invite.get('invite_id')}\n")

    # 4. Snapshot Branching
    print('4. Snapshot Branching')
    snap = mem.snapshot.create(namespace='default', label='before-experiment')
    print(f"   Snapshot: {snap.get('snapshot_id')}\n")

    # 5. Bayesian Calibration
    print('5. Bayesian Calibration')
    update = mem.bayesian.update(
        key='agent:goal',
        evidence='Team shipped 3 features this week',
        namespace='default',
    )
    print(f"   Posterior confidence: {update.get('posterior')}\n")

    # 6. Episodic Chains
    print('6. Episodic Chains')
    chain = mem.chain.create(
        title='Onboarding Journey',
        entries=[
            {'content': 'User signed up', 'role': 'system'},
            {'content': 'User set first memory', 'role': 'system'},
            {'content': 'User ran first dream', 'role': 'system'},
        ],
    )
    print(f"   Chain created: {chain.get('chain_id')}, length={chain.get('length')}\n")

    # 7. Memory Triggers
    print('7. Memory Triggers')
    trig = mem.trigger.create(
        event='memory.write',
        action='https://example.com/webhook',
        condition={'key_pattern': 'agent:*'},
    )
    print(f"   Trigger registered: {trig.get('trigger_id')}\n")

    # 8. Procedural Memory
    print('8. Procedural Memory')
    proc = mem.procedure.learn(
        name='daily-standup',
        description='Run daily standup synthesis',
        steps=[
            {'tool': 'memory-list', 'input': {'namespace': 'default'}},
            {'tool': 'memory/dream/start', 'input': {'strategy': 'compress'}},
        ],
    )
    print(f"   Procedure learned: {proc.get('procedure_id')}\n")

    # 9. Swarm Orchestration
    print('9. Swarm Orchestration')
    swarm = mem.swarm.orchestrate(
        task='Research the top 10 AI memory techniques and summarize findings',
        agents=5,
        strategy='parallel',
        memory_namespace='research',
    )
    print(f"   Swarm launched: {swarm.get('swarm_id')}, agents={swarm.get('agent_ids', [])}\n")

    print('=== Demo complete ===')
