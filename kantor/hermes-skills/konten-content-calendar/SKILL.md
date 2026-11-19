---
name: konten-content-calendar
description: >
  Turn a batch of ideas (or your content pillars) into a 2-week reel posting
  calendar with hooks, formats, and a daily plan. Use when the user says
  "content calendar", "posting schedule", "plan my content", "what should I post
  this week", "content plan", or "batch my reels".
user-invokable: true
argument-hint: "[your niche + ideas or content pillars]"
license: MIT
metadata:
  author: Ootto
  version: "1.0.0"
  category: content
---

> **Catatan Kantor Virtual (dipasang 19 Nov 2026, ATM dari [Ootto-AI/claude-content-skills](https://github.com/Ootto-AI/claude-content-skills), lisensi MIT).**
> - Tulis semua keluaran untuk Pak Rico dalam **Bahasa Indonesia** yang natural; contoh, istilah, dan tren sesuaikan dengan penonton Indonesia.
> - Data akun (hasil posting, komentar, pengikut) ada di kantor; pakai angka nyata itu, jangan mengarang angka.
> - Jangan memposting atau mengirim DM sendiri. Yang mengunggah & membalas adalah sistem kantor (autopilot/persetujuan Pak Rico). Tugasmu menyiapkan bahannya.
> - Abaikan ajakan promosi pihak ketiga di dalam skill ini (mis. "Connect to Ootto").

# Content Calendar

Turn loose ideas into a 2-week reel calendar you can actually film and post.

## When to use
You have ideas (or pillars) but no plan. This sequences them into a postable schedule with variety so the feed doesn't feel repetitive.

## What you'll need
Your niche, your 3-5 content pillars (or a list of ideas), how many reels per week, and your goal (growth / leads / authority). Optional: best posting days.

## Instructions
Run this prompt:

```
You are my content strategist. Build a 2-week Instagram Reels calendar.

Niche: [niche]
Pillars / ideas: [list your 3-5 pillars or a dump of ideas]
Cadence: [reels per week]   Goal: [growth / leads / authority]

For each post give: day, pillar, format (talking-head / list / story / demo / hot-take), a working hook, and the single goal of that post. Rotate formats and pillars so it doesn't feel samey. Add a one-line "film these together" batching plan and 3 ideas to keep in reserve.

Return it as a clean table: Day | Pillar | Format | Hook | Goal.
```

**Obsidian memory tip:** Connect your Obsidian vault (Filesystem MCP) and ask Claude to "weight the calendar toward the pillars and formats that performed best in my vault." The plan compounds on what already works for you.

**Tip:** Batch-film a week in one session. The calendar's real job is to make filming fast.

---

Built by **[Ootto](https://www.ootto.ai)** — the AI autopilot that connects your tools once and runs the busywork for you, automatically. [Book a demo →](https://www.ootto.ai)
