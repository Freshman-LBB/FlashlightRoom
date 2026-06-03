// 相机控制和变换矩阵计算

class Camera {
    constructor() {
        // 当前视角模式：0=主视角, 1-4=房顶四角
        this.viewMode = 0;
        
        // Hero位置（主角实际位置）
        this.heroPosition = [0, -13.9, 0];
        this.heroVelocityY = 0;
        this.heroIsGrounded = false;
        
        // 碰撞状态缓存（用于稳定站在物体上的位置）
        this.lastStandingOnObject = null;  // 上一帧站在哪个物体上
        this.stableStandingY = null;  // 稳定的站立Y位置
        this.stableCameraY = null;  // 稳定的相机Y位置（用于消除抖动）
        
        // 主视角相机位置（房间底面在Y=-15.5，人眼高度1.6）
        this.mainPosition = [0, -13.9, 0];
        this.mainYaw = 0;
        this.mainPitch = 0;
        
        // 房顶四角相机位置（Y=18，俯视，更靠近房间中心）
        this.cornerPositions = [
            [-15, 18, -15],  // 左后角（从-18调整到-15）
            [15, 18, -15],   // 右后角（从18调整到15）
            [15, 18, 15],    // 右前角（从18调整到15）
            [-15, 18, 15]    // 左前角（从-18调整到-15）
        ];
        // 计算每个机位朝向房间中心(0,0,0)的yaw值（位置已更新为-15/15）
        // 机位1(-15,18,-15)→(0,0,0): yaw = atan2(15, 15) = PI/4
        // 机位2(15,18,-15)→(0,0,0): yaw = atan2(-15, 15) = -PI/4
        // 机位3(15,18,15)→(0,0,0): yaw = atan2(-15, -15) = -3*PI/4
        // 机位4(-15,18,15)→(0,0,0): yaw = atan2(15, -15) = 3*PI/4
        this.cornerYaws = [
            Math.PI * 0.25,   // 机位1：左后角，朝向房间中心
            -Math.PI * 0.25,  // 机位2：右后角，朝向房间中心
            -Math.PI * 0.75,   // 机位3：右前角，朝向房间中心
            Math.PI * 0.75    // 机位4：左前角，朝向房间中心
        ];
        this.cornerPitch = -Math.PI * 0.4;  // 向下俯视
        
        // 保存每个机位的初始旋转值（用于角度限制）
        this.cornerInitialYaws = [...this.cornerYaws];
        this.cornerInitialPitch = this.cornerPitch;
        
        // 当前相机位置（会根据 viewMode 切换）
        this.position = [0, -13.9, 0];
        
        // 相机旋转（欧拉角：yaw, pitch）
        this.yaw = 0;      // 水平旋转（绕Y轴）
        this.pitch = 0;    // 垂直旋转（绕X轴）
        
        // 相机参数
        this.fov = degToRad(60);  // 视野角度（弧度）
        this.minFov = degToRad(30);  // 最小FOV（放大）
        this.maxFov = degToRad(90);  // 最大FOV（缩小）
        this.aspect = 1.0;
        this.near = 0.1;
        this.far = 100.0;
        
        // 移动速度
        this.moveSpeed = 5.0;
        this.rotationSpeed = 2.0;
        this.jumpSpeed = 8.0;  // 增加跳跃高度
        
        // 跳跃相关
        this.velocityY = 0;
        this.gravity = -9.8;
        this.isGrounded = false;
        this.groundHeight = -15.5;  // 房间底面在Y=-15.5
        
        // 计算方向向量
        this.updateDirection();
    }
    
    /**
     * 切换视角模式
     */
    switchViewMode(mode) {
        if (mode >= 0 && mode <= 4) {
            this.viewMode = mode;
            this.updateViewMode();
        }
    }
    
    /**
     * 根据视角模式更新相机位置和旋转
     */
    updateViewMode() {
        if (this.viewMode === 0) {
            // 主视角：恢复主相机状态
            this.position = vec3Copy(this.mainPosition);
            this.yaw = this.mainYaw;
            this.pitch = this.mainPitch;
        } else {
            // 房顶四角视角（1-4）
            const cornerIndex = this.viewMode - 1;
            this.position = vec3Copy(this.cornerPositions[cornerIndex]);
            this.yaw = this.cornerYaws[cornerIndex];
            this.pitch = this.cornerPitch;
        }
        this.updateDirection();
    }
    
