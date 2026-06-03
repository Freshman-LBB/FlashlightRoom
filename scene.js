// 场景管理，物体和光源组织

class Scene {
    constructor() {
        this.roomSize = 20.0;  // 房间大小（边长的一半，实际边长40）
        this.objects = [];
        
        // 创建测试物体
        this.createTestObjects();
    }
    
    /**
     * 创建测试物体
     */
    createTestObjects() {
        // 多面材质不同的立方体：左后角，底部在Y=-15.5（房间底面）
        this.objects.push({
            type: 'box',
            position: [-8, -14.5, -8],  // 中心Y=-14.5，size=1，底部在Y=-15.5
            size: [1, 1, 1],
            material: {
                type: 'diffuse',
                colors: [
                    [1, 0, 0],  // 右面：红
                    [0, 1, 0],  // 左面：绿
                    [0, 0, 1],  // 上面：蓝
                    [1, 1, 0],  // 下面：黄
                    [1, 0, 1],  // 前面：紫
                    [0, 1, 1]   // 后面：青
                ]
            }
        });
        
        // 标准球体：右后角，底部在Y=-15.5（房间底面）
        this.objects.push({
            type: 'sphere',
            position: [8, -14.5, -8],  // 中心Y=-14.5，半径0.8，底部在Y=-15.3
            radius: 0.8,
            material: {
                type: 'diffuse',
                color: [0.5, 0.0, 0.8]  // 紫色
            }
        });
        
        // Menger海绵分形几何体：左前方，底部在Y=-15.5（房间底面）
        this.objects.push({
            type: 'menger',
            position: [-8, -14.5, 8],  // 中心Y=-14.5，size=2.0，底部在Y=-15.5
            size: 2.0,
            level: 1,  // 递归深度1级（20个小立方体）
            material: {
                type: 'diffuse',
                color: [0.2, 0.8, 0.9]  // 青色
            }
        });
    }
    
    /**
     * 更新场景（每帧调用）
     */
    update(camera) {
        // 预留：如需在JS侧做场景动态更新，可在此处理。
    }
    
    /**
     * 获取房间大小
     */
    getRoomSize() {
        return this.roomSize;
    }
    
    /**
     * 获取所有物体
     */
    getObjects() {
        return this.objects;
    }
}
