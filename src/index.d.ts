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
  dotSize?: number;
  baseColor: [number, number, number];
  landColor: [number, number, number];
  markerColor: [number, number, number];
  markers: Marker[];
  devicePixelRatio: number;
  offset?: [number, number];
  scale?: number;
  range?: number;
  rangeColor?: [number, number, number];
  rangeOpacity?: number;
  selectedMarker?: number | null;
  onMarkerSelect?: (index: number | null, marker: Marker | null) => void;
  context?: WebGLContextAttributes;
}

export default function createGlobe(
  canvas: HTMLCanvasElement,
  opts: COBEOptions,
): Phenomenon;
