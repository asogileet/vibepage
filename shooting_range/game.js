// 靶場主引擎與互動邏輯
class ShootingRange {
    constructor() {
        this.canvas = document.getElementById('gameCanvas');
        this.ctx = this.canvas.getContext('2d');

        this.dummies = [];
        this.particles = [];
        this.projectiles = [];
        this.floatingTexts = [];
        this.casings = [];

        this.currentWeaponKey = 'pistol';
        this.currentWeapon = WEAPONS.pistol;
        this.lastFireTime = 0;
        this.isMouseDown = false;
        this.mouseX = 0;
        this.mouseY = 0;

        // 相機震動
        this.shakeTime = 0;
        this.shakeMagnitude = 0;

        // 槍口火光
        this.muzzleFlashTimer = 0;
        this.muzzlePos = { x: 0, y: 0 };

        // 統計
        this.stats = {
            shotsFired: 0,
            hits: 0,
            headshots: 0,
            totalDamage: 0
        };

        // 自動移動靶設定 (水平、垂直、前後景深)
        this.movement = {
            horizontal: false, // 左右
            vertical: false,   // 上下
            depth: false,      // 前後
            speed: 1.0,        // 速度倍率
            range: 1.0         // 幅度倍率
        };
        this.moveTime = 0;

        // 靶高度 (地面垂直比例 0.2 ~ 0.98)
        this.targetHeightRatio = 0.82;
        this.targetCount = 5;

        // 自訂圖片與顯示模式 ('circle' | 'rect' | 'full')
        this.uploadedImage = null;
        this.displayMode = 'circle';
        this.isCustomFull = false;
        this.customScale = 1.0;
        this.customOffsetX = 0;
        this.customOffsetY = 0;
        this.customShape = 'circle';
        this.headFrameScale = 1.0;

        // 即時同步預覽窗設定
        this.previewCanvas = document.getElementById('livePreviewCanvas');
        this.previewCtx = this.previewCanvas ? this.previewCanvas.getContext('2d') : null;
        this.previewCloseUp = true; // 預設特寫視角 (頭像模式時放大看臉，整張模式時看全貌)
        this.currentPreviewCamScale = 1.25;
        this.previewDummy = new CrucifiedDummy(0, 0, 1.0, null, false);

        // 圖片拖曳與雙指縮放狀態
        this.isDraggingImage = false;
        this.dragStartX = 0;
        this.dragStartY = 0;
        this.dragInitialOffsetX = 0;
        this.dragInitialOffsetY = 0;
        this.dragSensitivity = 1.0;

        this.initCanvasSize();
        this.setupDefaultTargets();
        this.setupEventListeners();
        this.setupPreviewInteractions();

        this.lastFrameTime = performance.now();
        requestAnimationFrame((t) => this.loop(t));
    }

    initCanvasSize() {
        this.width = window.innerWidth;
        this.height = window.innerHeight;
        this.canvas.width = this.width;
        this.canvas.height = this.height;
    }

    setupDefaultTargets(count = 5) {
        this.targetCount = count;
        this.dummies = [];
        const groundY = this.height * this.targetHeightRatio;
        const spacing = this.width / (count + 1);

        for (let i = 1; i <= count; i++) {
            // 單一巨靶置中放大
            const scale = count === 1 ? 1.15 : (0.9 + Math.random() * 0.2);
            const x = count === 1 ? (this.width / 2) : (spacing * i + (Math.random() - 0.5) * 20);
            const y = groundY;
            const dummy = new CrucifiedDummy(x, y, scale, this.uploadedImage, this.isCustomFull);
            dummy.dummyIndex = i;
            dummy.baseX = x;
            dummy.baseY = y;
            dummy.baseScale = scale;
            dummy.customScale = this.customScale;
            dummy.customOffsetX = this.customOffsetX;
            dummy.customOffsetY = this.customOffsetY;
            dummy.customShape = this.customShape;
            dummy.headFrameScale = this.headFrameScale;
            this.dummies.push(dummy);
        }
    }

    setupEventListeners() {
        window.addEventListener('resize', () => {
            this.initCanvasSize();
            // 重新校正地面位置
            const groundY = this.height * this.targetHeightRatio;
            this.dummies.forEach(d => d.y = groundY);
        });

        window.addEventListener('contextmenu', (e) => {
            // 禁止預設右鍵菜單，以支援右鍵拖曳移動照片
            e.preventDefault();
        });

        window.addEventListener('mousemove', (e) => {
            this.mouseX = e.clientX;
            this.mouseY = e.clientY;

            if (this.isDraggingImage) {
                const dx = e.clientX - this.dragStartX;
                const dy = e.clientY - this.dragStartY;
                const newX = Math.max(-500, Math.min(500, Math.round(this.dragInitialOffsetX + dx)));
                const newY = Math.max(-500, Math.min(500, Math.round(this.dragInitialOffsetY + dy)));
                this.setCustomOffsetX(newX);
                this.setCustomOffsetY(newY);

                const sliderX = document.getElementById('imageOffsetXSlider');
                if (sliderX) sliderX.value = newX;
                const sliderY = document.getElementById('imageOffsetYSlider');
                if (sliderY) sliderY.value = newY;
            }
        });

        window.addEventListener('mousedown', (e) => {
            if (e.target.closest('#ui-container, .modal, .btn, input, label')) return;

            // 右鍵 或 Shift+左鍵：直接拖曳調整照片顯示位置
            if (e.button === 2 || (e.button === 0 && e.shiftKey)) {
                this.isDraggingImage = true;
                this.dragStartX = e.clientX;
                this.dragStartY = e.clientY;
                this.dragInitialOffsetX = this.customOffsetX;
                this.dragInitialOffsetY = this.customOffsetY;
                return;
            }

            if (e.button === 0) { // 左鍵射擊
                this.isMouseDown = true;
                this.fire();
            }
        });

        window.addEventListener('mouseup', (e) => {
            if (e.button === 2 || this.isDraggingImage) {
                this.isDraggingImage = false;
            }
            if (e.button === 0) {
                this.isMouseDown = false;
            }
        });

        // ===== 觸控事件支援 (手機與平板) =====
        this.touchDragMode = false;

        this.canvas.addEventListener('touchstart', (e) => {
            if (e.target.closest('#ui-container, .modal, .btn, input, label, select')) return;
            e.preventDefault();

            // 若為雙指觸摸 或 開啟了觸控拖曳模式
            if (e.touches.length >= 2 || this.touchDragMode) {
                this.isDraggingImage = true;
                this.dragStartX = e.touches[0].clientX;
                this.dragStartY = e.touches[0].clientY;
                this.dragInitialOffsetX = this.customOffsetX;
                this.dragInitialOffsetY = this.customOffsetY;
                return;
            }

            // 單指射擊
            const touch = e.touches[0];
            this.mouseX = touch.clientX;
            this.mouseY = touch.clientY;
            this.isMouseDown = true;
            this.fire();
        }, { passive: false });

        this.canvas.addEventListener('touchmove', (e) => {
            if (e.target.closest('#ui-container, .modal, .btn, input, label, select')) return;
            e.preventDefault();

            const touch = e.touches[0];
            if (this.isDraggingImage) {
                const dx = touch.clientX - this.dragStartX;
                const dy = touch.clientY - this.dragStartY;
                const newX = Math.max(-500, Math.min(500, Math.round(this.dragInitialOffsetX + dx)));
                const newY = Math.max(-500, Math.min(500, Math.round(this.dragInitialOffsetY + dy)));
                this.setCustomOffsetX(newX);
                this.setCustomOffsetY(newY);

                const sliderX = document.getElementById('imageOffsetXSlider');
                if (sliderX) sliderX.value = newX;
                const sliderY = document.getElementById('imageOffsetYSlider');
                if (sliderY) sliderY.value = newY;
            } else {
                this.mouseX = touch.clientX;
                this.mouseY = touch.clientY;
            }
        }, { passive: false });

        this.canvas.addEventListener('touchend', (e) => {
            if (e.touches.length === 0) {
                this.isMouseDown = false;
                this.isDraggingImage = false;
            }
        });

        this.canvas.addEventListener('touchcancel', () => {
            this.isMouseDown = false;
            this.isDraggingImage = false;
        });

        // 鍵盤快捷鍵 (1-6 換武器)
        window.addEventListener('keydown', (e) => {
            const keys = ['1', '2', '3', '4', '5', '6'];
            const weaponList = ['pistol', 'smg', 'shotgun', 'tomato', 'rpg', 'laser'];
            const index = keys.indexOf(e.key);
            if (index !== -1) {
                this.switchWeapon(weaponList[index]);
            }
            if (e.key === 'r' || e.key === 'R') {
                this.cleanAllTargets();
            }
        });

        // 滾輪切換武器
        window.addEventListener('wheel', (e) => {
            const weaponList = ['pistol', 'smg', 'shotgun', 'tomato', 'rpg', 'laser'];
            let currentIndex = weaponList.indexOf(this.currentWeaponKey);
            if (e.deltaY > 0) {
                currentIndex = (currentIndex + 1) % weaponList.length;
            } else {
                currentIndex = (currentIndex - 1 + weaponList.length) % weaponList.length;
            }
            this.switchWeapon(weaponList[currentIndex]);
        }, { passive: true });

        // 拖曳上傳人偶圖片支援
        window.addEventListener('dragover', (e) => e.preventDefault());
        window.addEventListener('drop', (e) => {
            e.preventDefault();
            if (e.dataTransfer.files && e.dataTransfer.files[0]) {
                this.handleImageFile(e.dataTransfer.files[0]);
            }
        });
    }

