// 着色器编译和程序管理

// 顶点着色器源码（内联）
const VERTEX_SHADER_SOURCE = `// 全屏四边形顶点着色器
attribute vec2 a_position;

void main() {
    gl_Position = vec4(a_position, 0.0, 1.0);
}`;

// 片段着色器源码（内联）
const FRAGMENT_SHADER_SOURCE = `// GPU光线追踪片段着色器（仅环境光版本）
precision highp float;

uniform vec2 u_resolution;
uniform float u_time;
uniform vec3 u_cameraPos;
uniform vec3 u_cameraDir;
uniform vec3 u_cameraUp;
uniform vec3 u_cameraRight;
uniform float u_fov;

// 场景参数
uniform float u_roomSize;

// 雾化参数
uniform float u_fogDensity;
uniform vec3 u_fogColor;

// 性能参数
uniform int u_samples;  // 反走样采样数（1或2）

// 环境光强度（唯一光照项）
uniform float u_ambientStrength;

// 纹理uniform
uniform sampler2D u_floorTexture;
uniform sampler2D u_wallTexture;
uniform sampler2D u_ceilingTexture;
uniform vec2 u_floorTileScale;
uniform vec2 u_wallTileScale;
uniform vec2 u_ceilingTileScale;

// Hero位置
uniform vec3 u_heroPosition;

// 视角模式
uniform float u_viewMode;

// 聚光灯光源参数
uniform vec3 u_lightPosition;      // 光源位置
uniform vec3 u_lightDirection;      // 光源方向（归一化）
uniform float u_lightIntensity;     // 光源基础强度Z
uniform float u_lightMaxAngle;      // 最大照射角度（弧度，30度）
uniform float u_volumetricLightMaxIntensity;  // 体积光束强度上限G
uniform bool u_volumetricLightEnabled;  // 体积光束效果开关
uniform bool u_mengerSpongeEnabled;  // Menger海绵显示开关

// ==================== 材质定义 ====================
struct Material {
    int type;  // 0: diffuse, 3: multiFaceCube
    vec3 color;
    float roughness;
    float ior;  // 折射率
};

/**
 * 根据法线方向获取立方体的6面颜色
 * normal: 表面法线（归一化）
 */
vec3 getCubeFaceColor(vec3 normal) {
    vec3 absN = abs(normal);
    // 6个面的颜色：+X(红), -X(绿), +Y(黄), -Y(青), +Z(紫), -Z(橙)
    if (absN.x > absN.y && absN.x > absN.z) {
        return normal.x > 0.0 ? vec3(1.0, 0.2, 0.2) : vec3(0.2, 1.0, 0.2);  // +X红色, -X绿色
    } else if (absN.y > absN.z) {
        return normal.y > 0.0 ? vec3(1.0, 1.0, 0.2) : vec3(0.2, 1.0, 1.0);  // +Y黄色, -Y青色
    } else {
        return normal.z > 0.0 ? vec3(1.0, 0.2, 1.0) : vec3(1.0, 0.6, 0.2);  // +Z紫色, -Z橙色
    }
}

// ==================== 纹理函数 ====================

/**
 * 根据表面位置计算UV坐标（用于平面）
 */
vec2 getPlaneUV(vec3 pos, vec3 normal) {
    // 找到最大的法线分量来确定主平面
    vec3 absN = abs(normal);
    if (absN.x > absN.y && absN.x > absN.z) {
        return pos.yz;  // X面
    } else if (absN.y > absN.z) {
        return pos.xz;  // Y面
    } else {
        return pos.xy;  // Z面
    }
}

/**
 * 采样平铺纹理
 * sampler: 纹理采样器
 * uv: 纹理坐标
 * tileScale: 平铺比例
 */
vec3 sampleTiledTexture(sampler2D sampler, vec2 uv, vec2 tileScale) {
    vec2 tiledUV = fract(uv * tileScale);
    return texture2D(sampler, tiledUV).rgb;
}

/**
 * 应用纹理到材质颜色
 * pos: 表面位置
 * normal: 表面法线
 * baseColor: 基础颜色
 * wallType: 墙面类型 (0: 地面, 1: 天花板, 2: 墙壁)
 */
vec3 applyTexture(vec3 pos, vec3 normal, vec3 baseColor, int wallType) {
    vec2 uv = getPlaneUV(pos, normal);
    
    if (wallType == 0) {
        // 地面：使用地板纹理
        return sampleTiledTexture(u_floorTexture, uv, u_floorTileScale);
    } else if (wallType == 1) {
        // 天花板：使用天花板纹理
        return sampleTiledTexture(u_ceilingTexture, uv, u_ceilingTileScale);
    } else if (wallType == 2) {
        // 墙壁：使用墙壁纹理
        return sampleTiledTexture(u_wallTexture, uv, u_wallTileScale);
    }
    
    // 默认返回基础颜色
    return baseColor;
}

// ==================== SDF函数 ====================

/**
 * Box SDF（有符号距离场）
 * p: 测试点
 * size: 盒子尺寸（半边长）
 */
float boxSDF(vec3 p, vec3 size) {
    vec3 d = abs(p) - size;
    return length(max(d, 0.0)) + min(max(d.x, max(d.y, d.z)), 0.0);
}

/**
 * Plane SDF
 * p: 测试点
 * n: 法线（归一化）
 * h: 距离原点的距离
 */
float planeSDF(vec3 p, vec3 n, float h) {
    return dot(p, normalize(n)) + h;
}

/**
 * Sphere SDF（有符号距离场）
 * p: 测试点
 * radius: 半径
 */
float sphereSDF(vec3 p, float radius) {
    return length(p) - radius;
}

/**
 * Menger海绵 SDF（有符号距离场）
 * p: 测试点（相对于Menger海绵中心）
 * size: 初始立方体边长
 * level: 递归深度（1级=20个小立方体）
 */
float mengerSDF(vec3 p, float size, int level) {
    // 对于1级深度，生成20个小立方体
    // 将立方体分成3×3×3=27个小立方体，移除中心和面心，保留20个
    
    float subSize = size / 3.0;  // 子立方体边长
    float offset = subSize;      // 子立方体之间的间距
    
    float minDist = 1000.0;  // 初始距离设为很大
    
    // 遍历3×3×3的27个小立方体
    for (int x = -1; x <= 1; x++) {
        for (int y = -1; y <= 1; y++) {
            for (int z = -1; z <= 1; z++) {
                // 计算是否为需要移除的立方体
                // 注意：GLSL中abs()不支持整数，使用条件表达式
                int absX = (x < 0) ? -x : x;
                int absY = (y < 0) ? -y : y;
                int absZ = (z < 0) ? -z : z;
                int sum = absX + absY + absZ;
                bool isCenter = (x == 0 && y == 0 && z == 0);      // 中心立方体
                bool isFaceCenter = (sum == 1);                    // 面心立方体
                
                // 保留非中心、非面心的立方体
                if (!isCenter && !isFaceCenter) {
                    // 计算子立方体的中心位置
                    vec3 subPos = vec3(
                        float(x) * offset,
                        float(y) * offset,
                        float(z) * offset
                    );
                    
                    // 计算相对于子立方体中心的点
                    vec3 localP = p - subPos;
                    
                    // 计算子立方体的SDF（半边长为subSize/2）
                    float dist = boxSDF(localP, vec3(subSize * 0.5));
                    
                    // 使用min操作合并所有保留立方体的SDF
                    minDist = min(minDist, dist);
                }
            }
        }
    }
    
    return minDist;
}

// ==================== 场景SDF ====================

struct Hit {
    float dist;
    Material mat;
    vec3 pos;
    int hitType;  // 0: 无, 1: 墙, 2: 物体
    int wallType;  // 0: 地面, 1: 天花板, 2: 墙壁, -1: 非墙面
    float volumetricIntensity;  // 体积光束强度（从相机到表面的累加值）
};

/**
 * 计算场景的SDF（返回最近距离和材质信息）
 */
Hit sceneSDF(vec3 p) {
    Hit hit;
    hit.dist = 1000.0;
    hit.hitType = 0;
    hit.wallType = -1;
    hit.volumetricIntensity = 0.0;
    
    float roomHalf = u_roomSize;
    
    // 检查房间的6个面
    // 前面（+Z）
    float d1 = planeSDF(p, vec3(0, 0, -1), roomHalf);
    if (d1 < hit.dist) {
        hit.dist = d1;
        hit.mat = Material(0, vec3(0.8, 0.2, 0.2), 0.0, 1.0);
        hit.hitType = 1;
        hit.wallType = 2;  // 墙壁
    }
    
    // 后面（-Z）
    float d2 = planeSDF(p, vec3(0, 0, 1), roomHalf);
    if (d2 < hit.dist) {
        hit.dist = d2;
        hit.mat = Material(0, vec3(0.2, 0.8, 0.2), 0.0, 1.0);
        hit.hitType = 1;
        hit.wallType = 2;  // 墙壁
    }
    
    // 左面（-X）
    float d3 = planeSDF(p, vec3(1, 0, 0), roomHalf);
    if (d3 < hit.dist) {
        hit.dist = d3;
        hit.mat = Material(0, vec3(0.2, 0.2, 0.8), 0.0, 1.0);
        hit.hitType = 1;
        hit.wallType = 2;  // 墙壁
    }
    
    // 右面（+X）
    float d4 = planeSDF(p, vec3(-1, 0, 0), roomHalf);
    if (d4 < hit.dist) {
        hit.dist = d4;
        hit.mat = Material(0, vec3(0.8, 0.8, 0.2), 0.0, 1.0);
        hit.hitType = 1;
        hit.wallType = 2;  // 墙壁
    }
    
    // 地面（-Y）
    float d5 = planeSDF(p, vec3(0, 1, 0), roomHalf);
    if (d5 < hit.dist) {
        hit.dist = d5;
        hit.mat = Material(0, vec3(0.5, 0.5, 0.5), 0.0, 1.0);
        hit.hitType = 1;
        hit.wallType = 0;  // 地面
    }
    
    // 天花板（+Y）
    float d6 = planeSDF(p, vec3(0, -1, 0), roomHalf);
    if (d6 < hit.dist) {
        hit.dist = d6;
        hit.mat = Material(0, vec3(0.6, 0.6, 0.6), 0.0, 1.0);
        hit.hitType = 1;
        hit.wallType = 1;  // 天花板
    }
    
    // 如果启用了Menger海绵，只渲染海绵，不渲染其他物体
    if (u_mengerSpongeEnabled) {
        // Menger海绵分形几何体：左前方，底部在Y=-15.5（房间底面）
        vec3 pMenger = p - vec3(-8.0, -14.5, 8.0);
        float mengerDist = mengerSDF(pMenger, 2.0, 1);  // size=2.0, level=1
        if (mengerDist < hit.dist) {
            hit.dist = mengerDist;
            hit.mat = Material(5, vec3(0.2, 0.8, 0.9), 0.0, 1.0);  // type=5表示Menger海绵（青色）
            hit.hitType = 2;
            hit.wallType = -1;  // 非墙面
        }
    } else {
        // 多面材质立方体：左后角，底部在Y=-15.5（房间底面）
        vec3 p1 = p - vec3(-8.0, -14.5, -8.0);
        float boxDist = boxSDF(p1, vec3(1.0));
        if (boxDist < hit.dist) {
            hit.dist = boxDist;
            hit.mat = Material(3, vec3(1.0, 1.0, 1.0), 0.0, 1.0);  // type=3表示多面立方体
            hit.hitType = 2;
            hit.wallType = -1;  // 非墙面
        }
        
        // 标准球体：右后角，底部在Y=-15.5（房间底面）
        vec3 pSphere = p - vec3(8.0, -14.5, -8.0);
        float sphereDist = sphereSDF(pSphere, 0.8);
        if (sphereDist < hit.dist) {
            hit.dist = sphereDist;
            hit.mat = Material(6, vec3(0.5, 0.0, 0.8), 0.0, 1.0);  // type=6表示紫色球体
            hit.hitType = 2;
            hit.wallType = -1;  // 非墙面
        }
        
        // Hero立方体（竖直，金属银色）- 只在非主视角模式下显示
        if (u_viewMode != 0.0) {
            vec3 pHero = p - u_heroPosition;
            float heroDist = boxSDF(pHero, vec3(0.15, 0.5, 0.15));  // 尺寸 [0.3, 1.0, 0.3]
            if (heroDist < hit.dist) {
                hit.dist = heroDist;
                hit.mat = Material(4, vec3(0.7, 0.7, 0.8), 0.0, 1.0);  // type=4表示金属银色
                hit.hitType = 2;
                hit.wallType = -1;  // 非墙面
            }
        }
    }
    
    hit.pos = p;
    return hit;
}

// ==================== 法线计算 ====================

/**
 * 使用数值差分计算法线（改进版，处理拐角处）
 */
vec3 calculateNormal(vec3 p) {
    // 使用固定的epsilon值，避免变化导致波纹
    const float eps = 0.001;
    
    // 计算梯度（使用对称差分）
    vec3 n = vec3(
        sceneSDF(vec3(p.x + eps, p.y, p.z)).dist - sceneSDF(vec3(p.x - eps, p.y, p.z)).dist,
        sceneSDF(vec3(p.x, p.y + eps, p.z)).dist - sceneSDF(vec3(p.x, p.y - eps, p.z)).dist,
        sceneSDF(vec3(p.x, p.y, p.z + eps)).dist - sceneSDF(vec3(p.x, p.y, p.z - eps)).dist
    );
    
    // 归一化
    float len = length(n);
    
    // 如果长度太小，检查是否在拐角处
    if (len < 0.0001) {
        // 在拐角处，使用更稳定的法线计算
        // 检查是否在墙的拐角附近
        float roomHalf = u_roomSize;
        float dist1 = abs(abs(p.x) - roomHalf) + abs(abs(p.z) - roomHalf);
        float dist2 = abs(abs(p.x) - roomHalf) + abs(abs(p.y) - roomHalf);
        float dist3 = abs(abs(p.y) - roomHalf) + abs(abs(p.z) - roomHalf);
        float distToCorner = min(min(dist1, dist2), dist3);
        
        // 如果在拐角附近，使用平滑插值计算法线
        if (distToCorner < 0.15) {
            // 使用稍大的epsilon，但保持固定
            const float eps2 = 0.002;
            n = vec3(
                sceneSDF(vec3(p.x + eps2, p.y, p.z)).dist - sceneSDF(vec3(p.x - eps2, p.y, p.z)).dist,
                sceneSDF(vec3(p.x, p.y + eps2, p.z)).dist - sceneSDF(vec3(p.x, p.y - eps2, p.z)).dist,
                sceneSDF(vec3(p.x, p.y, p.z + eps2)).dist - sceneSDF(vec3(p.x, p.y, p.z - eps2)).dist
            );
            len = length(n);
            
            // 如果仍然太小，使用拐角处的平滑法线
            if (len < 0.0001) {
                // 在拐角处，使用平滑的法线插值
                vec3 cornerNormal = vec3(0.0);
                if (dist1 < dist2 && dist1 < dist3) {
                    // XZ拐角
                    cornerNormal = normalize(vec3(sign(p.x), 0.0, sign(p.z)));
                } else if (dist2 < dist3) {
                    // XY拐角
                    cornerNormal = normalize(vec3(sign(p.x), sign(p.y), 0.0));
                } else {
                    // YZ拐角
                    cornerNormal = normalize(vec3(0.0, sign(p.y), sign(p.z)));
                }
                return cornerNormal;
            }
        } else {
            // 不在拐角处，使用默认法线
            return vec3(0.0, 1.0, 0.0);
        }
    }
    
    return normalize(n);
}

// ==================== Ray Marching ====================

/**
 * 检查点是否在场景边界内（快速排除）
 */
bool inBounds(vec3 p, float margin) {
    return abs(p.x) < u_roomSize + margin &&
           abs(p.y) < u_roomSize + margin &&
           abs(p.z) < u_roomSize + margin;
}

// ==================== 聚光灯光照计算 ====================

/**
 * 计算角度衰减后的Z值
 * angle: 偏向角（弧度）
 * Z: 光源基础强度
 * 返回: 衰减后的Z值（Z''）
 */
float calculateAngleAttenuation(float angle, float Z) {
    // 将角度从弧度转换为度数
    float angleDeg = angle * 180.0 / 3.14159265359;
    
    // 计算常量：Z' = Z - u_ambientStrength
    float ZPrime = Z - u_ambientStrength;
    
    // 角度阈值（度数）- 缩小到3/8范围
    const float threshold1 = 7.5;   // 7.5度 (20 * 3/8)
    const float threshold2 = 18.75;  // 18.75度 (50 * 3/8)
    const float threshold3 = 30.0;   // 30度 (80 * 3/8)
    
    if (angleDeg <= threshold1) {
        // 区间1: 0°-7.5°
        // 导数 d1 = (0.1 * Z') * 8/3 / 20 = (0.1 * Z') * 8 / 60
        float d1 = (0.1 * ZPrime) * 8.0 / 60.0;
        // Z1'' = Z - d1 * angle
        return Z - d1 * angleDeg;
    } else if (angleDeg <= threshold2) {
        // 区间2: 7.5°-18.75°
        // 导数 d2 = (0.2 * Z') * 8/3 / 30 = (0.2 * Z') * 8 / 90
        float d2 = (0.2 * ZPrime) * 8.0 / 90.0;
        // Z2'' = 0.5 * Z - d2 * (angle - 7.5)
        return 0.5 * Z - d2 * (angleDeg - 7.5);
    } else if (angleDeg <= threshold3) {
        // 区间3: 18.75°-30°
        // 导数 d3 = (0.3 * Z') * 8/3 / 30 = (0.3 * Z') * 8 / 90
        float d3 = (0.3 * ZPrime) * 8.0 / 90.0;
        // Z3'' = 0.3 * Z - d3 * (angle - 18.75)
        return 0.3 * Z - d3 * (angleDeg - 18.75);
    } else {
        // >30°: 直接返回环境光强度
        return u_ambientStrength;
    }
}

/**
 * 根据角度计算衰减速度
 * angleDeg: 偏向角（度数）
 * 返回: 衰减速度（H'）
 */
float calculateAttenuationSpeed(float angleDeg) {
    const float H = 0.30;  // 基础衰减速度 H = H'' * 1.5 = 0.20 * 1.5
    
    const float threshold1 = 7.5;
    const float threshold2 = 18.75;
    const float threshold3 = 30.0;
    
    if (angleDeg <= threshold1) {
        // 区间1: 0°-7.5°, 从 0.1H 到 0.3H
        float h1 = (H * 0.2) / 7.5;
        return 0.1 * H + angleDeg * h1;
    } else if (angleDeg <= threshold2) {
        // 区间2: 7.5°-18.75°, 从 0.5H 到 0.9H
        float h2 = (H * 0.4) / 11.25;
        return 0.5 * H + (angleDeg - 7.5) * h2;
    } else if (angleDeg <= threshold3) {
        // 区间3: 18.75°-30°, 从 0.9H 到 1.0H
        float h3 = (H * 0.1) / 11.25;
        return 0.9 * H + (angleDeg - 18.75) * h3;
    } else {
        // >30°: 使用最大衰减速度
        return H;
    }
}

/**
 * 计算距离衰减系数（使用基于角度的动态衰减速度）
 * verticalDist: 垂直距离（实际距离 * cos(角度)）
 * angleDeg: 偏向角（度数）
 * 返回: 衰减系数（环境光强度到1.0之间）
 */
float calculateDistanceAttenuation(float verticalDist, float angleDeg) {
    // 根据角度计算动态衰减速度
    float attenuationSpeed = calculateAttenuationSpeed(angleDeg);
    // 最大照射距离 = 房间对角线的1.2倍
    // 房间是立方体，边长为 2 * u_roomSize，对角线为 sqrt(3) * 2 * u_roomSize
    float maxDistance = 1.2 * sqrt(3.0) * 2.0 * u_roomSize;
    
    // 如果超过最大距离，直接返回环境光强度
    if (verticalDist > maxDistance) {
        return u_ambientStrength;
    }
    
    // 使用动态衰减速度进行衰减计算
    // 当verticalDist=0时，我们希望返回1.0（无衰减）
    // 当verticalDist很大时，我们希望返回u_ambientStrength
    float attenuation = 1.0 / (1.0 + verticalDist * attenuationSpeed);
    
    // 将衰减值映射到[u_ambientStrength, 1.0]范围
    // attenuation在[0, 1]之间，我们需要将其映射到[u_ambientStrength, 1.0]
    float normalizedAttenuation = mix(u_ambientStrength, 1.0, attenuation);
    
    return normalizedAttenuation;
}

/**
 * 检查点是否在Hero立方体内（用于阴影检测时排除Hero自身）
 * p: 测试点
 * heroPos: Hero位置
 * 返回: true表示在Hero立方体内
 */
bool isInHeroCube(vec3 p, vec3 heroPos) {
    vec3 pHero = p - heroPos;
    // Hero立方体尺寸是[0.3, 1.0, 0.3]，半边长是0.15
    vec3 d = abs(pHero) - vec3(0.15, 0.5, 0.15);
    float dist = length(max(d, 0.0)) + min(max(d.x, max(d.y, d.z)), 0.0);
    return dist < 0.001;  // 如果在立方体内，距离应该小于epsilon
}

/**
 * 阴影检测：检查从表面点到光源的路径是否被遮挡
 * surfacePos: 表面点位置
 * lightPos: 光源位置
 * 返回: true表示被遮挡（在阴影中），false表示未被遮挡
 */
bool isInShadow(vec3 surfacePos, vec3 lightPos) {
    vec3 toLight = lightPos - surfacePos;
    float distToLight = length(toLight);
    vec3 lightDir = normalize(toLight);
    
    // 从表面点向光源进行ray marching
    // 使用足够的步数确保完整计算（不进行性能优化）
    const int maxSteps = 256;  // 进一步增加步数，确保完整计算
    const float eps = 0.001;
    float t = 0.01;  // 从表面点稍微偏移，避免自相交
    
    // 自适应步长因子
    float stepScale = 0.9;  // 稍微保守，避免跳过物体
    float minStep = 0.001;
    
    for (int i = 0; i < maxSteps; i++) {
        vec3 p = surfacePos + lightDir * t;
        
        // 如果已经超过光源位置，说明没有被遮挡
        if (t >= distToLight - eps) {
            return false;
        }
        
        // 检查是否在Hero立方体内，如果是则忽略（Hero自身不算障碍）
        if (isInHeroCube(p, u_heroPosition)) {
            // 继续前进，不视为遮挡
            t += 0.01;  // 小步前进，跳过Hero立方体
            continue;
        }
        
        Hit sceneHit = sceneSDF(p);
        
        // 如果遇到物体（且不是Hero立方体），说明被遮挡
        if (sceneHit.dist < eps) {
            // 再次检查是否是Hero立方体（虽然sceneSDF在主视角时不会返回Hero，但为了安全）
            if (sceneHit.mat.type != 4) {  // type 4是Hero材质
                return true;
            }
        }
        
        // 自适应步进（只有在不是Hero的情况下才使用sceneHit.dist）
        float step = max(sceneHit.dist * stepScale, minStep);
        t += step;
        
        // 如果步长太大，可能跳过了光源，提前终止
        if (t > distToLight + 1.0) {
            break;
        }
    }
    
    // 如果没有遇到物体，说明未被遮挡
    return false;
}

/**
 * 快速检查点是否在第一区间角度内（0°-7.5°）
 * pointPos: 空间中的点位置
 * 返回: true表示在第一区间内
 */
bool isInFirstAngleRange(vec3 pointPos) {
    // 计算点到光源的向量
    vec3 toLight = u_lightPosition - pointPos;
    float distToLight = length(toLight);
    
    // 如果距离为0，返回false（避免除以0）
    if (distToLight < 0.001) {
        return false;
    }
    
    vec3 toLightDir = normalize(toLight);
    
    // 计算偏向角（使用点积，避免acos）
    float cosAngle = dot(u_lightDirection, toLightDir);
    cosAngle = clamp(cosAngle, -1.0, 1.0);
    
    // 第一区间是0°-7.5°，对应的cos值范围
    // cos(7.5°) ≈ 0.9914
    // 如果cosAngle >= cos(7.5°)，说明角度 <= 7.5°
    // 为了测试，暂时使用更宽松的角度（30度）来验证逻辑是否正确
    const float cos30deg = 0.8660254037844386;  // cos(30°) - 暂时大幅放宽用于调试
    return cosAngle >= cos30deg;
}

/**
 * 计算空间中某点的体积光束强度
 * pointPos: 空间中的点位置
 * 返回: 体积光束强度（如果Z'' <= 0.85Z，返回0）
 */
float calculateVolumetricLightIntensity(vec3 pointPos) {
    // 检查光源强度是否为0
    if (u_lightIntensity <= 0.0) {
        return 0.0;
    }
    
    // 1. 计算点到光源的向量和距离
    vec3 toLight = u_lightPosition - pointPos;
    float distToLight = length(toLight);
    vec3 toLightDir = normalize(toLight);
    
    // 2. 计算偏向角（光源方向与到点方向的夹角）
    float cosAngle = dot(u_lightDirection, toLightDir);
    cosAngle = clamp(cosAngle, -1.0, 1.0);
    float angle = acos(cosAngle);
    
    // 3. 如果角度 > 30度，不显示体积光束
    // 暂时注释掉这个检查用于调试
    // if (angle > u_lightMaxAngle) {
    //     return 0.0;
    // }
    
    // 4. 进行阴影检测，如果被遮挡，不显示体积光束（Z''设为0）
    // 暂时注释掉阴影检测用于调试
    // if (isInShadow(pointPos, u_lightPosition)) {
    //     return 0.0;
    // }
    
    // 5. 计算角度衰减后的Z值
    float attenuatedZ = calculateAngleAttenuation(angle, u_lightIntensity);
    
    // 6. 计算垂直距离和距离衰减系数
    float verticalDist = distToLight * cosAngle;
    float angleDeg = angle * 180.0 / 3.14159265359;
    float distanceAttenuation = calculateDistanceAttenuation(verticalDist, angleDeg);
    
    // 7. 计算Z'' = 角度衰减后的Z值 × 距离衰减系数
    float ZDoublePrime = attenuatedZ * distanceAttenuation;
    
    // 8. 如果Z'' > 0.85Z，计算体积光束强度
    // 暂时大幅降低阈值用于调试（改为0.1Z而不是0.85Z）
    float threshold = 0.1 * u_lightIntensity;
    if (ZDoublePrime > threshold) {
        // G' = (((Z'' - 0.85Z) / 0.15Z)^2) * G
        // 暂时使用更宽松的计算方式用于调试
        float numerator = ZDoublePrime - threshold;
        float denominator = 0.9 * u_lightIntensity;  // 使用0.9Z作为分母范围
        float ratio = clamp(numerator / denominator, 0.0, 1.0);
        float volumetricIntensity = ratio * ratio * u_volumetricLightMaxIntensity * 5.0;  // 临时放大5倍用于调试
        return volumetricIntensity;
    }
    
    return 0.0;
}

/**
 * Ray Marching主函数（优化版）
 * ro: 射线起点
 * rd: 射线方向（归一化）
 */
Hit rayMarch(vec3 ro, vec3 rd) {
    Hit hit;
    hit.dist = -1.0;
    hit.hitType = 0;
    hit.volumetricIntensity = 0.0;
    
    float t = 0.0;
    const int maxSteps = 256;  // 进一步增加步数，确保完整计算
    float maxDist = u_roomSize * 3.5;  // 增加最大距离，支持房间对角线
    const float eps = 0.001;
    
    // 早期终止：检查是否在场景外
    if (!inBounds(ro, maxDist)) {
        return hit;
    }
    
    // 自适应步长因子
    float stepScale = 1.0;
    float minStep = 0.001;
    
    // 体积光束采样相关参数
    float volumetricAccumulation = 0.0;
    float lastVolumetricSampleT = -1.0;  // 上一次体积光束采样的距离
    const float volumetricSampleInterval = 0.05;  // 体积光束采样间隔（单位距离，减小以提高质量）
    const float volumetricMaxDistance = 30.0;  // 体积光束最大检测距离（增加到30.0以便测试）
    
    for (int i = 0; i < maxSteps; i++) {
        vec3 p = ro + rd * t;
        
        // 边界检查（早期终止）
        if (!inBounds(p, 1.0)) {
            break;
        }
        
        Hit sceneHit = sceneSDF(p);
        
        // 体积光束采样：只在启用时，在第一区间角度内，且在最大距离内时采样
        if (u_volumetricLightEnabled && t <= volumetricMaxDistance) {
            // 快速角度检查：只对第一区间（0°-7.5°）内的点进行采样
            // 暂时放宽角度检查用于调试（15度而非7.5度）
            // 进一步放宽：暂时允许更大角度范围用于调试
            bool inAngleRange = isInFirstAngleRange(p);
            // 暂时放宽：如果不在第一区间，也尝试计算（用于调试）
            if (inAngleRange) {
                if (lastVolumetricSampleT < 0.0 || (t - lastVolumetricSampleT) >= volumetricSampleInterval) {
                    float volumetricIntensity = calculateVolumetricLightIntensity(p);
                    if (volumetricIntensity > 0.0) {
                        // 根据采样间隔进行加权累加
                        float sampleWeight = volumetricSampleInterval;
                        volumetricAccumulation += volumetricIntensity * sampleWeight;
                    }
                    lastVolumetricSampleT = t;
                }
            }
        }
        
        // 命中检测
        if (sceneHit.dist < eps) {
            hit = sceneHit;
            hit.pos = p;
            hit.dist = t;
            hit.volumetricIntensity = volumetricAccumulation;
            break;
        }
        
        // 自适应步进：使用场景距离作为步长，但限制最小步长
        float step = max(sceneHit.dist * stepScale, minStep);
        t += step;
        
        // 超出最大距离，提前终止
        if (t > maxDist) {
            break;
        }
    }
    
    // 如果没有命中任何物体，也需要返回体积光束强度
    if (hit.hitType == 0) {
        hit.volumetricIntensity = volumetricAccumulation;
    }
    
    return hit;
}

// ==================== 仅环境光着色 ====================

/**
 * 光照着色：包含环境光和聚光灯光照
 */
vec3 ambientShade(vec3 pos, vec3 normal, Material material, int wallType) {
    vec3 baseColor = material.color;
    if (material.type == 3) {
        baseColor = getCubeFaceColor(normal);
    } else if (material.type == 4) {
        // Hero金属银色材质，使用更高的环境光强度
        baseColor = baseColor * u_ambientStrength * 1.5;
    } else if (material.type == 5) {
        // Menger海绵：使用材质颜色（青色）
        baseColor = material.color;
    } else if (material.type == 6) {
        // 球体：使用材质颜色（紫色）
        baseColor = material.color;
    }
    
    // 如果是墙面，应用纹理
    if (wallType >= 0) {
        baseColor = applyTexture(pos, normal, baseColor, wallType);
    }
    
    // 计算环境光贡献
    vec3 ambientColor = baseColor * u_ambientStrength;
    
    // 如果Hero材质，直接返回（不应用聚光灯）
    if (material.type == 4) {
        return baseColor;
    }
    
    // ==================== 聚光灯光照计算 ====================
    
    // 检查光源强度是否为0
    if (u_lightIntensity <= 0.0) {
        return ambientColor;
    }
    
    // 1. 计算表面点到光源的向量和距离
    vec3 toLight = u_lightPosition - pos;
    float distToLight = length(toLight);
    vec3 toLightDir = normalize(toLight);
    
    // 2. 计算偏向角（光源方向与到表面点方向的夹角）
    // 使用点积计算cos值，避免使用acos
    float cosAngle = dot(u_lightDirection, toLightDir);
    cosAngle = clamp(cosAngle, -1.0, 1.0);  // 确保在有效范围内
    float angle = acos(cosAngle);  // 计算角度（弧度）
    
    // 3. 如果角度 > 30度，只返回环境光
    if (angle > u_lightMaxAngle) {
        return ambientColor;
    }
    
    // 4. 进行阴影检测，如果被遮挡，只返回环境光
    if (isInShadow(pos, u_lightPosition)) {
        return ambientColor;
    }
    
    // 5. 计算角度衰减后的Z值
    float attenuatedZ = calculateAngleAttenuation(angle, u_lightIntensity);
    
    // 6. 计算垂直距离和距离衰减系数
    // 垂直距离 = 实际距离 * cos(角度)
    float verticalDist = distToLight * cosAngle;
    // 将角度从弧度转换为度数，用于计算动态衰减速度
    float angleDeg = angle * 180.0 / 3.14159265359;
    float distanceAttenuation = calculateDistanceAttenuation(verticalDist, angleDeg);
    
    // 7. 计算聚光灯贡献
    // 聚光灯贡献 = baseColor * attenuatedZ * distanceAttenuation
    vec3 spotlightContribution = baseColor * attenuatedZ * distanceAttenuation;
    
    // 8. 计算亮度值（luminance）进行比较
    float ambientLuminance = dot(ambientColor, vec3(0.299, 0.587, 0.114));
    float spotlightLuminance = dot(spotlightContribution, vec3(0.299, 0.587, 0.114));
    
    // 9. 互斥逻辑：如果聚光灯亮度 > 环境光亮度，使用聚光灯；否则使用环境光
    vec3 finalColor;
    if (spotlightLuminance > ambientLuminance) {
        finalColor = spotlightContribution;
    } else {
        finalColor = ambientColor;
    }
    
    return finalColor;
}

/**
 * 计算相机位置的曝光亮度（仅在相机1-4视角时使用）
 * 使用聚光灯的两级衰减机制计算相机位置应该呈现的亮度
 */
vec3 calculateExposureBrightness() {
    // 如果启用了Menger海绵，不显示曝光点
    if (u_mengerSpongeEnabled) {
        return vec3(0.0);
    }
    
    // 只在相机1-4视角时计算
    if (u_viewMode < 1.0 || u_viewMode > 4.0) {
        return vec3(0.0);
    }
    
    // 1. 计算从光源到相机位置的向量和距离
    vec3 toCamera = u_cameraPos - u_lightPosition;
    float distToCamera = length(toCamera);
    vec3 toCameraDir = normalize(toCamera);
    
    // 2. 计算偏向角（光源方向与到相机方向的夹角）
    // 反向toCameraDir，因为我们要计算的是从光源指向相机的方向与光源投射方向的夹角
    float cosAngle = dot(u_lightDirection, -toCameraDir);
    cosAngle = clamp(cosAngle, -1.0, 1.0);
    float angle = acos(cosAngle);
    
    // 3. 如果角度 > 30度，返回黑色（不在聚光灯范围内，不应该显示曝光点）
    if (angle > u_lightMaxAngle) {
        return vec3(0.0);
    }
    
    // 4. 计算角度衰减后的Z值
    float attenuatedZ = calculateAngleAttenuation(angle, u_lightIntensity);
    
    // 5. 计算垂直距离和距离衰减系数
    float verticalDist = distToCamera * cosAngle;
    float angleDeg = angle * 180.0 / 3.14159265359;
    float distanceAttenuation = calculateDistanceAttenuation(verticalDist, angleDeg);
    
    // 6. 计算曝光亮度 = 白色(1,1,1) * attenuatedZ * distanceAttenuation * 4
    vec3 exposureBrightness = vec3(1.0, 1.0, 1.0) * attenuatedZ * distanceAttenuation * 4.0;
    
    return exposureBrightness;
}

/**
 * 检测射线是否与光源位置的曝光圆相交
 * ro: 射线起点
 * rd: 射线方向（归一化）
 * 返回: 如果相交，返回距离t；否则返回-1.0
 * 
 * 曝光圆是在光源位置，垂直于从光源到相机连线的圆
 */
float intersectLightExposureCircle(vec3 ro, vec3 rd) {
    // 如果启用了Menger海绵，不显示曝光点
    if (u_mengerSpongeEnabled) {
        return -1.0;
    }
    
    // 只在相机1-4视角时检测
    if (u_viewMode < 1.0 || u_viewMode > 4.0) {
        return -1.0;
    }
    
    // 光源曝光圆的半径（世界空间单位）- 缩小到1/4
    const float circleRadius = 0.05;  // 0.2的1/4
    
    // 曝光圆位置就在光源位置（不需要前移，因为光源现在在Hero后面）
    vec3 exposureCirclePos = u_lightPosition;
    
    // 计算从射线起点到曝光圆位置的向量
    vec3 toLight = exposureCirclePos - ro;
    
    // 计算射线到光源的最近距离（投影到射线方向）
    float t = dot(toLight, rd);
    
    // 如果t < 0，光源在射线后方，不相交
    if (t < 0.0) {
        return -1.0;
    }
    
    // 计算射线在t位置的点（最接近光源的点）
    vec3 closestPoint = ro + rd * t;
    
    // 计算该点到曝光圆位置的距离
    float distToLight = length(closestPoint - exposureCirclePos);
    
    // 如果距离小于圆半径，则相交
    if (distToLight <= circleRadius) {
        // 计算实际交点：射线与圆的交点
        // 使用勾股定理：circleRadius^2 = distToLight^2 + offset^2
        // offset是沿着射线方向从closestPoint到交点的距离
        if (distToLight < circleRadius - 0.0001) {
            float offset = sqrt(circleRadius * circleRadius - distToLight * distToLight);
            float t1 = t - offset;
            float t2 = t + offset;
            
            // 返回最近的正交点
            if (t1 > 0.0) {
                return t1;
            } else if (t2 > 0.0) {
                return t2;
            }
        } else {
            // 刚好相切或非常接近
            return t;
        }
    }
    
    return -1.0;
}

/**
 * 单次追踪：命中即返回环境光着色结果
 */
vec3 traceRay(vec3 ro, vec3 rd) {
    // 进行ray marching
    Hit hit = rayMarch(ro, rd);
    
    // 只在相机1-4视角时，检测是否命中光源曝光圆
    // 如果启用了Menger海绵，不显示曝光点
    // 使用严格检查，确保用户视角（0.0）时不会启用
    if (!u_mengerSpongeEnabled && u_viewMode >= 1.0 && u_viewMode <= 4.0) {
        float exposureT = intersectLightExposureCircle(ro, rd);
        
        // 如果曝光圆存在且可见（在场景物体之前或没有场景物体），显示曝光亮度
        if (exposureT > 0.0 && (hit.hitType == 0 || exposureT < hit.dist)) {
            vec3 exposureBrightness = calculateExposureBrightness();
            return exposureBrightness;
        }
    }
    
    // 如果没有命中任何物体，返回黑色（但如果体积光束强度>0，可能需要显示）
    if (hit.hitType == 0) {
        // 即使没有命中物体，如果体积光束强度>0，也可以显示体积光束
        if (hit.volumetricIntensity > 0.0) {
            vec3 volumetricColor = vec3(1.0, 1.0, 1.0) * hit.volumetricIntensity;
            return volumetricColor;
        }
        return vec3(0.0);
    }

    vec3 normal = calculateNormal(hit.pos);
    vec3 color = ambientShade(hit.pos, normal, hit.mat, hit.wallType);

    // 雾化（仍保留，作为后处理）
    float fogFactor = exp(-u_fogDensity * hit.dist);
    fogFactor = clamp(fogFactor, 0.0, 1.0);
    color = mix(u_fogColor, color, fogFactor);
    
    // 叠加体积光束效果（使用加法混合）
    if (hit.volumetricIntensity > 0.0) {
        vec3 volumetricColor = vec3(1.0, 1.0, 1.0) * hit.volumetricIntensity;
        color = color + volumetricColor;
    }

    return color;
}

// ==================== 主函数 ====================

void main() {
    vec2 pixelSize = 1.0 / u_resolution.xy;
    vec2 uv = (gl_FragCoord.xy / u_resolution.xy) * 2.0 - 1.0;
    
    // 多重采样反走样（支持1、2或4采样）
    vec3 color = vec3(0.0);
    int samples = u_samples;
    
    if (samples >= 4) {
        // 4x4采样（16个采样点）
        int sampleCount = 0;
        for (int i = 0; i < 4; i++) {
            for (int j = 0; j < 4; j++) {
                // 子像素偏移（使用Halton序列或均匀分布）
                vec2 offset = (vec2(float(i), float(j)) - 1.5) * pixelSize * 0.5;
                vec2 sampleUV = uv + offset * vec2(u_resolution.x / u_resolution.y, 1.0);
                
                // 计算相机射线方向（修正投影，消除扭曲）
                float focalLength = 1.0 / tan(u_fov * 0.5);
                float aspect = u_resolution.x / u_resolution.y;
                vec3 rayDir = normalize(
                    u_cameraDir * focalLength +
                    sampleUV.x * u_cameraRight * aspect +
                    sampleUV.y * u_cameraUp
                );
                
                // Whitted风格光线追踪
                vec3 sampleColor = traceRay(u_cameraPos, rayDir);
                
                // 不做阈值置黑，保持低亮度区域的连续性
                color += sampleColor;
                sampleCount++;
            }
        }
        color /= float(sampleCount);
    } else if (samples > 1) {
        // 2x2采样
        for (int i = 0; i < 2; i++) {
            for (int j = 0; j < 2; j++) {
                // 子像素偏移
                vec2 offset = (vec2(float(i), float(j)) - 0.5) * pixelSize;
                vec2 sampleUV = uv + offset * vec2(u_resolution.x / u_resolution.y, 1.0);
                
                // 计算相机射线方向（修正投影，消除扭曲）
                float focalLength = 1.0 / tan(u_fov * 0.5);
                float aspect = u_resolution.x / u_resolution.y;
                vec3 rayDir = normalize(
                    u_cameraDir * focalLength +
                    sampleUV.x * u_cameraRight * aspect +
                    sampleUV.y * u_cameraUp
                );
                
                // Whitted风格光线追踪
                vec3 sampleColor = traceRay(u_cameraPos, rayDir);
                
                // 不做阈值置黑，保持低亮度区域的连续性
                color += sampleColor;
            }
        }
        color /= 4.0;
    } else {
        // 单采样（无反走样，性能更好）
        float focalLength = 1.0 / tan(u_fov * 0.5);
        float aspect = u_resolution.x / u_resolution.y;
        vec3 rayDir = normalize(
            u_cameraDir * focalLength +
            uv.x * u_cameraRight * aspect +
            uv.y * u_cameraUp
        );
        
        color = traceRay(u_cameraPos, rayDir);
        
        // 不做阈值置黑，保持低亮度区域的连续性
    }
    
    // 色调映射和伽马校正（增强曝光效果处理）
    // 检测强光（如正对镜子照射）
    float luminance = dot(color, vec3(0.299, 0.587, 0.114));
    if (luminance > 2.0) {
        // 强光情况：应用更强的色调映射
        color = color / (1.0 + color * 0.5);  // 更强的色调映射
    } else {
        color = color / (color + vec3(1.0));  // 标准Reinhard色调映射
    }
    color = pow(color, vec3(1.0 / 2.2));  // 伽马校正
    
    gl_FragColor = vec4(color, 1.0);
}`;