    /**
     * 根据yaw和pitch更新方向向量
     */
    updateDirection() {
        // 计算前方向量（相机朝向）
        this.direction = [
            Math.cos(this.pitch) * Math.sin(this.yaw),
            Math.sin(this.pitch),
            Math.cos(this.pitch) * Math.cos(this.yaw)
        ];
        this.direction = vec3Normalize(this.direction);
        
        // 计算右方向量
        this.right = vec3Normalize(vec3Cross(this.direction, [0, 1, 0]));
        
        // 计算上方向量
        this.up = vec3Normalize(vec3Cross(this.right, this.direction));
    }
    
    /**
     * 更新相机（每帧调用）
     */
    update(inputManager, deltaTime, scene) {
        // 处理视角切换（按键1-5）
        if (inputManager.isKeyPressed('Digit1')) {
            this.switchViewMode(1);
        }
        if (inputManager.isKeyPressed('Digit2')) {
            this.switchViewMode(2);
        }
        if (inputManager.isKeyPressed('Digit3')) {
            this.switchViewMode(3);
        }
        if (inputManager.isKeyPressed('Digit4')) {
            this.switchViewMode(4);
        }
        if (inputManager.isKeyPressed('Digit5')) {
            this.switchViewMode(0);
        }
        
        // 处理相机旋转
        if (this.viewMode === 0) {
            // 主视角模式：处理鼠标旋转
            const mouseDelta = inputManager.getMouseDelta();
            this.yaw -= mouseDelta.x * 0.002 * this.rotationSpeed;
            this.pitch -= mouseDelta.y * 0.002 * this.rotationSpeed;
            
            // 限制pitch范围（避免翻转）
            this.pitch = clamp(this.pitch, -Math.PI / 2 + 0.1, Math.PI / 2 - 0.1);
            
            // 保存主视角状态
            this.mainYaw = this.yaw;
            this.mainPitch = this.pitch;
        } else {
            // 1-4视角模式：鼠标和IKJL控制相机方向
            const cornerIndex = this.viewMode - 1;
            const initialYaw = this.cornerInitialYaws[cornerIndex];
            const initialPitch = this.cornerInitialPitch;
            const maxAngleOffset = Math.PI / 4;  // 45度限制
            
            // 鼠标控制
            const mouseDelta = inputManager.getMouseDelta();
            if (mouseDelta.x !== 0 || mouseDelta.y !== 0) {
                this.yaw -= mouseDelta.x * 0.002 * this.rotationSpeed;
                this.pitch -= mouseDelta.y * 0.002 * this.rotationSpeed;
            }
            
            // IKJL键盘控制
            if (inputManager.isKeyDown('KeyI')) {
                this.pitch += deltaTime * this.rotationSpeed;
            }
            if (inputManager.isKeyDown('KeyK')) {
                this.pitch -= deltaTime * this.rotationSpeed;
            }
            if (inputManager.isKeyDown('KeyJ')) {
                this.yaw += deltaTime * this.rotationSpeed;  // 修正：J向左转
            }
            if (inputManager.isKeyDown('KeyL')) {
                this.yaw -= deltaTime * this.rotationSpeed;  // 修正：L向右转
            }
            
            // 限制角度偏移（相对于初始方向不超过45度）
            let yawOffset = this.yaw - initialYaw;
            // 处理角度环绕（-PI到PI）
            if (yawOffset > Math.PI) yawOffset -= 2 * Math.PI;
            if (yawOffset < -Math.PI) yawOffset += 2 * Math.PI;
            yawOffset = clamp(yawOffset, -maxAngleOffset, maxAngleOffset);
            this.yaw = initialYaw + yawOffset;
            
            let pitchOffset = this.pitch - initialPitch;
            pitchOffset = clamp(pitchOffset, -maxAngleOffset, maxAngleOffset);
            this.pitch = initialPitch + pitchOffset;
        }
        
        // 处理滚轮FOV控制（仅非主视角模式支持，主视角不允许缩放）
        if (this.viewMode !== 0) {
            const wheelDelta = inputManager.getWheelDelta();
            if (wheelDelta !== 0) {
                // 滚轮向上（delta < 0）：减小FOV（放大）
                // 滚轮向下（delta > 0）：增大FOV（缩小）
                // 其他视角模式：更快的缩放速度（3倍）
                const fovChange = wheelDelta * 0.6;  // 每次滚轮调整60度（更快）
                this.fov += degToRad(fovChange);
                // 其他视角模式：更高的上限（120度）
                const maxFovOther = degToRad(120);
                this.fov = clamp(this.fov, this.minFov, maxFovOther);
            }
        }
        
        // 更新方向向量
        this.updateDirection();
        
        // 处理Hero移动（所有视角模式都支持）
        // 移动方向基于主视角的yaw（hero的朝向），而不是当前相机的yaw
        const moveDelta = [0, 0, 0];
        
        // 使用主视角的yaw计算移动方向
        const moveYaw = this.mainYaw;
        const moveDir = [
            Math.sin(moveYaw),
            0,
            Math.cos(moveYaw)
        ];
        const moveRight = [
            Math.cos(moveYaw),
            0,
            -Math.sin(moveYaw)
        ];
        
        // 将方向向量投影到水平面（已经是水平了）
        const horizontalDir = vec3Normalize(moveDir);
        const horizontalRight = vec3Normalize(moveRight);
        
        if (inputManager.isKeyDown('KeyW')) {
            // 向前移动（沿方向向量，投影到水平面）
            moveDelta[0] += horizontalDir[0] * this.moveSpeed * deltaTime;
            moveDelta[2] += horizontalDir[2] * this.moveSpeed * deltaTime;
        }
        if (inputManager.isKeyDown('KeyS')) {
            // 向后移动
            moveDelta[0] -= horizontalDir[0] * this.moveSpeed * deltaTime;
            moveDelta[2] -= horizontalDir[2] * this.moveSpeed * deltaTime;
        }
        if (inputManager.isKeyDown('KeyA')) {
            // 向左移动（沿右向量反方向，投影到水平面）
            moveDelta[0] += horizontalRight[0] * this.moveSpeed * deltaTime;
            moveDelta[2] += horizontalRight[2] * this.moveSpeed * deltaTime;
        }
        if (inputManager.isKeyDown('KeyD')) {
            // 向右移动（沿右向量，投影到水平面）
            moveDelta[0] -= horizontalRight[0] * this.moveSpeed * deltaTime;
            moveDelta[2] -= horizontalRight[2] * this.moveSpeed * deltaTime;
        }
        
        // 处理跳跃
        if (inputManager.isKeyDown('Space') && this.heroIsGrounded) {
            this.heroVelocityY = this.jumpSpeed;
            this.heroIsGrounded = false;
        }
        
        // 应用重力到hero
        this.heroVelocityY += this.gravity * deltaTime;
        const verticalDelta = this.heroVelocityY * deltaTime;
        
        // ==================== 碰撞检测系统（可扩展） ====================
        const roomSize = scene ? scene.getRoomSize() : 20.0;
        const collisionRadius = 0.3;
        const heroHeight = 1.0;
        const heroBottomOffset = 0.5;
        
        // 保存上一帧位置（用于稳定碰撞检测）
        const prevHeroPos = vec3Copy(this.heroPosition);
        
        // 碰撞检测处理器映射表（易于扩展新物体类型）
        const collisionHandlers = {
            'box': this.handleBoxCollision.bind(this),
            'sphere': this.handleSphereCollision.bind(this),
            'fractal': this.handleSphereCollision.bind(this)  // fractal使用球形碰撞
        };
        
        // 先处理水平移动碰撞检测（XZ平面）
        const newX = this.heroPosition[0] + moveDelta[0];
        const newZ = this.heroPosition[2] + moveDelta[2];
        
        // 房间边界检测（XZ）- 竖墙碰撞检测面内移1个单位
        let finalX = clamp(newX, -roomSize + collisionRadius + 1.0, roomSize - collisionRadius - 1.0);
        let finalZ = clamp(newZ, -roomSize + collisionRadius + 1.0, roomSize - collisionRadius - 1.0);
        
        // 物体水平碰撞检测（改进：直接使用修正后的位置，碰撞检测算法本身已优化）
        if (scene) {
            const objects = scene.getObjects();
            for (let obj of objects) {
                const handler = collisionHandlers[obj.type];
                if (handler) {
                    const result = handler(obj, finalX, this.heroPosition[1], finalZ, 
                                         collisionRadius, heroBottomOffset, 'horizontal', prevHeroPos);
                    if (result.blockedX !== undefined) finalX = result.blockedX;
                    if (result.blockedZ !== undefined) finalZ = result.blockedZ;
                }
            }
        }
        
        // 应用水平移动
        this.heroPosition[0] = finalX;
        this.heroPosition[2] = finalZ;
        
        // 处理垂直移动碰撞检测（Y轴）
        const newY = this.heroPosition[1] + verticalDelta;
        let finalY = newY;
        this.heroIsGrounded = false;
        
        // 地面碰撞检测
        if (finalY - heroBottomOffset <= this.groundHeight) {
            finalY = this.groundHeight + heroBottomOffset;
            this.heroVelocityY = 0;
            this.heroIsGrounded = true;
        }
        
        // 天花板碰撞检测
        if (finalY + heroBottomOffset > roomSize - collisionRadius) {
            finalY = roomSize - collisionRadius - heroBottomOffset;
            this.heroVelocityY = 0;
        }
        
        // 物体垂直碰撞检测（改进：使用平滑的位置修正，减少抖动）
        let standingOnObject = null;
        if (scene) {
            const objects = scene.getObjects();
            for (let obj of objects) {
                const handler = collisionHandlers[obj.type];
                if (handler) {
                    const result = handler(obj, this.heroPosition[0], finalY, this.heroPosition[2],
                                         collisionRadius, heroBottomOffset, 'vertical', prevHeroPos);
                    if (result.blockedY !== undefined) {
                        // 如果result.standingOn为true，会在后面统一处理稳定位置，这里先不设置finalY
                        if (!result.standingOn) {
                            finalY = result.blockedY;
                        }
                        if (result.grounded !== undefined) this.heroIsGrounded = result.grounded;
                        if (result.velocityY !== undefined) this.heroVelocityY = result.velocityY;
                        if (result.standingOn) {
                            standingOnObject = obj;  // 记录站在哪个物体上
                        }
                    }
                }
            }
        }
        
        // 应用垂直移动（使用稳定的位置，避免抖动）
        // 如果站在物体上且是同一个物体，使用稳定的位置（避免每帧微调导致抖动）
        if (standingOnObject && this.lastStandingOnObject === standingOnObject && this.stableStandingY !== null) {
            // 检查是否还在物体上方（允许小的水平移动）
            const objPos = standingOnObject.position;
            const objSize = standingOnObject.size || [1.0, 1.0, 1.0];
            const dx = this.heroPosition[0] - objPos[0];
            const dz = this.heroPosition[2] - objPos[2];
            const distX = Math.abs(dx) - objSize[0];
            const distZ = Math.abs(dz) - objSize[2];
            
            // 如果还在物体上方，使用稳定的Y位置
            if (distX < collisionRadius && distZ < collisionRadius) {
                finalY = this.stableStandingY;
                // 同时稳定相机Y位置
                if (this.stableCameraY !== null) {
                    this.stableCameraY = this.stableStandingY + 0.6;
                }
            } else {
                // 离开了物体，清除稳定位置
                this.stableStandingY = null;
                this.stableCameraY = null;
                this.lastStandingOnObject = null;
            }
        } else if (standingOnObject) {
            // 新站在物体上，计算并保存稳定位置
            const objPos = standingOnObject.position;
            const objSize = standingOnObject.size || [1.0, 1.0, 1.0];
            const objTop = objPos[1] + objSize[1];
            this.stableStandingY = objTop + heroBottomOffset + 0.02;
            this.stableCameraY = this.stableStandingY + 0.6;  // 同时计算稳定的相机Y位置
            this.lastStandingOnObject = standingOnObject;
            finalY = this.stableStandingY;
        } else {
            // 没有站在物体上，清除稳定位置
            this.stableStandingY = null;
            this.stableCameraY = null;
            this.lastStandingOnObject = null;
        }
        
        this.heroPosition[1] = finalY;
        
        // 在主视角模式下，相机位置跟随hero位置（向上偏移，避免卡在hero立方体内）
        if (this.viewMode === 0) {
            // 如果站在物体上，使用稳定的相机Y位置，避免抖动
            if (this.stableCameraY !== null) {
                this.position = [this.heroPosition[0], this.stableCameraY, this.heroPosition[2]];
            } else {
                // 没有站在物体上，正常计算相机位置
                this.position = [this.heroPosition[0], this.heroPosition[1] + 0.6, this.heroPosition[2]];
            }
            this.mainPosition = vec3Copy(this.position);
        }
        
        // 更新宽高比
        const canvas = document.getElementById('canvas');
        if (canvas) {
            this.aspect = canvas.width / canvas.height;
        }
    }
    
