---
name: remember
description: Save a durable fact to MemorySync. Use when the user runs /memorysync:remember or explicitly asks to remember, save or note something for the future.
---

# Remember

Store what the user asked you to remember using the `memorysync` MCP `add_memory` tool.

1. Rephrase it as ONE clear, self-contained factual statement (e.g. "The user prefers pnpm over npm in every project").
2. Call `add_memory` with that text.
3. Confirm to the user exactly what was stored, quoting the stored text and the memory id.

Never store secrets, tokens, API keys or passwords — refuse politely and explain why. If the request contains several distinct facts, store each as its own `add_memory` call.
