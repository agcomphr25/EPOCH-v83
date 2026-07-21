import { render, screen } from '@testing-library/react';
import { Route } from 'lucide-react';
import { describe, expect, it } from 'vitest';

import {
  DESIGN_CONTROL_DEFAULT_TAB,
  SectionHeader,
  lifecycleTabs,
} from '@/pages/QMSDesignControlPage';

describe('QMS Design Control project action', () => {
  it('puts Design Projects first and opens it by default', () => {
    expect(lifecycleTabs[0]).toEqual({ value: 'projects', label: 'Design Projects' });
    expect(DESIGN_CONTROL_DEFAULT_TAB).toBe('projects');
  });

  it('links Open Design Project to the existing R&D projects page', () => {
    render(
      <SectionHeader
        icon={Route}
        title="Design Projects"
        description="Controlled design projects"
        action="Open Design Project"
        actionHref="/design/rd-projects"
      />
    );

    expect(screen.getByRole('link', { name: /open design project/i })).toHaveAttribute(
      'href',
      '/design/rd-projects'
    );
  });
});
