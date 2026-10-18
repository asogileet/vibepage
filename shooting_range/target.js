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
        this.isCustomFull = isCustomFull; // 是否為整尊替換，否則僅替換頭像
        this.customScale = 1.0; // 放大縮小倍率 (0.2 ~ 3.5)
        this.customOffsetX = 0; // 左右水平偏移
        this.customOffsetY = 0; // 上下垂直偏移
        this.customShape = 'circle'; // 'circle' | 'rect'

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

        // 痕跡紀錄
        this.bulletHoles = [];
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

        // 1. 如果是全身自訂圖片檢測
        if (this.customImage && this.isCustomFull) {
            const aspect = this.customImage.width / this.customImage.height;
            const h = 260 * this.scale * this.customScale;
            const w = h * aspect;
            const topY = this.headY - 20 * this.scale + this.customOffsetY;
            const leftX = -w / 2 + this.customOffsetX;
            if (localY >= topY && localY <= topY + h && localX >= leftX && localX <= leftX + w) {
                // 上方 25% 視為暴擊爆頭
                const isHead = localY <= topY + h * 0.25;
                return { 
                    part: isHead ? 'head' : 'body', 
                    localX, localY, 
                    crit: isHead, 
                    multiplier: isHead ? 2.5 : 1.0 
                };
            }
        }

        // 2. 頭部檢測 (靶頭固定在十字架頂端，不受照片偏移影響)
        const headDist = Math.hypot(localX, localY - this.headY);
        if (headDist <= this.headRadius) {
            return { part: 'head', localX, localY, crit: true, multiplier: 2.5 };
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

    applyImpulse(impactLocalX, impactLocalY, force, damage, isTomato = false, hitData = null) {
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
            // 暫時不要完全消失，可以進入大損壞狀態，或者斷掉重置
            // this.isDead = true;
            // this.respawnTimer = 2.5;
        }

        // 記錄痕跡 (根據 customScale 動態適配痕跡大小)
        const scaleMult = this.customImage ? Math.max(1, Math.min(this.customScale * 0.7, 3.5)) : 1;
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
            this.bulletHoles.push({
                x: impactLocalX,
                y: impactLocalY,
                radius: 3.5 * this.scale * scaleMult * (0.8 + Math.random() * 0.5),
                part: hitData ? hitData.part : 'body',
                angle: Math.random() * Math.PI * 2
            });
            if (this.bulletHoles.length > 120) this.bulletHoles.shift();
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

    drawDummy(ctx) {
        // 如果是自訂整個人偶
        if (this.customImage && this.isCustomFull) {
            const aspect = this.customImage.width / this.customImage.height;
            const h = 260 * this.scale * this.customScale;
            const w = h * aspect;
            const drawX = -w / 2 + this.customOffsetX;
            const drawY = this.headY - 20 * this.scale + this.customOffsetY;
            ctx.drawImage(this.customImage, drawX, drawY, w, h);
            // 綁繩
            this.drawRopes(ctx);
            return;
        }

        const s = this.scale;

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

        // 繪製頭部 (自訂頭像 或 預設表情)
        this.drawHead(ctx);

        // 綁在手腕與腳踝上的粗麻繩
        this.drawRopes(ctx);
    }

    drawHead(ctx) {
        const s = this.scale;
        const hx = 0;
        const hy = this.headY;
        const hr = this.headRadius;

        if (this.customImage && !this.isCustomFull) {
            ctx.save();
            if (this.customShape === 'rect') {
                // 矩形頭像框 (固定在十字架頂端)
                const frameW = hr * 2.2;
                const frameH = hr * 2.2;
                ctx.beginPath();
                ctx.rect(hx - frameW / 2, hy - frameH / 2, frameW, frameH);
                ctx.clip();

                // 照片在框內縮放與平移
                const aspect = this.customImage.width / this.customImage.height;
                let drawH = frameH * this.customScale;
                let drawW = drawH * aspect;
                const photoX = hx + this.customOffsetX;
                const photoY = hy + this.customOffsetY;
                ctx.drawImage(this.customImage, photoX - drawW / 2, photoY - drawH / 2, drawW, drawH);

                ctx.restore();
                ctx.strokeStyle = '#333';
                ctx.lineWidth = 2.5 * s;
                ctx.strokeRect(hx - frameW / 2, hy - frameH / 2, frameW, frameH);
            } else {
                // 圓形頭像框 (固定在十字架頂端)
                ctx.beginPath();
                ctx.arc(hx, hy, hr * 1.05, 0, Math.PI * 2);
                ctx.clip();

                // 照片在圓形框內縮放與平移 (Pan & Zoom inside frame)
                const aspect = this.customImage.width / this.customImage.height;
                let baseSize = hr * 2.2;
                let drawW = baseSize * this.customScale;
                let drawH = baseSize * this.customScale;
                if (aspect > 1) {
                    drawW = drawH * aspect;
                } else {
                    drawH = drawW / aspect;
                }
                const photoX = hx + this.customOffsetX;
                const photoY = hy + this.customOffsetY;
                ctx.drawImage(this.customImage, photoX - drawW / 2, photoY - drawH / 2, drawW, drawH);

                ctx.restore();
                ctx.strokeStyle = '#333';
                ctx.lineWidth = 3 * s;
                ctx.beginPath();
                ctx.arc(hx, hy, hr * 1.05, 0, Math.PI * 2);
                ctx.stroke();
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
        // 彈孔
        for (let hole of this.bulletHoles) {
            ctx.save();
            ctx.translate(hole.x, hole.y);

            // 焦黑邊緣
            ctx.fillStyle = 'rgba(10, 10, 10, 0.85)';
            ctx.beginPath();
            ctx.arc(0, 0, hole.radius, 0, Math.PI * 2);
            ctx.fill();

            // 內圈深洞
            ctx.fillStyle = '#050505';
            ctx.beginPath();
            ctx.arc(0, 0, hole.radius * 0.6, 0, Math.PI * 2);
            ctx.fill();

            // 撕裂裂痕
            ctx.strokeStyle = 'rgba(50, 30, 20, 0.7)';
            ctx.lineWidth = 1;
            ctx.beginPath();
            for (let i = 0; i < 4; i++) {
                const a = hole.angle + (i * Math.PI) / 2;
                ctx.moveTo(0, 0);
                ctx.lineTo(Math.cos(a) * hole.radius * 1.8, Math.sin(a) * hole.radius * 1.8);
            }
            ctx.stroke();

            ctx.restore();
        }

        // 番茄汁 / 糊狀噴濺
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
