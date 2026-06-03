// 工具函数：矩阵运算、向量运算等

// ==================== 向量运算 ====================

/**
 * 向量加法
 */
function vec3Add(a, b) {
    return [a[0] + b[0], a[1] + b[1], a[2] + b[2]];
}

/**
 * 向量减法
 */
function vec3Sub(a, b) {
    return [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
}

/**
 * 向量数乘
 */
function vec3Scale(v, s) {
    return [v[0] * s, v[1] * s, v[2] * s];
}

/**
 * 向量点积
 */
function vec3Dot(a, b) {
    return a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
}

/**
 * 向量叉积
 */
function vec3Cross(a, b) {
    return [
        a[1] * b[2] - a[2] * b[1],
        a[2] * b[0] - a[0] * b[2],
        a[0] * b[1] - a[1] * b[0]
    ];
}

/**
 * 向量长度
 */
function vec3Length(v) {
    return Math.sqrt(v[0] * v[0] + v[1] * v[1] + v[2] * v[2]);
}

/**
 * 向量归一化
 */
function vec3Normalize(v) {
    const len = vec3Length(v);
    if (len < 0.0001) return [0, 0, 0];
    return [v[0] / len, v[1] / len, v[2] / len];
}

/**
 * 向量复制
 */
function vec3Copy(v) {
    return [v[0], v[1], v[2]];
}

// ==================== 矩阵运算 ====================

/**
 * 创建LookAt视图矩阵
 * @param {Array<number>} eye - 相机位置 [x, y, z]
 * @param {Array<number>} target - 目标点 [x, y, z]
 * @param {Array<number>} up - 上向量 [x, y, z]
 * @returns {Array<number>} 4x4视图矩阵
 */
function mat4LookAt(eye, target, up) {
    const z = vec3Normalize(vec3Sub(eye, target));
    const x = vec3Normalize(vec3Cross(up, z));
    const y = vec3Cross(z, x);
    
    return [
        x[0], y[0], z[0], 0,
        x[1], y[1], z[1], 0,
        x[2], y[2], z[2], 0,
        -vec3Dot(x, eye), -vec3Dot(y, eye), -vec3Dot(z, eye), 1
    ];
}

/**
 * 创建透视投影矩阵
 * @param {number} fov - 视野角度（弧度）
 * @param {number} aspect - 宽高比
 * @param {number} near - 近平面距离
 * @param {number} far - 远平面距离
 * @returns {Array<number>} 4x4投影矩阵
 */
function mat4Perspective(fov, aspect, near, far) {
    const f = 1.0 / Math.tan(fov / 2);
    const rangeInv = 1.0 / (near - far);
    
    return [
        f / aspect, 0, 0, 0,
        0, f, 0, 0,
        0, 0, (near + far) * rangeInv, -1,
        0, 0, near * far * rangeInv * 2, 0
    ];
}

// ==================== 工具函数 ====================

/**
 * 角度转弧度
 */
function degToRad(deg) {
    return deg * Math.PI / 180;
}

/**
 * 限制数值范围
 */
function clamp(value, min, max) {
    return Math.min(Math.max(value, min), max);
}