    switchWeapon(weaponId) {
        if (!WEAPONS[weaponId]) return;
        this.currentWeaponKey = weaponId;
        this.currentWeapon = WEAPONS[weaponId];

        // 更新 UI 選中態
        document.querySelectorAll('.weapon-btn').forEach(btn => {
            btn.classList.toggle('active', btn.dataset.weapon === weaponId);
        });

        // 更新鼠標樣式
        const customCursor = document.getElementById('customCursor');
        if (customCursor) {
            customCursor.className = `cursor-${weaponId}`;
        }
    }

    fire() {
        const now = performance.now() / 1000;
        if (now - this.lastFireTime < this.currentWeapon.fireRate) return;
        this.lastFireTime = now;

        const w = this.currentWeapon;
        this.stats.shotsFired += w.pellets;

        // 觸發音效
        if (window.soundFX && window.soundFX[w.sound]) {
            window.soundFX[w.sound]();
        }

        // 螢幕震動
        this.addScreenShake(w.force * 0.3);

        // 槍口閃光與拋殼
        this.muzzleFlashTimer = 0.06;
        this.muzzlePos = { x: this.width * 0.65, y: this.height - 40 };
        this.spawnCasing();

        if (w.type === 'projectile') {
            // 發射投擲物/火箭
            const startX = this.width * 0.55;
            const startY = this.height - 20;
            this.projectiles.push(new Projectile(startX, startY, this.mouseX, this.mouseY, w.projectileType, w));
        } else if (w.type === 'beam') {
            // 雷射貫穿射擊
            this.fireBeam(w);
        } else {
            // Hitscan (手槍、散彈、衝鋒槍)
            this.fireHitscan(w);
        }

        this.updateStatsUI();
    }

    fireHitscan(weapon) {
        for (let p = 0; p < weapon.pellets; p++) {
            // 彈道散佈
            const spreadAngle = (Math.random() - 0.5) * weapon.spread * Math.PI;
            const spreadDist = (Math.random() * 20) * weapon.spread * 10;
            const targetX = this.mouseX + Math.cos(spreadAngle) * spreadDist;
            const targetY = this.mouseY + Math.sin(spreadAngle) * spreadDist;

            // 射線檢測所有十字架靶子 (由前至後或優先命中)
            let hitFound = false;
            for (let i = this.dummies.length - 1; i >= 0; i--) {
                const dummy = this.dummies[i];
                const hit = dummy.hitTest(targetX, targetY);
                if (hit) {
                    hitFound = true;
                    this.onHitDummy(dummy, hit, targetX, targetY, weapon);
                    break;
                }
            }

            if (!hitFound) {
                // 打在背景地面或牆壁上
                this.spawnEnvironmentImpact(targetX, targetY, weapon);
            }

            // 彈道示蹤線
            this.spawnTracer(this.width * 0.65, this.height - 50, targetX, targetY, weapon.color);
        }
    }

    fireBeam(weapon) {
        // 從槍口直射一條高能雷射光束
        const startX = this.width * 0.65;
        const startY = this.height - 50;
        const targetX = this.mouseX;
        const targetY = this.mouseY;

        for (let dummy of this.dummies) {
            const hit = dummy.hitTest(targetX, targetY);
            if (hit) {
                this.onHitDummy(dummy, hit, targetX, targetY, weapon);
            }
        }

        // 光束效果
        this.particles.push({
            type: 'laser_beam',
            x1: startX,
            y1: startY,
            x2: targetX,
            y2: targetY,
            color: weapon.color,
            life: 0.12,
            maxLife: 0.12
        });
    }

    onHitDummy(dummy, hit, worldX, worldY, weapon) {
        this.stats.hits++;
        let finalDamage = Math.round(weapon.damage * hit.multiplier);

        if (hit.crit) {
            this.stats.headshots++;
            if (window.soundFX) window.soundFX.playHit(true);
            this.addFloatingText(worldX, worldY - 20, `HEADSHOT! ${finalDamage}`, '#ff3344', 28, true);
        } else {
            if (window.soundFX) window.soundFX.playHit(false);
            this.addFloatingText(worldX, worldY - 15, `-${finalDamage}`, '#ffcc00', 20, false);
        }

        this.stats.totalDamage += finalDamage;

        // 應用受擊推力與刻印
        dummy.applyImpulse(hit.localX, hit.localY, weapon.force, finalDamage, false, hit);

        // 產生受擊粒子 (木屑、火花)
        this.spawnImpactParticles(worldX, worldY, hit.part === 'wood' ? '#8b5a2b' : '#d2b48c', 12);
    }

