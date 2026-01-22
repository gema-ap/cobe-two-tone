import Phenomenon from "phenomenon";

const OPT_PHI = "phi";
const OPT_THETA = "theta";
const OPT_DOTS = "mapSamples";
const OPT_DOT_SIZE = "dotSize";
const OPT_BASE_COLOR = "baseColor";
const OPT_LAND_COLOR = "landColor";
const OPT_MARKER_COLOR = "markerColor";
const OPT_MARKERS = "markers";
const OPT_DPR = "devicePixelRatio";
const OPT_OFFSET = "offset";
const OPT_SCALE = "scale";
const OPT_RANGE = "range";
const OPT_RANGE_COLOR = "rangeColor";
const OPT_RANGE_OPACITY = "rangeOpacity";
const OPT_SELECTED_MARKER = "selectedMarker";

const EARTH_RADIUS_KM = 6371;

const OPT_MAPPING = {
    [OPT_PHI]: GLSLX_NAME_PHI,
    [OPT_THETA]: GLSLX_NAME_THETA,
    [OPT_DOTS]: GLSLX_NAME_DOTS,
    [OPT_DOT_SIZE]: GLSLX_NAME_DOT_SIZE,
    [OPT_BASE_COLOR]: GLSLX_NAME_BASE_COLOR,
    [OPT_LAND_COLOR]: GLSLX_NAME_LAND_COLOR,
    [OPT_MARKER_COLOR]: GLSLX_NAME_MARKER_COLOR,
    [OPT_OFFSET]: GLSLX_NAME_OFFSET,
    [OPT_SCALE]: GLSLX_NAME_SCALE,
    [OPT_RANGE_COLOR]: GLSLX_NAME_RANGE_COLOR,
    [OPT_RANGE_OPACITY]: GLSLX_NAME_RANGE_OPACITY,
};

const { PI, sin, cos, sqrt, atan2, floor, max, pow, log2 } = Math;

// Constants matching shader
const sqrt5 = 2.23606797749979;
const kPhi = 1.618033988749895;
const byLogPhiPlusOne = 0.7202100452062783;
const kTau = 6.283185307179586;
const twoPiOnPhi = 3.8832220774509327;
const phiMinusOne = 0.618033988749895;

// Optimized nearestFibonacciLattice implementation
const nearestFibonacciLattice = (p, d) => {
    const q = [p[0], p[2], p[1]], b = 1 / d;
    const k = max(2, floor(log2(sqrt5 * d * PI * (1 - q[2] * q[2])) * byLogPhiPlusOne));
    const pk = pow(kPhi, k) / sqrt5;
    const f = [floor(pk + .5), floor(pk * kPhi + .5)];
    const r1 = [((f[0] + 1) * phiMinusOne) % 1 * kTau - twoPiOnPhi, ((f[1] + 1) * phiMinusOne) % 1 * kTau - twoPiOnPhi];
    const r2 = [-2 * f[0], -2 * f[1]];
    const sp = [atan2(q[1], q[0]), q[2] - 1];
    const dt = r1[0] * r2[1] - r2[0] * r1[1];
    const c = [floor((r2[1] * sp[0] - r1[1] * (sp[1] * d + 1)) / dt), floor((-r2[0] * sp[0] + r1[0] * (sp[1] * d + 1)) / dt)];
    
    let md = PI, mp = [0, 0, 0];
    for (let s = 0; s < 4; s++) {
        const i = f[0] * (c[0] + s % 2) + f[1] * (c[1] + floor(s * .5));
        if (i > d) continue;
        const t = ((i * phiMinusOne) % 1) * kTau, cp = 1 - 2 * i * b, sp = sqrt(1 - cp * cp);
        const sm = [cos(t) * sp, sin(t) * sp, cp];
        const ds = sqrt((q[0] - sm[0]) ** 2 + (q[1] - sm[1]) ** 2 + (q[2] - sm[2]) ** 2);
        if (ds < md) md = ds, mp = sm;
    }
    return [mp[0], mp[2], mp[1]];
};

// Convert lat/lon to 3D position on unit sphere
const latLonToPos = (lat, lon) => {
    const a = lat * PI / 180;
    const b = lon * PI / 180 - PI;
    const c = cos(a);
    return [-c * cos(b), sin(a), c * sin(b)];
};

