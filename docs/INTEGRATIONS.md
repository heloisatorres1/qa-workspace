# Integrations

## Why integrations matter here

A QA lead on a game team usually works with a browser full of tabs: the issue tracker (ClickUp or Jira), a test case tool (TestRail or a spreadsheet), team chat (Slack), a wiki for test plans, a CI page for builds and a few dashboards. Each tool is good at its job. The trouble is in the gaps between them:

- A bug is filed in the tracker, then announced in chat by hand, and the two drift apart.
- Test results live in TestRail while the bugs they found live in Jira, so nobody sees one picture.
- The weekly "open bugs by severity" post is rebuilt by hand from a filtered view.
- The release go/no-go call means opening five tabs and reading numbers out loud.

This workspace is meant to be **the one place where QA work happens**. You capture, triage, run tests and decide on releases here. The workspace then writes to the tools your team already uses, so developers stay in Jira or ClickUp and producers stay in Slack. Nobody has to switch tools, and QA doesn't have to keep ten tabs open.

The source tools stay the record. This workspace doesn't try to replace Jira or TestRail. It sits in front of them, keeps the links between them, and turns their data into decisions.

## How it is built

Screens and domain rules never call a vendor API. They depend on four provider-neutral interfaces in [`src/integrations/types.ts`](../src/integrations/types.ts):

| Interface | Purpose | Example tools |
| --- | --- | --- |
| `IssueTracker` | Create tickets, look them up by dedupe key, list open bugs page by page | ClickUp, Jira, Linear, GitHub Issues, Azure DevOps |
| `TestManagement` | Import cases, create runs, append results with linked defects | TestRail, Zephyr Scale, Xray, Qase |
| `TeamMessaging` | Post messages and thread replies, look them up by dedupe key | Slack, Microsoft Teams, Discord |
| `LinkSource` | Feed the Library and build picker with docs, boards and builds | Confluence, Notion, GitHub Actions, Jenkins |

Adding a tool means writing one adapter for one interface. Swapping ClickUp for Jira, or Slack for Teams, is a settings change, not a rewrite. The full list of connectors with their sync scope and auth method is in [`src/integrations/catalog.ts`](../src/integrations/catalog.ts) and is shown under **Settings → Connectors**.

The public demo ships only mock adapters ([`src/integrations/mock.ts`](../src/integrations/mock.ts)). The build cannot reach any external service, and the end-to-end tests fail if a request leaves localhost.

## What each tool does in the workflow

### Issue tracking: ClickUp, Jira and others
- **Capture → ticket.** A submitted bug becomes a task or issue with title, steps, expected and actual results, build and environment. Severity and priority map to custom fields (ClickUp) or fields and labels (Jira).
- **Triage.** Status, owner and duplicate links sync both ways through webhooks, so a developer closing an issue in Jira updates the workspace.
- **Bug digest.** Open bugs are fetched page by page (ClickUp list endpoints, Jira JQL search). Tracker statuses go through an explicit mapping, and anything unmapped is shown as "Needs review" instead of being guessed.

### Test management: TestRail and others
- **Import** suites and cases so runs can start from the team's existing test library.
- **Push results** from a run back as appended results, with the bug IDs found during the run attached as defects.
- **Release evidence** can combine TestRail results with tracker blockers in one view.

### Team chat: Slack and others
Slack is the main chat target, and every chat feature in the demo is built for it:
- **Finding alerts.** New bugs and feedback post to the channel routed for that project and type, with a link back to the ticket.
- **Questions.** Questions go to a channel where the owner can answer them, instead of being filed as bugs.
- **Bug digest.** One parent message with severity counts, plus thread replies with the bug lists, split to stay under message size limits. A digest that stops halfway resumes from the first message that wasn't sent.
- **Release decision.** The saved Ready / Ready with risks / Hold message goes to the release channel, exactly as frozen in the decision revision.
- Mentions such as `@channel` and `@here` are neutralised before posting, so user text can't ping a whole channel.

Teams and Discord use the same `TeamMessaging` interface. Discord is common for game playtest communities.

### Docs, links and builds
Confluence and Notion pages, CI builds from GitHub Actions or Jenkins, and dashboards appear as tagged Library links and as choices in the build picker. This replaces the bookmarks folder.

## Rules every live adapter must follow

These rules already apply to the mock adapters and are covered by unit and end-to-end tests:

1. **Save first, deliver second.** A finding is stored before anything is sent. Each destination gets its own delivery job with its own status and retry.
2. **Idempotent by dedupe key.** Every create or post carries a dedupe key. After a timeout, the adapter looks the key up before trying again, so no duplicate tickets or messages are created.
3. **Respect rate limits.** A `rate_limited` error carries `retryAfterMs`, and the outbox waits that long.
4. **All or nothing reads.** A paginated fetch that fails partway is refused, never published as if complete.
5. **Append, never overwrite.** Test results are pushed as new attempts, matching local history.

## What a live version needs

- **A small server.** Tokens and OAuth secrets must never reach the browser. The server holds credentials, proxies API calls and receives webhooks.
- **A database with a transactional outbox** and a worker that retries delivery jobs.
- **OAuth flows** per tool (ClickUp, Jira, Slack apps, Microsoft Graph) and per-workspace connection settings.
- **Webhook endpoints** with signature checks (Slack signing secret, Jira and ClickUp webhook secrets).
- **Field mapping settings** for severity, priority and status per project.
- **Authentication and roles**, so only leads can send release decisions.

None of this is in the public demo, on purpose.
