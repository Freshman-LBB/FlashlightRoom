// 主程序入口，初始化WebGL上下文和渲染循环

let gl;
let program;
let scene;
let camera;
let inputManager;
let lastTime = 0;
let frameCount = 0;
let fps = 0;
let fpsTime = 0;

// 体积光束效果开关（默认关闭）
let volumetricLightEnabled = false;

// Menger海绵显示开关（默认不加载）
let mengerSpongeEnabled = false;

// 纹理对象
let floorTexture = null;
let wallTexture = null;
let ceilingTexture = null;

// 全屏四边形顶点数据
const quadVertices = new Float32Array([
    -1, -1,
     1, -1,
    -1,  1,
     1,  1
]);

/**
 * 初始化函数
 */
async function init() {
    // 获取canvas和WebGL上下文
    const canvas = document.getElementById('canvas');
    if (!canvas) {
        throw new Error('找不到canvas元素');
    }
    
    // 尝试获取WebGL 2.0上下文，失败则使用WebGL 1.0
    gl = canvas.getContext('webgl2') || canvas.getContext('webgl');
    if (!gl) {
        throw new Error('无法获取WebGL上下文');
    }
    
    // 设置canvas尺寸
    resizeCanvas();
    window.addEventListener('resize', resizeCanvas);
    
    // 初始化输入管理器
    inputManager = new InputManager();
    
    // 初始化相机
    camera = new Camera();
    
    // 初始化场景
    scene = new Scene();
    
    // 加载并创建着色器程序（使用内联源码，避免CORS问题）
    try {
        program = createProgramFromInline(gl);
        gl.useProgram(program);
    } catch (error) {
        console.error('着色器编译失败:', error);
        throw error;
    }
    
    // 创建全屏四边形
    setupQuad();
    
    // 加载纹理
    await loadTextures();
    
    // 启动渲染循环
    requestAnimationFrame(render);
}

/**
 * 调整canvas尺寸
 */
function resizeCanvas() {
    const canvas = document.getElementById('canvas');
    const displayWidth = window.innerWidth;
    const displayHeight = window.innerHeight;
    
    if (canvas.width !== displayWidth || canvas.height !== displayHeight) {
        canvas.width = displayWidth;
        canvas.height = displayHeight;
        gl.viewport(0, 0, displayWidth, displayHeight);
    }
}

/**
 * 设置全屏四边形
 */
function setupQuad() {
    const positionBuffer = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, positionBuffer);
    gl.bufferData(gl.ARRAY_BUFFER, quadVertices, gl.STATIC_DRAW);
    
    const positionLocation = gl.getAttribLocation(program, 'a_position');
    gl.enableVertexAttribArray(positionLocation);
    gl.vertexAttribPointer(positionLocation, 2, gl.FLOAT, false, 0, 0);
}

/**
 * 加载纹理
 */
async function loadTextures() {
    const textures = [
        { name: 'floor', path: 'assets/floor.jpg' },
        { name: 'wall', path: 'assets/wall.jpg' },
        { name: 'ceiling', path: 'assets/ceiling.jpeg' }
    ];
    
    try {
        for (let tex of textures) {
            const texture = await loadTexture(tex.path);
            if (tex.name === 'floor') {
                floorTexture = texture;
                console.log('地板纹理加载成功:', texture.width, 'x', texture.height);
            } else if (tex.name === 'wall') {
                wallTexture = texture;
                console.log('墙壁纹理加载成功:', texture.width, 'x', texture.height);
            } else if (tex.name === 'ceiling') {
                ceilingTexture = texture;
                console.log('天花板纹理加载成功:', texture.width, 'x', texture.height);
            }
        }
    } catch (error) {
        console.error('纹理加载失败:', error);
        alert('纹理加载失败: ' + error.message);
    }
}

/**
 * 加载单个纹理
 */