// Convert range in km to chord distance on unit sphere
const rangeToChord = (rangeKm) => {
    const angle = rangeKm / EARTH_RADIUS_KM;
    return 2 * sin(angle / 2);
};

// Rotation matrix (matches shader)
const createRotationMatrix = (theta, phi) => {
    const cx = cos(theta), cy = cos(phi);
    const sx = sin(theta), sy = sin(phi);
    return [
        [cy, sy * sx, -sy * cx],
        [0, cx, sx],
        [sy, -cy * sx, cy * cx]
    ];
};

// Apply rotation matrix to vector
const applyRotation = (rot, v) => [
    rot[0][0]*v[0] + rot[0][1]*v[1] + rot[0][2]*v[2],
    rot[1][0]*v[0] + rot[1][1]*v[1] + rot[1][2]*v[2],
    rot[2][0]*v[0] + rot[2][1]*v[1] + rot[2][2]*v[2]
];

// Get marker lattice position
const getMarkerLatticePos = (lat, lon, dots) => {
    const p = latLonToPos(lat, lon);
    return nearestFibonacciLattice(p, dots);
};

const mapMarkers = (ms, d) => [].concat(...ms.map(m => {
    const [lat, lon] = m.location;
    const p = latLonToPos(lat, lon);
    const l = nearestFibonacciLattice(p, d);
    return [...l, m.size, ...(m.color ? [...m.color, 1] : [0, 0, 0, 0])];
}), [0, 0, 0, 0, 0, 0, 0, 0]);

