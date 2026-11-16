// Connectors the workspace is designed to support. Each one implements a
// provider-neutral interface from ./types, so screens never depend on a
// specific vendor. Only the mock adapters ship in the public demo.

export type ConnectorCategory = 'Issue tracking' | 'Test management' | 'Team chat' | 'Docs & links' | 'Builds & CI';
export type ConnectorInterface = 'IssueTracker' | 'TestManagement' | 'TeamMessaging' | 'LinkSource';

export interface Connector {
  id: string;
  name: string;
  category: ConnectorCategory;
  implements: ConnectorInterface;
  syncs: string;
  auth: string;
  docsUrl: string;
  status: 'mock' | 'planned';
}

export const CATEGORIES: ConnectorCategory[] = ['Issue tracking', 'Test management', 'Team chat', 'Docs & links', 'Builds & CI'];

export const CONNECTORS: Connector[] = [
  { id: 'mock-tracker', name: 'Mock issue tracker', category: 'Issue tracking', implements: 'IssueTracker', syncs: 'Create tickets, look up by dedupe key, list open bugs', auth: 'None (runs in the browser)', docsUrl: '', status: 'mock' },
  { id: 'clickup', name: 'ClickUp', category: 'Issue tracking', implements: 'IssueTracker', syncs: 'Tasks in a list, custom fields for severity and priority, statuses, webhooks', auth: 'OAuth 2.0 or personal token', docsUrl: 'https://developer.clickup.com', status: 'planned' },
  { id: 'jira', name: 'Jira', category: 'Issue tracking', implements: 'IssueTracker', syncs: 'Issues via REST API, JQL search for digests, workflow statuses, webhooks', auth: 'OAuth 2.0 (3LO) or API token', docsUrl: 'https://developer.atlassian.com/cloud/jira/platform/', status: 'planned' },
  { id: 'linear', name: 'Linear', category: 'Issue tracking', implements: 'IssueTracker', syncs: 'Issues via GraphQL API, labels, workflow states, webhooks', auth: 'OAuth 2.0 or API key', docsUrl: 'https://linear.app/developers', status: 'planned' },
  { id: 'github', name: 'GitHub Issues', category: 'Issue tracking', implements: 'IssueTracker', syncs: 'Issues and labels via REST or GraphQL, webhooks', auth: 'GitHub App', docsUrl: 'https://docs.github.com/en/rest', status: 'planned' },
  { id: 'azure-devops', name: 'Azure DevOps Boards', category: 'Issue tracking', implements: 'IssueTracker', syncs: 'Work items, WIQL queries, service hooks', auth: 'OAuth or personal access token', docsUrl: 'https://learn.microsoft.com/rest/api/azure/devops/', status: 'planned' },

  { id: 'testrail', name: 'TestRail', category: 'Test management', implements: 'TestManagement', syncs: 'Import cases and suites, create runs, push results with linked defects', auth: 'API key', docsUrl: 'https://support.testrail.com', status: 'planned' },
  { id: 'zephyr', name: 'Zephyr Scale', category: 'Test management', implements: 'TestManagement', syncs: 'Test cases, cycles and executions linked to Jira issues', auth: 'API token', docsUrl: 'https://support.smartbear.com/zephyr-scale-cloud/', status: 'planned' },
  { id: 'xray', name: 'Xray', category: 'Test management', implements: 'TestManagement', syncs: 'Tests, executions and results via REST or GraphQL', auth: 'Client ID and secret', docsUrl: 'https://docs.getxray.app', status: 'planned' },
  { id: 'qase', name: 'Qase', category: 'Test management', implements: 'TestManagement', syncs: 'Cases, runs and results', auth: 'API token', docsUrl: 'https://developers.qase.io', status: 'planned' },

  { id: 'mock-chat', name: 'Mock team chat', category: 'Team chat', implements: 'TeamMessaging', syncs: 'Post messages and thread replies', auth: 'None (runs in the browser)', docsUrl: '', status: 'mock' },
  { id: 'slack', name: 'Slack', category: 'Team chat', implements: 'TeamMessaging', syncs: 'Bug and feedback alerts, question routing, bug digest with thread replies, release go/no-go messages', auth: 'Slack app (bot token)', docsUrl: 'https://api.slack.com', status: 'planned' },
  { id: 'teams', name: 'Microsoft Teams', category: 'Team chat', implements: 'TeamMessaging', syncs: 'Channel messages and replies', auth: 'Microsoft Graph (OAuth 2.0)', docsUrl: 'https://learn.microsoft.com/graph/', status: 'planned' },
  { id: 'discord', name: 'Discord', category: 'Team chat', implements: 'TeamMessaging', syncs: 'Channel posts and threads, common for playtest communities', auth: 'Bot token or webhook', docsUrl: 'https://discord.com/developers/docs', status: 'planned' },

  { id: 'confluence', name: 'Confluence', category: 'Docs & links', implements: 'LinkSource', syncs: 'Test plans and release checklists as Library links', auth: 'OAuth 2.0 or API token', docsUrl: 'https://developer.atlassian.com/cloud/confluence/', status: 'planned' },
  { id: 'notion', name: 'Notion', category: 'Docs & links', implements: 'LinkSource', syncs: 'Pages and databases as Library links', auth: 'Integration token', docsUrl: 'https://developers.notion.com', status: 'planned' },
  { id: 'github-actions', name: 'GitHub Actions', category: 'Builds & CI', implements: 'LinkSource', syncs: 'Latest builds and artifacts per branch for the build picker', auth: 'GitHub App', docsUrl: 'https://docs.github.com/en/rest/actions', status: 'planned' },
  { id: 'jenkins', name: 'Jenkins', category: 'Builds & CI', implements: 'LinkSource', syncs: 'Build numbers, status and download links', auth: 'API token', docsUrl: 'https://www.jenkins.io/doc/book/using/remote-access-api/', status: 'planned' },
];
