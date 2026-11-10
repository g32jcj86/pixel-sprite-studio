export interface Frame {
  pixels: string[];
  reference?: string[];
}
export interface Action {
  name: string;
  fps: number;
  loop: boolean;
  frames: Frame[];
}
export interface Project {
  id?: string;
  name: string;
  width: number;
  height: number;
  pivot: { x: number; y: number };
  palette: string[];
  actions: Action[];
}
