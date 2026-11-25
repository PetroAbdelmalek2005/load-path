// Example house for trying the app: basement and ground floor, 8.0 m × 6.0 m, a centre beam on two posts.
// All elements are assumed. Not a real project.
import { addBeam, addLevel, addOpening, addPost, addSurface, addWall, newProject } from './edits';
import type { SectionTable } from './geometry';
import type { Project } from './types';

export function exampleHouse(tables: SectionTable): Project {
  const p = newProject('Example house (sample data)');
  p.info.address = 'Sample only';
  const ground = p.levels[0]!;
  const bsmt = addLevel(p, ground.id, 'below', 'Basement');
  bsmt.wallHeight = 2440;
  bsmt.elevation = -(2440 + ground.floorDepth);
  const W = 8000;
  const D = 6000;
  const rect = [
    [0, 0, W, 0],
    [W, 0, W, D],
    [W, D, 0, D],
    [0, D, 0, 0],
  ] as const;
  for (const [x1, y1, x2, y2] of rect) addWall(p, bsmt.id, { x: x1, y: y1 }, { x: x2, y: y2 }, { bearing: true, thickness: 200, studSize: '2x6', notes: 'Foundation wall (shown as a wall until foundations arrive).' });
  const gw = rect.map(([x1, y1, x2, y2]) => addWall(p, ground.id, { x: x1, y: y1 }, { x: x2, y: y2 }, { bearing: true }));
  addSurface(p, ground.id, 'floor', [
    { x: 0, y: 0 },
    { x: W, y: 0 },
    { x: W, y: D },
    { x: 0, y: D },
  ], { spanDirection: 90, joistSize: '2x10', joistSpacing: 406 });
  addBeam(p, ground.id, { x: 0, y: D / 2 }, { x: W, y: D / 2 }, tables, { elevationMode: 'flush', label: 'B1' });
  addPost(p, bsmt.id, { x: W / 3, y: D / 2 }, tables, 1);
  addPost(p, bsmt.id, { x: (2 * W) / 3, y: D / 2 }, tables, 1);
  addOpening(p, gw[0]!.id, 2500, 1830, tables);
  addSurface(p, ground.id, 'roof', [
    { x: 0, y: 0 },
    { x: W, y: 0 },
    { x: W, y: D },
    { x: 0, y: D },
  ], { pitch: 26.6, ridgeDirection: 0 });
  return p;
}
