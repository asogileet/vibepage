// 十字架人偶靶子 (Crucified Dummy Target)
class CrucifiedDummy {
    constructor(x, y, scale = 1.0, customImage = null, isCustomFull = false) {
        this.x = x;
        this.y = y; // 十字架底部地面錨點
        this.baseX = x;
        this.baseY = y;
        this.baseScale = scale;
        this.scale = scale;

        // 自訂圖片
        this.customImage = customImage; // Image 物件
        this.isCustomFull = isCustomFull; // 是否為整張相片完整顯示，否則為替換頭像
        this.customScale = 1.0; // 放大縮小倍率
        this.customOffsetX = 0; // 左右水平偏移
        this.customOffsetY = 0; // 上下垂直偏移
        this.customShape = 'circle'; // 'circle' | 'rect'
        this.headFrameScale = 1.0; // 頭像框本身的大小倍率 (0.8 ~ 4.0)

        // 預設樣式
        this.dummyType = Math.floor(Math.random() * 3); // 0: 布偶, 1: 標靶假人, 2: 搞怪表情人

        // 物理擺動系統 (雙軸：左右擺動 angleZ, 前後後仰 tiltX, 扭動 twist)
        this.angle = 0; // 左右擺角 (rad)
        this.angleVel = 0;
        this.tilt = 0;  // 後仰角 (0 ~ 0.5)
        this.tiltVel = 0;
        
        // 抖動/震動
        this.shakeX = 0;
        this.shakeY = 0;

        // 生命值與狀態
        this.maxHp = 500;
        this.hp = this.maxHp;
        this.isDead = false;
        this.respawnTimer = 0;

        // 痕跡紀錄與子彈射入動態特效
        this.bulletHoles = [];
        this.activeEntries = []; // 正在鑽入靶體的子彈射入動畫
        this.splats = []; // 番茄/雞蛋污漬

        // 尺寸計算 (相對於基準高度約 320px)
        this.updateDimensions();

        this.hitFlash = 0; // 受擊閃白/紅
    }

    updateDimensions() {
        this.height = 340 * this.scale;
        this.crossbarY = -230 * this.scale; // 橫木相對底部的 Y
        this.crossbarWidth = 200 * this.scale;
        this.postWidth = 32 * this.scale;
        this.headY = -250 * this.scale;
        this.headRadius = 35 * this.scale;
    }

    setScale(newScale) {
        this.scale = newScale;
        this.updateDimensions();
    }

    update(dt) {
        // 物理彈簧諧振 (左右擺盪)
        const springK = 35; // 彈力係數
        const damping = 0.92; // 阻尼
        const accel = -springK * this.angle;
        this.angleVel = (this.angleVel + accel * dt) * damping;
        this.angle += this.angleVel * dt;

        // 後仰恢復
        const tiltSpring = 45;
        const tiltDamp = 0.90;
        const tiltAccel = -tiltSpring * this.tilt;
        this.tiltVel = (this.tiltVel + tiltAccel * dt) * tiltDamp;
        this.tilt += this.tiltVel * dt;

        // 震動衰減
        this.shakeX *= 0.85;
        this.shakeY *= 0.85;
        if (Math.abs(this.shakeX) < 0.1) this.shakeX = 0;
        if (Math.abs(this.shakeY) < 0.1) this.shakeY = 0;

        // 受擊高亮淡出
        if (this.hitFlash > 0) {
            this.hitFlash -= dt * 5;
            if (this.hitFlash < 0) this.hitFlash = 0;
        }

        // 更新子彈射入鑽擊動畫
        for (let i = this.activeEntries.length - 1; i >= 0; i--) {
            const entry = this.activeEntries[i];
            entry.life -= dt;
            if (entry.life <= 0) {
                this.activeEntries.splice(i, 1);
            }
        }

        // 更新彈孔灼熱度與冒煙計時
        for (let i = 0; i < this.bulletHoles.length; i++) {
            const h = this.bulletHoles[i];
            if (h.heat > 0) {
                h.heat = Math.max(0, h.heat - dt * 0.65);
            }
            if (h.smokeLife > 0) {
                h.smokeLife = Math.max(0, h.smokeLife - dt);
                h.smokePhase += dt * 4.5;
            }
        }

        // 番茄醬流淌動態
        for (let s of this.splats) {
            if (s.drip < s.maxDrip) {
                s.drip += dt * 8;
            }
        }

        // 重生冷卻
        if (this.isDead) {
            this.respawnTimer -= dt;
            if (this.respawnTimer <= 0) {
                this.respawn();
            }
        }
    }

    respawn() {
        this.isDead = false;
        this.hp = this.maxHp;
        this.bulletHoles = [];
        this.activeEntries = [];
        this.splats = [];
        this.angle = 0;
        this.angleVel = 0;
        this.tilt = 0;
    }

