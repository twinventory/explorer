// @vitest-environment jsdom
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, expect, it, vi } from 'vitest';
import { createSpatialDocument } from '../model/createSpatialDocument';
import type { SpatialDocument } from '../model/SpatialDocument';
import { useSimulation } from './useSimulation';
import { SimulationControls } from './SimulationControls';
afterEach(() => { cleanup(); vi.unstubAllGlobals(); });
const source = '"Block/+0+1/+1+1/+0+1":"body: rigid; mass: 2"';
function Harness({ document }: { document: SpatialDocument }) {
  const runtime = useSimulation(document);
  return <><SimulationControls runtime={runtime}/><output data-testid="height">{runtime.document.renderNodes[0]?.transform.position[1]}</output></>;
}
it('steps, resets and resets on source change without mutating authored state', () => {
  const document = createSpatialDocument(source);
  const view = render(<Harness document={document}/>);
  fireEvent.click(screen.getByText('Step'));
  expect(Number(screen.getByTestId('height').textContent)).toBeLessThan(1.5);
  expect(document.renderNodes[0].transform.position[1]).toBe(1.5);
  fireEvent.click(screen.getByText('Reset'));
  expect(Number(screen.getByTestId('height').textContent)).toBe(1.5);
  fireEvent.click(screen.getByText('Step'));
  view.rerender(<Harness document={createSpatialDocument(source.replace('/+1+1/', '/+2+1/'))}/>);
  expect(Number(screen.getByTestId('height').textContent)).toBe(2.5);
  expect(screen.getByText('Play')).toBeTruthy();
});
it('plays, pauses and cancels animation on unmount', () => {
  let callback: FrameRequestCallback = () => {};
  const cancel = vi.fn();
  vi.stubGlobal('requestAnimationFrame', vi.fn(fn => { callback = fn; return 1; }));
  vi.stubGlobal('cancelAnimationFrame', cancel);
  const view = render(<Harness document={createSpatialDocument(source)}/>);
  fireEvent.click(screen.getByText('Play'));
  act(() => callback(100));
  act(() => callback(150));
  expect(Number(screen.getByTestId('height').textContent)).toBeLessThan(1.5);
  fireEvent.click(screen.getByText('Pause'));
  expect(cancel).toHaveBeenCalled();
  fireEvent.click(screen.getByText('Play'));
  view.unmount();
  expect(cancel).toHaveBeenCalledTimes(2);
});
