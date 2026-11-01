#include <stdint.h>

/* Independently written browser platform renderer, not recovered match logic.
 * The caller projects geometry into screen pixels and clips at its near plane.
 * Vertex layout: five float32 values {x, y, positive camera depth, u, v}.
 * UVs are normalized, perspective-correct and clamped at texture edges.
 * Triangle indices are uint32 triples; colours are little-endian RGBA words.
 * Faces are double-sided. A 4-bit subpixel top-left rule avoids shared-edge
 * cracks. Inverse-depth testing persists across texture-group draw calls.
 */
#define MAX_VERTICES 16384u
#define MAX_TRIANGLES 32768u
#define MAX_SIDE 512u
#define MAX_PIXELS (MAX_SIDE * MAX_SIDE)
#define MAX_TEXTURE_PIXELS (1024u * 1024u)
#define MAX_FRAME_WORK UINT64_C(67108864)

typedef struct { float x, y, z, u, v; } Vertex;
typedef struct { int32_t x, y; } Point;
typedef struct { int32_t left, top, right, bottom; } Bounds;

static Vertex vertices[MAX_VERTICES];
static uint32_t indices[MAX_TRIANGLES * 3u];
static uint32_t colours[MAX_TRIANGLES];
static uint32_t texture[MAX_TEXTURE_PIXELS];
static uint32_t framebuffer[MAX_PIXELS];
static double depthbuffer[MAX_PIXELS];
static uint32_t frame_width;
static uint32_t frame_height;
static uint64_t frame_work;

float *fifa98_mesh_vertices(void) { return (float *)vertices; }
uint32_t *fifa98_mesh_indices(void) { return indices; }
uint32_t *fifa98_mesh_colours(void) { return colours; }
uint8_t *fifa98_mesh_texture(void) { return (uint8_t *)texture; }
uint8_t *fifa98_mesh_rgba(void) { return (uint8_t *)framebuffer; }
uint32_t fifa98_mesh_vertex_capacity(void) { return MAX_VERTICES; }
uint32_t fifa98_mesh_triangle_capacity(void) { return MAX_TRIANGLES; }
uint32_t fifa98_mesh_texture_capacity(void) { return MAX_TEXTURE_PIXELS; }

static int finite_bounded(float value) {
    return value == value && value >= -1000000.0f && value <= 1000000.0f;
}

static Point point(const Vertex *vertex) {
    float x = vertex->x * 16.0f;
    float y = vertex->y * 16.0f;
    Point result = { (int32_t)(x + (x < 0.0f ? -0.5f : 0.5f)),
                     (int32_t)(y + (y < 0.0f ? -0.5f : 0.5f)) };
    return result;
}

static int64_t edge(Point a, Point b, Point p) {
    return (int64_t)(b.x - a.x) * (p.y - a.y) -
           (int64_t)(b.y - a.y) * (p.x - a.x);
}

static int top_left(Point a, Point b) {
    return b.y < a.y || (b.y == a.y && b.x > a.x);
}

static int32_t minimum(int32_t a, int32_t b) { return a < b ? a : b; }
static int32_t maximum(int32_t a, int32_t b) { return a > b ? a : b; }
static int32_t floor16(int32_t value) {
    return value >= 0 ? value / 16 : -((15 - value) / 16);
}

static Bounds bounds(Point a, Point b, Point c, uint32_t width, uint32_t height) {
    int32_t min_x = minimum(a.x, minimum(b.x, c.x));
    int32_t min_y = minimum(a.y, minimum(b.y, c.y));
    int32_t max_x = maximum(a.x, maximum(b.x, c.x));
    int32_t max_y = maximum(a.y, maximum(b.y, c.y));
    Bounds result = {
        maximum(0, -floor16(8 - min_x)),
        maximum(0, -floor16(8 - min_y)),
        minimum((int32_t)width - 1, floor16(max_x - 8)),
        minimum((int32_t)height - 1, floor16(max_y - 8)),
    };
    return result;
}

/* Return errors before touching output: -1 frame, -2 capacities/texture,
 * -3 nonfinite/out-of-range/projected-behind-camera vertex, -4 index,
 * -5 per-frame clipped bounding-box work limit. */
static int preflight(uint32_t vertex_count, uint32_t triangle_count,
                     uint32_t width, uint32_t height,
                     uint32_t texture_width, uint32_t texture_height,
                     uint64_t *work) {
    if (!width || !height || width > MAX_SIDE || height > MAX_SIDE) return -1;
    if (vertex_count > MAX_VERTICES || triangle_count > MAX_TRIANGLES ||
        ((texture_width == 0) != (texture_height == 0)) ||
        texture_width > 1024 || texture_height > 1024 ||
        texture_width * texture_height > MAX_TEXTURE_PIXELS) return -2;
    for (uint32_t i = 0; i < vertex_count; ++i) {
        Vertex *v = &vertices[i];
        if (!finite_bounded(v->x) || !finite_bounded(v->y) ||
            !finite_bounded(v->z) || v->z < 0.000001f ||
            !finite_bounded(v->u) || !finite_bounded(v->v)) return -3;
    }
    *work = 0;
    for (uint32_t i = 0; i < triangle_count; ++i) {
        uint32_t a = indices[i * 3], b = indices[i * 3 + 1], c = indices[i * 3 + 2];
        if (a >= vertex_count || b >= vertex_count || c >= vertex_count) return -4;
        if (!(colours[i] >> 24)) continue;
        Point p = point(&vertices[a]), q = point(&vertices[b]), r = point(&vertices[c]);
        if (!edge(p, q, r)) continue;
        Bounds box = bounds(p, q, r, width, height);
        if (box.right < box.left || box.bottom < box.top) continue;
        *work += (uint64_t)(box.right - box.left + 1) * (box.bottom - box.top + 1);
        if (*work > MAX_FRAME_WORK) return -5;
    }
    return 0;
}