    /**
     * 获取相机位置
     */
    getPosition() {
        return vec3Copy(this.position);
    }
    
    /**
     * 获取Hero位置
     */
    getHeroPosition() {
        return vec3Copy(this.heroPosition);
    }
    
    /**
     * 获取当前视角模式
     */
    getViewMode() {
        return this.viewMode;
    }
    
    /**
     * 处理Box类型物体的碰撞（可扩展的碰撞处理器）
     * @param {Object} obj - 物体对象
     * @param {number} heroX - hero的X位置
     * @param {number} heroY - hero的Y位置
     * @param {number} heroZ - hero的Z位置
     * @param {number} collisionRadius - 碰撞半径
     * @param {number} heroBottomOffset - hero底部偏移
     * @param {string} mode - 'horizontal' 或 'vertical'
     * @param {Array} prevPos - 上一帧的位置 [x, y, z]
     * @returns {Object} 碰撞结果 {blockedX, blockedZ, blockedY, grounded, velocityY}
     */
    handleBoxCollision(obj, heroX, heroY, heroZ, collisionRadius, heroBottomOffset, mode, prevPos) {
        const objPos = obj.position;
        const objSize = obj.size || [1.0, 1.0, 1.0];
        const margin = collisionRadius;
        const result = {};
        
        const dx = heroX - objPos[0];
        const dz = heroZ - objPos[2];
        const distX = Math.abs(dx) - objSize[0];
        const distZ = Math.abs(dz) - objSize[2];
        
        const heroBottom = heroY - heroBottomOffset;
        const heroTop = heroY + heroBottomOffset;
        const objTop = objPos[1] + objSize[1];
        const objBottom = objPos[1] - objSize[1];
        const inYRange = heroBottom < objTop && heroTop > objBottom;
        
        if (mode === 'horizontal') {
            // 水平碰撞检测（改进：在边界处使用更稳定的选择方法，减少抖动）
            if (distX < margin && distZ < margin && inYRange) {
                // 计算到边界的距离
                const distToXBoundary = Math.abs(distX);
                const distToZBoundary = Math.abs(distZ);
                
                // 如果两个方向都很接近（差值小于0.05），使用上一帧的移动方向来判断
                // 这样可以避免在边界处来回切换
                const threshold = 0.05;
                if (Math.abs(distToXBoundary - distToZBoundary) < threshold && prevPos) {
                    // 使用上一帧的移动方向来判断应该阻止哪个方向
                    const prevDx = prevPos[0] - objPos[0];
                    const prevDz = prevPos[2] - objPos[2];
                    const prevDistX = Math.abs(prevDx) - objSize[0];
                    const prevDistZ = Math.abs(prevDz) - objSize[2];
                    
                    // 如果上一帧更接近X边界，阻止X方向；否则阻止Z方向
                    if (Math.abs(prevDistX) < Math.abs(prevDistZ)) {
                        result.blockedX = objPos[0] + (dx > 0 ? 1 : -1) * (objSize[0] + margin);
                    } else {
                        result.blockedZ = objPos[2] + (dz > 0 ? 1 : -1) * (objSize[2] + margin);
                    }
                } else {
                    // 正常情况：找到最近的边界并阻止移动
                    if (distToXBoundary < distToZBoundary) {
                        result.blockedX = objPos[0] + (dx > 0 ? 1 : -1) * (objSize[0] + margin);
                    } else {
                        result.blockedZ = objPos[2] + (dz > 0 ? 1 : -1) * (objSize[2] + margin);
                    }
                }
            }
        } else if (mode === 'vertical') {
            // 垂直碰撞检测
            if (distX < margin && distZ < margin) {
                if (inYRange) {
                    const prevY = prevPos[1];
                    const prevBottom = prevY - heroBottomOffset;
                    
                    // 判断是从上方还是下方碰撞（使用上一帧位置判断，更稳定）
                    if (prevBottom >= objTop - 0.15 && heroY <= objTop + heroBottomOffset + 0.15) {
                        // 从上方落下，站在物体上（位置将在外部稳定化处理）
                        result.blockedY = objTop + heroBottomOffset + 0.02;
                        result.velocityY = 0;
                        result.grounded = true;
                        result.standingOn = true;  // 标记站在物体上，用于稳定位置处理
                    } else if (heroY + heroBottomOffset > objBottom && prevY + heroBottomOffset <= objBottom + 0.1) {
                        // 从下方碰撞
                        result.blockedY = objBottom - heroBottomOffset - 0.02;
                        result.velocityY = 0;
                    }
                }
            }
        }
        
        return result;
    }
    