    // 受擊判定與物理衝擊
    hitTest(hitX, hitY) {
        if (this.isDead) return null;

        // 轉換坐標系至十字架本體
        const dx = hitX - (this.x + this.shakeX);
        const dy = hitY - (this.y + this.shakeY);

        // 逆旋轉角度以判定局部點
        const cos = Math.cos(-this.angle);
        const sin = Math.sin(-this.angle);
        const localX = dx * cos - dy * sin;
        const localY = dx * sin + dy * cos;
        const s = this.scale;

        // 1. 如果是整張相片完整顯示模式 (isCustomFull)
        if (this.customImage && this.isCustomFull) {
            const aspect = this.customImage.width / this.customImage.height;
            let baseH = 260 * s;
            let baseW = baseH * aspect;
            if (baseW > 300 * s) {
                baseW = 300 * s;
                baseH = baseW / aspect;
            }
            const w = baseW * this.customScale;
            const h = baseH * this.customScale;
            const centerX = this.customOffsetX * s;
            const centerY = -165 * s + this.customOffsetY * s;
            const leftX = centerX - w / 2;
            const topY = centerY - h / 2;
            if (localY >= topY && localY <= topY + h && localX >= leftX && localX <= leftX + w) {
                // 上方 30% 視為暴擊爆頭
                const isHead = localY <= topY + h * 0.30;
                return { 
                    part: isHead ? 'head' : 'body', 
                    localX, localY, 
                    crit: isHead, 
                    multiplier: isHead ? 2.5 : 1.0 
                };
            }
        }

        // 2. 頭部檢測 (支援 headFrameScale 頭框放大倍率)
        const effectiveHeadRadius = this.headRadius * (this.headFrameScale || 1.0);
        if (this.customImage && !this.isCustomFull && this.customShape === 'rect') {
            const halfFrame = effectiveHeadRadius * 1.1;
            if (Math.abs(localX) <= halfFrame && Math.abs(localY - this.headY) <= halfFrame) {
                return { part: 'head', localX, localY, crit: true, multiplier: 2.5 };
            }
        } else {
            const headDist = Math.hypot(localX, localY - this.headY);
            if (headDist <= effectiveHeadRadius * 1.05) {
                return { part: 'head', localX, localY, crit: true, multiplier: 2.5 };
            }
        }

        // 3. 軀幹檢測 (胸腹)
        const bodyTop = this.headY + this.headRadius;
        const bodyBottom = -100 * this.scale;
        const bodyWidth = 55 * this.scale;
        if (localY >= bodyTop && localY <= bodyBottom && Math.abs(localX) <= bodyWidth / 2) {
            return { part: 'body', localX, localY, crit: false, multiplier: 1.0 };
        }

        // 4. 雙臂檢測 (橫木上的綁縛手臂)
        const armY = this.crossbarY;
        const armHeight = 35 * this.scale;
        const armSpan = this.crossbarWidth / 2;
        if (Math.abs(localY - armY) <= armHeight && Math.abs(localX) <= armSpan) {
            return { part: 'arm', localX, localY, crit: false, multiplier: 0.8 };
        }

        // 5. 腿部檢測
        const legBottom = -20 * this.scale;
        if (localY > bodyBottom && localY <= legBottom && Math.abs(localX) <= 30 * this.scale) {
            return { part: 'leg', localX, localY, crit: false, multiplier: 0.7 };
        }

        // 6. 十字架木頭檢測
        if (Math.abs(localX) <= this.postWidth / 2 && localY >= -this.height && localY <= 0) {
            return { part: 'wood', localX, localY, crit: false, multiplier: 0.4 };
        }

        return null;
    }

