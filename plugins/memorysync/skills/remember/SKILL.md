---
name: remember
description: Save a durable fact to MemorySync. Use when the user runs /memorysync:remember or explicitly asks to remember, save or note something for the future.
---

# Remember

Store what the user asked you to remember using the `memorysync` MCP `add_memory` tool.

1. Rephrase it as ONE clear, self-contained factual statement (e.g. "The user prefers pnpm over npm in every project").
2. Call `add_memory` with that text.
3. Tell the user the outcome. `created` returns the new memory ids; `skipped` means nothing new was stored, because MemorySync already had the fact or found nothing lasting in it. MemorySync stores the facts it extracts in its own words, so describe what was saved rather than quoting it.

Never store secrets, tokens, API keys or passwords — refuse politely and explain why. If the request contains several distinct facts, send them together in one `add_memory` call: each fact is extracted and stored as its own memory.