    handleExplosion(x, y, radius, damage, force) {
        if (window.soundFX) window.soundFX.playExplosion();
        this.addScreenShake(30);

        // 巨大爆炸特效
        this.spawnExplosionParticles(x, y);

        // 對周圍所有十字架施加衝擊波
        for (let dummy of this.dummies) {
            const dist = Math.hypot(dummy.x - x, (dummy.y - 150) - y);
            if (dist < radius) {
                const ratio = 1 - (dist / radius);
                const appliedForce = force * ratio;
                const appliedDmg = Math.round(damage * ratio);
                dummy.applyImpulse((dummy.x - x) * 0.2, -100, appliedForce, appliedDmg);
                this.addFloatingText(dummy.x, dummy.y - 200, `-${appliedDmg}`, '#ff4400', 24, false);
            }
        }
    }

    handleTomatoImpact(x, y, targetDummy) {
        if (window.soundFX) window.soundFX.playSplat();
        // 番茄噴射粒子
        this.spawnTomatoParticles(x, y);

        if (targetDummy) {
            const hit = targetDummy.hitTest(x, y);
            if (hit) {
                targetDummy.applyImpulse(hit.localX, hit.localY, 15, 12, true, hit);
                this.addFloatingText(x, y - 10, 'SPLAT! 🍅', '#ff3333', 22, false);
            }
        } else {
            // 找最近的十字架是否碰上
            for (let dummy of this.dummies) {
                const hit = dummy.hitTest(x, y);
                if (hit) {
                    dummy.applyImpulse(hit.localX, hit.localY, 15, 12, true, hit);
                    this.addFloatingText(x, y - 10, 'SPLAT! 🍅', '#ff3333', 22, false);
                    break;
                }
            }
        }
    }

    spawnImpactParticles(x, y, color, count) {
        for (let i = 0; i < count; i++) {
            const angle = Math.random() * Math.PI * 2;
            const speed = 60 + Math.random() * 220;
            this.particles.push({
                type: 'spark',
                x, y,
                vx: Math.cos(angle) * speed,
                vy: Math.sin(angle) * speed - 50,
                radius: 2 + Math.random() * 3,
                color: Math.random() > 0.4 ? color : '#ffea70',
                life: 0.35 + Math.random() * 0.25,
                maxLife: 0.6
            });
        }
    }

    spawnTomatoParticles(x, y) {
        for (let i = 0; i < 20; i++) {
            const angle = Math.random() * Math.PI * 2;
            const speed = 40 + Math.random() * 180;
            this.particles.push({
                type: 'tomato_chunk',
                x, y,
                vx: Math.cos(angle) * speed,
                vy: Math.sin(angle) * speed - 60,
                radius: 3 + Math.random() * 5,
                color: Math.random() > 0.2 ? '#c0392b' : '#e74c3c',
                life: 0.6 + Math.random() * 0.4,
                maxLife: 1.0
            });
        }
    }

    spawnExplosionParticles(x, y) {
        // 衝擊光環
        this.particles.push({
            type: 'shockwave',
            x, y,
            radius: 10,
            maxRadius: 180,
            life: 0.35,
            maxLife: 0.35
        });

        // 火焰煙霧球
        for (let i = 0; i < 45; i++) {
            const angle = Math.random() * Math.PI * 2;
            const speed = 100 + Math.random() * 350;
            this.particles.push({
                type: 'fire',
                x, y,
                vx: Math.cos(angle) * speed,
                vy: Math.sin(angle) * speed - 120,
                radius: 12 + Math.random() * 20,
                color: ['#ff4400', '#ff9900', '#ffcc00', '#555555'][Math.floor(Math.random() * 4)],
                life: 0.5 + Math.random() * 0.4,
                maxLife: 0.9
            });
        }
    }

    spawnEnvironmentImpact(x, y, weapon) {
        // 打在地面或背景
        for (let i = 0; i < 6; i++) {
            const angle = Math.random() * Math.PI * 2;
            this.particles.push({
                type: 'dust',
                x, y,
                vx: Math.cos(angle) * 80,
                vy: Math.sin(angle) * 80 - 40,
                radius: 2 + Math.random() * 3,
                color: '#666',
                life: 0.3,
                maxLife: 0.3
            });
        }
    }

    spawnTracer(x1, y1, x2, y2, color) {
        this.particles.push({
            type: 'tracer',
            x1, y1, x2, y2,
            color,
            life: 0.08,
            maxLife: 0.08
        });
    }

    spawnCasing() {
        // 拋出黃銅彈殼
        const x = this.width * 0.68;
        const y = this.height - 30;
        this.casings.push({
            x, y,
            vx: 80 + Math.random() * 100,
            vy: -150 - Math.random() * 80,
            angle: Math.random() * Math.PI,
            vRot: 12 + Math.random() * 15,
            life: 0.7
        });
    }

    addScreenShake(mag) {
        this.shakeMagnitude = Math.min(this.shakeMagnitude + mag, 35);
        this.shakeTime = 0.25;
    }

    addFloatingText(x, y, text, color = '#fff', size = 20, isCrit = false) {
        this.floatingTexts.push({
            x, y,
            text,
            color,
            size,
            isCrit,
            vy: -70 - (isCrit ? 30 : 0),
            alpha: 1.0,
            life: 0.85
        });
    }

