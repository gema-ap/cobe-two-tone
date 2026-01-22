import type Phenomenon from "phenomenon";

export interface Marker {
  location: [number, number];
  size: number;
  color?: [number, number, number];
}

export interface COBEOptions {
  width: number;
  height: number;
  onRender: (state: Record<string, any>) => void;
  phi: number;
  theta: number;
  mapSamples: number;
  baseColor: [number, number, number];
  landColor: [number, number, number];
  markerColor: [number, number, number];
  markers: Marker[];
  devicePixelRatio: number;
  opacity?: number;
  offset?: [number, number];
  scale?: number;
  context?: WebGLContextAttributes;
}

export default function createGlobe(
  canvas: HTMLCanvasElement,
  opts: COBEOptions,
): Phenomenon;