static uint32_t modulate(uint32_t sampled, uint32_t colour) {
    uint32_t result = 0;
    for (uint32_t shift = 0; shift < 32; shift += 8) {
        uint32_t value = (((sampled >> shift) & 255u) * ((colour >> shift) & 255u) + 127u) / 255u;
        result |= value << shift;
    }
    return result;
}

static uint32_t blend(uint32_t source, uint32_t destination) {
    uint32_t alpha = source >> 24;
    if (alpha == 255) return source;
    uint32_t inverse = 255 - alpha;
    uint32_t destination_weight = ((destination >> 24) * inverse + 127u) / 255u;
    uint32_t output_alpha = alpha + destination_weight;
    uint32_t result = output_alpha << 24;
    for (uint32_t shift = 0; shift < 24; shift += 8) {
        uint32_t value = (((source >> shift) & 255u) * alpha +
                          ((destination >> shift) & 255u) * destination_weight + output_alpha / 2u) / output_alpha;
        result |= value << shift;
    }
    return result;
}

static uint32_t sample(double u, double v, uint32_t width, uint32_t height) {
    uint32_t x = u <= 0.0 ? 0 : u >= 1.0 ? width - 1 : (uint32_t)(u * width);
    uint32_t y = v <= 0.0 ? 0 : v >= 1.0 ? height - 1 : (uint32_t)(v * height);
    return texture[y * width + x];
}

static int32_t rasterize(uint32_t triangle_count, uint32_t texture_width, uint32_t texture_height) {
    int32_t written = 0;
    for (uint32_t i = 0; i < triangle_count; ++i) {
        uint32_t colour = colours[i];
        if (!(colour >> 24)) continue;
        Vertex *a = &vertices[indices[i * 3]], *b = &vertices[indices[i * 3 + 1]], *c = &vertices[indices[i * 3 + 2]];
        Point pa = point(a), pb = point(b), pc = point(c);
        int64_t area = edge(pa, pb, pc);
        if (!area) continue;
        if (area < 0) {
            Vertex *swap_vertex = b; b = c; c = swap_vertex;
            Point swap_point = pb; pb = pc; pc = swap_point;
            area = -area;
        }
        Bounds box = bounds(pa, pb, pc, frame_width, frame_height);
        int include_a = top_left(pb, pc), include_b = top_left(pc, pa), include_c = top_left(pa, pb);
        double za = 1.0 / a->z, zb = 1.0 / b->z, zc = 1.0 / c->z;
        for (int32_t y = box.top; y <= box.bottom; ++y) {
            for (int32_t x = box.left; x <= box.right; ++x) {
                Point p = { x * 16 + 8, y * 16 + 8 };
                int64_t wa = edge(pb, pc, p), wb = edge(pc, pa, p), wc = edge(pa, pb, p);
                if (wa < 0 || (!wa && !include_a) || wb < 0 || (!wb && !include_b) || wc < 0 || (!wc && !include_c)) continue;
                uint32_t at = (uint32_t)y * frame_width + (uint32_t)x;
                double qa = (double)wa * za, qb = (double)wb * zb, qc = (double)wc * zc;
                double q = qa + qb + qc;
                double inverse_depth = q / (double)area;
                if (inverse_depth <= depthbuffer[at]) continue;
                uint32_t pixel = colour;
                if (texture_width) {
                    double u = (qa * a->u + qb * b->u + qc * c->u) / q;
                    double v = (qa * a->v + qb * b->v + qc * c->v) / q;
                    pixel = modulate(sample(u, v, texture_width, texture_height), colour);
                }
                if (!(pixel >> 24)) continue;
                framebuffer[at] = blend(pixel, framebuffer[at]);
                depthbuffer[at] = inverse_depth;
                ++written;
            }
        }
    }
    return written;
}

int32_t fifa98_mesh_begin(uint32_t width, uint32_t height, uint32_t clear_rgba) {
    if (!width || !height || width > MAX_SIDE || height > MAX_SIDE) return -1;
    frame_width = width; frame_height = height; frame_work = 0;
    for (uint32_t i = 0; i < width * height; ++i) {
        framebuffer[i] = clear_rgba;
        depthbuffer[i] = 0.0;
    }
    return 0;
}

int32_t fifa98_mesh_draw(uint32_t vertex_count, uint32_t triangle_count,
                         uint32_t texture_width, uint32_t texture_height) {
    uint64_t work;
    int error = preflight(vertex_count, triangle_count, frame_width, frame_height,
                          texture_width, texture_height, &work);
    if (error) return error;
    if (work > MAX_FRAME_WORK - frame_work) return -5;
    frame_work += work;
    return rasterize(triangle_count, texture_width, texture_height);
}

int32_t fifa98_render_mesh(uint32_t vertex_count, uint32_t triangle_count,
                           uint32_t width, uint32_t height,
                           uint32_t texture_width, uint32_t texture_height,
                           uint32_t clear_rgba) {
    uint64_t work;
    int error = preflight(vertex_count, triangle_count, width, height,
                          texture_width, texture_height, &work);
    if (error) return error;
    fifa98_mesh_begin(width, height, clear_rgba);
    frame_work = work;
    return rasterize(triangle_count, texture_width, texture_height);
}