    applyImpulse(impactLocalX, impactLocalY, force, damage, isTomato = false, hitData = null, entryAngle = -Math.PI * 0.65, weaponColor = '#ffaa00') {
        if (this.isDead) return;

        // 左右旋轉扭矩 (力臂 * 力)
        const torque = (impactLocalX / (100 * this.scale)) * force * 0.08;
        this.angleVel += torque;

        // 後仰衝擊
        this.tiltVel += force * 0.04;

        // 隨機微小震動
        this.shakeX = (Math.random() - 0.5) * force * 0.8;
        this.shakeY = (Math.random() - 0.5) * force * 0.5;

        this.hitFlash = 1.0;

        // 扣血
        this.hp -= damage;
        if (this.hp <= 0) {
            this.hp = 0;
        }

        // 記錄痕跡 (根據 customScale 動態適配痕跡大小)
        const scaleMult = this.customImage ? Math.max(1, Math.min(this.customScale * 0.7, 3.5)) : 1;
        const localEntryAngle = entryAngle - this.angle;

        if (isTomato) {
            this.splats.push({
                x: impactLocalX,
                y: impactLocalY,
                radius: 18 * this.scale * scaleMult * (0.8 + Math.random() * 0.6),
                color: Math.random() > 0.15 ? '#b81d13' : '#d1431f', // 番茄醬紅
                drip: 0,
                maxDrip: (20 + Math.random() * 35) * scaleMult
            });
            if (this.splats.length > 50) this.splats.shift();
        } else {
            const holeRadius = 4.2 * this.scale * scaleMult * (0.85 + Math.random() * 0.45);
            const part = hitData ? hitData.part : 'body';

            this.bulletHoles.push({
                x: impactLocalX,
                y: impactLocalY,
                radius: holeRadius,
                part: part,
                angle: Math.random() * Math.PI * 2,
                entryAngle: localEntryAngle,
                heat: 1.0, // 剛射入時的高溫紅熱狀態
                smokeLife: 1.8, // 彈孔冒煙時間
                smokePhase: Math.random() * Math.PI * 2
            });
            if (this.bulletHoles.length > 140) this.bulletHoles.shift();

            // 新增「子彈射入/鑽入靶體」即時動態特效
            this.activeEntries.push({
                x: impactLocalX,
                y: impactLocalY,
                radius: holeRadius,
                entryAngle: localEntryAngle,
                color: weaponColor,
                part: part,
                crit: hitData ? !!hitData.crit : false,
                life: 0.18,
                maxLife: 0.18
            });
            if (this.activeEntries.length > 35) this.activeEntries.shift();
        }

        // 嘎吱聲
        if (Math.abs(this.angleVel) > 1.5 || force > 15) {
            if (window.soundFX) window.soundFX.playWoodCreak();
        }
    }

    draw(ctx) {
        ctx.save();
        ctx.translate(this.x + this.shakeX, this.y + this.shakeY);

        // 應用左右傾斜擺動
        ctx.rotate(this.angle);

        // 應用後仰透視縮放 (tilt 會讓頂部稍微壓縮下移)
        const tiltCompression = 1 - this.tilt * 0.25;

        // 陰影 (十字架在地面的倒影)
        ctx.save();
        ctx.scale(1, 0.2);
        ctx.fillStyle = 'rgba(0,0,0,0.4)';
        ctx.beginPath();
        ctx.ellipse(0, 0, 70 * this.scale, 20 * this.scale, 0, 0, Math.PI * 2);
        ctx.fill();
        ctx.restore();

        // 1. 繪製木質十字架
        this.drawCross(ctx);

        // 2. 繪製受刑人偶
        this.drawDummy(ctx);

        // 3. 繪製彈孔與血污/番茄醬
        this.drawDecals(ctx);

        // 4. 受擊閃白/閃紅濾鏡
        if (this.hitFlash > 0.05) {
            ctx.fillStyle = `rgba(255, 60, 60, ${this.hitFlash * 0.35})`;
            ctx.beginPath();
            ctx.arc(0, this.headY, this.headRadius * 1.2, 0, Math.PI * 2);
            ctx.fill();
            ctx.fillRect(-30 * this.scale, this.headY + this.headRadius, 60 * this.scale, 160 * this.scale);
        }

        // 5. 繪製血條 / 狀態條
        this.drawHealthBar(ctx);

        ctx.restore();
    }

    drawCross(ctx) {
        const pw = this.postWidth;
        const ph = this.height;
        const cw = this.crossbarWidth;
        const cy = this.crossbarY;
        const ch = 28 * this.scale;

        // 木紋底色
        ctx.fillStyle = '#4a3319';
        ctx.strokeStyle = '#2b1c0e';
        ctx.lineWidth = 3 * this.scale;

        // 豎直木樁
        ctx.fillRect(-pw / 2, -ph, pw, ph);
        ctx.strokeRect(-pw / 2, -ph, pw, ph);

        // 橫向木條
        ctx.fillRect(-cw / 2, cy - ch / 2, cw, ch);
        ctx.strokeRect(-cw / 2, cy - ch / 2, cw, ch);

        // 木樁紋理與釘子
        ctx.strokeStyle = 'rgba(20, 10, 5, 0.4)';
        ctx.lineWidth = 1.5 * this.scale;
        for (let i = -ph + 20; i < 0; i += 40) {
            ctx.beginPath();
            ctx.moveTo(-pw / 2 + 5, i);
            ctx.lineTo(pw / 2 - 5, i + 10);
            ctx.stroke();
        }

        // 橫木接合處加固麻繩綁結 (X 型綁法)
        ctx.strokeStyle = '#8d7b55';
        ctx.lineWidth = 4 * this.scale;
        ctx.beginPath();
        ctx.moveTo(-pw / 2 - 4, cy - ch / 2 - 4);
        ctx.lineTo(pw / 2 + 4, cy + ch / 2 + 4);
        ctx.moveTo(pw / 2 + 4, cy - ch / 2 - 4);
        ctx.lineTo(-pw / 2 - 4, cy + ch / 2 + 4);
        ctx.stroke();
    }

