# CLPeasy two-way AI handover — isolated draft

Status: **OFFLINE SIMULATION ONLY**. No autonomous OpenAI/Claude execution.

The manual-only GitHub workflow tests an envelope representing Claude -> OpenAI -> Claude and prints a summary. It does not call either model, send or receive live agent messages, persist messages to GitHub issues, schedule itself, or perform coding.

## Hard gates before live integration
- Founder separately approves runner, scope, cadence, permissions, API keys, and spending.
- Verify a genuinely enforceable combined GBP 5/month hard cap including all charges; fail closed before *any* paid call. A soft budget alert is not enough.
- Separate model invocation identities, minimal permissions, secret redaction, prompt-injection defenses, concurrency controls and kill switch.
- Agent outputs are proposals only. No autonomous merges, production deploys, regulatory changes or paid usage.
- Test real handover and founder approval process in a sandbox first.

The GitHub branch and PR are not authorisation to activate anything.