export default (canvas, opts) => {
    const createUniform = (type, name, fallback) => {
        return {
            type,
            value: typeof opts[name] === "undefined" ? fallback : opts[name],
        };
    };

    // Track current state for click handling
    const currentState = {
        phi: opts[OPT_PHI] || 0,
        theta: opts[OPT_THETA] || 0,
        scale: opts[OPT_SCALE] || 1,
        offset: opts[OPT_OFFSET] || [0, 0],
        markers: opts[OPT_MARKERS] || [],
        dots: opts[OPT_DOTS] || 16000,
        selectedMarker: null,
    };

    // See https://github.com/shuding/cobe/pull/34.
    const contextType = canvas.getContext("webgl2")
        ? "webgl2"
        : canvas.getContext("webgl")
          ? "webgl"
          : "experimental-webgl";

    const p = new Phenomenon({
        canvas,
        contextType,
        context: {
            alpha: true,
            stencil: false,
            antialias: true,
            depth: false,
            preserveDrawingBuffer: false,
            ...opts.context,
        },
        settings: {
            [OPT_DPR]: opts[OPT_DPR] || 1,
            onSetup: (gl) => {
                const RGBFormat = gl.RGB;
                const srcType = gl.UNSIGNED_BYTE;
                const TEXTURE_2D = gl.TEXTURE_2D;

                const texture = gl.createTexture();
                gl.bindTexture(TEXTURE_2D, texture);
                gl.texImage2D(
                    TEXTURE_2D,
                    0,
                    RGBFormat,
                    1,
                    1,
                    0,
                    RGBFormat,
                    srcType,
                    new Uint8Array([0, 0, 0, 0]),
                );

                const image = new Image();
                image.onload = () => {
                    gl.bindTexture(TEXTURE_2D, texture);
                    gl.texImage2D(
                        TEXTURE_2D,
                        0,
                        RGBFormat,
                        RGBFormat,
                        srcType,
                        image,
                    );

                    gl.generateMipmap(TEXTURE_2D);

                    const program = gl.getParameter(gl.CURRENT_PROGRAM);
                    const textureLocation = gl.getUniformLocation(
                        program,
                        GLSLX_NAME_U_TEXTURE,
                    );
                    gl.texParameteri(
                        TEXTURE_2D,
                        gl.TEXTURE_MIN_FILTER,
                        gl.NEAREST,
                    );
                    gl.texParameteri(
                        TEXTURE_2D,
                        gl.TEXTURE_MAG_FILTER,
                        gl.NEAREST,
                    );
                    gl.uniform1i(textureLocation, 0);
                };
                image.src = __TEXTURE__;
            },
        },
    });

    p.add("", {
        vertex: `attribute vec3 aPosition;uniform mat4 uProjectionMatrix;uniform mat4 uModelMatrix;uniform mat4 uViewMatrix;void main(){gl_Position=uProjectionMatrix*uModelMatrix*uViewMatrix*vec4(aPosition,1.);}`,
        fragment: GLSLX_SOURCE_MAIN,
        uniforms: {
            [GLSLX_NAME_U_RESOLUTION]: {
                type: "vec2",
                value: [opts.width, opts.height],
            },
            [GLSLX_NAME_PHI]: createUniform("float", OPT_PHI),
            [GLSLX_NAME_THETA]: createUniform("float", OPT_THETA),
            [GLSLX_NAME_DOTS]: createUniform("float", OPT_DOTS),
            [GLSLX_NAME_DOT_SIZE]: createUniform("float", OPT_DOT_SIZE, 0.008),
            [GLSLX_NAME_BASE_COLOR]: createUniform("vec3", OPT_BASE_COLOR),
            [GLSLX_NAME_LAND_COLOR]: createUniform("vec3", OPT_LAND_COLOR),
            [GLSLX_NAME_MARKER_COLOR]: createUniform("vec3", OPT_MARKER_COLOR),
            [GLSLX_NAME_MARKERS]: {
                type: "vec4",
                value: mapMarkers(opts[OPT_MARKERS], opts[OPT_DOTS]),
            },
            [GLSLX_NAME_MARKERS_NUM]: {
                type: "float",
                value: opts[OPT_MARKERS].length * 2,
            },
            [GLSLX_NAME_OFFSET]: createUniform("vec2", OPT_OFFSET, [0, 0]),
            [GLSLX_NAME_SCALE]: createUniform("float", OPT_SCALE, 1),
            [GLSLX_NAME_RANGE_COLOR]: createUniform("vec3", OPT_RANGE_COLOR, [1, 0.5, 0]),
            [GLSLX_NAME_RANGE_OPACITY]: createUniform("float", OPT_RANGE_OPACITY, 1),
            [GLSLX_NAME_RANGE_RADIUS]: {
                type: "float",
                value: rangeToChord(opts[OPT_RANGE] || 0),
            },
            [GLSLX_NAME_SELECTED_MARKER_POS]: {
                type: "vec3",
                value: [0, 0, 0],
            },
            [GLSLX_NAME_HAS_SELECTION]: {
                type: "float",
                value: 0,
            },
        },
        mode: 4,
        geometry: {
            vertices: [
                { x: -100, y: 100, z: 0 },
                { x: -100, y: -100, z: 0 },
                { x: 100, y: 100, z: 0 },
                { x: 100, y: -100, z: 0 },
                { x: -100, y: -100, z: 0 },
                { x: 100, y: 100, z: 0 },
            ],
        },
        onRender: ({ uniforms }) => {
            let state = {};
            if (opts.onRender) {
                state = opts.onRender(state) || state;
                for (const k in OPT_MAPPING) {
                    if (state[k] !== undefined) {
                        uniforms[OPT_MAPPING[k]].value = state[k];
                    }
                }
                if (state[OPT_MARKERS] !== undefined) {
                    // Get current dots value from state or existing uniform
                    const currentDots = state[OPT_DOTS] !== undefined ? state[OPT_DOTS] : uniforms[GLSLX_NAME_DOTS].value;
                    uniforms[GLSLX_NAME_MARKERS].value = mapMarkers(
                        state[OPT_MARKERS],
                        currentDots
                    );
                    uniforms[GLSLX_NAME_MARKERS_NUM].value =
                        state[OPT_MARKERS].length;
                }
                if (state.width && state.height) {
                    uniforms[GLSLX_NAME_U_RESOLUTION].value = [
                        state.width,
                        state.height,
                    ];
                }
                if (state[OPT_DOTS] !== undefined) {
                    // Remap markers when dots change
                    uniforms[GLSLX_NAME_MARKERS].value = mapMarkers(
                        state[OPT_MARKERS] || opts[OPT_MARKERS],
                        state[OPT_DOTS]
                    );
                }
                // Handle range updates
                if (state[OPT_RANGE] !== undefined) {
                    uniforms[GLSLX_NAME_RANGE_RADIUS].value = rangeToChord(state[OPT_RANGE]);
                }
                // Handle marker selection
                if (state[OPT_SELECTED_MARKER] !== undefined) {
                    currentState.selectedMarker = state[OPT_SELECTED_MARKER];
                }

                // Update selection uniforms
                const idx = currentState.selectedMarker;
                const markers = currentState.markers;
                if (idx !== null && idx >= 0 && idx < markers.length) {
                    const marker = markers[idx];
                    // Use lattice-snapped position to match marker rendering
                    const pos = getMarkerLatticePos(marker.location[0], marker.location[1], currentState.dots);
                    uniforms[GLSLX_NAME_SELECTED_MARKER_POS].value = pos;
                    uniforms[GLSLX_NAME_HAS_SELECTION].value = 1;
                } else {
                    uniforms[GLSLX_NAME_HAS_SELECTION].value = 0;
                }

                // Track state for click handling
                if (state[OPT_PHI] !== undefined) currentState.phi = state[OPT_PHI];
                if (state[OPT_THETA] !== undefined) currentState.theta = state[OPT_THETA];
                if (state[OPT_SCALE] !== undefined) currentState.scale = state[OPT_SCALE];
                if (state[OPT_OFFSET] !== undefined) currentState.offset = state[OPT_OFFSET];
                if (state[OPT_MARKERS] !== undefined) currentState.markers = state[OPT_MARKERS];
                if (state[OPT_DOTS] !== undefined) currentState.dots = state[OPT_DOTS];
            }
        },
    });

    // Click handler for marker selection
    const r = 0.8; // Globe radius (matches shader)
    const handleClick = (e) => {
        const rect = canvas.getBoundingClientRect();
        const x = (e.clientX - rect.left) / rect.width;
        const y = (e.clientY - rect.top) / rect.height;

        // Match shader UV calculation exactly:
        // vec2 uv = ((gl_FragCoord.xy * invResolution) * 2. - 1.) / scale - offset * vec2(1, -1) * invResolution;
        // uv.x *= uResolution.x * invResolution.y;
        // Note: gl_FragCoord.y is 0 at bottom, but clientY is 0 at top - must flip Y
        const scale = currentState.scale;
        const [offsetX, offsetY] = currentState.offset;
        const width = opts.width;
        const height = opts.height;
        const aspect = width / height;

        let uvX = (x * 2 - 1) / scale - offsetX / width;
        let uvY = (1 - 2 * y) / scale + offsetY / height; // Flipped Y to match shader coords
        uvX *= aspect;

        const l = uvX * uvX + uvY * uvY;

        if (l <= r * r) {
            // Point is on globe - compute 3D position
            const z = sqrt(r * r - l);
            const len = sqrt(uvX * uvX + uvY * uvY + z * z);
            const point = [uvX / len, uvY / len, z / len];

            // Apply rotation (same as shader: p * rot)
            const rot = createRotationMatrix(currentState.theta, currentState.phi);
            const rP = applyRotation(rot, point);

            // Check each marker using lattice-snapped positions
            let closestIdx = null;
            let closestDist = Infinity;
            const markers = currentState.markers;
            const dots = currentState.dots;

            for (let i = 0; i < markers.length; i++) {
                const pos = getMarkerLatticePos(markers[i].location[0], markers[i].location[1], dots);
                const dx = rP[0] - pos[0], dy = rP[1] - pos[1], dz = rP[2] - pos[2];
                const dist = sqrt(dx * dx + dy * dy + dz * dz);
                if (dist < markers[i].size && dist < closestDist) {
                    closestDist = dist;
                    closestIdx = i;
                }
            }

            currentState.selectedMarker = closestIdx;

            // Call optional callback
            if (opts.onMarkerSelect) {
                opts.onMarkerSelect(closestIdx, closestIdx !== null ? markers[closestIdx] : null);
            }
        } else {
            // Clicked outside globe - deselect
            currentState.selectedMarker = null;
            if (opts.onMarkerSelect) {
                opts.onMarkerSelect(null, null);
            }
        }
    };

    canvas.addEventListener('click', handleClick);

    // Extend the Phenomenon instance with cleanup
    const originalDestroy = p.destroy.bind(p);
    p.destroy = () => {
        canvas.removeEventListener('click', handleClick);
        originalDestroy();
    };

    return p;
};