    drawDummy(ctx, isPreview = false) {
        const s = this.scale;

        // 如果是「整張相片完整顯示」模式 (isCustomFull)
        if (this.customImage && this.isCustomFull) {
            const aspect = this.customImage.width / this.customImage.height;
            let baseH = 260 * s;
            let baseW = baseH * aspect;
            if (baseW > 300 * s) {
                baseW = 300 * s;
                baseH = baseW / aspect;
            }
            const w = baseW * this.customScale;
            const h = baseH * this.customScale;
            const centerX = this.customOffsetX * s;
            const centerY = -165 * s + this.customOffsetY * s;
            const drawX = centerX - w / 2;
            const drawY = centerY - h / 2;

            ctx.save();
            ctx.shadowColor = 'rgba(0, 0, 0, 0.55)';
            ctx.shadowBlur = 10 * s;
            ctx.drawImage(this.customImage, drawX, drawY, w, h);
            ctx.strokeStyle = isPreview ? '#00e5ff' : 'rgba(255, 255, 255, 0.35)';
            ctx.lineWidth = (isPreview ? 2.5 : 2) * s;
            ctx.strokeRect(drawX, drawY, w, h);
            ctx.restore();

            // 綁繩在整張相片上方固定處
            this.drawRopes(ctx);
            return;
        }

        // 身體軀幹 (麻布偶/棉布假人)
        ctx.fillStyle = '#cfbfa8'; // 麻布色
        ctx.strokeStyle = '#6d5a45';
        ctx.lineWidth = 2.5 * s;

        // 腿部 (並攏垂掛在十字架下端)
        ctx.beginPath();
        if (ctx.roundRect) {
            ctx.roundRect(-16 * s, -120 * s, 32 * s, 100 * s, 6 * s);
        } else {
            ctx.rect(-16 * s, -120 * s, 32 * s, 100 * s);
        }
        ctx.fill();
        ctx.stroke();

        // 雙臂 (水平綁在橫木上)
        ctx.beginPath();
        if (ctx.roundRect) {
            ctx.roundRect(-this.crossbarWidth * 0.45, this.crossbarY - 10 * s, this.crossbarWidth * 0.9, 20 * s, 8 * s);
        } else {
            ctx.rect(-this.crossbarWidth * 0.45, this.crossbarY - 10 * s, this.crossbarWidth * 0.9, 20 * s);
        }
        ctx.fill();
        ctx.stroke();

        // 軀幹
        ctx.beginPath();
        if (ctx.roundRect) {
            ctx.roundRect(-25 * s, this.headY + this.headRadius * 0.8, 50 * s, 120 * s, 10 * s);
        } else {
            ctx.rect(-25 * s, this.headY + this.headRadius * 0.8, 50 * s, 120 * s);
        }
        ctx.fill();
        ctx.stroke();

        // 衣服/繃帶紋理
        ctx.strokeStyle = '#a8947e';
        ctx.lineWidth = 1.5 * s;
        ctx.beginPath();
        ctx.moveTo(-20 * s, this.headY + 60 * s);
        ctx.lineTo(20 * s, this.headY + 80 * s);
        ctx.moveTo(-20 * s, this.headY + 100 * s);
        ctx.lineTo(20 * s, this.headY + 120 * s);
        ctx.stroke();

        // 綁在手腕與腳踝上的粗麻繩
        this.drawRopes(ctx);

        // 繪製頭部 (自訂頭像 或 預設表情，放在最上層避免大頭框被繩子遮擋)
        this.drawHead(ctx, isPreview);
    }

