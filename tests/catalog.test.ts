import { CATEGORIES, CONNECTORS } from '../src/integrations/catalog';

describe('connector catalog', () => {
  it('has unique ids and a known category for every connector', () => {
    const ids = CONNECTORS.map((c) => c.id);
    expect(new Set(ids).size).toBe(ids.length);
    for (const c of CONNECTORS) expect(CATEGORIES).toContain(c.category);
  });

  it('covers every category and the main tools QA teams use', () => {
    for (const cat of CATEGORIES) expect(CONNECTORS.some((c) => c.category === cat)).toBe(true);
    const names = CONNECTORS.map((c) => c.name);
    for (const tool of ['ClickUp', 'Jira', 'TestRail', 'Slack']) expect(names).toContain(tool);
  });

  it('only links to https docs, and only mocks are active', () => {
    for (const c of CONNECTORS) {
      if (c.docsUrl) expect(new URL(c.docsUrl).protocol).toBe('https:');
      if (c.status === 'mock') expect(c.docsUrl).toBe('');
    }
  });
});