    // 綁定即時預覽窗的單指拖曳移位、雙指縮放與滾輪縮放
    setupPreviewInteractions() {
        if (!this.previewCanvas) return;

        this.isPreviewDragging = false;
        this.isPreviewPinching = false;
        this.previewDragStartX = 0;
        this.previewDragStartY = 0;
        this.previewDragInitOffsetX = 0;
        this.previewDragInitOffsetY = 0;
        this.pinchStartDist = 0;
        this.pinchInitScale = 1.0;

        // 滑鼠拖曳預覽窗
        this.previewCanvas.addEventListener('mousedown', (e) => {
            e.preventDefault();
            e.stopPropagation();
            this.isPreviewDragging = true;
            this.previewDragStartX = e.clientX;
            this.previewDragStartY = e.clientY;
            this.previewDragInitOffsetX = this.customOffsetX;
            this.previewDragInitOffsetY = this.customOffsetY;
        });

        window.addEventListener('mousemove', (e) => {
            if (!this.isPreviewDragging || !this.previewCanvas) return;
            const rect = this.previewCanvas.getBoundingClientRect();
            const factorX = (this.previewCanvas.width / Math.max(1, rect.width)) / this.currentPreviewCamScale;
            const factorY = (this.previewCanvas.height / Math.max(1, rect.height)) / this.currentPreviewCamScale;
            const dx = (e.clientX - this.previewDragStartX) * factorX;
            const dy = (e.clientY - this.previewDragStartY) * factorY;
            this.setCustomOffsetX(Math.max(-500, Math.min(500, Math.round(this.previewDragInitOffsetX + dx))));
            this.setCustomOffsetY(Math.max(-500, Math.min(500, Math.round(this.previewDragInitOffsetY + dy))));
        });

        window.addEventListener('mouseup', () => {
            this.isPreviewDragging = false;
        });

        // 滾輪在預覽窗內直接縮放相片
        this.previewCanvas.addEventListener('wheel', (e) => {
            e.preventDefault();
            e.stopPropagation();
            const step = this.customScale >= 3.0 ? 0.25 : 0.1;
            const delta = e.deltaY < 0 ? step : -step;
            const newScale = Math.max(0.1, Math.min(10.0, Math.round((this.customScale + delta) * 20) / 20));
            this.setCustomScale(newScale);
        }, { passive: false });

        // 手機/平板：在預覽窗內單指滑動移位、雙指捏合縮放
        this.previewCanvas.addEventListener('touchstart', (e) => {
            e.preventDefault();
            e.stopPropagation();
            if (e.touches.length >= 2) {
                this.isPreviewDragging = false;
                this.isPreviewPinching = true;
                this.pinchStartDist = Math.hypot(
                    e.touches[0].clientX - e.touches[1].clientX,
                    e.touches[0].clientY - e.touches[1].clientY
                );
                this.pinchInitScale = this.customScale;
            } else if (e.touches.length === 1) {
                this.isPreviewPinching = false;
                this.isPreviewDragging = true;
                this.previewDragStartX = e.touches[0].clientX;
                this.previewDragStartY = e.touches[0].clientY;
                this.previewDragInitOffsetX = this.customOffsetX;
                this.previewDragInitOffsetY = this.customOffsetY;
            }
        }, { passive: false });

        this.previewCanvas.addEventListener('touchmove', (e) => {
            e.preventDefault();
            e.stopPropagation();
            if (this.isPreviewPinching && e.touches.length >= 2) {
                const dist = Math.hypot(
                    e.touches[0].clientX - e.touches[1].clientX,
                    e.touches[0].clientY - e.touches[1].clientY
                );
                if (this.pinchStartDist > 5) {
                    const ratio = dist / this.pinchStartDist;
                    const newScale = Math.max(0.1, Math.min(10.0, Math.round((this.pinchInitScale * ratio) * 20) / 20));
                    this.setCustomScale(newScale);
                }
            } else if (this.isPreviewDragging && e.touches.length === 1) {
                const rect = this.previewCanvas.getBoundingClientRect();
                const factorX = (this.previewCanvas.width / Math.max(1, rect.width)) / this.currentPreviewCamScale;
                const factorY = (this.previewCanvas.height / Math.max(1, rect.height)) / this.currentPreviewCamScale;
                const dx = (e.touches[0].clientX - this.previewDragStartX) * factorX;
                const dy = (e.touches[0].clientY - this.previewDragStartY) * factorY;
                this.setCustomOffsetX(Math.max(-500, Math.min(500, Math.round(this.previewDragInitOffsetX + dx))));
                this.setCustomOffsetY(Math.max(-500, Math.min(500, Math.round(this.previewDragInitOffsetY + dy))));
            }
        }, { passive: false });

        const endPreviewTouch = (e) => {
            if (e.touches.length === 0) {
                this.isPreviewDragging = false;
                this.isPreviewPinching = false;
            } else if (e.touches.length === 1) {
                this.isPreviewPinching = false;
                this.isPreviewDragging = true;
                this.previewDragStartX = e.touches[0].clientX;
                this.previewDragStartY = e.touches[0].clientY;
                this.previewDragInitOffsetX = this.customOffsetX;
                this.previewDragInitOffsetY = this.customOffsetY;
            }
        };
        this.previewCanvas.addEventListener('touchend', endPreviewTouch);
        this.previewCanvas.addEventListener('touchcancel', endPreviewTouch);
    }

    // 繪製控制面板內的即時同步預覽畫布
    renderLivePreview() {
        if (!this.previewCtx || !this.previewCanvas) return;
        const panel = document.getElementById('controlPanel');
        if (panel && panel.classList.contains('collapsed')) return;

        const ctx = this.previewCtx;
        const w = this.previewCanvas.width;
        const h = this.previewCanvas.height;

        ctx.clearRect(0, 0, w, h);

        // 背景細網格線
        ctx.save();
        ctx.strokeStyle = 'rgba(255, 255, 255, 0.05)';
        ctx.lineWidth = 1;
        for (let gx = 0; gx < w; gx += 25) {
            ctx.beginPath(); ctx.moveTo(gx, 0); ctx.lineTo(gx, h); ctx.stroke();
        }
        for (let gy = 0; gy < h; gy += 25) {
            ctx.beginPath(); ctx.moveTo(0, gy); ctx.lineTo(w, gy); ctx.stroke();
        }
        ctx.restore();

        // 同步預覽人偶的屬性
        const pd = this.previewDummy;
        pd.customImage = this.uploadedImage;
        pd.isCustomFull = this.isCustomFull;
        pd.customScale = this.customScale;
        pd.customOffsetX = this.customOffsetX;
        pd.customOffsetY = this.customOffsetY;
        pd.customShape = this.customShape;
        pd.headFrameScale = this.headFrameScale;
        pd.dummyType = this.dummies[0] ? this.dummies[0].dummyType : 0;

        ctx.save();
        // 決定預覽相機的縮放與對焦中心
        if (!this.isCustomFull && this.previewCloseUp) {
            // 頭像特寫模式：對焦在十字架頂部頭像 (0, -250)
            const camScale = Math.min(1.35, 1.55 / Math.max(1.0, this.headFrameScale * 0.75));
            this.currentPreviewCamScale = camScale;
            ctx.translate(w / 2, h * 0.56);
            ctx.scale(camScale, camScale);
            ctx.translate(0, 250);
        } else {
            // 全貌模式 (整張相片模式 或 切換為全貌視角)：對焦在十字架中心 (0, -170)
            const camScale = 0.46;
            this.currentPreviewCamScale = camScale;
            ctx.translate(w / 2, h * 0.53);
            ctx.scale(camScale, camScale);
            ctx.translate(0, 170);
        }

        pd.drawCross(ctx);
        pd.drawDummy(ctx, true);
        ctx.restore();
    }

    // 處理圖片上傳 (自訂頭像或整張相片)
    handleImageFile(file) {
        if (!file.type.startsWith('image/')) {
            alert('請上傳有效的圖片文件 (PNG, JPG, WebP)！');
            return;
        }

        const reader = new FileReader();
        reader.onload = (e) => {
            const img = new Image();
            img.onload = () => {
                this.uploadedImage = img;
                // 重設位置偏移，讓新上傳的相片預設居中
                this.setCustomOffsetX(0);
                this.setCustomOffsetY(0);
                this.setCustomScale(1.0);

                // 更新所有人偶的相片
                this.dummies.forEach(d => {
                    d.customImage = img;
                    d.isCustomFull = this.isCustomFull;
                    d.customShape = this.customShape;
                    d.headFrameScale = this.headFrameScale;
                });

                // 更新小縮圖與文字狀態
                const preview = document.getElementById('uploadPreview');
                if (preview) {
                    preview.src = e.target.result;
                    preview.style.display = 'block';
                }
                const status = document.getElementById('uploadStatus');
                if (status) status.innerText = `已載入: ${file.name}`;
            };
            img.src = e.target.result;
        };
        reader.readAsDataURL(file);
    }