    drawHead(ctx, isPreview = false) {
        const s = this.scale;
        const hx = 0;
        const hy = this.headY;
        const frameScale = this.headFrameScale || 1.0;
        const hr = this.headRadius * frameScale;

        if (this.customImage && !this.isCustomFull) {
            const aspect = this.customImage.width / this.customImage.height;
            let baseSize = hr * 2.2;
            let drawW = baseSize * this.customScale;
            let drawH = baseSize * this.customScale;
            if (aspect > 1) {
                drawW = drawH * aspect;
            } else {
                drawH = drawW / aspect;
            }
            const photoX = hx + this.customOffsetX * s;
            const photoY = hy + this.customOffsetY * s;

            // 若在即時預覽視窗中，先繪製半透明的「裁切框外完整原圖殘影」，讓使用者拖曳對位超直覺！
            if (isPreview) {
                ctx.save();
                ctx.globalAlpha = 0.28;
                ctx.drawImage(this.customImage, photoX - drawW / 2, photoY - drawH / 2, drawW, drawH);
                ctx.strokeStyle = 'rgba(0, 229, 255, 0.5)';
                ctx.lineWidth = 1.5 * s;
                ctx.setLineDash([4 * s, 4 * s]);
                ctx.strokeRect(photoX - drawW / 2, photoY - drawH / 2, drawW, drawH);
                ctx.restore();
            }

            ctx.save();
            if (this.customShape === 'rect') {
                // 方形頭像框 (固定在十字架頂端)
                const frameW = hr * 2.2;
                const frameH = hr * 2.2;
                ctx.beginPath();
                ctx.rect(hx - frameW / 2, hy - frameH / 2, frameW, frameH);
                ctx.clip();

                ctx.drawImage(this.customImage, photoX - drawW / 2, photoY - drawH / 2, drawW, drawH);
                ctx.restore();

                ctx.strokeStyle = isPreview ? '#00e5ff' : '#333';
                ctx.lineWidth = (isPreview ? 3.5 : 2.5) * s;
                ctx.strokeRect(hx - frameW / 2, hy - frameH / 2, frameW, frameH);
            } else {
                // 圓形頭像框 (固定在十字架頂端)
                ctx.beginPath();
                ctx.arc(hx, hy, hr * 1.05, 0, Math.PI * 2);
                ctx.clip();

                ctx.drawImage(this.customImage, photoX - drawW / 2, photoY - drawH / 2, drawW, drawH);
                ctx.restore();

                ctx.strokeStyle = isPreview ? '#00e5ff' : '#333';
                ctx.lineWidth = (isPreview ? 3.5 : 3) * s;
                ctx.beginPath();
                ctx.arc(hx, hy, hr * 1.05, 0, Math.PI * 2);
                ctx.stroke();
            }

            // 預覽模式下繪製淡淡的十字對準中心線
            if (isPreview) {
                ctx.save();
                ctx.strokeStyle = 'rgba(0, 229, 255, 0.55)';
                ctx.lineWidth = 1.2 * s;
                ctx.setLineDash([3 * s, 3 * s]);
                ctx.beginPath();
                ctx.moveTo(hx - hr * 1.15, hy);
                ctx.lineTo(hx + hr * 1.15, hy);
                ctx.moveTo(hx, hy - hr * 1.15);
                ctx.lineTo(hx, hy + hr * 1.15);
                ctx.stroke();
                ctx.restore();
            }
            return;
        }

        // 預設手繪風格頭部 (呆萌表情 / 標靶面具 / 倒楣小丑)
        ctx.fillStyle = '#e8d7c0';
        ctx.strokeStyle = '#6d5a45';
        ctx.lineWidth = 2.5 * s;

        ctx.beginPath();
        ctx.arc(hx, hy, hr, 0, Math.PI * 2);
        ctx.fill();
        ctx.stroke();

        // 標靶或表情
        if (this.dummyType === 0) {
            // 靶心表情：臉上有紅色同心圓標靶
            ctx.strokeStyle = 'rgba(215, 38, 38, 0.75)';
            ctx.lineWidth = 3 * s;
            ctx.beginPath();
            ctx.arc(hx, hy, hr * 0.7, 0, Math.PI * 2);
            ctx.stroke();

            ctx.beginPath();
            ctx.arc(hx, hy, hr * 0.35, 0, Math.PI * 2);
            ctx.fillStyle = '#d72626';
            ctx.fill();

            // 準心十字線
            ctx.beginPath();
            ctx.moveTo(hx - hr * 0.8, hy);
            ctx.lineTo(hx + hr * 0.8, hy);
            ctx.moveTo(hx, hy - hr * 0.8);
            ctx.lineTo(hx, hy + hr * 0.8);
            ctx.stroke();

        } else if (this.dummyType === 1) {
            // 呆萌倒楣布偶 (X 眼睛 + 波浪嘴)
            ctx.strokeStyle = '#4a3b30';
            ctx.lineWidth = 2.5 * s;

            // 左眼 X
            ctx.beginPath();
            ctx.moveTo(hx - 16 * s, hy - 10 * s); ctx.lineTo(hx - 6 * s, hy);
            ctx.moveTo(hx - 6 * s, hy - 10 * s); ctx.lineTo(hx - 16 * s, hy);
            ctx.stroke();

            // 右眼 X
            ctx.beginPath();
            ctx.moveTo(hx + 6 * s, hy - 10 * s); ctx.lineTo(hx + 16 * s, hy);
            ctx.moveTo(hx + 16 * s, hy - 10 * s); ctx.lineTo(hx + 6 * s, hy);
            ctx.stroke();

            // 嘴巴 (歪倒的大張嘴巴，受氣表情)
            ctx.fillStyle = '#4a3b30';
            ctx.beginPath();
            ctx.ellipse(hx, hy + 14 * s, 8 * s, 10 * s, 0, 0, Math.PI * 2);
            ctx.fill();

            // 汗滴
            ctx.fillStyle = '#4da6ff';
            ctx.beginPath();
            ctx.arc(hx + 22 * s, hy - 14 * s, 3.5 * s, 0, Math.PI * 2);
            ctx.fill();

        } else {
            // 嘲諷小黃臉 / 搞怪表情
            ctx.fillStyle = '#ffd54f';
            ctx.beginPath();
            ctx.arc(hx, hy, hr * 0.95, 0, Math.PI * 2);
            ctx.fill();

            // 瞇眼奸笑
            ctx.strokeStyle = '#333';
            ctx.lineWidth = 3 * s;
            ctx.beginPath();
            ctx.arc(hx - 12 * s, hy - 4 * s, 8 * s, Math.PI * 0.8, Math.PI * 0.2, true);
            ctx.arc(hx + 12 * s, hy - 4 * s, 8 * s, Math.PI * 0.8, Math.PI * 0.2, true);
            ctx.stroke();

            // 吐舌大笑
            ctx.beginPath();
            ctx.arc(hx, hy + 10 * s, 12 * s, 0, Math.PI);
            ctx.fillStyle = '#333';
            ctx.fill();

            ctx.fillStyle = '#ff5252';
            ctx.beginPath();
            ctx.arc(hx + 2 * s, hy + 15 * s, 6 * s, 0, Math.PI);
            ctx.fill();
        }
    }