function loadTexture(url) {
    return new Promise((resolve, reject) => {
        const image = new Image();
        image.crossOrigin = 'anonymous';
        image.onload = () => {
            const texture = gl.createTexture();
            gl.bindTexture(gl.TEXTURE_2D, texture);
            gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, image);
            
            // 检查是否是2的幂次方
            if (isPowerOf2(image.width) && isPowerOf2(image.height)) {
                gl.generateMipmap(gl.TEXTURE_2D);
            } else {
                gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.REPEAT);
                gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.REPEAT);
                gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
                gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
            }
            
            // 设置重复模式（用于平铺）
            gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.REPEAT);
            gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.REPEAT);
            
            resolve({ texture, width: image.width, height: image.height });
        };
        image.onerror = () => {
            reject(new Error(`无法加载纹理: ${url}`));
        };
        image.src = url;
    });
}

/**
 * 检查是否是2的幂次方
 */
function isPowerOf2(value) {
    return (value & (value - 1)) === 0;
}

/**
 * 渲染循环
 */
function render(currentTime) {
    // 计算FPS
    frameCount++;
    if (currentTime - fpsTime >= 1000) {
        fps = frameCount;
        frameCount = 0;
        fpsTime = currentTime;
        document.getElementById('fps').textContent = fps;
    }
    
    const deltaTime = (currentTime - lastTime) / 1000.0;
    lastTime = currentTime;
    
    // 更新输入
    inputManager.update();
    
    // 处理体积光束效果开关（G键）
    if (inputManager.isKeyPressed('KeyG')) {
        volumetricLightEnabled = !volumetricLightEnabled;
        console.log('体积光束效果:', volumetricLightEnabled ? '开启' : '关闭');
        // #region agent log
        fetch('http://127.0.0.1:7243/ingest/f75d3637-4327-48d1-a584-c484c14acea8',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'main.js:199',message:'体积光束开关切换',data:{enabled:volumetricLightEnabled},timestamp:Date.now(),sessionId:'debug-session',runId:'run1',hypothesisId:'A'})}).catch(()=>{});
        // #endregion
    }
    
    // 处理Menger海绵显示开关（Z键）
    if (inputManager.isKeyPressed('KeyZ')) {
        mengerSpongeEnabled = !mengerSpongeEnabled;
        console.log('Menger海绵:', mengerSpongeEnabled ? '加载' : '不加载');
    }
    
    // 更新相机（基于输入）
    camera.update(inputManager, deltaTime, scene);
    
    // 更新场景（预留扩展）
    scene.update(camera);
    
    // 设置uniform变量
    setUniforms(currentTime / 1000.0);
    
    // 清空画布
    gl.clearColor(0.0, 0.0, 0.0, 1.0);
    gl.clear(gl.COLOR_BUFFER_BIT);
    
    // 绘制全屏四边形（触发片段着色器）
    gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
    
    // 更新UI
    updateUI();
    
    // 继续渲染循环
    requestAnimationFrame(render);
}

/**
 * 设置uniform变量
 */