    /**
     * 处理Sphere类型物体的碰撞（可扩展的碰撞处理器）
     * @param {Object} obj - 物体对象
     * @param {number} heroX - hero的X位置
     * @param {number} heroY - hero的Y位置
     * @param {number} heroZ - hero的Z位置
     * @param {number} collisionRadius - 碰撞半径
     * @param {number} heroBottomOffset - hero底部偏移
     * @param {string} mode - 'horizontal' 或 'vertical'
     * @param {Array} prevPos - 上一帧的位置 [x, y, z]
     * @returns {Object} 碰撞结果
     */
    handleSphereCollision(obj, heroX, heroY, heroZ, collisionRadius, heroBottomOffset, mode, prevPos) {
        const objPos = obj.position;
        const radius = obj.type === 'sphere' ? (obj.radius || 0.8) : (obj.size || 1.5);
        const totalRadius = radius + collisionRadius;
        const result = {};
        
        const dx = heroX - objPos[0];
        const dy = heroY - objPos[1];
        const dz = heroZ - objPos[2];
        const dist = Math.sqrt(dx * dx + dy * dy + dz * dz);
        
        if (dist < totalRadius && dist > 0.001) {
            const normal = [dx / dist, dy / dist, dz / dist];
            
            if (mode === 'horizontal') {
                // 水平碰撞：只处理XZ
                const horizontalDist = Math.sqrt(dx * dx + dz * dz);
                if (horizontalDist > 0.001) {
                    const horizontalNormal = [dx / horizontalDist, 0, dz / horizontalDist];
                    const pushDist = totalRadius - Math.abs(dy);
                    if (pushDist > 0 && Math.abs(dy) < heroBottomOffset * 2) {
                        result.blockedX = objPos[0] + horizontalNormal[0] * Math.sqrt(totalRadius * totalRadius - dy * dy);
                        result.blockedZ = objPos[2] + horizontalNormal[2] * Math.sqrt(totalRadius * totalRadius - dy * dy);
                    }
                }
            } else if (mode === 'vertical') {
                // 垂直碰撞：主要处理Y轴
                if (Math.abs(dy) > Math.abs(dx) * 0.5 && Math.abs(dy) > Math.abs(dz) * 0.5) {
                    if (dy > 0) {
                        // 从上方，允许站在上面
                        result.blockedY = objPos[1] + totalRadius;
                        result.velocityY = Math.max(0, this.heroVelocityY);
                        if (result.velocityY === 0) {
                            result.grounded = true;
                        }
                    } else {
                        // 从下方
                        result.blockedY = objPos[1] - totalRadius;
                        result.velocityY = Math.min(0, this.heroVelocityY);
                    }
                } else {
                    // 主要水平碰撞，但也需要调整Y
                    result.blockedY = objPos[1] + normal[1] * totalRadius;
                }
            }
        }
        
        return result;
    }
    
    /**
     * 获取相机方向
     */
    getDirection() {
        return vec3Copy(this.direction);
    }
    
    /**
     * 获取相机上向量
     */
    getUp() {
        return vec3Copy(this.up);
    }
    
    /**
     * 获取相机右向量
     */
    getRight() {
        return vec3Copy(this.right);
    }
    
    /**
     * 获取视野角度
     */
    getFov() {
        return this.fov;
    }
}
