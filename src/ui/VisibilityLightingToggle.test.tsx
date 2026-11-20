// @vitest-environment jsdom
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, expect, it } from 'vitest';
import { setLocale } from '../i18n';
import { setVisibilityLighting } from '../scene/visibilityLighting';
import { VisibilityLightingToggle } from './VisibilityLightingToggle';

beforeEach(() => { setVisibilityLighting(false); setLocale('en'); });
afterEach(() => { cleanup(); setVisibilityLighting(false); });

it('is opt-in and synchronizes across controls and document remounts', () => {
  const view = render(<><VisibilityLightingToggle /><VisibilityLightingToggle /></>);
  const buttons = screen.getAllByRole('button', { name: 'Visibility lighting' });
  expect(buttons.every(button => button.getAttribute('aria-pressed') === 'false')).toBe(true);
  fireEvent.click(buttons[0]);
  expect(buttons.every(button => button.getAttribute('aria-pressed') === 'true')).toBe(true);
  view.rerender(<VisibilityLightingToggle key="another-document" />);
  expect(screen.getByRole('button').getAttribute('aria-pressed')).toBe('true');
  fireEvent.click(screen.getByRole('button'));
  expect(screen.getByRole('button').getAttribute('aria-pressed')).toBe('false');
});

it('translates the control without changing its enabled state', () => {
  render(<VisibilityLightingToggle />);
  fireEvent.click(screen.getByRole('button'));
  act(() => setLocale('fr'));
  expect(screen.getByRole('button', { name: 'Éclairage de visibilité' }).getAttribute('aria-pressed')).toBe('true');
});
