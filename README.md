# QA Workspace

**From finding to release confidence.** QA Workspace is one place for game QA teams to capture bugs, feedback and questions, triage them, run test cases, and make a release recommendation backed by evidence.

**[Live demo](https://heloisatorres1.github.io/qa-workspace/)** · [![CI and Pages](https://github.com/heloisatorres1/qa-workspace/actions/workflows/deploy-pages.yml/badge.svg)](https://github.com/heloisatorres1/qa-workspace/actions/workflows/deploy-pages.yml)

> Portfolio demo. All data is fictional (project *Orbit Garden*, build 0.8.4) and every integration is a mock. Nothing leaves your browser.

## The problem

On a typical game team, QA work is spread across an issue tracker, a chat tool, spreadsheets of test cases and a pile of bookmarks. That causes the same failures again and again:

- Bug reports arrive without steps, expected or actual results, or with severity and priority mixed up.
- Questions get filed as bugs, or they get lost in chat.
- Someone builds the "open bugs by severity" digest by hand, from a list that was only half fetched.
- Test cases get edited after a run, and the run's history quietly changes.
- "Are we good to ship?" gets answered from memory instead of from evidence, and nobody can say later what the evidence was.

## One place for QA work

A QA lead's day usually involves a dozen tabs: ClickUp or Jira for bugs, TestRail or a spreadsheet for test cases, Slack for announcements and questions, a wiki for test plans, a CI page for builds and a few dashboards. The work falls into the gaps between them.

QA Workspace is meant to be the **single place where QA work happens**. You capture, triage, test and decide here. QA Workspace then writes to the tools the rest of the team already uses, through API connectors:

- **Issue tracking:** ClickUp, Jira, Linear, GitHub Issues, Azure DevOps
- **Test management:** TestRail, Zephyr Scale, Xray, Qase
- **Team chat:** Slack, Microsoft Teams, Discord
- **Docs and builds:** Confluence, Notion, GitHub Actions, Jenkins

Developers stay in their tracker and producers stay in Slack. QA gets one view instead of ten tabs. Every connector implements a provider-neutral interface, so any tool with an API can be added. See **[docs/INTEGRATIONS.md](docs/INTEGRATIONS.md)** for the design and what each tool does in the workflow.

## What it does

| Area | What you can do |
| --- | --- |
| **Overview** | Open bugs, criticals, active runs, unanswered questions, release readiness, priority queue, recent activity and delivery status. |
| **Capture** | One composer for **Bug**, **Feedback** and **Question**, with inline validation, saved drafts, attachments (metadata only), testing sessions, and a delivery preview that shows exactly which ticket and message will be created. |
| **Triage** | Filter by type, severity, status, build and owner. Assign owners, link duplicates, answer questions or deliberately convert one into a bug. |
| **Bug digest** | Fetch every page from the tracker, de-duplicate, group open bugs by severity, preview the parent message and its thread replies, then send. A partial send resumes where it stopped. |
| **Test Lab** | Cases (with revisions), suites, runs and sessions. Record results and retests, report a bug straight from a failure, and complete a run with an explicit reason for anything left untested. |
| **QA Tasks** | The QA team's own work, not bugs: new or updated automation, test coverage, reviews and meetings. Board (drag cards with mouse, touch or keyboard) or list, with owners, due dates, overdue warnings and a My tasks filter. Tasks can link to a suite, run, release or Library item. |
| **Releases** | Evidence → Decision → Message. A human chooses Ready, Ready with accepted risks, or Hold. Saving freezes the evidence and the message as a revision. |
| **Library** | Tagged, searchable links to repos, dashboards, boards, docs and builds. |
| **Settings** | Routing per project and finding type, tracker status mapping, failure simulation, delivery log and demo reset. |

## Design decisions

- **Severity is not priority.** Severity is player impact and priority is fix order, so they are two separate required fields.
- **A question is not a bug.** Questions have an owner and an answer. Converting one to a bug is a deliberate action that creates a linked draft.
- **Saved is not the same as delivered.** Submitting stores the record first, then queues one delivery job per destination. Each job has its own status (pending, delivered, failed or uncertain) and its own retry. If chat fails after the ticket was created, retrying only re-sends the message.
- **Timeouts are treated as "maybe".** A ticket request that times out may have landed. Before retrying, QA Workspace looks it up by dedupe key, so it never creates a duplicate blindly.
- **Digests are all or nothing.** A partial fetch cannot be published, statuses come from an explicit mapping (no guessing from titles), and unmapped items show up in a "Needs review" group.
- **History doesn't change after the fact.** A run stores a copy of each case revision, results are append-only, and a saved release decision keeps its evidence and message even after bugs or tests change. New evidence means a new revision.
- **No automatic approval.** Metrics inform the decision but never make it. "Ready" is unavailable while critical bugs are open, and every accepted risk needs a rationale and an owner.

Metrics:
- Pass rate = passed / applicable, where applicable excludes *Not applicable*.
- Execution rate = (passed + failed + blocked) / applicable. For example, 42 / 3 / 2 / 5 gives a pass rate of 80.8% and an execution rate of 90.4%.

## Run it

```bash
npm install
npm run dev        # http://localhost:5173
npm test           # unit tests (Vitest)
npx playwright install chromium
npx playwright test   # end-to-end journeys
npm run build      # static build in dist/
```

Try these:
1. **Capture**: open *Demo: simulate a delivery problem*, tick *Next chat post fails*, then submit a bug. The ticket is delivered and the message fails. Retry only the message.
2. **Triage → Bug digest**: tick *fail page 2*, fetch (refused as partial), fetch again, prepare the preview, then send.
3. **Test Lab → Hotfix regression**: fail a case and report a bug from it. The bug ID is linked back to the result.
4. **Releases**: save the Hold decision, then resolve CP-109 in Triage. The saved message stays the same and is flagged as stale.

Your changes are kept in this browser's local storage. **Settings → Reset demo** restores the fixtures.

## QA strategy

- **Unit tests** cover the domain rules: metrics and the zero-denominator case, run snapshots and retest history, completing a run with work left, finding validation, chat escaping, release validation and frozen revisions, outbox retry and timeout reconciliation, digest pagination, de-duplication, chunking and resume.
- **End-to-end tests** (Playwright) cover these journeys: report → review → submit, chat failure → single retry, timeout → reconcile, failed case → linked bug, digest partial fetch and partial send, release Hold → frozen message → send, refresh persistence and reset, keyboard search, and the narrow layout. Every journey also checks that **no request leaves localhost**.
- **Continuous integration**: every push runs the type check, unit tests, end-to-end tests and the build on GitHub Actions. The demo is published to GitHub Pages only when all of them pass.
- **Accessibility**: labelled controls, inline errors linked with `aria-describedby`, focus moved to the first invalid field, a skip link, focus-trapped dialogs that close with Escape, and status shown with text and icons, never color alone. Night mode follows the system setting and can be switched in the top bar (System, Light, Dark).

## Architecture

React + TypeScript (Vite) with no backend. The code is organised in four layers:

```
src/domain/        pure rules: metrics, runs, findings, digest, release, formatting
src/integrations/  IssueTracker / TeamMessaging interfaces, mock adapters, delivery outbox
src/data/          app state, fixtures, actions, selectors (persisted to localStorage)
src/routes/        screens
```

Domain code depends only on the adapter interfaces. A live version would add a server that holds the credentials, a database with a transactional outbox and worker, real tracker and chat adapters, authentication, and role checks. None of that is in this demo, and the public build cannot reach a live service.

## Integration status

| Integration | Interface | Status |
| --- | --- | --- |
| Issue tracker (ClickUp, Jira, Linear, GitHub Issues, Azure DevOps) | `IssueTracker` | Mock adapter in the demo, live adapters planned |
| Test management (TestRail, Zephyr Scale, Xray, Qase) | `TestManagement` | Interface defined, adapters planned |
| Team chat (Slack, Microsoft Teams, Discord) | `TeamMessaging` | Mock adapter in the demo, live adapters planned |
| Docs and builds (Confluence, Notion, GitHub Actions, Jenkins) | `LinkSource` | Interface defined, adapters planned |
| Draft from notes | n/a | Deterministic. It only rearranges the text you wrote and never invents steps or results. |

The connector catalog is in `src/integrations/catalog.ts` and is shown under **Settings → Connectors**.

## Known limitations

- Single user, no authentication. Data lives in one browser.
- Attachments are recorded as file details only. Their contents are not stored.
- No automation-result import, scheduled digests or live adapters yet.
