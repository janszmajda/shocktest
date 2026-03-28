---
name: no-coauthor-tag
description: User does not want Co-Authored-By Claude line in git commit messages
type: feedback
---

Do not include the `Co-Authored-By: Claude Opus 4.6 (1M context) <noreply@anthropic.com>` line in git commit messages.

**Why:** User explicitly asked to remove it — they don't want Claude attribution in commits.
**How to apply:** Omit the Co-Authored-By trailer from all commit messages in this project.
