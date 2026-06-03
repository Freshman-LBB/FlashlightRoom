// 用户输入处理（键盘、鼠标）

class InputManager {
    constructor() {
        this.keys = {};
        this.keysPressed = {};  // 记录按键按下事件（单次触发）
        this.mouse = {
            x: 0,
            y: 0,
            deltaX: 0,
            deltaY: 0,
            wheelDelta: 0,  // 鼠标滚轮增量（手动实现）
            buttons: {}
        };
        this.locked = false;
        
        this.setupEventListeners();
    }
    
    setupEventListeners() {
        // 键盘事件
        document.addEventListener('keydown', (e) => {
            if (!this.keys[e.code]) {
                this.keysPressed[e.code] = true;  // 记录按键按下事件
            }
            this.keys[e.code] = true;
            // 防止空格键滚动页面
            if (e.code === 'Space') {
                e.preventDefault();
            }
        });
        
        document.addEventListener('keyup', (e) => {
            this.keys[e.code] = false;
            this.keysPressed[e.code] = false;
        });
        
        // 鼠标移动事件
        document.addEventListener('mousemove', (e) => {
            if (this.locked) {
                this.mouse.deltaX = e.movementX || 0;
                this.mouse.deltaY = e.movementY || 0;
            } else {
                this.mouse.x = e.clientX;
                this.mouse.y = e.clientY;
            }
        });
        
        // 鼠标点击锁定（用于第一人称控制）
        document.addEventListener('click', () => {
            if (!this.locked) {
                this.lockPointer();
            }
        });
        
        // 指针锁定变化
        document.addEventListener('pointerlockchange', () => {
            this.locked = document.pointerLockElement !== null;
        });
        
        document.addEventListener('pointerlockerror', () => {
            console.error('指针锁定失败');
        });
        
        // 鼠标滚轮事件（手动实现缩放功能）
        // 滚轮向上（远离用户）：deltaY < 0，应该放大（缩小FOV）
        // 滚轮向下（靠近用户）：deltaY > 0，应该缩小（增大FOV）
        document.addEventListener('wheel', (e) => {
            e.preventDefault();  // 防止页面滚动
            // 归一化滚轮增量（不同浏览器可能有不同的值）
            // deltaY > 0 表示向下滚（放大FOV，缩小画面）
            // deltaY < 0 表示向上滚（缩小FOV，放大画面）
            this.mouse.wheelDelta += Math.sign(e.deltaY);
        }, { passive: false });
    }
    
    lockPointer() {
        const canvas = document.getElementById('canvas');
        if (canvas && canvas.requestPointerLock) {
            canvas.requestPointerLock();
        }
    }
    
    /**
     * 检查按键是否按下
     */
    isKeyDown(code) {
        return this.keys[code] === true;
    }
    
    /**
     * 检查按键是否刚按下（单次触发）
     */
    isKeyPressed(code) {
        const pressed = this.keysPressed[code] === true;
        if (pressed) {
            this.keysPressed[code] = false;  // 消费事件
        }
        return pressed;
    }
    
    /**
     * 获取鼠标移动增量
     */
    getMouseDelta() {
        const delta = { x: this.mouse.deltaX, y: this.mouse.deltaY };
        this.mouse.deltaX = 0;
        this.mouse.deltaY = 0;
        return delta;
    }
    
    /**
     * 获取鼠标滚轮增量（手动实现）
     * 返回值：正数表示向下滚（放大FOV），负数表示向上滚（缩小FOV）
     */
    getWheelDelta() {
        const delta = this.mouse.wheelDelta;
        this.mouse.wheelDelta = 0;  // 重置为0
        return delta;
    }
    
    /**
     * 更新（每帧调用）
     */
    update() {
        // 可以在这里处理一些逻辑
    }
}