    // 切換三種顯示模式: 'circle' (圓形頭像) | 'rect' (方形頭像) | 'full' (整張相片完整顯示)
    setDisplayMode(mode) {
        this.displayMode = mode;
        if (mode === 'full') {
            this.isCustomFull = true;
        } else {
            this.isCustomFull = false;
            this.customShape = mode === 'rect' ? 'rect' : 'circle';
        }

        this.dummies.forEach(d => {
            d.isCustomFull = this.isCustomFull;
            d.customShape = this.customShape;
        });

        // 更新按鈕高亮狀態
        document.querySelectorAll('.mode-btn').forEach(btn => {
            btn.classList.toggle('active', btn.dataset.mode === mode);
        });

        // 切換「頭像框尺寸」滑桿顯示與標籤文字
        const headFrameRow = document.getElementById('headFrameSizeRow');
        if (headFrameRow) {
            headFrameRow.style.display = mode === 'full' ? 'none' : 'block';
        }
        const zoomLabel = document.getElementById('zoomLabelText');
        if (zoomLabel) {
            zoomLabel.innerText = mode === 'full' ? '🔍 整張相片大小 (Zoom)：' : '🔍 框內相片縮放 (Zoom)：';
        }
        const btnZoomToggle = document.getElementById('btnPreviewZoomToggle');
        if (btnZoomToggle) {
            btnZoomToggle.innerText = (mode === 'full' || !this.previewCloseUp) ? '🔍 全貌視角' : '🔍 特寫視角';
        }
    }

    setHeadFrameScale(scale) {
        this.headFrameScale = scale;
        this.dummies.forEach(d => d.headFrameScale = scale);
        const label = document.getElementById('headFrameScaleLabel');
        if (label) {
            label.innerText = `${Math.round(scale * 100)}%${scale === 1.0 ? ' (標準)' : ''}`;
        }
        const slider = document.getElementById('headFrameScaleSlider');
        if (slider && parseFloat(slider.value) !== scale) {
            slider.value = scale;
        }
    }

    setCustomScale(scale) {
        this.customScale = scale;
        this.dummies.forEach(d => d.customScale = scale);
        const valLabel = document.getElementById('scaleValLabel');
        if (valLabel) valLabel.innerText = `${Math.round(scale * 100)}%`;
        const scaleSlider = document.getElementById('imageScaleSlider');
        if (scaleSlider && parseFloat(scaleSlider.value) !== scale) {
            scaleSlider.value = scale;
        }
    }

    setCustomOffsetX(offset) {
        this.customOffsetX = offset;
        this.dummies.forEach(d => d.customOffsetX = offset);
        const valLabel = document.getElementById('offsetXValLabel');
        if (valLabel) valLabel.innerText = `${offset > 0 ? '+' : ''}${offset}px`;
        const sliderX = document.getElementById('imageOffsetXSlider');
        if (sliderX && parseInt(sliderX.value) !== offset) {
            sliderX.value = offset;
        }
    }

    setCustomOffsetY(offset) {
        this.customOffsetY = offset;
        this.dummies.forEach(d => d.customOffsetY = offset);
        const valLabel = document.getElementById('offsetYValLabel');
        if (valLabel) valLabel.innerText = `${offset > 0 ? '+' : ''}${offset}px`;
        const sliderY = document.getElementById('imageOffsetYSlider');
        if (sliderY && parseInt(sliderY.value) !== offset) {
            sliderY.value = offset;
        }
    }

    setCustomShape(shape) {
        this.setDisplayMode(shape === 'rect' ? 'rect' : 'circle');
    }

    setTargetHeight(ratio) {
        this.targetHeightRatio = ratio;
        const groundY = this.height * this.targetHeightRatio;
        this.dummies.forEach(d => {
            d.baseY = groundY;
            d.y = groundY;
        });
        const valLabel = document.getElementById('targetHeightValLabel');
        if (valLabel) {
            valLabel.innerText = `${Math.round(ratio * 100)}% (${Math.round(groundY)}px)`;
        }
    }

    setFullScreenFit() {
        // 自動切換為「🖼️ 整張相片」模式 + 1 個十字架置中，確保整張相片完整全屏顯示！
        this.setDisplayMode('full');

        const countSelect = document.getElementById('targetCountSelect');
        if (countSelect && countSelect.value !== '1') {
            countSelect.value = '1';
            this.setTargetCount(1);
        }

        let fitScale = 2.8;
        if (this.uploadedImage) {
            const aspect = this.uploadedImage.width / this.uploadedImage.height;
            const dummyScale = this.dummies[0] ? this.dummies[0].scale : 1.15;
            let baseH = 260 * dummyScale;
            let baseW = baseH * aspect;
            if (baseW > 300 * dummyScale) {
                baseW = 300 * dummyScale;
                baseH = baseW / aspect;
            }
            fitScale = Math.min((this.height * 0.82) / baseH, (this.width * 0.90) / baseW);
        } else {
            fitScale = (this.height * 0.85) / 320;
        }

        fitScale = Math.max(0.5, Math.min(fitScale, 10.0));
        fitScale = Math.round(fitScale * 20) / 20;

        // 調整靶高度至最佳全屏位置
        this.setTargetHeight(0.88);
        const heightSlider = document.getElementById('targetHeightSlider');
        if (heightSlider) heightSlider.value = 88;

        // 水平與垂直偏移歸零
        this.setCustomOffsetX(0);
        this.setCustomOffsetY(0);

        // 套用縮放
        this.setCustomScale(fitScale);

        this.addFloatingText(this.width / 2, this.height * 0.45, '🖼️ 已切換為整張相片全屏巨靶！', '#00ffcc', 28, true);
    }

    // 清理靶子上的彈孔和污漬
    cleanAllTargets() {
        this.dummies.forEach(d => {
            d.respawn();
        });
        this.addFloatingText(this.width / 2, this.height * 0.5, '✨ 全部十字架已修復翻新！', '#00ffcc', 26, true);
    }

    setTargetCount(count) {
        this.setupDefaultTargets(count);
    }

    updateStatsUI() {
        const acc = this.stats.shotsFired > 0 ? ((this.stats.hits / this.stats.shotsFired) * 100).toFixed(1) : 0;
        document.getElementById('statShots').innerText = this.stats.shotsFired;
        document.getElementById('statHits').innerText = this.stats.hits;
        document.getElementById('statHeadshots').innerText = this.stats.headshots;
        document.getElementById('statAccuracy').innerText = `${acc}%`;
        document.getElementById('statDamage').innerText = this.stats.totalDamage;
    }

    // 主遊戲循環
    loop(timestamp) {
        const dt = Math.min((timestamp - this.lastFrameTime) / 1000, 0.1);
        this.lastFrameTime = timestamp;

        this.update(dt);
        this.render();
        this.renderLivePreview();

        requestAnimationFrame((t) => this.loop(t));
    }