function setUniforms(time) {
    const width = gl.canvas.width;
    const height = gl.canvas.height;
    
    // 分辨率
    setUniform2f('u_resolution', width, height);
    
    // 时间
    setUniform1f('u_time', time);
    
    // 相机参数
    const cameraPos = camera.getPosition();
    const cameraDir = camera.getDirection();
    const cameraUp = camera.getUp();
    const cameraRight = camera.getRight();
    
    setUniform3f('u_cameraPos', cameraPos[0], cameraPos[1], cameraPos[2]);
    setUniform3f('u_cameraDir', cameraDir[0], cameraDir[1], cameraDir[2]);
    setUniform3f('u_cameraUp', cameraUp[0], cameraUp[1], cameraUp[2]);
    setUniform3f('u_cameraRight', cameraRight[0], cameraRight[1], cameraRight[2]);
    setUniform1f('u_fov', camera.getFov());

    // 环境光（仅保留环境光，不包含任何手电筒/聚光/阴影逻辑）
    setUniform1f('u_ambientStrength', 0.02);
    
    // 场景参数
    setUniform1f('u_roomSize', scene.getRoomSize());
    
    // 雾化参数
    setUniform1f('u_fogDensity', 0.01);
    setUniform3f('u_fogColor', 0.0, 0.0, 0.0);
    
    // 性能参数：增加采样数以提升质量（不进行性能优化）
    const samples = 4;  // 使用4x4采样（16个采样点）提升反走样质量
    const samplesLocation = gl.getUniformLocation(program, 'u_samples');
    if (samplesLocation !== null) {
        gl.uniform1i(samplesLocation, samples);
    }
    // 纹理设置
    if (floorTexture && wallTexture && ceilingTexture) {
        // 绑定纹理到纹理单元
        gl.activeTexture(gl.TEXTURE0);
        gl.bindTexture(gl.TEXTURE_2D, floorTexture.texture);
        const floorLoc = gl.getUniformLocation(program, 'u_floorTexture');
        if (floorLoc !== null) {
            gl.uniform1i(floorLoc, 0);
        }
        
        gl.activeTexture(gl.TEXTURE1);
        gl.bindTexture(gl.TEXTURE_2D, wallTexture.texture);
        const wallLoc = gl.getUniformLocation(program, 'u_wallTexture');
        if (wallLoc !== null) {
            gl.uniform1i(wallLoc, 1);
        }
        
        gl.activeTexture(gl.TEXTURE2);
        gl.bindTexture(gl.TEXTURE_2D, ceilingTexture.texture);
        const ceilingLoc = gl.getUniformLocation(program, 'u_ceilingTexture');
        if (ceilingLoc !== null) {
            gl.uniform1i(ceilingLoc, 2);
        }
        
        // 传递纹理尺寸和平铺比例
        const roomSize = scene.getRoomSize();
        const wallSize = roomSize * 2.0; // 一面墙的尺寸（40单位，从-20到20）
        
        // 计算平铺比例：确保一面墙有3-5张图片拼接
        // UV坐标是位置坐标（-20到20，共40单位）
        // 如果希望有4张图片，每张图片应该占据 40/4 = 10单位
        // 在shader中：fract(uv * tileScale)，如果tileScale=0.1，那么uv*0.1后每10单位重复一次
        // 所以tileScale = tilesPerWall / wallSize = 4 / 40 = 0.1
        // 将每张图片放大2.5倍（减少平铺数量）
        // 如果当前是16张，放大2.5倍后约为6-7张
        const currentTileScale = 3.0 / wallSize;  // 当前的基础比例
        const scaleMultiplier = 2.5;  // 放大倍数
        const tileScale = currentTileScale / scaleMultiplier;  // 除以倍数以放大图片
        const floorTileScale = tileScale;
        const wallTileScale = tileScale;
        const ceilingTileScale = tileScale;
        
        setUniform2f('u_floorTileScale', floorTileScale, floorTileScale);
        setUniform2f('u_wallTileScale', wallTileScale, wallTileScale);
        setUniform2f('u_ceilingTileScale', ceilingTileScale, ceilingTileScale);
    }
    
    // Hero位置
    const heroPos = camera.getHeroPosition();
    setUniform3f('u_heroPosition', heroPos[0], heroPos[1], heroPos[2]);
    
    // 视角模式
    const viewMode = camera.getViewMode();
    setUniform1f('u_viewMode', viewMode);
    
    // 聚光灯光源参数（始终启用，基于Hero位置和主视角方向）
    // 获取主视角的方向（mainYaw, mainPitch）
    const mainYaw = camera.mainYaw;
    const mainPitch = camera.mainPitch;
    
    // 根据主视角的yaw和pitch计算方向向量（和camera.js中的updateDirection()保持一致）
    // 注意：如果相机方向反了，这里需要取反
    const normalizedMainDir = [
        Math.cos(mainPitch) * Math.sin(mainYaw),
        Math.sin(mainPitch),
        Math.cos(mainPitch) * Math.cos(mainYaw)
    ];
    // 如果用户视角实际超前但看到的是朝后，说明方向反了，需要取反
    const normalizedMainDirVec = vec3Normalize([
        -normalizedMainDir[0],
        -normalizedMainDir[1],
        -normalizedMainDir[2]
    ]);
    
    // 计算主视角的右向量和上向量（和camera.js中的计算保持一致）
    const mainRight = vec3Normalize(vec3Cross(normalizedMainDirVec, [0, 1, 0]));
    const mainUp = vec3Normalize(vec3Cross(mainRight, normalizedMainDirVec));
    
    // 计算聚光灯位置：
    // 1. 基于Hero位置（heroPos）
    // 2. 在Hero立方体后方（沿主视角方向反向移动，移到Hero后面）
    // 3. 在相机高度下方（向下偏移0.3单位）
    // Hero立方体尺寸是[0.3, 1.0, 0.3]，半边长是0.15
    const backwardOffset = 0.5;   // 后移距离（移到Hero后面，再后移一点）
    const downwardOffset = 0.3;   // 向下偏移
    const cameraHeight = 0.6;      // 相机相对Hero的高度
    
    const lightPosition = [
        heroPos[0] - normalizedMainDirVec[0] * backwardOffset,  // 反向移动
        heroPos[1] + cameraHeight - downwardOffset,
        heroPos[2] - normalizedMainDirVec[2] * backwardOffset  // 反向移动
    ];
    
    // 计算聚光灯方向：
    // 基础方向是主视角方向，然后向上偏移一个小角度（5度）
    const upwardAngle = degToRad(5.0);  // 向上偏移5度
    const cosAngle = Math.cos(upwardAngle);
    const sinAngle = Math.sin(upwardAngle);
    
    // 绕右向量旋转主视角方向（向上偏移）
    // lightDir = dir * cos(angle) + up * sin(angle)
    const lightDirection = [
        normalizedMainDirVec[0] * cosAngle + mainUp[0] * sinAngle,
        normalizedMainDirVec[1] * cosAngle + mainUp[1] * sinAngle,
        normalizedMainDirVec[2] * cosAngle + mainUp[2] * sinAngle
    ];
    const normalizedLightDir = vec3Normalize(lightDirection);
    
    setUniform3f('u_lightPosition', lightPosition[0], lightPosition[1], lightPosition[2]);
    setUniform3f('u_lightDirection', normalizedLightDir[0], normalizedLightDir[1], normalizedLightDir[2]);
    setUniform1f('u_lightIntensity', 5.333);  // 光源基础强度Z（减小到2/3）
    setUniform1f('u_lightMaxAngle', 30.0 * Math.PI / 180.0);  // 最大照射角度30度（转换为弧度）
    setUniform1f('u_volumetricLightMaxIntensity', 1.0);  // 体积光束强度上限G
    setUniform1i('u_volumetricLightEnabled', volumetricLightEnabled ? 1 : 0);  // 体积光束效果开关
    setUniform1i('u_mengerSpongeEnabled', mengerSpongeEnabled ? 1 : 0);  // Menger海绵显示开关
    // #region agent log
    if (volumetricLightEnabled) {
        fetch('http://127.0.0.1:7243/ingest/f75d3637-4327-48d1-a584-c484c14acea8',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'main.js:380',message:'设置体积光束uniform',data:{enabled:volumetricLightEnabled,uniformValue:volumetricLightEnabled?1:0},timestamp:Date.now(),sessionId:'debug-session',runId:'run1',hypothesisId:'D'})}).catch(()=>{});
    }
    // #endregion
}

/**
 * 辅助函数：设置uniform
 */
function setUniform1f(name, value) {
    const location = gl.getUniformLocation(program, name);
    if (location !== null) {
        gl.uniform1f(location, value);
    }
}

function setUniform2f(name, x, y) {
    const location = gl.getUniformLocation(program, name);
    if (location !== null) {
        gl.uniform2f(location, x, y);
    }
}

function setUniform3f(name, x, y, z) {
    const location = gl.getUniformLocation(program, name);
    if (location !== null) {
        gl.uniform3f(location, x, y, z);
    }
}

function setUniform1i(name, value) {
    const location = gl.getUniformLocation(program, name);
    if (location !== null) {
        gl.uniform1i(location, value);
    }
}

/**
 * 更新UI显示
 */
function updateUI() {
    const pos = camera.getPosition();
    document.getElementById('position').textContent = 
        `${pos[0].toFixed(2)}, ${pos[1].toFixed(2)}, ${pos[2].toFixed(2)}`;
}

// 页面加载完成后初始化
window.addEventListener('load', () => {
    init().catch(error => {
        console.error('初始化失败:', error);
        alert('初始化失败: ' + error.message);
    });
});
