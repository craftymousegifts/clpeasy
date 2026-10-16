# AI handover budget — activation gates (NOT SATISFIED)

Current implementation: **in-memory offline demonstration only**. `live_calls_permitted()` always returns false. No keys, network calls or paid AI usage.

Founder ceiling: **GBP 5.00 total per calendar month across OpenAI and Anthropic**, including fees/taxes where applicable. Existing Anthropic prepaid balance still counts as usage. Never infer a provider-side soft alert is a hard ceiling.

A production-capable controller needs ALL of:
1. Durable transactional/atomic reservation storage, single-writer or safe concurrent transactions, idempotency and crash recovery; shared across runners.
2. Provider-specific conservative **maximum** cost per request based on enforced input/output/token limits and any tools/caching/extra fees; reject requests without a provable upper bound.
3. Conservative USD→GBP conversion with explicit exchange-rate buffer, VAT/tax treatment, rounding up, and monthly reset in a declared timezone.
4. Reconciliation with actual provider usage, outstanding reservations, other activity using same accounts, delayed billing, and unexpected costs; halt on discrepancies.
5. Credential isolation, key rotation, request-scoped permissions, bounded cadence, replay protection, prompt-injection resistance, and emergency disable.
6. Independent sandbox validation including parallel runners, retries, provider errors, month boundary and overspend attempts; explicit founder approval for any live run.

**Important:** An application-level cap cannot guarantee the total *provider account bill* if credentials are also used outside this runner. A strict all-account limit needs provider-enforced prepaid/limits or isolated billing accounts in addition to the controller. Until demonstrated, paid calls remain BLOCKED.

OpenAI billing is not active per founder screenshot; Anthropic shows US$13.37 prepaid and auto-reload off. These are observations, not permission to spend.
