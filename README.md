DAAT v2

A context layer for organizations

⸻

What DAAT is

Companies don’t run on their tools.
They run on shared understanding.

Who knows what.
What was decided and why.
What is in motion.
How things connect.

That knowledge exists, but it lives in fragments. Conversations in Slack. Documents in Notion. Transactions in QuickBooks. Access in Google. And a large portion never makes it into any system at all.

Every tool captures a slice. None preserve the whole.

AI doesn’t fix this by default. Most systems being built today are pipelines, triggers, API calls with some intelligence layered in. Each step starts from scratch. No memory of how a company actually works.

The AI is smart, but blind.

DAAT is an attempt to solve that.

⸻

What this system actually does (today)

DAAT is not a concept. It is already running.

It connects to Slack, Notion, QuickBooks, and Google Workspace, ingests raw activity into a unified signal layer, and processes each item through a constrained AI pipeline that extracts grounded context.

Every extraction is traceable back to source. Nothing is flattened. Nothing is guessed.

Right now, the system:
	•	Ingests full Slack channels and threads with metadata and structure
	•	Reconstructs Notion page hierarchies, block trees, and relationships
	•	Parses financial activity from QuickBooks into structured signals
	•	Maps OAuth access and app usage across a company via Google Workspace
	•	Stores all raw data alongside structured metadata with full provenance
	•	Runs a comprehension pipeline over each signal using strict rules
	•	Extracts workflows, decisions, problems, tools, people, and states
	•	Preserves uncertainty instead of fabricating answers

This is not summarization. It is controlled reconstruction of how work actually happens.

⸻

The problem

Modern software made individuals faster.
It did not make organizations smarter.

To manage complexity, systems make things legible by simplifying them.

A conversation becomes a message.
A relationship becomes a CRM entry.
A workflow becomes a task.

This works operationally, but it destroys the texture of how work actually happens. The tacit knowledge, the reasoning behind decisions, the local context, all of it gets fragmented or lost.

The result:
	•	Context is scattered across tools
	•	Decisions are hard to trace
	•	Work is constantly reinterpreted
	•	Knowledge disappears when people leave
	•	AI systems operate without grounded understanding

The organization becomes legible to software, but less intelligible to itself.

⸻

The approach

DAAT does not try to replace existing tools or force a new workflow.

It sits underneath them.

It observes what is already happening and extracts structured understanding from it, without requiring users to change behavior.

The system is built around one principle:

Preserve reality first. Interpret it carefully. Never flatten it prematurely.

⸻

Architecture

DAAT v2 is structured as a layered system.

Layer 0 — Connections

OAuth integrations into core company tools:
	•	Slack
	•	Notion
	•	QuickBooks
	•	Google Workspace

Stores tokens and workspace metadata. No transformation.

⸻

Layer 1 — Signals

The universal ingestion layer.

Every piece of data becomes a signal.
	•	One row in signals_core per item
	•	Raw payload stored untouched
	•	Source-specific metadata stored separately
	•	Strict atomic insert pattern
	•	Full provenance preserved

Examples:
	•	Slack message or thread
	•	Notion page with full block tree
	•	QuickBooks transaction
	•	Google OAuth app authorization

This layer is not interpretation. It is faithful capture.

⸻

Layer 2 — Comprehension

A structured extraction layer powered by Claude.

Each signal is processed independently under a strict doctrine.

The system extracts:
	•	Workflows
	•	Problems
	•	Tools
	•	Decisions
	•	People
	•	States

Each with grounding back to the source.

Also includes:
	•	Summary
	•	Uncertainty
	•	Tacit context

This is not cross-signal intelligence. It is disciplined, local understanding.

⸻

The Comprehension Doctrine

The doctrine defines what the system is allowed to do.

It exists to prevent the common failure mode where AI produces something clean but incorrect.

Key rules:
	•	Extract only what is present in the signal
	•	No cross-signal claims
	•	Ground every output in source data
	•	Prefer null over weak inference
	•	Preserve uncertainty explicitly
	•	Capture implied context without fabricating structure

This is a constraint system, not a prompt trick.

⸻

What exists today

The system is already doing this across real data sources.
	•	Multi-source ingestion across Slack, Notion, QuickBooks, and Google
	•	Unified signal layer with reconciliation and provenance
	•	Structured comprehension pipeline with validation
	•	Admin dashboard for pipeline state
	•	Ingest explorer for raw signals
	•	Comprehension explorer for extracted context

This is a working system, not a mock or demo.

⸻

What is not built yet
	•	Cross-signal synthesis
	•	Entity and relationship layer
	•	Feedback and correction loops
	•	External API for querying context
	•	Multi-tenant support
	•	Real-time ingestion via webhooks

These form the next stage.

⸻

Direction

This is not meant to be another dashboard.

The direction is infrastructure.

A system that:
	•	Continuously builds a live map of how a company operates
	•	Makes that map queryable
	•	Allows agents, workflows, and software to operate with real context

Today, every team building with AI reconstructs context from scratch.

DAAT is an attempt to make that unnecessary.

⸻

Why this matters

The next step in AI is not just better models.

It is systems that can operate with context.

Without that, every agent is limited.
With it, the entire stack changes.

⸻

Status

Early, but real.

The ingestion and comprehension layers are built and running.
The rest is being developed through use.

⸻

Author

David Rosenberg
dovidro154@gmail.com
