// 2D 波动方程 FDTD 模拟

(() => {
    const canvas = document.getElementById('wave-canvas');
    if (!canvas) return;
    const ctx = canvas.getContext('2d', { alpha: false });

    // 网格与物理参数
    let nx, ny, dx, dy, dt, c, c2dt2;
    let u, uPrev, uNext, wall;
    let img;

    function setupGrid() {
        // 按屏幕尺寸自适应网格
        const w = window.innerWidth;
        const h = window.innerHeight;
        nx = Math.floor(w / 2);
        ny = Math.floor(h / 2);
        dx = dy = 1.0;
        dt = 0.5;
        c = 1.0;
        c2dt2 = (c * dt) * (c * dt);
        canvas.width = nx;
        canvas.height = ny;
        ctx.imageSmoothingEnabled = false;
        const size = nx * ny;
        u = new Float32Array(size);
        uPrev = new Float32Array(size);
        uNext = new Float32Array(size);
        wall = new Uint8Array(size);
        img = ctx.createImageData(nx, ny);
    }

    function idx(i, j) { return i + j * nx; }
    function clamp(v, lo, hi) { return v < lo ? lo : v > hi ? hi : v; }

    // 随机生成若干道墙（竖直段），并用白色绘制
    function generateWalls() {
        if (!wall) return;
        wall.fill(0);
        const count = 2;
        for (let k = 0; k < count; k++) {
            const x = 5 + Math.floor(Math.random() * Math.max(1, nx - 10));
            const minLen = Math.floor(ny * 0.2);
            const maxLen = Math.floor(ny * 0.7);
            const len = minLen + Math.floor(Math.random() * Math.max(1, (maxLen - minLen)));
            const y1 = 2 + Math.floor(Math.random() * Math.max(1, (ny - 4 - len)));
            const y2 = y1 + len;
            for (let y = y1; y <= y2 && y < ny - 1; y++) {
                wall[idx(x, y)] = 1;
            }
        }
    }

    // 点击释放一个高斯脉冲
    function addPulseAt(ix, iy, amp = 2.0, sigma = 2.0) {
        for (let dy_ = -3 * sigma; dy_ <= 3 * sigma; dy_++) {
            const j = iy + Math.floor(dy_);
            if (j <= 0 || j >= ny - 1) continue;
            for (let dx_ = -3 * sigma; dx_ <= 3 * sigma; dx_++) {
                const i = ix + Math.floor(dx_);
                if (i <= 0 || i >= nx - 1) continue;
                const id = idx(i, j);
                if (wall[id]) continue; // 不在墙体处注入
                const r2 = (dx_ * dx_ + dy_ * dy_) / (sigma * sigma);
                u[id] += amp * Math.exp(-0.5 * r2);
            }
        }
    }

    // 一步时间推进
    function step() {
        // 内部点更新（避开边界）
        for (let j = 1; j < ny - 1; j++) {
            const jnx = j * nx;
            const jnxm = (j - 1) * nx;
            const jnxp = (j + 1) * nx;
            for (let i = 1; i < nx - 1; i++) {
                const id = jnx + i;

                if (wall[id]) {
                    // 墙体反射
                    u[id] = 0;
                    continue;
                }

                // 离散波动方程
                const lap = (u[id - 1] + u[id + 1] - 2 * u[id]) / (dx * dx)
                    + (u[jnxm + i] + u[jnxp + i] - 2 * u[id]) / (dy * dy);
                uNext[id] = 2 * u[id] - uPrev[id] + c2dt2 * lap;

                // 简单阻尼
                uNext[id] *= 0.998;
            }
        }

        // 交换
        const tmp = uPrev; uPrev = u; u = uNext; uNext = tmp;
    }

    // 颜色映射（负为蓝，零为黑，正为红，绝对值大时更亮）
    function colorFor(v) {
        const vv = clamp(v, -1, 1);
        const a = Math.abs(vv);
        let r = 0, g = 0, b = 0;
        if (vv > 0) {
            r = Math.floor(255 * a);
            b = 0;
        } else if (vv < 0) {
            b = Math.floor(255 * a);
            r = 0;
        } else {
            r = 0;
            b = 0;
        }
        g = 0;
        return [r, g, b];
    }

    // 渲染到画布
    // img 在 setupGrid 内赋值，无需重复声明
    function render() {
        const data = img.data;
        let p = 0;
        for (let j = 0; j < ny; j++) {
            for (let i = 0; i < nx; i++) {
                const id = idx(i, j);
                if (wall[id]) {
                    data[p++] = 255; // R
                    data[p++] = 255; // G
                    data[p++] = 255; // B
                    data[p++] = 255; // A
                } else {
                    const [r, g, b] = colorFor(u[id]);
                    data[p++] = r;
                    data[p++] = g;
                    data[p++] = b;
                    data[p++] = 255;
                }
            }
        }
        ctx.putImageData(img, 0, 0);
    }

    // 鼠标长按自动随机释放波
    let autoStimulateTimer = setInterval(randomStimulate, 5000);
    function randomStimulate() {
        // 在画布范围内随机位置
        const rect = canvas.getBoundingClientRect();
        const m_x = rect.left + Math.random() * rect.width;
        const m_y = rect.top + Math.random() * rect.height;
        stimulate(m_x, m_y);
    }
    canvas.addEventListener('pointerdown', (ev) => {
        stimulate(ev.clientX, ev.clientY);
        if (autoStimulateTimer) clearInterval(autoStimulateTimer);
        autoStimulateTimer = setInterval(randomStimulate, 200);
    });
    window.addEventListener('pointerup', () => {
        if (autoStimulateTimer) {
            clearInterval(autoStimulateTimer);
            autoStimulateTimer = null;
        }
    });

    function stimulate(m_x, m_y) {
        const rect = canvas.getBoundingClientRect();
        const x = m_x - rect.left;
        const y = m_y - rect.top;
        const ix = clamp(Math.floor(x * nx / rect.width), 1, nx - 2);
        const iy = clamp(Math.floor(y * ny / rect.height), 1, ny - 2);
        addPulseAt(ix, iy, 2.0, 2.0);
    }

    // 额外：按 R 重新随机墙体
    window.addEventListener('keydown', (e) => {
        if (e.key === 'r' || e.key === 'R') {
            generateWalls();
        }
    });

    // 初始化与自适应
    function resetAll() {
        setupGrid();
        generateWalls();
    }

    // 屏幕尺寸变化时自适应
    window.addEventListener('resize', () => {
        resetAll();
    });

    // 动画循环
    let running = true;
    function loop() {
        if (!running) return;
        // 每帧推进 2 步更顺滑
        step();
        step();
        render();
        requestAnimationFrame(loop);
    }
    resetAll();
    requestAnimationFrame(loop);
})();

