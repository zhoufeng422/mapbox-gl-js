// This shader implements a simple geometry instancing using uniform vector arrays. Per-circle data is stored
// in u_quads array (circles are rendered as quads) which is then referenced by vertices of different quads.
//
// It is possible to deduce all variables required to render sequential quads by using a single incremental
// index value as the only vertex data. If one quad uses 4 vertices then index of the quad can be found
// quad_idx = floor(vertex.idx / 4) and vertex_idx = vertex.idx % 4.
//
// 1    2   vertex offsets:
// *----*   0: vec2(-1, -1)
// |   /|   1: vec2(-1, 1)
// |  / |   2: vec2(1, 1)
// | /  |   3: vec2(1, -1)
// |/   |
// *----*
// 0    3
//

attribute vec2 a_idx;

uniform mat4 u_matrix;
uniform mat4 u_invMatrix;
uniform vec2 u_viewport_size;
uniform float u_camera_to_center_distance;

// Rendering information of each quad is packed into a single uniform array.
// NOTE: all values are in screen space (ie. in pixels) already!
// x: center_x
// y: center_y
// z: radius
// w: collision flag [0, 1]
uniform vec4 u_quads[64];

varying float v_radius;
varying vec2 v_extrude;
varying float v_perspective_ratio;
varying float v_collision;

vec3 toTilePosition(vec2 screenPos) {
    // Shoot a ray towards the ground to reconstruct the depth-value
    vec4 rayStart = u_invMatrix * vec4(screenPos, -1.0, 1.0);
    vec4 rayEnd   = u_invMatrix * vec4(screenPos,  1.0, 1.0);

    rayStart.xyz /= rayStart.w;
    rayEnd.xyz   /= rayEnd.w;

    highp float t = (0.0 - rayStart.z) / (rayEnd.z - rayStart.z);
    return mix(rayStart.xyz, rayEnd.xyz, t);
}

void main() {

    highp float vertexIdx = mod(a_idx.x, 4.0);

    // Get the quad this vertex belongs to
    vec4 quad = u_quads[int(floor(a_idx.x / 4.0))];

    vec2 quadCenterPos = quad.xy;
    highp float radius = quad.z;
    highp float collision = quad.w;

    vec2 quadVertexOffset = vec2(
        mix(-1.0, 1.0, float(vertexIdx >= 2.0)),
        mix(-1.0, 1.0, float(vertexIdx >= 1.0 && vertexIdx <= 2.0)));

    vec2 quadVertexExtent = quadVertexOffset * radius;

    // Screen position of the quad might have been computed with different camera parameters.
    // Transform the point to a proper position on the current viewport
    vec3 tilePos = toTilePosition(quadCenterPos);
    vec4 clipPos = u_matrix * vec4(tilePos, 1.0);

    highp float camera_to_anchor_distance = clipPos.w;
    highp float collision_perspective_ratio = clamp(
        0.5 + 0.5 * (u_camera_to_center_distance / camera_to_anchor_distance),
        0.0, // Prevents oversized near-field circles in pitched/overzoomed tiles
        4.0);

    // Apply small padding for the anti-aliasing effect to fit the quad
    // Note that v_radius and v_extrude are in screen coordinates already
    float padding_factor = 1.2;
    v_radius = radius;
    v_extrude = quadVertexExtent * padding_factor;
    v_perspective_ratio = collision_perspective_ratio;
    v_collision = collision;

    gl_Position = vec4(clipPos.xyz / clipPos.w, 1.0) + vec4(quadVertexExtent * padding_factor / u_viewport_size * 2.0, 0.0, 0.0);
}