    drawRopes(ctx) {
        const s = this.scale;
        ctx.strokeStyle = '#a6804d';
        ctx.lineWidth = 5 * s;

        // 左手腕繩索
        const leftArmX = -this.crossbarWidth * 0.38;
        ctx.beginPath();
        ctx.moveTo(leftArmX, this.crossbarY - 14 * s);
        ctx.lineTo(leftArmX, this.crossbarY + 14 * s);
        ctx.moveTo(leftArmX + 6 * s, this.crossbarY - 14 * s);
        ctx.lineTo(leftArmX + 6 * s, this.crossbarY + 14 * s);
        ctx.stroke();

        // 右手腕繩索
        const rightArmX = this.crossbarWidth * 0.38;
        ctx.beginPath();
        ctx.moveTo(rightArmX, this.crossbarY - 14 * s);
        ctx.lineTo(rightArmX, this.crossbarY + 14 * s);
        ctx.moveTo(rightArmX - 6 * s, this.crossbarY - 14 * s);
        ctx.lineTo(rightArmX - 6 * s, this.crossbarY + 14 * s);
        ctx.stroke();

        // 腳踝繩索
        ctx.beginPath();
        ctx.moveTo(-18 * s, -35 * s);
        ctx.lineTo(18 * s, -35 * s);
        ctx.moveTo(-18 * s, -42 * s);
        ctx.lineTo(18 * s, -42 * s);
        ctx.stroke();
    }

