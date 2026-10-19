// 靶場主引擎與互動邏輯
class ShootingRange {
    constructor() {
        this.canvas = document.getElementById('gameCanvas');
        this.ctx = this.canvas.getContext('2d');

        this.dummies = [];
        this.particles = [];
        this.projectiles = [];
        this.bullets = [];        // 可見高速3D飛行子彈 (呈現「子彈射出」與「槍林彈雨」)
        this.worldEntries = [];   // 背景/地面上的「子彈射入」鑽孔動畫
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

        // 第一人稱槍管、槍帽噴火與後座力狀態
        this.muzzleFlashTimer = 0;
        this.muzzleFlashDuration = 0.11;
        this.muzzleFlashSeed = 0;
        this.gunRecoil = 0;
        this.barrelHeat = 0;
        this.muzzlePos = { x: 0, y: 0, angle: -Math.PI / 2, anchorX: 0, anchorY: 0 };

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

        // 狙擊瞄準鏡 (Scope) 縮放與狀態設定
        this.scopeMode = 'pip';        // 'pip' (鏡內局部放大) | 'fullscreen' (全畫面狙擊放大) | 'reticle' (一般準心縮放)
        this.scopeZoom = 2.0;          // 目標放大倍率 (0.5x ~ 8.0x)
        this.currentScopeZoom = 2.0;   // 平滑過渡中的當前倍率
        this.scopeRadius = 125;        // 瞄準鏡鏡框半徑 (60px ~ 260px)
        this.scopeHudTimer = 1.5;      // 倍率刻度高亮計時器
        this.hitMarkerTimer = 0;       // 命中準心反饋計時器
        this.hitMarkerCrit = false;

        // 滑鼠右鍵調整瞄準鏡狀態
        this.isRightMouseScope = false;
        this.rightClickStartX = 0;
        this.rightClickStartY = 0;
        this.rightClickMoved = false;
        this.rightClickInitZoom = 2.0;
        this.rightClickInitRadius = 125;

        this.initCanvasSize();
        this.setupDefaultTargets();
        this.setupEventListeners();
        this.setupPreviewInteractions();

        // 預設鼠標位置在畫面中央
        this.mouseX = this.width / 2;
        this.mouseY = this.height * 0.48;

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
            // 禁止預設右鍵菜單，以支援滑鼠右鍵切換/拖曳調整瞄準鏡縮放
            e.preventDefault();
        });

        window.addEventListener('mousemove', (e) => {
            this.mouseX = e.clientX;
            this.mouseY = e.clientY;

            // 按住滑鼠右鍵拖曳：上下調整瞄準鏡倍率、左右調整鏡框大小
            if (this.isRightMouseScope) {
                const dx = e.clientX - this.rightClickStartX;
                const dy = e.clientY - this.rightClickStartY;
                if (Math.hypot(dx, dy) > 6) {
                    this.rightClickMoved = true;
                    // 上移放大、下移縮小
                    const zoomDelta = -dy * 0.015;
                    const newZoom = Math.max(0.5, Math.min(8.0, Math.round((this.rightClickInitZoom + zoomDelta) * 20) / 20));
                    this.setScopeZoom(newZoom, false);

                    // 左右移動超過一定幅度時微調鏡框大小
                    if (Math.abs(dx) > 15) {
                        const radDelta = dx * 0.35;
                        const newRadius = Math.max(60, Math.min(260, Math.round(this.rightClickInitRadius + radDelta)));
                        this.setScopeRadius(newRadius);
                    }
                }
                return;
            }

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
            if (e.target.closest('#ui-container, .modal, .btn, input, label, select')) return;

            // Shift+左鍵：直接拖曳調整照片顯示位置
            if (e.button === 0 && e.shiftKey) {
                this.isDraggingImage = true;
                this.dragStartX = e.clientX;
                this.dragStartY = e.clientY;
                this.dragInitialOffsetX = this.customOffsetX;
                this.dragInitialOffsetY = this.customOffsetY;
                return;
            }

            // 滑鼠右鍵：點擊快速切換倍鏡倍率，或按住上下拖曳無段縮放瞄準鏡
            if (e.button === 2) {
                this.isRightMouseScope = true;
                this.rightClickStartX = e.clientX;
                this.rightClickStartY = e.clientY;
                this.rightClickMoved = false;
                this.rightClickInitZoom = this.scopeZoom;
                this.rightClickInitRadius = this.scopeRadius;
                return;
            }

            if (e.button === 0) { // 左鍵射擊
                this.isMouseDown = true;
                this.fire();
            }
        });

        window.addEventListener('mouseup', (e) => {
            if (e.button === 2 && this.isRightMouseScope) {
                this.isRightMouseScope = false;
                // 若右鍵為單純點擊（未大幅拖曳），則循環切換常用瞄準鏡倍率 (1x -> 2x -> 4x -> 6x -> 8x)
                if (!this.rightClickMoved) {
                    this.cycleScopeZoom();
                }
            }
            if (this.isDraggingImage) {
                this.isDraggingImage = false;
            }
            if (e.button === 0) {
                this.isMouseDown = false;
            }
        });

        // ===== 觸控事件支援 (手機與平板：單指射擊、雙指捏合縮放瞄準鏡) =====
        this.touchDragMode = false;
        this.isCanvasPinchingScope = false;
        this.canvasPinchStartDist = 0;
        this.canvasPinchInitZoom = 2.0;

        this.canvas.addEventListener('touchstart', (e) => {
            if (e.target.closest('#ui-container, .modal, .btn, input, label, select')) return;
            e.preventDefault();

            // 雙指捏合直接縮放瞄準鏡倍率
            if (e.touches.length >= 2) {
                this.isMouseDown = false;
                this.isCanvasPinchingScope = true;
                this.canvasPinchStartDist = Math.hypot(
                    e.touches[0].clientX - e.touches[1].clientX,
                    e.touches[0].clientY - e.touches[1].clientY
                );
                this.canvasPinchInitZoom = this.scopeZoom;
                return;
            }

            // 單指射擊與移動瞄準鏡
            const touch = e.touches[0];
            this.mouseX = touch.clientX;
            this.mouseY = touch.clientY;
            this.isMouseDown = true;
            this.fire();
        }, { passive: false });

        this.canvas.addEventListener('touchmove', (e) => {
            if (e.target.closest('#ui-container, .modal, .btn, input, label, select')) return;
            e.preventDefault();

            if (this.isCanvasPinchingScope && e.touches.length >= 2) {
                const dist = Math.hypot(
                    e.touches[0].clientX - e.touches[1].clientX,
                    e.touches[0].clientY - e.touches[1].clientY
                );
                if (this.canvasPinchStartDist > 10) {
                    const ratio = dist / this.canvasPinchStartDist;
                    const newZoom = Math.max(0.5, Math.min(8.0, Math.round((this.canvasPinchInitZoom * ratio) * 20) / 20));
                    this.setScopeZoom(newZoom, false);
                }
                return;
            }

            const touch = e.touches[0];
            this.mouseX = touch.clientX;
            this.mouseY = touch.clientY;
        }, { passive: false });

        this.canvas.addEventListener('touchend', (e) => {
            if (e.touches.length < 2) {
                this.isCanvasPinchingScope = false;
            }
            if (e.touches.length === 0) {
                this.isMouseDown = false;
                this.isDraggingImage = false;
            }
        });

        this.canvas.addEventListener('touchcancel', () => {
            this.isMouseDown = false;
            this.isDraggingImage = false;
            this.isCanvasPinchingScope = false;
        });

        // 鍵盤快捷鍵 (1-6 換武器，+/- 縮放瞄準鏡，R 修復)
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
            if (e.key === '=' || e.key === '+') {
                this.adjustScopeZoomByStep(1);
            }
            if (e.key === '-' || e.key === '_') {
                this.adjustScopeZoomByStep(-1);
            }
        });

        // 滑鼠滾輪：調整瞄準鏡縮放倍率 (Shift+滾輪調整鏡框大小；在武器欄上滾輪則切換武器)
        window.addEventListener('wheel', (e) => {
            // 若在左側控制面板或統計面板內滾動，保留面板原本的捲動行為
            if (e.target.closest('#controlPanel, #statsPanel, #livePreviewCanvas')) return;

            // 若滑鼠停留在底部武器欄上，或按住 Alt 鍵滾動，則切換武器
            if (e.target.closest('#weaponBar') || e.altKey) {
                e.preventDefault();
                const weaponList = ['pistol', 'smg', 'shotgun', 'tomato', 'rpg', 'laser'];
                let currentIndex = weaponList.indexOf(this.currentWeaponKey);
                if (e.deltaY > 0) {
                    currentIndex = (currentIndex + 1) % weaponList.length;
                } else {
                    currentIndex = (currentIndex - 1 + weaponList.length) % weaponList.length;
                }
                this.switchWeapon(weaponList[currentIndex]);
                return;
            }

            e.preventDefault();
            const dir = e.deltaY < 0 ? 1 : -1;

            if (e.shiftKey) {
                // Shift + 滾輪：調整瞄準鏡鏡框直徑大小
                const newRadius = Math.max(60, Math.min(260, this.scopeRadius + dir * 10));
                this.setScopeRadius(newRadius);
                if (window.soundFX && window.soundFX.playScopeZoom) {
                    window.soundFX.playScopeZoom(this.scopeZoom);
                }
            } else {
                // 一般滾輪：調整瞄準鏡放大倍率 (Zoom)
                this.adjustScopeZoomByStep(dir);
            }
        }, { passive: false });

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

    // 計算第一人稱槍管與槍帽頂端 (Muzzle Cap Tip) 的即時座標與角度
    getGunMuzzleTransform() {
        const anchorX = this.width * (this.width < 600 ? 0.75 : 0.67);
        const anchorY = this.height + 12;
        const dx = this.mouseX - anchorX;
        const dy = this.mouseY - anchorY;
        let aimAngle = Math.atan2(dy, dx);
        // 限制槍管仰角範圍，確保槍口始終自然朝向靶場前方
        if (aimAngle > -0.15) aimAngle = -0.15;
        if (aimAngle < -Math.PI + 0.15) aimAngle = -Math.PI + 0.15;

        const barrelLen = Math.max(95, (this.width < 600 ? 120 : 152) - this.gunRecoil * 0.72);
        const muzzleX = anchorX + Math.cos(aimAngle) * barrelLen;
        const muzzleY = anchorY + Math.sin(aimAngle) * barrelLen;
        const ejectX = anchorX + Math.cos(aimAngle) * (barrelLen * 0.52);
        const ejectY = anchorY + Math.sin(aimAngle) * (barrelLen * 0.52);

        return {
            x: muzzleX,
            y: muzzleY,
            angle: aimAngle,
            anchorX,
            anchorY,
            barrelLen,
            ejectX,
            ejectY
        };
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

        // 螢幕震動與槍管後座力
        this.addScreenShake(w.force * 0.3);
        this.gunRecoil = Math.min(34, this.gunRecoil + Math.max(10, w.force * 0.65));
        this.barrelHeat = Math.min(1.0, this.barrelHeat + 0.22);

        // 槍帽猛烈噴火與拋殼
        this.muzzleFlashTimer = this.muzzleFlashDuration;
        this.muzzleFlashSeed = Math.random();
        this.muzzlePos = this.getGunMuzzleTransform();
        this.spawnMuzzleFireParticles(this.muzzlePos, w);
        this.spawnCasing(this.muzzlePos);

        if (w.type === 'projectile') {
            // 從槍帽頂端發射投擲物/火箭
            this.projectiles.push(new Projectile(this.muzzlePos.x, this.muzzlePos.y, this.mouseX, this.mouseY, w.projectileType, w));
        } else if (w.type === 'beam') {
            // 雷射貫穿射擊
            this.fireBeam(w);
        } else {
            // 發射可見高速 3D 實體子彈流 (手槍、衝鋒槍、霰彈槍)
            this.fireHitscan(w);
        }

        this.updateStatsUI();
    }

    // 槍帽噴火粒子特效 (定向火舌火星、側孔噴流與硝煙)
    spawnMuzzleFireParticles(mPos, weapon) {
        const mx = mPos.x;
        const my = mPos.y;
        const baseAngle = mPos.angle;
        const scale = weapon.muzzleScale || 1.2;

        // 1. 往前高速噴射的槍口炽熱火星 (Muzzle Sparks)
        const sparkCount = weapon.id === 'shotgun' ? 18 : 10;
        for (let i = 0; i < sparkCount; i++) {
            const spread = (Math.random() - 0.5) * 0.65;
            const a = baseAngle + spread;
            const spd = (380 + Math.random() * 680) * scale;
            const life = 0.08 + Math.random() * 0.1;
            this.particles.push({
                type: 'muzzle_spark',
                x: mx,
                y: my,
                vx: Math.cos(a) * spd,
                vy: Math.sin(a) * spd,
                radius: 2 + Math.random() * 2.5,
                color: Math.random() > 0.35 ? '#ffcc33' : '#ffffff',
                life,
                maxLife: life
            });
        }

        // 2. 槍帽制退器左右側孔噴出的橫向火流粒子
        for (let side of [-1, 1]) {
            for (let j = 0; j < 3; j++) {
                const sideAngle = baseAngle + side * (1.05 + (Math.random() - 0.5) * 0.25);
                const spd = (180 + Math.random() * 240) * scale;
                const life = 0.07 + Math.random() * 0.06;
                this.particles.push({
                    type: 'muzzle_spark',
                    x: mx - Math.cos(baseAngle) * 12,
                    y: my - Math.sin(baseAngle) * 12,
                    vx: Math.cos(sideAngle) * spd,
                    vy: Math.sin(sideAngle) * spd,
                    radius: 2.2,
                    color: '#ff8800',
                    life,
                    maxLife: life
                });
            }
        }

        // 3. 槍口濃烈硝煙 (Gun Smoke)
        for (let s = 0; s < 3; s++) {
            const a = baseAngle + (Math.random() - 0.5) * 0.5;
            const spd = 70 + Math.random() * 110;
            const life = 0.35 + Math.random() * 0.25;
            this.particles.push({
                type: 'gun_smoke',
                x: mx + Math.cos(baseAngle) * 10,
                y: my + Math.sin(baseAngle) * 10,
                vx: Math.cos(a) * spd,
                vy: Math.sin(a) * spd - 35,
                radius: 8 + Math.random() * 8,
                maxRadius: 28 + Math.random() * 18,
                life,
                maxLife: life
            });
        }

        if (this.particles.length > 380) {
            this.particles.splice(0, this.particles.length - 380);
        }
    }

    fireHitscan(weapon) {
        const zoomAccuracy = this.scopeZoom > 1.0 ? Math.max(0.25, 1.0 / Math.sqrt(this.scopeZoom)) : 1.0;
        const mPos = this.muzzlePos;

        for (let p = 0; p < weapon.pellets; p++) {
            // 彈道散佈 (高倍鏡瞄準時散佈更集中)
            const spreadAngle = (Math.random() - 0.5) * weapon.spread * Math.PI;
            const spreadDist = (0.25 + Math.random() * 0.85) * 24 * weapon.spread * 10 * zoomAccuracy;
            const targetX = this.mouseX + Math.cos(spreadAngle) * spreadDist;
            const targetY = this.mouseY + Math.sin(spreadAngle) * spreadDist;

            // 預先檢測鎖定命中的十字架靶子部位 (確保移動靶在子彈飛行 0.07s 後仍100%精準射入該部位)
            let lockedHit = null;
            for (let i = this.dummies.length - 1; i >= 0; i--) {
                const dummy = this.dummies[i];
                const hit = dummy.hitTest(targetX, targetY);
                if (hit) {
                    lockedHit = { dummy, hit };
                    break;
                }
            }

            // 計算錯位出膛延遲：讓衝鋒槍/手槍多發子彈呈現前後接續飛出的密集「槍林彈雨」流線感
            let delay = 0;
            if (weapon.id === 'smg' || weapon.id === 'pistol') {
                delay = p * 0.018;
            } else if (weapon.id === 'shotgun') {
                delay = Math.random() * 0.016;
            }

            // 槍口微小散佈起點，讓多發彈頭同時飛行時層次分明
            const startJitterX = (Math.random() - 0.5) * 8;
            const startJitterY = (Math.random() - 0.5) * 8;

            this.bullets.push(new BulletProjectile(
                mPos.x + startJitterX,
                mPos.y + startJitterY,
                targetX,
                targetY,
                weapon,
                delay,
                lockedHit
            ));

            // 破空殘影細線 (輔助呈現超音速彈道軌跡)
            if (p === 0 || weapon.id === 'shotgun') {
                this.spawnTracer(mPos.x, mPos.y, targetX, targetY, weapon.color);
            }
        }
    }

    fireBeam(weapon) {
        // 從槍帽頂端直射一條高能雷射光束
        const startX = this.muzzlePos.x;
        const startY = this.muzzlePos.y;
        const targetX = this.mouseX;
        const targetY = this.mouseY;
        const beamAngle = Math.atan2(targetY - startY, targetX - startX);

        for (let dummy of this.dummies) {
            const hit = dummy.hitTest(targetX, targetY);
            if (hit) {
                this.onHitDummy(dummy, hit, targetX, targetY, weapon, beamAngle);
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
            life: 0.14,
            maxLife: 0.14
        });
    }

    onHitDummy(dummy, hit, worldX, worldY, weapon, entryAngle = -Math.PI * 0.65) {
        this.stats.hits++;
        let finalDamage = Math.round(weapon.damage * hit.multiplier);

        // 觸發瞄準鏡中心命中反饋 (Hitmarker)
        this.hitMarkerTimer = 0.18;
        this.hitMarkerCrit = !!hit.crit;

        if (hit.crit) {
            this.stats.headshots++;
            if (window.soundFX) window.soundFX.playHit(true);
            this.addFloatingText(worldX, worldY - 20, `HEADSHOT! ${finalDamage}`, '#ff3344', 28, true);
        } else {
            if (window.soundFX) window.soundFX.playHit(false);
            this.addFloatingText(worldX, worldY - 15, `-${finalDamage}`, '#ffcc00', 20, false);
        }

        this.stats.totalDamage += finalDamage;

        // 應用受擊推力、立體灼熱彈孔與「子彈射入鑽孔動畫」
        dummy.applyImpulse(hit.localX, hit.localY, weapon.force, finalDamage, false, hit, entryAngle, weapon.color);

        // 產生定向射入噴濺粒子 (木屑、血霧/棉絮、高熱火花)
        const baseColor = hit.part === 'wood' ? '#a66c38' : (hit.crit ? '#ff2a2a' : '#e0c097');
        this.spawnImpactParticles(worldX, worldY, baseColor, hit.crit ? 16 : 11, entryAngle);
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

    spawnImpactParticles(x, y, color, count, entryAngle = null) {
        for (let i = 0; i < count; i++) {
            // 65% 粒子沿射入反方向噴濺 (逆向破口飛濺)，35% 往四周炸開
            let angle;
            if (entryAngle !== null && i < count * 0.65) {
                angle = entryAngle + Math.PI + (Math.random() - 0.5) * 1.15;
            } else {
                angle = Math.random() * Math.PI * 2;
            }
            const speed = 80 + Math.random() * 260;
            this.particles.push({
                type: 'spark',
                x, y,
                vx: Math.cos(angle) * speed,
                vy: Math.sin(angle) * speed - 50,
                radius: 2 + Math.random() * 3.2,
                color: Math.random() > 0.42 ? color : '#ffee77',
                life: 0.3 + Math.random() * 0.25,
                maxLife: 0.55
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

    spawnEnvironmentImpact(x, y, weapon, entryAngle = -Math.PI * 0.65) {
        // 打在地面或背景牆上，產生「子彈射入地面」特效與跳彈火星
        this.worldEntries.push({
            x, y,
            radius: 4.5 * (weapon.bulletSize || 1.0),
            entryAngle,
            color: weapon.color || '#ffaa00',
            life: 0.18,
            maxLife: 0.18
        });
        if (this.worldEntries.length > 40) this.worldEntries.shift();

        for (let i = 0; i < 7; i++) {
            const angle = entryAngle + Math.PI + (Math.random() - 0.5) * 1.3;
            const spd = 70 + Math.random() * 160;
            this.particles.push({
                type: i < 3 ? 'spark' : 'dust',
                x, y,
                vx: Math.cos(angle) * spd,
                vy: Math.sin(angle) * spd - 40,
                radius: 2 + Math.random() * 2.8,
                color: i < 3 ? '#ffcc44' : '#888',
                life: 0.28,
                maxLife: 0.28
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

    spawnCasing(mPos) {
        // 從槍身拋殼窗拋出旋轉黃銅彈殼
        const x = mPos && mPos.ejectX ? mPos.ejectX : this.width * 0.68;
        const y = mPos && mPos.ejectY ? mPos.ejectY : this.height - 40;
        const count = this.currentWeapon.id === 'smg' ? 2 : 1;
        for (let i = 0; i < count; i++) {
            this.casings.push({
                x: x + (Math.random() - 0.5) * 8,
                y: y + (Math.random() - 0.5) * 8,
                vx: 95 + Math.random() * 140,
                vy: -170 - Math.random() * 110,
                angle: Math.random() * Math.PI,
                vRot: 14 + Math.random() * 18,
                life: 0.75
            });
        }
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

    // ===== 狙擊瞄準鏡 (Scope) 縮放與模式控制 =====
    setScopeZoom(zoom, playSound = true) {
        const clamped = Math.max(0.5, Math.min(8.0, Math.round(zoom * 20) / 20));
        const changed = Math.abs(clamped - this.scopeZoom) > 0.001;
        this.scopeZoom = clamped;
        this.scopeHudTimer = 1.6;

        if (changed && playSound && window.soundFX && window.soundFX.playScopeZoom) {
            window.soundFX.playScopeZoom(clamped);
        }

        const formatted = `${clamped.toFixed(clamped % 1 === 0 ? 1 : (clamped * 10 % 1 === 0 ? 1 : 2))}x`;
        const valLabel = document.getElementById('scopeZoomValLabel');
        if (valLabel) valLabel.innerText = formatted;
        const hudLabel = document.getElementById('hudScopeZoomVal');
        if (hudLabel) hudLabel.innerText = formatted;

        const slider = document.getElementById('scopeZoomSlider');
        if (slider && Math.abs(parseFloat(slider.value) - clamped) > 0.01) {
            slider.value = clamped;
        }
        const hudSlider = document.getElementById('hudScopeSlider');
        if (hudSlider && Math.abs(parseFloat(hudSlider.value) - clamped) > 0.01) {
            hudSlider.value = clamped;
        }
    }

    adjustScopeZoomByStep(dir) {
        // 低倍率時以 0.25x 微調，高倍率 (>=3.0x) 時以 0.5x 快速縮放
        const step = this.scopeZoom >= 3.0 ? 0.5 : 0.25;
        const nextZoom = Math.max(0.5, Math.min(8.0, Math.round((this.scopeZoom + dir * step) * 4) / 4));
        this.setScopeZoom(nextZoom, true);
    }

    cycleScopeZoom() {
        const presets = [1.0, 2.0, 4.0, 6.0, 8.0];
        let next = presets[0];
        for (let p of presets) {
            if (p > this.scopeZoom + 0.1) {
                next = p;
                break;
            }
        }
        this.setScopeZoom(next, true);
    }

    setScopeRadius(radius) {
        const clamped = Math.max(60, Math.min(260, Math.round(radius)));
        this.scopeRadius = clamped;
        this.scopeHudTimer = 1.6;

        const sizeLabel = document.getElementById('scopeSizeValLabel');
        if (sizeLabel) sizeLabel.innerText = `${clamped}px`;
        const sizeSlider = document.getElementById('scopeSizeSlider');
        if (sizeSlider && parseInt(sizeSlider.value) !== clamped) {
            sizeSlider.value = clamped;
        }
    }

    setScopeMode(mode) {
        this.scopeMode = mode; // 'pip' | 'fullscreen' | 'reticle'
        this.scopeHudTimer = 1.6;
        document.querySelectorAll('.scope-mode-btn').forEach(btn => {
            btn.classList.toggle('active', btn.dataset.scopemode === mode);
        });
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

        // 槍管後座力歸位與槍口熱度冷卻
        if (this.gunRecoil > 0) {
            this.gunRecoil = Math.max(0, this.gunRecoil - dt * 165);
        }
        if (this.barrelHeat > 0) {
            this.barrelHeat = Math.max(0, this.barrelHeat - dt * 0.28);
        }
        this.muzzlePos = this.getGunMuzzleTransform();

        // 瞄準鏡平滑變焦過渡
        const zoomDiff = this.scopeZoom - this.currentScopeZoom;
        if (Math.abs(zoomDiff) > 0.002) {
            this.currentScopeZoom += zoomDiff * Math.min(1, dt * 16);
        } else {
            this.currentScopeZoom = this.scopeZoom;
        }

        if (this.scopeHudTimer > 0) {
            this.scopeHudTimer = Math.max(0, this.scopeHudTimer - dt);
        }
        if (this.hitMarkerTimer > 0) {
            this.hitMarkerTimer = Math.max(0, this.hitMarkerTimer - dt);
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

        // 更新可見高速 3D 實體子彈流 (從槍帽射出 -> 高速飛行 -> 射入目標)
        for (let i = this.bullets.length - 1; i >= 0; i--) {
            const b = this.bullets[i];
            const wasWaiting = !b.started;
            const arrived = b.update(dt, this.muzzlePos);

            // 若錯位連發子彈剛出膛，觸發額外槍帽火光脈衝，讓連射火舌不間斷
            if (wasWaiting && b.started) {
                this.muzzleFlashTimer = Math.max(this.muzzleFlashTimer, 0.065);
                this.muzzleFlashSeed = Math.random();
                this.gunRecoil = Math.min(34, this.gunRecoil + 3.5);
            }

            if (arrived || b.isDead) {
                if (b.lockedHit && b.lockedHit.dummy && !b.lockedHit.dummy.isDead) {
                    this.onHitDummy(b.lockedHit.dummy, b.lockedHit.hit, b.x, b.y, b.weapon, b.angle);
                } else {
                    let hitFound = false;
                    for (let j = this.dummies.length - 1; j >= 0; j--) {
                        const dummy = this.dummies[j];
                        const hit = dummy.hitTest(b.x, b.y);
                        if (hit) {
                            hitFound = true;
                            this.onHitDummy(dummy, hit, b.x, b.y, b.weapon, b.angle);
                            break;
                        }
                    }
                    if (!hitFound) {
                        this.spawnEnvironmentImpact(b.x, b.y, b.weapon, b.angle);
                    }
                }
                this.bullets.splice(i, 1);
            }
        }

        // 更新背景/地面上的子彈射入鑽孔特效
        for (let i = this.worldEntries.length - 1; i >= 0; i--) {
            this.worldEntries[i].life -= dt;
            if (this.worldEntries[i].life <= 0) {
                this.worldEntries.splice(i, 1);
            }
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
            } else if (pt.type === 'muzzle_spark') {
                pt.x += pt.vx * dt;
                pt.y += pt.vy * dt;
                pt.vx *= 0.92;
                pt.vy *= 0.92;
            } else if (pt.type === 'gun_smoke') {
                pt.x += pt.vx * dt;
                pt.y += pt.vy * dt;
                pt.vx *= 0.95;
                const progress = 1 - (pt.life / pt.maxLife);
                pt.currentRadius = pt.radius + (pt.maxRadius - pt.radius) * progress;
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

    // 繪製世界場景（供主畫面與光學倍鏡鏡片內部高解析度重繪共用）
    renderWorldScene(ctx) {
        // 1. 繪製精美背景 (暗色工業/室外荒原靶場)
        this.renderBackground(ctx);

        // 2. 繪製背景/地面上的子彈射入特效
        this.renderWorldEntries(ctx);

        // 3. 繪製十字架人偶群 (內含人偶身上的「子彈射入/鑽孔」即時動畫)
        for (let dummy of this.dummies) {
            dummy.draw(ctx);
        }

        // 4. 繪製飛行投擲物 (火箭、番茄)
        for (let p of this.projectiles) {
            p.draw(ctx);
        }

        // 5. 繪製高速 3D 實體飛行子彈流 (呈現「子彈射出」與「槍林彈雨」)
        for (let b of this.bullets) {
            b.draw(ctx);
        }

        // 6. 繪製粒子特效
        this.renderParticles(ctx);

        // 7. 浮動傷害字體
        this.renderFloatingTexts(ctx);
    }

    render() {
        const ctx = this.ctx;
        ctx.clearRect(0, 0, this.width, this.height);

        let rx = 0;
        let ry = 0;
        if (this.shakeMagnitude > 0) {
            rx = (Math.random() - 0.5) * this.shakeMagnitude;
            ry = (Math.random() - 0.5) * this.shakeMagnitude;
        }

        ctx.save();
        // 若為「全屏狙擊放大」模式，以滑鼠準心為軸心縮放整個視野
        if (this.scopeMode === 'fullscreen' && Math.abs(this.currentScopeZoom - 1.0) > 0.01) {
            ctx.translate(this.mouseX, this.mouseY);
            ctx.scale(this.currentScopeZoom, this.currentScopeZoom);
            ctx.translate(-this.mouseX, -this.mouseY);
        }

        if (rx !== 0 || ry !== 0) {
            ctx.translate(rx, ry);
        }

        this.renderWorldScene(ctx);
        ctx.restore();

        // 8. 前景第一人稱槍帽猛烈噴火、擬真槍管與拋殼 (始終顯示於右下前景，極具臨場射擊感)
        ctx.save();
        if (rx !== 0 || ry !== 0) {
            ctx.translate(rx * 0.45, ry * 0.45);
        }
        if (this.muzzleFlashTimer > 0) {
            this.renderMuzzleFlash(ctx);
        }
        this.renderFirstPersonGun(ctx);
        this.renderCasings(ctx);
        ctx.restore();

        // 9. 繪製可縮放狙擊瞄準鏡 / 準心指示 (跟隨滑鼠)
        this.renderCrosshair(ctx, rx, ry);
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

        // 開槍瞬間照亮靶場地面的環境火光
        if (this.muzzleFlashTimer > 0) {
            const flashAlpha = (this.muzzleFlashTimer / this.muzzleFlashDuration) * 0.16;
            const envGrad = ctx.createRadialGradient(
                this.muzzlePos.x, this.muzzlePos.y, 20,
                this.muzzlePos.x, this.muzzlePos.y, this.width * 0.65
            );
            envGrad.addColorStop(0, `rgba(255, 160, 40, ${flashAlpha})`);
            envGrad.addColorStop(1, 'rgba(255, 100, 0, 0)');
            ctx.fillStyle = envGrad;
            ctx.fillRect(0, 0, this.width, this.height);
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

    renderWorldEntries(ctx) {
        if (!this.worldEntries || this.worldEntries.length === 0) return;
        for (let entry of this.worldEntries) {
            const p = 1 - (entry.life / entry.maxLife);
            const alpha = Math.max(0, 1 - p);
            const r = entry.radius;

            ctx.save();
            ctx.translate(entry.x, entry.y);
            ctx.rotate(entry.entryAngle);

            // 射入地面氣浪環
            ctx.strokeStyle = `rgba(255, 200, 80, ${alpha * 0.8})`;
            ctx.lineWidth = 2 * (1 - p);
            ctx.beginPath();
            ctx.ellipse(0, 0, r * (0.6 + p * 2.6), r * (1.2 + p * 3.5), 0, 0, Math.PI * 2);
            ctx.stroke();

            // 鑽入地面的子彈殘影
            if (p < 0.75) {
                const subP = p / 0.75;
                const bLen = r * 4.5;
                const offsetX = -bLen * (1 - subP * 0.9);
                ctx.beginPath();
                ctx.rect(-bLen * 2, -r * 3, bLen * 2 + r * 0.2, r * 6);
                ctx.clip();

                ctx.fillStyle = '#f39c12';
                ctx.beginPath();
                ctx.moveTo(offsetX, -r * 0.8);
                ctx.lineTo(offsetX + bLen, 0);
                ctx.lineTo(offsetX, r * 0.8);
                ctx.closePath();
                ctx.fill();
            }
            ctx.restore();
        }
    }

    renderParticles(ctx) {
        for (let pt of this.particles) {
            ctx.save();
            if (pt.type === 'spark' || pt.type === 'tomato_chunk' || pt.type === 'fire') {
                ctx.fillStyle = pt.color;
                ctx.beginPath();
                ctx.arc(pt.x, pt.y, Math.max(0.5, pt.radius * (pt.life / pt.maxLife)), 0, Math.PI * 2);
                ctx.fill();
            } else if (pt.type === 'muzzle_spark') {
                const alpha = Math.max(0, pt.life / pt.maxLife);
                ctx.strokeStyle = pt.color;
                ctx.globalAlpha = alpha;
                ctx.lineWidth = pt.radius;
                ctx.lineCap = 'round';
                ctx.beginPath();
                ctx.moveTo(pt.x, pt.y);
                ctx.lineTo(pt.x - pt.vx * 0.028, pt.y - pt.vy * 0.028);
                ctx.stroke();
            } else if (pt.type === 'gun_smoke') {
                const alpha = Math.max(0, (pt.life / pt.maxLife) * 0.28);
                ctx.fillStyle = `rgba(190, 200, 210, ${alpha})`;
                ctx.beginPath();
                ctx.arc(pt.x, pt.y, pt.currentRadius || pt.radius, 0, Math.PI * 2);
                ctx.fill();
            } else if (pt.type === 'dust') {
                const alpha = Math.max(0, pt.life / pt.maxLife);
                ctx.fillStyle = `rgba(140, 130, 115, ${alpha * 0.65})`;
                ctx.beginPath();
                ctx.arc(pt.x, pt.y, pt.radius * (1.5 - alpha * 0.5), 0, Math.PI * 2);
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
                ctx.globalAlpha = alpha * 0.55;
                ctx.lineWidth = 2.0;
                ctx.beginPath();
                ctx.moveTo(pt.x1, pt.y1);
                ctx.lineTo(pt.x2, pt.y2);
                ctx.stroke();
            } else if (pt.type === 'laser_beam') {
                const alpha = Math.max(0, pt.life / pt.maxLife);
                // 外層光暈
                ctx.strokeStyle = pt.color;
                ctx.globalAlpha = alpha * 0.5;
                ctx.lineWidth = 12;
                ctx.beginPath();
                ctx.moveTo(pt.x1, pt.y1);
                ctx.lineTo(pt.x2, pt.y2);
                ctx.stroke();
                // 核心白光
                ctx.strokeStyle = '#ffffff';
                ctx.globalAlpha = alpha;
                ctx.lineWidth = 3.5;
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
            // 立體黃銅拋殼與金屬反光
            ctx.fillStyle = '#f1c40f';
            ctx.fillRect(-7, -2.5, 14, 5);
            ctx.fillStyle = '#fff5b8';
            ctx.fillRect(-6, -1.5, 10, 1.5);
            ctx.fillStyle = '#b7950b';
            ctx.fillRect(5, -2.5, 2.5, 5);
            ctx.restore();
        }
    }

    // 繪製第一人稱擬真槍管與重型多孔槍帽 (Muzzle Cap / Compensator)
    renderFirstPersonGun(ctx) {
        const mPos = this.muzzlePos;
        if (!mPos) return;

        const w = this.currentWeapon;
        const heat = this.barrelHeat;

        ctx.save();
        ctx.translate(mPos.anchorX, mPos.anchorY);
        ctx.rotate(mPos.angle);

        const len = mPos.barrelLen;
        const capLen = 34;
        const bodyEnd = len - capLen;

        // 1. 槍機護木與主槍管 (Gun Receiver & Barrel Shroud)
        const bodyGrad = ctx.createLinearGradient(0, -18, 0, 18);
        bodyGrad.addColorStop(0, '#3a4149');
        bodyGrad.addColorStop(0.45, '#1f242a');
        bodyGrad.addColorStop(1, '#0d1014');
        ctx.fillStyle = bodyGrad;
        ctx.strokeStyle = '#525c68';
        ctx.lineWidth = 1.5;

        ctx.beginPath();
        if (ctx.roundRect) {
            ctx.roundRect(-20, -16, bodyEnd + 22, 32, 5);
        } else {
            ctx.rect(-20, -16, bodyEnd + 22, 32);
        }
        ctx.fill();
        ctx.stroke();

        // 戰術散熱孔與拋殼窗 (開火時透出火光)
        const isFiring = this.muzzleFlashTimer > 0;
        for (let vx = 28; vx < bodyEnd - 12; vx += 18) {
            ctx.fillStyle = isFiring
                ? 'rgba(255, 180, 50, 0.9)'
                : (heat > 0.05 ? `rgba(255, 90, 20, ${heat * 0.7})` : '#090b0e');
            ctx.fillRect(vx, -6, 10, 12);
        }

        // 武器專屬裝飾條 (依當前武器變換塗裝高光)
        ctx.fillStyle = w.color || '#ffaa00';
        ctx.globalAlpha = 0.75;
        ctx.fillRect(15, -13, bodyEnd - 20, 2.5);
        ctx.globalAlpha = 1.0;

        // 2. 前端重型槍帽 / 多孔制退器 (Heavy Tactical Muzzle Cap / Brake)
        const capStart = bodyEnd;
        const capGrad = ctx.createLinearGradient(0, -14, 0, 14);
        capGrad.addColorStop(0, '#56606b');
        capGrad.addColorStop(0.35, '#2b3139');
        capGrad.addColorStop(1, '#12161a');
        ctx.fillStyle = capGrad;
        ctx.strokeStyle = isFiring ? '#ffaa33' : '#6e7885';
        ctx.lineWidth = 1.8;

        ctx.beginPath();
        ctx.moveTo(capStart, -13);
        ctx.lineTo(len, -11);
        ctx.lineTo(len + 4, -8);
        ctx.lineTo(len + 4, 8);
        ctx.lineTo(len, 11);
        ctx.lineTo(capStart, 13);
        ctx.closePath();
        ctx.fill();
        ctx.stroke();

        // 槍帽上的三排斜向噴火制退氣孔 (Muzzle Cap Exhaust Vents)
        for (let i = 0; i < 3; i++) {
            const slotX = capStart + 6 + i * 9;
            ctx.fillStyle = isFiring
                ? '#ffffff'
                : (heat > 0.03 ? `rgba(255, ${Math.round(100 + heat * 110)}, 20, ${0.4 + heat * 0.6})` : '#0a0c0e');
            // 上下側排氣孔與中央腔室
            ctx.fillRect(slotX, -12, 4.5, 5);
            ctx.fillRect(slotX, 7, 4.5, 5);
            ctx.fillRect(slotX, -3.5, 4.5, 7);
        }

        // 槍帽持續高溫紅熱光暈 (持續掃射時槍帽發紅發亮)
        if (heat > 0.05 || isFiring) {
            const glowA = isFiring ? 0.65 : heat * 0.45;
            const heatGrad = ctx.createRadialGradient(len - 8, 0, 2, len - 8, 0, 28);
            heatGrad.addColorStop(0, `rgba(255, 160, 40, ${glowA})`);
            heatGrad.addColorStop(1, 'rgba(255, 50, 0, 0)');
            ctx.fillStyle = heatGrad;
            ctx.beginPath();
            ctx.arc(len - 8, 0, 28, 0, Math.PI * 2);
            ctx.fill();
        }

        ctx.restore();
    }

    // 繪製槍帽猛烈噴火特效 (中央主火舌 + 左右制退器噴火翼 + 星芒爆閃 + 音爆火環)
    renderMuzzleFlash(ctx) {
        const mPos = this.muzzlePos;
        if (!mPos) return;

        const progress = Math.max(0, this.muzzleFlashTimer / this.muzzleFlashDuration);
        const wScale = (this.currentWeapon.muzzleScale || 1.3) * (0.85 + 0.35 * Math.sin(progress * Math.PI));
        const jitter = 0.88 + 0.24 * ((this.muzzleFlashSeed * 997) % 1);

        ctx.save();
        ctx.translate(mPos.x, mPos.y);
        ctx.rotate(mPos.angle);
        ctx.globalCompositeOperation = 'lighter';

        // 1. 槍口大範圍熾熱火光環境暈染
        const radGlow = ctx.createRadialGradient(25 * wScale, 0, 4, 25 * wScale, 0, 145 * wScale);
        radGlow.addColorStop(0, `rgba(255, 230, 140, ${0.85 * progress})`);
        radGlow.addColorStop(0.4, `rgba(255, 110, 15, ${0.5 * progress})`);
        radGlow.addColorStop(1, 'rgba(255, 40, 0, 0)');
        ctx.fillStyle = radGlow;
        ctx.beginPath();
        ctx.arc(25 * wScale, 0, 145 * wScale, 0, Math.PI * 2);
        ctx.fill();

        // 2. 槍帽左右側孔噴出的雙翼制退火舌 (Side Muzzle Brake Flame Jets)
        const sideLen = 68 * wScale * jitter;
        const sideWidth = 14 * wScale;
        for (let side of [-1, 1]) {
            ctx.save();
            ctx.translate(-14, side * 9);
            ctx.rotate(side * 1.05); // 約 ±60 度從槍帽側孔猛烈噴出

            // 外層橘紅火翼
            const sGrad = ctx.createLinearGradient(0, 0, sideLen, 0);
            sGrad.addColorStop(0, `rgba(255, 255, 220, ${progress})`);
            sGrad.addColorStop(0.45, `rgba(255, 140, 20, ${0.9 * progress})`);
            sGrad.addColorStop(1, 'rgba(255, 30, 0, 0)');
            ctx.fillStyle = sGrad;
            ctx.beginPath();
            ctx.moveTo(0, -sideWidth * 0.45);
            ctx.quadraticCurveTo(sideLen * 0.5, -sideWidth, sideLen, 0);
            ctx.quadraticCurveTo(sideLen * 0.5, sideWidth, 0, sideWidth * 0.45);
            ctx.closePath();
            ctx.fill();

            // 內層白熱火芯
            ctx.fillStyle = `rgba(255, 255, 255, ${0.9 * progress})`;
            ctx.beginPath();
            ctx.moveTo(0, -sideWidth * 0.2);
            ctx.lineTo(sideLen * 0.55, 0);
            ctx.lineTo(0, sideWidth * 0.2);
            ctx.closePath();
            ctx.fill();

            ctx.restore();
        }

        // 3. 斜向星芒火刺 (Diagonal Flame Spikes)
        const diagLen = 78 * wScale / jitter;
        for (let side of [-1, 1]) {
            ctx.save();
            ctx.rotate(side * 0.36);
            ctx.fillStyle = `rgba(255, 150, 30, ${0.75 * progress})`;
            ctx.beginPath();
            ctx.moveTo(-2, -6 * wScale);
            ctx.lineTo(diagLen, 0);
            ctx.lineTo(-2, 6 * wScale);
            ctx.closePath();
            ctx.fill();
            ctx.restore();
        }

        // 4. 中央主噴火巨舌 (Main Forward Roaring Flame Spear)
        const mainLen = 148 * wScale * jitter;
        const mainW = 24 * wScale;

        // 主火舌外層赤紅烈焰
        const mainGrad = ctx.createLinearGradient(0, 0, mainLen, 0);
        mainGrad.addColorStop(0, `rgba(255, 255, 255, ${progress})`);
        mainGrad.addColorStop(0.28, `rgba(255, 200, 40, ${0.95 * progress})`);
        mainGrad.addColorStop(0.68, `rgba(255, 80, 10, ${0.85 * progress})`);
        mainGrad.addColorStop(1, 'rgba(255, 20, 0, 0)');
        ctx.fillStyle = mainGrad;

        ctx.beginPath();
        ctx.moveTo(-6, -mainW * 0.45);
        ctx.quadraticCurveTo(mainLen * 0.3, -mainW * 1.05, mainLen * 0.62, -mainW * 0.38);
        ctx.lineTo(mainLen, 0);
        ctx.lineTo(mainLen * 0.62, mainW * 0.38);
        ctx.quadraticCurveTo(mainLen * 0.3, mainW * 1.05, -6, mainW * 0.45);
        ctx.closePath();
        ctx.fill();

        // 主火舌內層刺眼白熱電漿核心
        ctx.fillStyle = `rgba(255, 255, 255, ${0.98 * progress})`;
        ctx.beginPath();
        ctx.moveTo(-4, -mainW * 0.24);
        ctx.quadraticCurveTo(mainLen * 0.25, -mainW * 0.45, mainLen * 0.58, 0);
        ctx.quadraticCurveTo(mainLen * 0.25, mainW * 0.45, -4, mainW * 0.24);
        ctx.closePath();
        ctx.fill();

        // 5. 槍帽口高壓音爆火環 (Expanding Muzzle Shockwave Ring)
        const ringX = 18 + (1 - progress) * 48 * wScale;
        const ringR = (16 + (1 - progress) * 28) * wScale;
        ctx.strokeStyle = `rgba(255, 220, 120, ${progress * 0.8})`;
        ctx.lineWidth = 3 * progress;
        ctx.beginPath();
        ctx.ellipse(ringX, 0, ringR * 0.38, ringR, 0, 0, Math.PI * 2);
        ctx.stroke();

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

    renderCrosshair(ctx, rx = 0, ry = 0) {
        const x = this.mouseX;
        const y = this.mouseY;
        const w = this.currentWeapon;
        const accentColor = w.color || '#00ffcc';
        const zoom = this.currentScopeZoom;
        const r = this.scopeRadius;

        ctx.save();

        // 若為「一般準心 (reticle)」模式：不畫光學倍鏡鏡片，而是隨倍率縮放準心本身大小
        if (this.scopeMode === 'reticle') {
            const s = Math.max(0.5, Math.min(4.0, zoom * 0.75));
            ctx.strokeStyle = accentColor;
            ctx.lineWidth = 2 * Math.min(1.8, s);

            if (w.id === 'rpg') {
                ctx.beginPath();
                ctx.arc(x, y, 24 * s, 0, Math.PI * 2);
                ctx.stroke();
                ctx.beginPath();
                ctx.arc(x, y, 6 * s, 0, Math.PI * 2);
                ctx.fillStyle = '#ff4400';
                ctx.fill();
            } else if (w.id === 'tomato') {
                ctx.beginPath();
                ctx.arc(x, y, 14 * s, 0, Math.PI * 2);
                ctx.stroke();
                ctx.fillStyle = '#ff4444';
                ctx.beginPath();
                ctx.arc(x, y, 4 * s, 0, Math.PI * 2);
                ctx.fill();
            } else {
                const gap = 6 * s;
                const len = 14 * s;
                ctx.beginPath();
                ctx.moveTo(x - gap - len, y); ctx.lineTo(x - gap, y);
                ctx.moveTo(x + gap, y); ctx.lineTo(x + gap + len, y);
                ctx.moveTo(x, y - gap - len); ctx.lineTo(x, y - gap);
                ctx.moveTo(x, y + gap); ctx.lineTo(x, y + gap + len);
                ctx.stroke();

                ctx.fillStyle = accentColor;
                ctx.fillRect(x - 1.5 * s, y - 1.5 * s, 3 * s, 3 * s);
            }

            if (this.scopeHudTimer > 0) {
                ctx.fillStyle = `rgba(0, 230, 118, ${Math.min(1, this.scopeHudTimer)})`;
                ctx.font = 'bold 12px "Segoe UI", sans-serif';
                ctx.fillText(`🔍 ${this.scopeZoom.toFixed(1)}x`, x + 18 * s, y - 14 * s);
            }
            ctx.restore();
            return;
        }

        // ===== 1. 光學倍鏡 (PiP) 鏡內局部高解析度放大渲染 =====
        if (this.scopeMode === 'pip') {
            ctx.save();
            ctx.beginPath();
            ctx.arc(x, y, r, 0, Math.PI * 2);
            ctx.clip();

            // 鏡片底色保護
            ctx.fillStyle = '#0d1117';
            ctx.fillRect(x - r, y - r, r * 2, r * 2);

            // 以準心 (x, y) 為中心進行光學縮放
            ctx.translate(x, y);
            ctx.scale(zoom, zoom);
            ctx.translate(-x, -y);

            if (rx !== 0 || ry !== 0) {
                ctx.translate(rx, ry);
            }

            this.renderWorldScene(ctx);
            ctx.restore();
        } else if (this.scopeMode === 'fullscreen') {
            // 全屏狙擊模式下，鏡框外部稍微壓暗以突顯狙擊鏡視野
            ctx.save();
            ctx.fillStyle = 'rgba(0, 0, 0, 0.38)';
            ctx.beginPath();
            ctx.rect(0, 0, this.width, this.height);
            ctx.arc(x, y, r, 0, Math.PI * 2, true);
            ctx.fill();
            ctx.restore();
        }

        // ===== 2. 光學鏡片塗層與邊緣暗角 (Vignette & Lens Glint) =====
        const lensGrad = ctx.createRadialGradient(x, y, r * 0.55, x, y, r);
        lensGrad.addColorStop(0, 'rgba(0, 255, 200, 0)');
        lensGrad.addColorStop(0.82, 'rgba(0, 40, 35, 0.12)');
        lensGrad.addColorStop(1, 'rgba(0, 10, 15, 0.55)');
        ctx.fillStyle = lensGrad;
        ctx.beginPath();
        ctx.arc(x, y, r, 0, Math.PI * 2);
        ctx.fill();

        // 鏡面反光高光弧
        ctx.save();
        ctx.strokeStyle = 'rgba(255, 255, 255, 0.14)';
        ctx.lineWidth = Math.max(3, r * 0.05);
        ctx.lineCap = 'round';
        ctx.beginPath();
        ctx.arc(x, y, r * 0.84, -Math.PI * 0.78, -Math.PI * 0.48);
        ctx.stroke();

        // 開槍瞬間：槍帽火光在瞄準鏡鏡片右下緣形成的熾熱橘金反光弧
        if (this.muzzleFlashTimer > 0) {
            const mfAlpha = Math.min(1, (this.muzzleFlashTimer / this.muzzleFlashDuration) * 0.85);
            ctx.strokeStyle = `rgba(255, 160, 40, ${mfAlpha})`;
            ctx.lineWidth = Math.max(4, r * 0.07);
            ctx.beginPath();
            ctx.arc(x, y, r * 0.91, Math.PI * 0.08, Math.PI * 0.42);
            ctx.stroke();
        }
        ctx.restore();

        // ===== 3. 戰術密位十字刻度線 (Mil-Dot Reticle) =====
        ctx.save();
        ctx.beginPath();
        ctx.arc(x, y, r - 2, 0, Math.PI * 2);
        ctx.clip();

        // 外圍細十字線
        ctx.strokeStyle = 'rgba(255, 255, 255, 0.45)';
        ctx.lineWidth = 1;
        const centerGap = 14;
        ctx.beginPath();
        ctx.moveTo(x - r, y); ctx.lineTo(x - centerGap, y);
        ctx.moveTo(x + centerGap, y); ctx.lineTo(x + r, y);
        ctx.moveTo(x, y - r); ctx.lineTo(x, y - centerGap);
        ctx.moveTo(x, y + centerGap); ctx.lineTo(x, y + r);
        ctx.stroke();

        // 密位刻度 (隨變焦倍率微調間距，帶來真實光學變焦感)
        const tickStep = Math.max(12, Math.min(34, 16 * (1 + (zoom - 1) * 0.12)));
        ctx.strokeStyle = accentColor;
        ctx.lineWidth = 1.4;
        ctx.globalAlpha = 0.75;
        ctx.beginPath();
        for (let d = tickStep; d < r - 12; d += tickStep) {
            const tickHalf = (Math.round(d / tickStep) % 2 === 0) ? 5.5 : 3;
            // 左右水平刻度
            ctx.moveTo(x - d, y - tickHalf); ctx.lineTo(x - d, y + tickHalf);
            ctx.moveTo(x + d, y - tickHalf); ctx.lineTo(x + d, y + tickHalf);
            // 上下垂直刻度
            ctx.moveTo(x - tickHalf, y - d); ctx.lineTo(x + tickHalf, y - d);
            ctx.moveTo(x - tickHalf, y + d); ctx.lineTo(x + tickHalf, y + d);
        }
        ctx.stroke();

        // 中心武器專屬準心與夜光紅點
        ctx.globalAlpha = 0.95;
        ctx.strokeStyle = accentColor;
        ctx.lineWidth = 2;
        if (w.id === 'rpg') {
            ctx.beginPath();
            ctx.arc(x, y, 22, 0, Math.PI * 2);
            ctx.stroke();
        } else if (w.id === 'shotgun') {
            ctx.setLineDash([5, 4]);
            ctx.beginPath();
            ctx.arc(x, y, Math.max(14, 34 / Math.sqrt(Math.max(1, zoom))), 0, Math.PI * 2);
            ctx.stroke();
            ctx.setLineDash([]);
        } else {
            ctx.beginPath();
            ctx.arc(x, y, centerGap, 0, Math.PI * 2);
            ctx.stroke();
        }

        // 中心精準瞄準點
        ctx.fillStyle = '#ff2244';
        ctx.beginPath();
        ctx.arc(x, y, 2.8, 0, Math.PI * 2);
        ctx.fill();

        // 命中反饋 (Hitmarker ✕)
        if (this.hitMarkerTimer > 0) {
            const hmAlpha = Math.min(1, this.hitMarkerTimer / 0.12);
            ctx.strokeStyle = this.hitMarkerCrit ? '#ff2233' : '#ffffff';
            ctx.lineWidth = this.hitMarkerCrit ? 3 : 2.2;
            ctx.globalAlpha = hmAlpha;
            const hmIn = 6;
            const hmOut = this.hitMarkerCrit ? 17 : 13;
            ctx.beginPath();
            ctx.moveTo(x - hmOut, y - hmOut); ctx.lineTo(x - hmIn, y - hmIn);
            ctx.moveTo(x + hmOut, y - hmOut); ctx.lineTo(x + hmIn, y - hmIn);
            ctx.moveTo(x - hmOut, y + hmOut); ctx.lineTo(x - hmIn, y + hmIn);
            ctx.moveTo(x + hmOut, y + hmOut); ctx.lineTo(x + hmIn, y + hmIn);
            ctx.stroke();
        }
        ctx.restore();

        // ===== 4. 狙擊鏡金屬外框與倍率轉輪弧線 =====
        // 鏡筒金屬黑外框
        ctx.strokeStyle = '#161b22';
        ctx.lineWidth = 7;
        ctx.beginPath();
        ctx.arc(x, y, r, 0, Math.PI * 2);
        ctx.stroke();

        // 戰術光圈內環
        ctx.strokeStyle = accentColor;
        ctx.lineWidth = 1.8;
        ctx.globalAlpha = 0.85;
        ctx.beginPath();
        ctx.arc(x, y, r - 3, 0, Math.PI * 2);
        ctx.stroke();
        ctx.globalAlpha = 1.0;

        // 頂部與右側戰術調節旋鈕 (Turrets)
        ctx.fillStyle = '#21262d';
        ctx.strokeStyle = '#484f58';
        ctx.lineWidth = 1.5;
        // 頂部仰角旋鈕
        ctx.fillRect(x - 14, y - r - 10, 28, 7);
        ctx.strokeRect(x - 14, y - r - 10, 28, 7);
        // 右側風偏旋鈕
        ctx.fillRect(x + r + 3, y - 14, 7, 28);
        ctx.strokeRect(x + r + 3, y - 14, 7, 28);

        // 右下角變焦進度弧線 (0.5x ~ 8.0x)
        const zoomProgress = Math.max(0, Math.min(1, (zoom - 0.5) / 7.5));
        const startArc = Math.PI * 0.15;
        const endArc = Math.PI * 0.42;
        ctx.strokeStyle = 'rgba(255, 255, 255, 0.2)';
        ctx.lineWidth = 4;
        ctx.beginPath();
        ctx.arc(x, y, r + 8, startArc, endArc);
        ctx.stroke();

        ctx.strokeStyle = '#00e676';
        ctx.lineWidth = 4;
        ctx.beginPath();
        ctx.arc(x, y, r + 8, startArc, startArc + (endArc - startArc) * zoomProgress);
        ctx.stroke();

        // ===== 5. 瞄準鏡即時倍率與操作標籤 =====
        const badgeX = x + r * 0.68;
        const badgeY = y + r * 0.78;
        const zoomText = `${this.scopeZoom.toFixed(this.scopeZoom % 1 === 0 ? 1 : (this.scopeZoom * 10 % 1 === 0 ? 1 : 2))}x`;

        ctx.fillStyle = 'rgba(13, 17, 23, 0.85)';
        ctx.strokeStyle = this.scopeHudTimer > 0 ? '#00e676' : 'rgba(0, 230, 118, 0.5)';
        ctx.lineWidth = 1.5;
        ctx.beginPath();
        if (ctx.roundRect) {
            ctx.roundRect(badgeX - 4, badgeY - 14, 54, 20, 5);
        } else {
            ctx.rect(badgeX - 4, badgeY - 14, 54, 20);
        }
        ctx.fill();
        ctx.stroke();

        ctx.fillStyle = '#00e676';
        ctx.font = 'bold 12px "Segoe UI", monospace';
        ctx.textAlign = 'center';
        ctx.fillText(`🔭${zoomText}`, badgeX + 23, badgeY);

        // 當剛滾動滾輪或調整倍率時，在鏡框下方顯示短暫操作提示
        if (this.scopeHudTimer > 0) {
            ctx.globalAlpha = Math.min(1, this.scopeHudTimer * 1.2);
            ctx.fillStyle = '#e6edf3';
            ctx.font = '600 11px "Segoe UI", sans-serif';
            ctx.textAlign = 'center';
            ctx.fillText(`🖱️ 滾輪縮放 (${zoomText}) ｜ 右鍵切換`, x, y + r + 22);
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

    // ===== 狙擊瞄準鏡 (Scope) 控制項綁定 =====
    document.querySelectorAll('.scope-mode-btn').forEach(btn => {
        btn.addEventListener('click', () => {
            window.game.setScopeMode(btn.dataset.scopemode);
        });
    });

    const scopeZoomSlider = document.getElementById('scopeZoomSlider');
    if (scopeZoomSlider) {
        scopeZoomSlider.addEventListener('input', (e) => {
            window.game.setScopeZoom(parseFloat(e.target.value), true);
        });
    }

    const hudScopeSlider = document.getElementById('hudScopeSlider');
    if (hudScopeSlider) {
        hudScopeSlider.addEventListener('input', (e) => {
            window.game.setScopeZoom(parseFloat(e.target.value), true);
        });
    }

    const btnScopeZoomOut = document.getElementById('btnScopeZoomOut');
    if (btnScopeZoomOut) {
        btnScopeZoomOut.addEventListener('click', () => {
            window.game.adjustScopeZoomByStep(-1);
        });
    }

    const btnScopeZoomIn = document.getElementById('btnScopeZoomIn');
    if (btnScopeZoomIn) {
        btnScopeZoomIn.addEventListener('click', () => {
            window.game.adjustScopeZoomByStep(1);
        });
    }

    const hudScopeMinus = document.getElementById('hudScopeMinus');
    if (hudScopeMinus) {
        hudScopeMinus.addEventListener('click', () => {
            window.game.adjustScopeZoomByStep(-1);
        });
    }

    const hudScopePlus = document.getElementById('hudScopePlus');
    if (hudScopePlus) {
        hudScopePlus.addEventListener('click', () => {
            window.game.adjustScopeZoomByStep(1);
        });
    }

    document.querySelectorAll('.btn-scope-preset').forEach(btn => {
        btn.addEventListener('click', () => {
            window.game.setScopeZoom(parseFloat(btn.dataset.zoom), true);
        });
    });

    const scopeSizeSlider = document.getElementById('scopeSizeSlider');
    if (scopeSizeSlider) {
        scopeSizeSlider.addEventListener('input', (e) => {
            window.game.setScopeRadius(parseInt(e.target.value));
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
