# \## Project context files

# 

# Additional project and user context is stored in the following files:

# 

# \- `docs/context/MICHAELA\_CONTEXT.md` — background about Michaela and her preferred way of working.

# \- `docs/context/CLPEASY\_PROJECT\_CONTEXT.md` — detailed context about the CLPeasy product, features, technical stack, compliance-sensitive areas, pricing history, and known issues.

# \- `docs/context/CRAFTY\_MOUSE\_GIFTS\_CONTEXT.md` — context about Michaela's Crafty Mouse Gifts business and its relevance to the CLPeasy target audience.

# \- `docs/context/PROJECT\_HISTORY.md` — historical information about CLPeasy development, previous decisions, pricing, launch history, and known technical issues.

# 

# \### How to use these files

# 

# Before making significant changes to CLPeasy, read the relevant context files so that you understand the existing project history and decisions.

# 

# At minimum:

# \- For general CLPeasy development, read `CLPEASY\_PROJECT\_CONTEXT.md`.

# \- For understanding Michaela's working preferences, read `MICHAELA\_CONTEXT.md`.

# \- For product decisions involving makers, read `CRAFTY\_MOUSE\_GIFTS\_CONTEXT.md`.

# \- When investigating an existing feature, bug, or previous implementation, read `PROJECT\_HISTORY.md`.

# 

# Treat the context files as supporting documentation, not as a replacement for inspecting the current codebase. The current code, configuration, database schema, environment, and deployed application always take precedence over historical notes when they conflict.

# 

# If the context files contain historical pricing, technical details, file names, or implementation details that differ from the current codebase, do not assume the historical information is still current. Inspect the current implementation and configuration first.

# 

# Keep these context files updated when major project decisions, architecture changes, pricing changes, or significant technical fixes are made.

# 

# AGENTS.md — Michaela / CLPeasy Working Instructions

## Who you are working with

The primary user is Michaela Feeley. She is building and maintaining CLPeasy, a UK-focused SaaS product for makers who need to create GB CLP-compliant labels and related safety documents.

## Core working principles

* Treat CLPeasy as an active production project.
* Preserve existing functionality unless the requested change explicitly replaces it.
* Before making broad architectural changes, inspect the current implementation and understand dependencies.
* Avoid destructive changes, data loss, breaking API changes, or unnecessary rewrites.
* Make the smallest reliable change that solves the requested problem.
* Check existing files and current code before assuming how a feature works.
* Keep the user informed in plain English.
* When something is uncertain, clearly state what is known and what is being assumed.
* Do not invent credentials, IDs, URLs, API keys, database records, or configuration values.
* Never expose secrets or hard-code credentials.
* When changing production-facing functionality, consider authentication, billing, downloads, data persistence, and backwards compatibility.
* After changes, run appropriate validation/tests and report what was checked and any remaining uncertainty.

## User communication style

Michaela prefers practical, direct explanations without unnecessary technical jargon. When discussing code or errors:

1. Explain what is happening in simple terms.
2. Explain why it matters.
3. State exactly what was changed or should be changed.
4. Mention any risks or follow-up actions.

Do not overwhelm her with irrelevant implementation detail unless she asks for it.

## Project safety

CLPeasy handles product compliance workflows. Do not casually change compliance-related logic, hazard statements, pictograms, signal words, UFI handling, label dimensions, or regulatory wording without checking the current requirements and existing implementation.

For legal/regulatory questions, distinguish clearly between software implementation and legal advice. Verify current UK requirements when needed.

## Git and deployment

The project has used GitHub and Netlify. Treat deployment as production-sensitive.

* Do not force-push or delete branches without explicit instruction.
* Do not overwrite production configuration blindly.
* Do not remove existing environment variables.
* Do not change Supabase or Stripe schemas without understanding the existing application code.
* Keep changes reviewable and focused.

## Existing technical ecosystem

Known technologies/services include:

* HTML/CSS/JavaScript front-end files
* GitHub
* Netlify hosting/deployment
* Supabase authentication and database
* Stripe billing/payment integration

Known project files have included:

* builder(1).html
* pricing.html
* home(3).html

File names may have changed. Inspect the repository before relying on these exact names.

## CLPeasy product principles

The product should make CLP-related workflows easier for UK makers. Important product areas include:

* Label creation
* SDS information entry
* Hazard classification
* CLP label generation
* GHS pictograms
* Hazard statements
* Precautionary statements
* Signal word
* UFI field
* Print-ready PNG, PDF and SVG output
* AI-assisted "Guide Me"
* "Smart Paste SDS"
* Candle Care Cards
* Room Spray Safety Cards
* Wax Melt Inserts

## Important known issue

A previous PDF output issue involved a 63×44 mm rectangle where "SCENTED CANDLE" and "WARNING" overlapped. A patch was applied in builder.html. When modifying PDF/label rendering, check for regressions in text fitting, spacing, and label dimensions.

## CLP label sizing

Michaela has specifically been concerned that GHS pictograms and other label elements must meet applicable minimum sizing requirements. Do not casually reduce pictogram or label dimensions to make a layout fit. Verify the current regulatory requirement before implementing compliance-sensitive changes.

## Pricing history

Previously discussed CLPeasy pricing:

* Easy Start: $9.99/month
* Easy Pro: $14.99/month
* Easy Pro annual: $149/year
* Easy Start annual: $99/year
* Top-up: 5 downloads $3.99
* Top-up: 10 downloads $7.99
* Free trial changed to 14 days

These are historical project notes. Inspect the current live pricing and code before changing or quoting prices.

## Launch

CLPeasy V1.0 was planned/launched around Monday 15 June 2026, with a "LIVE TODAY!!! V1.0" announcement.

## What to do before editing

1. Inspect repository structure.
2. Identify current entry points and build/deployment setup.
3. Search for relevant feature names before changing code.
4. Check authentication and billing dependencies.
5. Make a focused change.
6. Validate locally where possible.
7. Summarize files changed and tests/checks performed.

