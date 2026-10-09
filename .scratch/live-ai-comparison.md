# Live recommendation comparison

Tested the Oct 9, 2026 dinner draft and blank Oct 9 lunches for Member A and Member B through the real `/api/ai/recommendations` route. Each request used a fresh copy of the local database; its SHA-256 remained unchanged.

| Scenario | Model | Route | Raw → delivered | Route time | Provider tokens | Provider cost |
|---|---|---:|---:|---:|---:|---:|
| Dinner | Current Qwen config (`qwen/qwen3.5-35b-a3b-20260224`) | 200 | 5 → 4 | 15.14 s | 12,972 | $0.004081 |
| Member A lunch | Current Qwen config | 200 | 3 → 3 | 8.99 s | 11,399 | $0.00299505 |
| Member B lunch | Current Qwen config | 200 | 3 → 3 | 5.97 s | 10,790 | $0.00239455 |
| Dinner | `deepseek/deepseek-v4.1-flash` | 200 | 5 → 4 | 5.53 s | 11,352 | $0.00497970 |
| Member A lunch | `deepseek/deepseek-v4.1-flash` | 200 | 5 → 4 | 3.47 s | 10,063 | $0.003768036 |
| Member B lunch | `deepseek/deepseek-v4.1-flash` | 200 | 5 → 5 | 4.10 s | 10,437 | $0.001699992 |

The current-model comparison batch cost $0.00947060 for 35,161 tokens and took 30.10 seconds end to end. DeepSeek cost $0.010447728 for 31,852 tokens and took 13.09 seconds end to end. In these three samples, DeepSeek was about 56% faster end to end, used about 9% fewer tokens, and cost about 10% more. Current-model member A/B captures predate the final dinner filtering change; both already returned HTTP 200. Qwen provider duration was captured only for the final dinner call (1.91 s); the Qwen A/B figures are route times, so compare route latency rather than inference-only latency.

The fixed Qwen dinner call included later options whose raw model output omitted the chicken removal disclosure. The route returned four usable recommendations with the removal derived from the changed ingredient lists. The exact post-fix response also stayed within the calorie tolerance. DeepSeek dinner likewise returned four usable recommendations; its returned removals were canonicalized and both members' portions were kept separate. All lunch suggestions belonged to the requested member, and retained choices passed the route's calorie checks.

Both models returned only new-origin suggestions for blank lunches even though saved lunch menus were available. The current model returned three suggestions for each member; DeepSeek returned four for A and five for B. This is a separate provider/prompt behavior, not evidence that either model followed the saved-menu mix instruction.

This is one live sample per model and scenario, so output quality and cost may vary between runs. The run ledger records exactly five current-model requests (including the two failures found during repair) and three DeepSeek requests. No other OpenRouter requests were made by the harness.

Raw responses and replay captures are in `.scratch/live-ai-captures/`. They include the Oct 9 menu and generated nutrition recommendations, so keep them local. The source database was never modified; the temporary replay copy was removed after verification.