    update(dt) {
        // 連射武器檢測
        if (this.isMouseDown && this.currentWeapon.auto) {
            this.fire();
        }

        // 相機震動衰減
        if (this.shakeTime > 0) {
            this.shakeTime -= dt;
            if (this.shakeTime <= 0) {
                this.shakeMagnitude = 0;
            }
        }

        // 槍口閃光衰減
        if (this.muzzleFlashTimer > 0) {
            this.muzzleFlashTimer -= dt;
        }

        // 移動靶 3D 空間動態 (水平 X、垂直 Y、前後景深 Z)
        const m = this.movement;
        if (m.horizontal || m.vertical || m.depth) {
            this.moveTime += dt * 2.2 * m.speed;

            this.dummies.forEach((d, idx) => {
                const phase = idx * 1.3;

                // 1. 水平移動 (左右 X軸)
                if (m.horizontal) {
                    const ampX = (this.targetCount === 1 ? 260 : 130) * m.range;
                    d.x = d.baseX + Math.sin(this.moveTime * 1.2 + phase) * ampX;
                } else {
                    d.x = d.baseX;
                }

                // 2. 垂直移動 (上下 Y軸)
                if (m.vertical) {
                    const ampY = 85 * m.range;
                    d.y = d.baseY + Math.cos(this.moveTime * 1.4 + phase) * ampY;
                } else {
                    d.y = d.baseY;
                }

                // 3. 前後移動 (景深 Z軸 / 縮放)
                if (m.depth) {
                    // scale 在 baseScale * 0.55 ~ baseScale * 1.45 之間往返
                    const zFactor = 1 + Math.sin(this.moveTime * 1.1 + phase) * 0.45 * m.range;
                    d.setScale(d.baseScale * Math.max(0.2, zFactor));
                } else {
                    d.setScale(d.baseScale);
                }
            });
        }

        // 更新十字架
        for (let dummy of this.dummies) {
            dummy.update(dt);
        }

        // 更新投擲物 / 火箭
        for (let i = this.projectiles.length - 1; i >= 0; i--) {
            const p = this.projectiles[i];
            const arrived = p.update(dt);
            if (arrived || p.isDead) {
                if (p.type === 'rocket') {
                    this.handleExplosion(p.x, p.y, 220, p.weapon.damage, p.weapon.force);
                } else if (p.type === 'tomato') {
                    this.handleTomatoImpact(p.x, p.y);
                }
                this.projectiles.splice(i, 1);
            }
        }

        // 更新粒子
        for (let i = this.particles.length - 1; i >= 0; i--) {
            const pt = this.particles[i];
            pt.life -= dt;
            if (pt.life <= 0) {
                this.particles.splice(i, 1);
                continue;
            }

            if (pt.type === 'spark' || pt.type === 'tomato_chunk' || pt.type === 'fire') {
                pt.x += pt.vx * dt;
                pt.y += pt.vy * dt;
                pt.vy += 450 * dt; // 重力
            } else if (pt.type === 'dust') {
                pt.x += pt.vx * dt;
                pt.y += pt.vy * dt;
            } else if (pt.type === 'shockwave') {
                const progress = 1 - (pt.life / pt.maxLife);
                pt.radius = pt.maxRadius * progress;
            }
        }

        // 更新拋殼
        for (let i = this.casings.length - 1; i >= 0; i--) {
            const c = this.casings[i];
            c.life -= dt;
            if (c.life <= 0) {
                this.casings.splice(i, 1);
                continue;
            }
            c.x += c.vx * dt;
            c.y += c.vy * dt;
            c.vy += 500 * dt;
            c.angle += c.vRot * dt;
        }

        // 更新浮動跳字
        for (let i = this.floatingTexts.length - 1; i >= 0; i--) {
            const ft = this.floatingTexts[i];
            ft.life -= dt;
            if (ft.life <= 0) {
                this.floatingTexts.splice(i, 1);
                continue;
            }
            ft.y += ft.vy * dt;
            ft.alpha = Math.max(0, ft.life / 0.85);
        }
    }

    render() {
        const ctx = this.ctx;
        ctx.clearRect(0, 0, this.width, this.height);

        ctx.save();

        // 應用相機震動
        if (this.shakeMagnitude > 0) {
            const rx = (Math.random() - 0.5) * this.shakeMagnitude;
            const ry = (Math.random() - 0.5) * this.shakeMagnitude;
            ctx.translate(rx, ry);
        }

        // 1. 繪製精美背景 (暗色工業/室外荒原靶場)
        this.renderBackground(ctx);

        // 2. 繪製十字架人偶群
        for (let dummy of this.dummies) {
            dummy.draw(ctx);
        }

        // 3. 繪製飛行投擲物
        for (let p of this.projectiles) {
            p.draw(ctx);
        }

        // 4. 繪製粒子特效
        this.renderParticles(ctx);

        // 5. 繪製拋出的彈殼
        this.renderCasings(ctx);

        // 6. 槍口火焰 (Muzzle flash)
        if (this.muzzleFlashTimer > 0) {
            this.renderMuzzleFlash(ctx);
        }

        // 7. 浮動傷害字體
        this.renderFloatingTexts(ctx);

        ctx.restore();

        // 8. 準心指示 (跟隨滑鼠)
        this.renderCrosshair(ctx);
    }

    renderBackground(ctx) {
        // 夜幕天空漸變
        const skyGrad = ctx.createLinearGradient(0, 0, 0, this.height * 0.7);
        skyGrad.addColorStop(0, '#0d1117');
        skyGrad.addColorStop(1, '#1e2430');
        ctx.fillStyle = skyGrad;
        ctx.fillRect(0, 0, this.width, this.height);

        // 聚光燈從頂部照射十字架位置
        for (let dummy of this.dummies) {
            const spotGrad = ctx.createRadialGradient(dummy.x, dummy.y - 180, 20, dummy.x, dummy.y - 180, 260);
            spotGrad.addColorStop(0, 'rgba(255, 230, 180, 0.12)');
            spotGrad.addColorStop(1, 'rgba(255, 230, 180, 0)');
            ctx.fillStyle = spotGrad;
            ctx.beginPath();
            ctx.arc(dummy.x, dummy.y - 180, 260, 0, Math.PI * 2);
            ctx.fill();
        }

        // 地面沙土/水泥 (隨靶高度動態聯動)
        const groundY = this.height * (this.targetHeightRatio - 0.04);
        const groundGrad = ctx.createLinearGradient(0, groundY, 0, this.height);
        groundGrad.addColorStop(0, '#1c1815');
        groundGrad.addColorStop(0.3, '#2a221b');
        groundGrad.addColorStop(1, '#110d0a');
        ctx.fillStyle = groundGrad;
        ctx.fillRect(0, groundY, this.width, Math.max(10, this.height - groundY));

        // 地平線警示警戒線
        ctx.strokeStyle = '#c0392b';
        ctx.lineWidth = 3;
        ctx.beginPath();
        ctx.moveTo(0, groundY);
        ctx.lineTo(this.width, groundY);
        ctx.stroke();

        // 靶位距離標記線 (10m, 25m, 50m)
        ctx.fillStyle = 'rgba(255,255,255,0.15)';
        ctx.font = 'bold 14px "Segoe UI", sans-serif';
        ctx.fillText('◀ 靶場射擊線 RANGE-A 50M ▶', 40, groundY + 30);
    }

    renderParticles(ctx) {
        for (let pt of this.particles) {
            ctx.save();
            if (pt.type === 'spark' || pt.type === 'tomato_chunk' || pt.type === 'fire') {
                ctx.fillStyle = pt.color;
                ctx.beginPath();
                ctx.arc(pt.x, pt.y, Math.max(0.5, pt.radius * (pt.life / pt.maxLife)), 0, Math.PI * 2);
                ctx.fill();
            } else if (pt.type === 'shockwave') {
                const alpha = Math.max(0, pt.life / pt.maxLife);
                ctx.strokeStyle = `rgba(255, 200, 100, ${alpha * 0.8})`;
                ctx.lineWidth = 8 * alpha;
                ctx.beginPath();
                ctx.arc(pt.x, pt.y, pt.radius, 0, Math.PI * 2);
                ctx.stroke();
            } else if (pt.type === 'tracer') {
                const alpha = Math.max(0, pt.life / pt.maxLife);
                ctx.strokeStyle = pt.color;
                ctx.globalAlpha = alpha;
                ctx.lineWidth = 2.5;
                ctx.beginPath();
                ctx.moveTo(pt.x1, pt.y1);
                ctx.lineTo(pt.x2, pt.y2);
                ctx.stroke();
            } else if (pt.type === 'laser_beam') {
                const alpha = Math.max(0, pt.life / pt.maxLife);
                // 外層光暈
                ctx.strokeStyle = pt.color;
                ctx.globalAlpha = alpha * 0.5;
                ctx.lineWidth = 10;
                ctx.beginPath();
                ctx.moveTo(pt.x1, pt.y1);
                ctx.lineTo(pt.x2, pt.y2);
                ctx.stroke();
                // 核心白光
                ctx.strokeStyle = '#ffffff';
                ctx.globalAlpha = alpha;
                ctx.lineWidth = 3;
                ctx.beginPath();
                ctx.moveTo(pt.x1, pt.y1);
                ctx.lineTo(pt.x2, pt.y2);
                ctx.stroke();
            }
            ctx.restore();
        }
    }