    drawDecals(ctx) {
        const totalHoles = this.bulletHoles.length;
        // 1. 繪製立體射入彈孔 (含方向性凹陷、灼熱紅光邊緣、鑲嵌彈尾與裊裊青煙)
        for (let idx = 0; idx < totalHoles; idx++) {
            const hole = this.bulletHoles[idx];
            ctx.save();
            ctx.translate(hole.x, hole.y);

            const r = hole.radius;
            const ea = hole.entryAngle !== undefined ? hole.entryAngle : -Math.PI * 0.65;
            const cosE = Math.cos(ea);
            const sinE = Math.sin(ea);

            // 外圍放射狀撕裂裂痕
            ctx.strokeStyle = hole.part === 'wood' ? 'rgba(35, 18, 8, 0.85)' : 'rgba(60, 20, 20, 0.78)';
            ctx.lineWidth = Math.max(1, r * 0.25);
            ctx.beginPath();
            for (let i = 0; i < 6; i++) {
                const a = hole.angle + (i * Math.PI) / 3;
                const len = r * (i % 2 === 0 ? 2.2 : 1.5);
                ctx.moveTo(0, 0);
                ctx.lineTo(Math.cos(a) * len, Math.sin(a) * len);
            }
            ctx.stroke();

            // 射入方向的斜向焦黑破口外圈 (呈現子彈斜向鑽入的立體感)
            ctx.fillStyle = 'rgba(22, 16, 14, 0.9)';
            ctx.beginPath();
            ctx.arc(-cosE * r * 0.22, -sinE * r * 0.22, r * 1.15, 0, Math.PI * 2);
            ctx.fill();

            // 剛射入時的高溫灼熱熔岩紅光邊緣 (Glowing Hot Rim)
            if (hole.heat > 0.02) {
                ctx.strokeStyle = `rgba(255, ${Math.round(80 + hole.heat * 120)}, 20, ${hole.heat * 0.9})`;
                ctx.lineWidth = r * 0.55;
                ctx.beginPath();
                ctx.arc(0, 0, r * 0.88, 0, Math.PI * 2);
                ctx.stroke();
            }

            // 內圈深邃彈道黑洞 (往射入方向微偏，形成深坑立體透視)
            ctx.fillStyle = '#040404';
            ctx.beginPath();
            ctx.arc(cosE * r * 0.2, sinE * r * 0.2, r * 0.72, 0, Math.PI * 2);
            ctx.fill();

            // 深坑內部殘留的黃銅彈頭底部微光 (讓玩家看到子彈鑲嵌在孔內)
            ctx.fillStyle = hole.heat > 0.05
                ? `rgba(255, 200, 80, ${0.45 + hole.heat * 0.55})`
                : 'rgba(180, 135, 50, 0.42)';
            ctx.beginPath();
            ctx.arc(cosE * r * 0.28, sinE * r * 0.28, r * 0.34, 0, Math.PI * 2);
            ctx.fill();

            // 最新 25 個彈孔飄出裊裊硝煙 (Rising Gun Smoke)
            if (hole.smokeLife > 0 && idx >= totalHoles - 25) {
                const smAlpha = Math.min(0.45, (hole.smokeLife / 1.8) * 0.45);
                const driftY = -(1.8 - hole.smokeLife) * 22 * this.scale;
                const driftX = Math.sin(hole.smokePhase) * 6 * this.scale;
                ctx.strokeStyle = `rgba(210, 220, 230, ${smAlpha})`;
                ctx.lineWidth = Math.max(1.5, r * 0.65);
                ctx.lineCap = 'round';
                ctx.beginPath();
                ctx.moveTo(0, -r * 0.3);
                ctx.quadraticCurveTo(driftX, driftY * 0.5, -driftX * 0.6, driftY);
                ctx.stroke();
            }

            ctx.restore();
        }

        // 2. 番茄汁 / 糊狀噴濺
        for (let splat of this.splats) {
            ctx.save();
            ctx.translate(splat.x, splat.y);

            ctx.fillStyle = splat.color;
            ctx.beginPath();
            ctx.arc(0, 0, splat.radius, 0, Math.PI * 2);
            // 噴濺小圓點
            for (let i = 0; i < 6; i++) {
                const a = i * 1.05;
                const d = splat.radius * 1.3;
                ctx.arc(Math.cos(a) * d, Math.sin(a) * d, splat.radius * 0.25, 0, Math.PI * 2);
            }
            ctx.fill();

            // 流淌痕跡
            if (splat.drip > 0) {
                ctx.beginPath();
                ctx.lineWidth = splat.radius * 0.45;
                ctx.lineCap = 'round';
                ctx.strokeStyle = splat.color;
                ctx.moveTo(0, splat.radius * 0.5);
                ctx.lineTo(0, splat.radius * 0.5 + splat.drip);
                ctx.stroke();
            }

            ctx.restore();
        }

        // 3. 繪製「子彈正在射入/鑽進靶體」的即時穿透動畫
        this.drawActiveEntries(ctx);
    }