/**
 * 编译着色器
 * @param {WebGLRenderingContext} gl - WebGL上下文
 * @param {number} type - 着色器类型 (gl.VERTEX_SHADER 或 gl.FRAGMENT_SHADER)
 * @param {string} source - 着色器源码
 * @returns {WebGLShader} 编译后的着色器对象
 */
function loadShader(gl, type, source) {
    const shader = gl.createShader(type);
    
    gl.shaderSource(shader, source);
    gl.compileShader(shader);
    
    if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) {
        const error = gl.getShaderInfoLog(shader);
        gl.deleteShader(shader);
        console.error('着色器编译错误:', error);
        throw new Error('着色器编译失败: ' + error);
    }
    
    return shader;
}

/**
 * 创建着色器程序
 * @param {WebGLRenderingContext} gl - WebGL上下文
 * @param {string} vertexSource - 顶点着色器源码
 * @param {string} fragmentSource - 片段着色器源码
 * @returns {WebGLProgram} 着色器程序对象
 */
function createProgram(gl, vertexSource, fragmentSource) {
    const vertexShader = loadShader(gl, gl.VERTEX_SHADER, vertexSource);
    const fragmentShader = loadShader(gl, gl.FRAGMENT_SHADER, fragmentSource);
    
    const program = gl.createProgram();
    gl.attachShader(program, vertexShader);
    gl.attachShader(program, fragmentShader);
    gl.linkProgram(program);
    
    if (!gl.getProgramParameter(program, gl.LINK_STATUS)) {
        const error = gl.getProgramInfoLog(program);
        gl.deleteProgram(program);
        console.error('程序链接错误:', error);
        throw new Error('着色器程序链接失败: ' + error);
    }
    
    // 清理着色器对象（已链接到程序中，不再需要）
    gl.deleteShader(vertexShader);
    gl.deleteShader(fragmentShader);
    
    return program;
}

/**
 * 创建着色器程序（使用内联的着色器源码）
 * @param {WebGLRenderingContext} gl - WebGL上下文
 * @returns {WebGLProgram} 着色器程序对象
 */
function createProgramFromInline(gl) {
    return createProgram(gl, VERTEX_SHADER_SOURCE, FRAGMENT_SHADER_SOURCE);
}