    renderCasings(ctx) {
        for (let c of this.casings) {
            ctx.save();
            ctx.translate(c.x, c.y);
            ctx.rotate(c.angle);
            ctx.fillStyle = '#f1c40f'; // 黃銅色
            ctx.fillRect(-6, -2, 12, 4);
            ctx.fillStyle = '#b7950b';
            ctx.fillRect(4, -2, 2, 4);
            ctx.restore();
        }
    }

    renderMuzzleFlash(ctx) {
        const mx = this.muzzlePos.x;
        const my = this.muzzlePos.y;
        ctx.save();
        ctx.fillStyle = 'rgba(255, 230, 120, 0.9)';
        ctx.beginPath();
        ctx.arc(mx, my, 40 + Math.random() * 20, 0, Math.PI * 2);
        ctx.fill();

        ctx.fillStyle = '#fff';
        ctx.beginPath();
        ctx.arc(mx, my, 18, 0, Math.PI * 2);
        ctx.fill();
        ctx.restore();
    }

    renderFloatingTexts(ctx) {
        for (let ft of this.floatingTexts) {
            ctx.save();
            ctx.globalAlpha = ft.alpha;
            ctx.font = `${ft.isCrit ? '900' : 'bold'} ${ft.size}px 'Arial Black', Impact, sans-serif`;
            ctx.fillStyle = ft.color;
            ctx.strokeStyle = '#000';
            ctx.lineWidth = ft.isCrit ? 4 : 2.5;
            ctx.textAlign = 'center';

            ctx.strokeText(ft.text, ft.x, ft.y);
            ctx.fillText(ft.text, ft.x, ft.y);
            ctx.restore();
        }
    }

    renderCrosshair(ctx) {
        const x = this.mouseX;
        const y = this.mouseY;
        const w = this.currentWeapon;

        ctx.save();
        ctx.strokeStyle = w.color || '#00ffcc';
        ctx.lineWidth = 2;

        if (w.id === 'rpg') {
            // 火箭筒大圓準心
            ctx.beginPath();
            ctx.arc(x, y, 24, 0, Math.PI * 2);
            ctx.stroke();
            ctx.beginPath();
            ctx.arc(x, y, 6, 0, Math.PI * 2);
            ctx.fillStyle = '#ff4400';
            ctx.fill();
        } else if (w.id === 'tomato') {
            // 番茄圖標/十字
            ctx.beginPath();
            ctx.arc(x, y, 14, 0, Math.PI * 2);
            ctx.stroke();
            ctx.fillStyle = '#ff4444';
            ctx.beginPath();
            ctx.arc(x, y, 4, 0, Math.PI * 2);
            ctx.fill();
        } else {
            // 戰術十字準心
            const gap = 6;
            const len = 14;
            ctx.beginPath();
            ctx.moveTo(x - gap - len, y); ctx.lineTo(x - gap, y);
            ctx.moveTo(x + gap, y); ctx.lineTo(x + gap + len, y);
            ctx.moveTo(x, y - gap - len); ctx.lineTo(x, y - gap);
            ctx.moveTo(x, y + gap); ctx.lineTo(x, y + gap + len);
            ctx.stroke();

            // 中心微點
            ctx.fillStyle = w.color || '#00ffcc';
            ctx.fillRect(x - 1.5, y - 1.5, 3, 3);
        }

        ctx.restore();
    }
}