    drawActiveEntries(ctx) {
        if (!this.activeEntries || this.activeEntries.length === 0) return;

        for (let entry of this.activeEntries) {
            const p = 1 - (entry.life / entry.maxLife); // 0.0 -> 1.0
            const alpha = Math.max(0, 1 - p);
            const r = entry.radius;

            ctx.save();
            ctx.translate(entry.x, entry.y);
            ctx.rotate(entry.entryAngle);

            // A. 射入破口處的高壓音爆環 (Entry Cavitation Shockwave Ring)
            const ringScale = 0.6 + p * 3.4;
            ctx.strokeStyle = entry.crit
                ? `rgba(255, 60, 60, ${alpha * 0.92})`
                : `rgba(255, 210, 90, ${alpha * 0.88})`;
            ctx.lineWidth = Math.max(1.4, (1 - p) * 3.8);
            ctx.beginPath();
            ctx.ellipse(0, 0, r * ringScale * 0.55, r * ringScale * 1.25, 0, 0, Math.PI * 2);
            ctx.stroke();

            // A2. 射入瞬間的高速破空入射殘影線與音爆圈 (確保在高倍瞄準鏡內也能清楚看到子彈飛入軌跡)
            if (p < 0.55) {
                const inAlpha = (1 - p / 0.55) * 0.9;
                const trailLen = r * 18;
                const inGrad = ctx.createLinearGradient(-trailLen, 0, 0, 0);
                inGrad.addColorStop(0, 'rgba(255, 120, 0, 0)');
                inGrad.addColorStop(0.6, `rgba(255, 190, 50, ${inAlpha * 0.65})`);
                inGrad.addColorStop(1, `rgba(255, 255, 255, ${inAlpha})`);
                ctx.strokeStyle = inGrad;
                ctx.lineWidth = Math.max(1.8, r * 0.75 * inAlpha);
                ctx.beginPath();
                ctx.moveTo(-trailLen, 0);
                ctx.lineTo(0, 0);
                ctx.stroke();
            }

            // B. 子彈實體「鑽入靶面」過程 (前 80% 時間可見子彈尾端正往彈孔內高速沒入)
            if (p < 0.82) {
                const subP = p / 0.82; // 0 -> 1
                const bLen = r * 5.8;
                const bRad = r * 0.92;
                // 子彈尖端已經刺入孔內，隨 subP 往 x 正方向深處鑽入
                const offsetX = -bLen * (1 - subP * 0.92);

                ctx.save();
                // 裁切區域：只顯示尚未完全沒入彈孔 (x <= r * 0.3) 的後半截子彈與曳光尾焰，呈現真實「射入靶內」視覺！
                ctx.beginPath();
                ctx.rect(-bLen * 2.5, -bRad * 4, bLen * 2.5 + r * 0.3, bRad * 8);
                ctx.clip();

                // 鑽入中的子彈曳光尾跡
                const tailGrad = ctx.createLinearGradient(offsetX - bLen * 1.3, 0, offsetX + bLen * 0.5, 0);
                tailGrad.addColorStop(0, 'rgba(255, 100, 0, 0)');
                tailGrad.addColorStop(1, entry.color || '#ffaa00');
                ctx.strokeStyle = tailGrad;
                ctx.lineWidth = bRad * 1.7;
                ctx.lineCap = 'round';
                ctx.beginPath();
                ctx.moveTo(offsetX - bLen * 1.3, 0);
                ctx.lineTo(offsetX + bLen * 0.4, 0);
                ctx.stroke();

                // 鑽入中的黃銅彈體後半部
                const bGrad = ctx.createLinearGradient(0, -bRad, 0, bRad);
                bGrad.addColorStop(0, '#fff5b8');
                bGrad.addColorStop(0.45, '#f39c12');
                bGrad.addColorStop(1, '#7f3000');
                ctx.fillStyle = bGrad;
                ctx.beginPath();
                ctx.moveTo(offsetX, -bRad);
                ctx.lineTo(offsetX + bLen * 0.65, -bRad);
                ctx.quadraticCurveTo(offsetX + bLen, -bRad * 0.4, offsetX + bLen * 1.1, 0);
                ctx.quadraticCurveTo(offsetX + bLen, bRad * 0.4, offsetX + bLen * 0.65, bRad);
                ctx.lineTo(offsetX, bRad);
                ctx.closePath();
                ctx.fill();

                // 彈底白熱曳光點
                ctx.fillStyle = '#ffffff';
                ctx.beginPath();
                ctx.arc(offsetX, 0, bRad * 0.78, 0, Math.PI * 2);
                ctx.fill();

                ctx.restore();
            }

            // C. 射入瞬間的逆向破片/血霧/火花噴流 (Entry Back-Spatter & Spark Jet)
            const jetLen = r * (2.5 + p * 6.5);
            for (let j = -2; j <= 2; j++) {
                const spreadA = Math.PI + j * 0.24;
                const d1 = r * (0.4 + p * 1.8);
                const d2 = d1 + jetLen * (1 - Math.abs(j) * 0.18);
                ctx.strokeStyle = j === 0
                    ? `rgba(255, 255, 220, ${alpha})`
                    : (entry.part === 'wood'
                        ? `rgba(210, 150, 80, ${alpha * 0.9})`
                        : `rgba(255, ${entry.crit ? 50 : 140}, 40, ${alpha * 0.9})`);
                ctx.lineWidth = Math.max(1, r * 0.35 * (1 - p));
                ctx.beginPath();
                ctx.moveTo(Math.cos(spreadA) * d1, Math.sin(spreadA) * d1);
                ctx.lineTo(Math.cos(spreadA) * d2, Math.sin(spreadA) * d2);
                ctx.stroke();
            }

            // 破口中心瞬時火光核
            if (p < 0.45) {
                const flashA = (1 - p / 0.45) * 0.95;
                ctx.fillStyle = `rgba(255, 240, 180, ${flashA})`;
                ctx.beginPath();
                ctx.arc(0, 0, r * (1.5 - p), 0, Math.PI * 2);
                ctx.fill();
            }

            ctx.restore();
        }
    }

    drawHealthBar(ctx) {
        const hpPercent = Math.max(0, this.hp / this.maxHp);
        const barWidth = 60 * this.scale;
        const barHeight = 6 * this.scale;
        const barY = -this.height - 18 * this.scale;

        // 底框
        ctx.fillStyle = 'rgba(0,0,0,0.6)';
        ctx.fillRect(-barWidth / 2 - 1, barY - 1, barWidth + 2, barHeight + 2);

        // 剩餘血量
        let hpColor = '#4caf50';
        if (hpPercent < 0.3) hpColor = '#f44336';
        else if (hpPercent < 0.6) hpColor = '#ff9800';

        ctx.fillStyle = hpColor;
        ctx.fillRect(-barWidth / 2, barY, barWidth * hpPercent, barHeight);
    }
}

window.CrucifiedDummy = CrucifiedDummy;
