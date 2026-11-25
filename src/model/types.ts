// Building model data. All lengths in mm. Plan coordinates x (east), y (north). Elevations in mm,
// with 0 = top of the ground-floor subfloor (DECISIONS.md 2026-11-25).

export const SCHEMA_VERSION = 1;
export const APP_ID = 'spanwise';

export type Status = 'verified' | 'assumed';
export type Lifecycle = 'existing' | 'new' | 'remove';

export interface Pt {
  x: number;
  y: number;
}

export interface SectionRef {
  species: string;
  size: string; // e.g. "2x10"
  plies: number;
}

export interface Level {
  id: string;
  name: string;
  /** Top of this level's subfloor, mm. */
  elevation: number;
  /** Wall height on this level, mm (bottom of bottom plate to top of top plates). */
  wallHeight: number;
  /** Joists plus subfloor, mm. */
  floorDepth: number;
}

interface ElementBase {
  id: string;
  levelId: string;
  label: string;
  status: Status;
  lifecycle: Lifecycle;
  notes: string;
}

export interface Wall extends ElementBase {
  kind: 'wall';
  /** Centreline end points. */
  a: Pt;
  b: Pt;
  thickness: number;
  height: number;
  studSize: string;
  studSpacing: number;
  plates: number;
  /** Engineer's choice. Never overwritten without asking. */
  bearing: boolean;
}

export type BeamRole = 'beam' | 'header' | 'girder';
export type ElevationMode = 'flush' | 'dropped' | 'custom';

export interface Beam extends ElementBase {
  kind: 'beam';
  role: BeamRole;
  a: Pt;
  b: Pt;
  section: SectionRef;
  /** How the top-of-beam elevation is set. Flush and dropped are relative to the floor of this beam's level. */
  elevationMode: ElevationMode;
  /** Top of beam, mm. Used when elevationMode is 'custom'; otherwise kept in step by the edit operations. */
  topElevation: number;
  /** Bearing length at each end, mm, if known. */
  bearingA: number | null;
  bearingB: number | null;
  /** For headers created by an opening. */
  openingId: string | null;
}

export interface Post extends ElementBase {
  kind: 'post';
  at: Pt;
  section: SectionRef;
  /** Element the post stands on (wall or beam). Null = the floor of the post's level. */
  baseId: string | null;
  /** Beam the post supports. Null = none yet (top defaults to the level's wall height). */
  supportsId: string | null;
}

export type SurfaceRole = 'floor' | 'roof';

export interface Surface extends ElementBase {
  kind: 'surface';
  role: SurfaceRole;
  polygon: Pt[];
  /** Joist span direction in plan, degrees counter-clockwise from east. */
  spanDirection: number;
  joistSize: string | null;
  joistSpacing: number | null;
  /** Roof only. Degrees. */
  pitch: number | null;
  /** Roof only. Ridge direction in plan, degrees counter-clockwise from east. */
  ridgeDirection: number | null;
}

export interface Opening extends ElementBase {
  kind: 'opening';
  wallId: string;
  /** Distance along the wall from end a to the opening's near edge, mm. */
  offset: number;
  width: number;
  height: number;
  sill: number;
  headerId: string | null;
}

export type Element = Wall | Beam | Post | Surface | Opening;
export type ElementKind = Element['kind'];

export type BareUnit = 'mm' | 'm' | 'in' | 'ft';

export interface DrawingDefaults {
  mode: 'existing' | 'new';
  bareUnit: BareUnit;
  snapPx: number;
  grid: number; // mm
  studSize: string;
  studSpacing: number;
  plates: number;
  wallThickness: number;
  beamSection: SectionRef;
  postSection: SectionRef;
  headerSection: SectionRef;
  headerBearing: number; // mm, one jack stud
  openingHeight: number;
  plateThickness: number;
}

export interface ProjectInfo {
  name: string;
  address: string;
  municipality: string;
  codeEdition: string;
  engineer: string;
  occupancy: string;
}

export interface Project {
  id: string;
  info: ProjectInfo;
  defaults: DrawingDefaults;
  levels: Level[];
  elements: Element[];
}

export type ModelGate = 'unconfirmed' | 'confirmed';

export interface SavedFile {
  app: typeof APP_ID;
  schemaVersion: number;
  savedAt: string;
  gate: ModelGate;
  project: Project;
}