window.addEventListener('DOMContentLoaded', () => {
    window.game = new ShootingRange();

    // 綁定 UI 事件
    document.querySelectorAll('.weapon-btn').forEach(btn => {
        btn.addEventListener('click', () => {
            window.game.switchWeapon(btn.dataset.weapon);
        });
    });

    const fileInput = document.getElementById('imageUploadInput');
    if (fileInput) {
        fileInput.addEventListener('change', (e) => {
            if (e.target.files && e.target.files[0]) {
                window.game.handleImageFile(e.target.files[0]);
            }
        });
    }

    const resetBtn = document.getElementById('btnClean');
    if (resetBtn) {
        resetBtn.addEventListener('click', () => window.game.cleanAllTargets());
    }

    const countSelect = document.getElementById('targetCountSelect');
    if (countSelect) {
        countSelect.addEventListener('change', (e) => {
            window.game.setTargetCount(parseInt(e.target.value));
        });
    }

    // 3D 移動靶開關控制 (水平、垂直、前後)
    const moveHToggle = document.getElementById('moveHorizontalToggle');
    if (moveHToggle) {
        moveHToggle.addEventListener('change', (e) => {
            window.game.movement.horizontal = e.target.checked;
            if (!e.target.checked) window.game.dummies.forEach(d => d.x = d.baseX);
        });
    }

    const moveVToggle = document.getElementById('moveVerticalToggle');
    if (moveVToggle) {
        moveVToggle.addEventListener('change', (e) => {
            window.game.movement.vertical = e.target.checked;
            if (!e.target.checked) window.game.dummies.forEach(d => d.y = d.baseY);
        });
    }

    const moveDToggle = document.getElementById('moveDepthToggle');
    if (moveDToggle) {
        moveDToggle.addEventListener('change', (e) => {
            window.game.movement.depth = e.target.checked;
            if (!e.target.checked) window.game.dummies.forEach(d => d.setScale(d.baseScale));
        });
    }

    // 狂暴三維全開 / 全部停止
    const btnMoveCrazy = document.getElementById('btnMoveCrazy');
    if (btnMoveCrazy) {
        btnMoveCrazy.addEventListener('click', () => {
            window.game.movement.horizontal = true;
            window.game.movement.vertical = true;
            window.game.movement.depth = true;
            if (moveHToggle) moveHToggle.checked = true;
            if (moveVToggle) moveVToggle.checked = true;
            if (moveDToggle) moveDToggle.checked = true;
            window.game.addFloatingText(window.game.width / 2, window.game.height * 0.45, '🌪️ 狂暴3D動態全開！', '#ff0055', 30, true);
        });
    }

    const btnMoveStop = document.getElementById('btnMoveStop');
    if (btnMoveStop) {
        btnMoveStop.addEventListener('click', () => {
            window.game.movement.horizontal = false;
            window.game.movement.vertical = false;
            window.game.movement.depth = false;
            if (moveHToggle) moveHToggle.checked = false;
            if (moveVToggle) moveVToggle.checked = false;
            if (moveDToggle) moveDToggle.checked = false;
            window.game.dummies.forEach(d => {
                d.x = d.baseX;
                d.y = d.baseY;
                d.setScale(d.baseScale);
            });
        });
    }

    // 移動速度滑桿
    const moveSpeedSlider = document.getElementById('moveSpeedSlider');
    if (moveSpeedSlider) {
        moveSpeedSlider.addEventListener('input', (e) => {
            const spd = parseFloat(e.target.value);
            window.game.movement.speed = spd;
            const spdLabel = document.getElementById('moveSpeedValLabel');
            if (spdLabel) spdLabel.innerText = `${spd.toFixed(1)}x`;
        });
    }

    // 三種顯示模式按鈕切換 (圓形頭像 / 方形頭像 / 整張相片)
    document.querySelectorAll('.mode-btn').forEach(btn => {
        btn.addEventListener('click', () => {
            window.game.setDisplayMode(btn.dataset.mode);
        });
    });

    // 即時預覽窗的特寫 / 全貌視角切換
    const btnPreviewZoomToggle = document.getElementById('btnPreviewZoomToggle');
    if (btnPreviewZoomToggle) {
        btnPreviewZoomToggle.addEventListener('click', () => {
            if (window.game.isCustomFull) {
                // 若在整張相片模式下點擊，提示全貌視角
                btnPreviewZoomToggle.innerText = '🔍 全貌視角';
                return;
            }
            window.game.previewCloseUp = !window.game.previewCloseUp;
            btnPreviewZoomToggle.innerText = window.game.previewCloseUp ? '🔍 特寫視角' : '🔍 全貌視角';
        });
    }

    // 頭像框尺寸滑桿 (大頭模式)
    const headFrameScaleSlider = document.getElementById('headFrameScaleSlider');
    if (headFrameScaleSlider) {
        headFrameScaleSlider.addEventListener('input', (e) => {
            window.game.setHeadFrameScale(parseFloat(e.target.value));
        });
    }

    // 靶高度滑桿 (垂直升降)
    const targetHeightSlider = document.getElementById('targetHeightSlider');
    if (targetHeightSlider) {
        targetHeightSlider.addEventListener('input', (e) => {
            window.game.setTargetHeight(parseInt(e.target.value) / 100);
        });
    }

    // 圖片放大縮小滑桿與按鈕
    const scaleSlider = document.getElementById('imageScaleSlider');
    if (scaleSlider) {
        scaleSlider.addEventListener('input', (e) => {
            window.game.setCustomScale(parseFloat(e.target.value));
        });
    }

    const btnScaleMinus = document.getElementById('btnScaleMinus');
    if (btnScaleMinus && scaleSlider) {
        btnScaleMinus.addEventListener('click', () => {
            let step = parseFloat(scaleSlider.value) >= 3.0 ? 0.5 : 0.1;
            let val = Math.max(0.1, Math.round((parseFloat(scaleSlider.value) - step) * 10) / 10);
            window.game.setCustomScale(val);
        });
    }

    const btnScalePlus = document.getElementById('btnScalePlus');
    if (btnScalePlus && scaleSlider) {
        btnScalePlus.addEventListener('click', () => {
            let step = parseFloat(scaleSlider.value) >= 3.0 ? 0.5 : 0.1;
            let val = Math.min(10.0, Math.round((parseFloat(scaleSlider.value) + step) * 10) / 10);
            window.game.setCustomScale(val);
        });
    }

    const btnScaleReset = document.getElementById('btnScaleReset');
    if (btnScaleReset) {
        btnScaleReset.addEventListener('click', () => {
            window.game.setCustomScale(1.0);
        });
    }

    // 一鍵全螢幕巨靶
    const btnFullScreenFit = document.getElementById('btnFullScreenFit');
    if (btnFullScreenFit) {
        btnFullScreenFit.addEventListener('click', () => {
            window.game.setFullScreenFit();
        });
    }

    // 快捷比例按鈕
    document.querySelectorAll('.btn-scale-preset').forEach(btn => {
        btn.addEventListener('click', () => {
            const scale = parseFloat(btn.dataset.scale);
            window.game.setCustomScale(scale);
        });
    });

    // 水平 X 位置偏移滑桿
    const offsetXSlider = document.getElementById('imageOffsetXSlider');
    if (offsetXSlider) {
        offsetXSlider.addEventListener('input', (e) => {
            window.game.setCustomOffsetX(parseInt(e.target.value));
        });
    }

    // 垂直 Y 位置偏移滑桿
    const offsetYSlider = document.getElementById('imageOffsetYSlider');
    if (offsetYSlider) {
        offsetYSlider.addEventListener('input', (e) => {
            window.game.setCustomOffsetY(parseInt(e.target.value));
        });
    }

    // 方向微調快捷按鈕
    const btnPosUp = document.getElementById('btnPosUp');
    if (btnPosUp) {
        btnPosUp.addEventListener('click', () => {
            const val = Math.max(-500, window.game.customOffsetY - 10);
            window.game.setCustomOffsetY(val);
        });
    }

    const btnPosDown = document.getElementById('btnPosDown');
    if (btnPosDown) {
        btnPosDown.addEventListener('click', () => {
            const val = Math.min(500, window.game.customOffsetY + 10);
            window.game.setCustomOffsetY(val);
        });
    }

    const btnPosLeft = document.getElementById('btnPosLeft');
    if (btnPosLeft) {
        btnPosLeft.addEventListener('click', () => {
            const val = Math.max(-500, window.game.customOffsetX - 10);
            window.game.setCustomOffsetX(val);
        });
    }

    const btnPosRight = document.getElementById('btnPosRight');
    if (btnPosRight) {
        btnPosRight.addEventListener('click', () => {
            const val = Math.min(500, window.game.customOffsetX + 10);
            window.game.setCustomOffsetX(val);
        });
    }

    const btnPosCenter = document.getElementById('btnPosCenter');
    if (btnPosCenter) {
        btnPosCenter.addEventListener('click', () => {
            window.game.setCustomOffsetX(0);
            window.game.setCustomOffsetY(0);
        });
    }

    // 手機/平板 控制面板摺疊與展開
    const btnTogglePanel = document.getElementById('btnTogglePanel');
    const controlPanel = document.getElementById('controlPanel');
    const closePanel = () => {
        if (controlPanel && btnTogglePanel) {
            controlPanel.classList.add('collapsed');
            btnTogglePanel.innerText = '⚙️';
        }
    };

    if (btnTogglePanel && controlPanel) {
        btnTogglePanel.addEventListener('click', () => {
            controlPanel.classList.toggle('collapsed');
            btnTogglePanel.innerText = controlPanel.classList.contains('collapsed') ? '⚙️' : '✕';
        });

        // 手機螢幕窄時預設摺疊面板
        if (window.innerWidth < 768) {
            controlPanel.classList.add('collapsed');
            btnTogglePanel.innerText = '⚙️';
        }
    }

    const btnHeaderClosePanel = document.getElementById('btnHeaderClosePanel');
    if (btnHeaderClosePanel) {
        btnHeaderClosePanel.addEventListener('click', closePanel);
    }

    const btnClosePanelPlay = document.getElementById('btnClosePanelPlay');
    if (btnClosePanelPlay) {
        btnClosePanelPlay.addEventListener('click', closePanel);
    }
});
