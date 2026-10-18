// 十字架人偶靶子 (Crucified Dummy Target)
class CrucifiedDummy {
    constructor(x, y, scale = 1.0, customImage = null, isCustomFull = false) {
        this.targetCategory = 'cross';
        this.row = 0;
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

// ============================================================================
// 2. 相片倒靶 / 真實立靶 (Knockdown Photo Target - 打到就往後倒、自動彈起)
// ============================================================================
class KnockdownPhotoTarget {
    constructor(x, y, scale = 1.0, customImage = null, isCustomFull = false, row = 0) {
        this.targetCategory = 'knockdown';
        this.row = row;
        this.x = x;
        this.y = y; // 底部鉸鏈錨點 (固定在靶台軌道上)
        this.baseX = x;
        this.baseY = y;
        this.baseScale = scale;
        this.scale = scale;

        // 自訂相片設定
        this.customImage = customImage;
        this.isCustomFull = isCustomFull;
        this.customScale = 1.0;
        this.customOffsetX = 0;
        this.customOffsetY = 0;
        this.customShape = 'circle'; // 'circle' | 'rect'
        this.headFrameScale = 1.0;

        // 預設無照片時的標靶樣式 (0: 經典紅白同心圓靶, 1: 戰術人形計分胸環靶, 2: 黃黑警用金屬倒靶)
        this.dummyType = Math.floor(Math.random() * 3);

        // 往後倒物理系統 (fallAngle: 0 為直立, Math.PI/2 為 90度向後平躺倒下)
        this.fallAngle = 0;
        this.fallVel = 0;
        this.isFalling = false;
        this.isDown = false;
        this.isRising = false;
        this.downTimer = 0;

        // 左右受擊微晃與震動
        this.angle = 0;
        this.angleVel = 0;
        this.shakeX = 0;
        this.shakeY = 0;
        this.hitFlash = 0;

        // 彈孔與番茄汁紀錄
        this.bulletHoles = [];
        this.splats = [];
        this.knockdownCount = 0;

        this.updateDimensions();
    }

    updateDimensions() {
        const s = this.scale * (this.headFrameScale ? Math.max(0.8, Math.min(this.headFrameScale * 0.85, 2.2)) : 1.0);
        this.boardWidth = 135 * s;
        this.boardHeight = 165 * s;
        this.stemHeight = 24 * this.scale; // 底部金屬轉軸立柱高度
        this.totalHeight = this.boardHeight + this.stemHeight;
    }

    setScale(newScale) {
        this.scale = newScale;
        this.updateDimensions();
    }

    update(dt) {
        this.updateDimensions();

        // 1. 往後倒下物理動畫
        if (this.isFalling) {
            // 重力加速往後倒
            this.fallVel += 28 * dt;
            this.fallAngle += this.fallVel * dt;

            if (this.fallAngle >= Math.PI / 2) {
                this.fallAngle = Math.PI / 2;
                // 撞擊後擋板微幅反彈
                if (Math.abs(this.fallVel) > 3.5) {
                    this.fallVel = -this.fallVel * 0.25;
                } else {
                    this.fallVel = 0;
                    this.isFalling = false;
                    this.isDown = true;
                    this.downTimer = 2.0 + Math.random() * 0.6; // 倒下約 2 秒後自動彈起
                }
            }
        } else if (this.isDown) {
            this.downTimer -= dt;
            if (this.downTimer <= 0) {
                this.isDown = false;
                this.isRising = true;
            }
        } else if (this.isRising) {
            // 機械彈簧將靶牌重新彈起立正
            this.fallAngle -= dt * 8.5;
            if (this.fallAngle <= 0) {
                this.fallAngle = 0;
                this.fallVel = 0;
                this.isRising = false;
                // 彈起後清除舊彈孔，方便下一輪射擊
                this.bulletHoles = [];
                this.splats = [];
                // 微小彈起晃動
                this.angleVel = (Math.random() - 0.5) * 1.2;
            }
        }

        // 2. 左右微幅擺動阻尼
        const springK = 45;
        const damping = 0.88;
        this.angleVel = (this.angleVel - springK * this.angle * dt) * damping;
        this.angle += this.angleVel * dt;

        // 3. 震動與閃光衰減
        this.shakeX *= 0.82;
        this.shakeY *= 0.82;
        if (this.hitFlash > 0) {
            this.hitFlash = Math.max(0, this.hitFlash - dt * 6);
        }

        // 番茄汁流淌
        for (let s of this.splats) {
            if (s.drip < s.maxDrip) s.drip += dt * 8;
        }
    }

    respawn() {
        this.fallAngle = 0;
        this.fallVel = 0;
        this.isFalling = false;
        this.isDown = false;
        this.isRising = false;
        this.bulletHoles = [];
        this.splats = [];
        this.angle = 0;
        this.angleVel = 0;
    }

    getBoardRect() {
        const s = this.scale;
        const frameScale = this.headFrameScale || 1.0;

        // 若有上傳相片且為「整張相片」模式，依照相片長寬比決定立牌尺寸
        if (this.customImage && this.isCustomFull) {
            const aspect = this.customImage.width / this.customImage.height;
            let baseH = 190 * s;
            let baseW = baseH * aspect;
            if (baseW > 240 * s) {
                baseW = 240 * s;
                baseH = baseW / aspect;
            }
            const w = baseW * this.customScale;
            const h = baseH * this.customScale;
            const cx = this.customOffsetX * s;
            const cy = -this.stemHeight - h / 2 + this.customOffsetY * s;
            return { cx, cy, w, h, shape: 'rect' };
        }

        // 圓形或方形立牌模式
        if (this.customShape === 'rect') {
            const w = 140 * s * frameScale;
            const h = 165 * s * frameScale;
            const cx = 0;
            const cy = -this.stemHeight - h / 2;
            return { cx, cy, w, h, shape: 'rect' };
        } else {
            const r = 72 * s * frameScale;
            const cx = 0;
            const cy = -this.stemHeight - r;
            return { cx, cy, w: r * 2, h: r * 2, r, shape: 'circle' };
        }
    }

    hitTest(hitX, hitY) {
        // 如果已經往後倒下超過 40 度，子彈會從上方飛過，不再重複觸發
        if (this.isDown || this.fallAngle > 0.7) return null;

        const dx = hitX - (this.x + this.shakeX);
        const dy = hitY - (this.y + this.shakeY);

        const cosA = Math.max(0.15, Math.cos(this.fallAngle));
        const localX = dx;
        const localY = dy / cosA; // 補償後仰透視壓縮

        const rect = this.getBoardRect();
        if (rect.shape === 'circle') {
            const dist = Math.hypot(localX - rect.cx, localY - rect.cy);
            if (dist <= rect.r * 1.04) {
                const isBullseye = dist <= rect.r * 0.38;
                return {
                    part: isBullseye ? 'head' : 'body',
                    localX,
                    localY,
                    crit: isBullseye,
                    multiplier: isBullseye ? 2.5 : 1.2
                };
            }
        } else {
            const halfW = rect.w / 2;
            const halfH = rect.h / 2;
            if (
                localX >= rect.cx - halfW &&
                localX <= rect.cx + halfW &&
                localY >= rect.cy - halfH &&
                localY <= rect.cy + halfH
            ) {
                // 中心紅心或上半部中心視為暴擊
                const normX = (localX - rect.cx) / halfW;
                const normY = (localY - rect.cy) / halfH;
                const isBullseye = Math.hypot(normX, normY + 0.12) <= 0.42;
                return {
                    part: isBullseye ? 'head' : 'body',
                    localX,
                    localY,
                    crit: isBullseye,
                    multiplier: isBullseye ? 2.5 : 1.2
                };
            }
        }

        return null;
    }

    applyImpulse(impactLocalX, impactLocalY, force, damage, isTomato = false, hitData = null) {
        this.hitFlash = 1.0;
        this.shakeX = (Math.random() - 0.5) * 8;
        this.shakeY = (Math.random() - 0.5) * 4;
        this.angleVel += (impactLocalX / (80 * this.scale)) * 1.5;

        // 記錄彈孔或番茄漬
        if (isTomato) {
            this.splats.push({
                x: impactLocalX,
                y: impactLocalY,
                radius: 16 * this.scale * (0.85 + Math.random() * 0.4),
                color: Math.random() > 0.15 ? '#b81d13' : '#d1431f',
                drip: 0,
                maxDrip: 18 + Math.random() * 25
            });
        } else {
            this.bulletHoles.push({
                x: impactLocalX,
                y: impactLocalY,
                radius: 4 * this.scale * (0.85 + Math.random() * 0.4),
                angle: Math.random() * Math.PI * 2
            });
        }

        // 觸發往後倒！ (打到就往後倒)
        if (!this.isDown) {
            this.isFalling = true;
            this.isRising = false;
            // 依據武器推力給予往後倒的角速度，確保一槍就乾脆俐落往後倒
            this.fallVel = Math.max(9.5, force * 0.45);
            this.knockdownCount++;
            if (window.soundFX) window.soundFX.playTargetKnockdown();
        }
    }

    draw(ctx, isPreview = false) {
        ctx.save();
        ctx.translate(this.x + this.shakeX, this.y + this.shakeY);

        const s = this.scale;
        const cosFall = Math.max(0.07, Math.cos(this.fallAngle));
        const sinFall = Math.sin(this.fallAngle);

        // 1. 地面/靶架上的投影 (往後倒時陰影向後延伸)
        if (!isPreview) {
            ctx.save();
            ctx.fillStyle = `rgba(0, 0, 0, ${0.32 + sinFall * 0.25})`;
            ctx.beginPath();
            ctx.ellipse(
                sinFall * 14 * s,
                -sinFall * 18 * s,
                (65 + sinFall * 15) * s,
                (12 + sinFall * 28) * s,
                0, 0, Math.PI * 2
            );
            ctx.fill();
            ctx.restore();
        }

        // 2. 繪製底部金屬轉軸鉸鏈與回彈彈簧座 (固定在軌道上，不隨板子壓扁)
        this.drawHingeBase(ctx);

        // 3. 繪製可往後傾倒的靶牌本體 (利用 3D 透視縱向壓縮 + 微傾角模擬真實往後倒下)
        ctx.save();
        ctx.rotate(this.angle * cosFall);

        // 當往後倒時，板子頂端向遠處傾斜壓縮
        ctx.transform(1, 0, sinFall * 0.14, cosFall, 0, 0);

        const rect = this.getBoardRect();

        // 連接轉軸與靶牌底部的金屬支撐柄
        ctx.fillStyle = '#55606e';
        ctx.strokeStyle = '#222831';
        ctx.lineWidth = 2 * s;
        ctx.fillRect(-10 * s, -this.stemHeight - 4 * s, 20 * s, this.stemHeight + 4 * s);
        ctx.strokeRect(-10 * s, -this.stemHeight - 4 * s, 20 * s, this.stemHeight + 4 * s);

        // 往後倒時露出靶牌的 3D 厚度底邊/頂邊，讓「往後倒平躺」視覺極度逼真
        if (sinFall > 0.15) {
            const thickness = 14 * s * (sinFall / Math.max(0.12, cosFall));
            ctx.fillStyle = '#3d2b1f';
            if (rect.shape === 'circle') {
                ctx.beginPath();
                ctx.arc(rect.cx, rect.cy + thickness, rect.r + 4 * s, 0, Math.PI * 2);
                ctx.fill();
            } else {
                ctx.fillRect(rect.cx - rect.w / 2 - 4 * s, rect.cy - rect.h / 2 + thickness, rect.w + 8 * s, rect.h + 8 * s);
            }
        }

        // 繪製靶板內容 (自訂相片 或 經典標靶)
        this.drawTargetBoard(ctx, rect, isPreview);

        // 繪製彈孔與番茄污漬
        this.drawDecals(ctx);

        // 往後倒下的背光陰影遮罩與受擊閃光
        if (sinFall > 0.05 || this.hitFlash > 0.05) {
            ctx.save();
            if (rect.shape === 'circle') {
                ctx.beginPath();
                ctx.arc(rect.cx, rect.cy, rect.r, 0, Math.PI * 2);
                ctx.clip();
            } else {
                ctx.beginPath();
                ctx.rect(rect.cx - rect.w / 2, rect.cy - rect.h / 2, rect.w, rect.h);
                ctx.clip();
            }

            if (sinFall > 0.05) {
                ctx.fillStyle = `rgba(10, 14, 22, ${sinFall * 0.55})`;
                ctx.fillRect(rect.cx - rect.w, rect.cy - rect.h, rect.w * 2, rect.h * 2);
            }
            if (this.hitFlash > 0.05) {
                ctx.fillStyle = `rgba(255, 220, 120, ${this.hitFlash * 0.42})`;
                ctx.fillRect(rect.cx - rect.w, rect.cy - rect.h, rect.w * 2, rect.h * 2);
            }
            ctx.restore();
        }

        ctx.restore();
        ctx.restore();
    }

    drawHingeBase(ctx) {
        const s = this.scale;
        // 底座鐵板
        ctx.fillStyle = '#2f3640';
        ctx.strokeStyle = '#15191f';
        ctx.lineWidth = 2 * s;
        ctx.beginPath();
        if (ctx.roundRect) {
            ctx.roundRect(-34 * s, -8 * s, 68 * s, 14 * s, 4 * s);
        } else {
            ctx.rect(-34 * s, -8 * s, 68 * s, 14 * s);
        }
        ctx.fill();
        ctx.stroke();

        // 左右鉚釘與中央轉軸圓筒
        ctx.fillStyle = '#95a5a6';
        ctx.beginPath();
        ctx.arc(-22 * s, -1 * s, 3 * s, 0, Math.PI * 2);
        ctx.arc(22 * s, -1 * s, 3 * s, 0, Math.PI * 2);
        ctx.fill();

        ctx.fillStyle = '#f39c12';
        ctx.fillRect(-14 * s, -11 * s, 28 * s, 6 * s);
    }

    drawTargetBoard(ctx, rect, isPreview = false) {
        const s = this.scale;

        // 情況 A：有上傳自訂相片
        if (this.customImage) {
            if (this.isCustomFull) {
                // 整張相片直接當成立牌靶！外加厚實靶框與四個角落固定夾
                const drawX = rect.cx - rect.w / 2;
                const drawY = rect.cy - rect.h / 2;

                // 背板白邊框
                ctx.fillStyle = '#f5f6fa';
                ctx.strokeStyle = isPreview ? '#00e5ff' : '#d63031';
                ctx.lineWidth = 5 * s;
                ctx.fillRect(drawX - 6 * s, drawY - 6 * s, rect.w + 12 * s, rect.h + 12 * s);
                ctx.strokeRect(drawX - 6 * s, drawY - 6 * s, rect.w + 12 * s, rect.h + 12 * s);

                // 相片本體
                ctx.drawImage(this.customImage, drawX, drawY, rect.w, rect.h);

                // 淡淡的準心同心環浮水印，讓相片看起來更像真實標靶
                ctx.save();
                ctx.strokeStyle = 'rgba(255, 50, 50, 0.38)';
                ctx.lineWidth = 2 * s;
                const minDim = Math.min(rect.w, rect.h);
                ctx.beginPath();
                ctx.arc(rect.cx, rect.cy, minDim * 0.35, 0, Math.PI * 2);
                ctx.arc(rect.cx, rect.cy, minDim * 0.16, 0, Math.PI * 2);
                ctx.moveTo(rect.cx - minDim * 0.42, rect.cy);
                ctx.lineTo(rect.cx + minDim * 0.42, rect.cy);
                ctx.moveTo(rect.cx, rect.cy - minDim * 0.42);
                ctx.lineTo(rect.cx, rect.cy + minDim * 0.42);
                ctx.stroke();
                ctx.restore();
                return;
            }

            // 圓形或方形相片標靶牌
            const aspect = this.customImage.width / this.customImage.height;
            let baseSize = Math.max(rect.w, rect.h);
            let drawW = baseSize * this.customScale;
            let drawH = baseSize * this.customScale;
            if (aspect > 1) drawW = drawH * aspect;
            else drawH = drawW / aspect;

            const photoX = rect.cx + this.customOffsetX * s;
            const photoY = rect.cy + this.customOffsetY * s;

            if (isPreview) {
                ctx.save();
                ctx.globalAlpha = 0.25;
                ctx.drawImage(this.customImage, photoX - drawW / 2, photoY - drawH / 2, drawW, drawH);
                ctx.restore();
            }

            ctx.save();
            if (rect.shape === 'circle') {
                // 外層紅白相間靶環外框
                ctx.fillStyle = '#d63031';
                ctx.beginPath();
                ctx.arc(rect.cx, rect.cy, rect.r + 8 * s, 0, Math.PI * 2);
                ctx.fill();

                ctx.fillStyle = '#ffffff';
                ctx.beginPath();
                ctx.arc(rect.cx, rect.cy, rect.r + 3 * s, 0, Math.PI * 2);
                ctx.fill();

                ctx.beginPath();
                ctx.arc(rect.cx, rect.cy, rect.r, 0, Math.PI * 2);
                ctx.clip();
                ctx.drawImage(this.customImage, photoX - drawW / 2, photoY - drawH / 2, drawW, drawH);
            } else {
                // 方形紅白框立牌靶
                ctx.fillStyle = '#d63031';
                ctx.fillRect(rect.cx - rect.w / 2 - 7 * s, rect.cy - rect.h / 2 - 7 * s, rect.w + 14 * s, rect.h + 14 * s);
                ctx.fillStyle = '#ffffff';
                ctx.fillRect(rect.cx - rect.w / 2 - 3 * s, rect.cy - rect.h / 2 - 3 * s, rect.w + 6 * s, rect.h + 6 * s);

                ctx.beginPath();
                ctx.rect(rect.cx - rect.w / 2, rect.cy - rect.h / 2, rect.w, rect.h);
                ctx.clip();
                ctx.drawImage(this.customImage, photoX - drawW / 2, photoY - drawH / 2, drawW, drawH);
            }

            // 標靶紅心浮水印線
            ctx.strokeStyle = 'rgba(255, 40, 40, 0.35)';
            ctx.lineWidth = 2 * s;
            const ringR = Math.min(rect.w, rect.h) * 0.25;
            ctx.beginPath();
            ctx.arc(rect.cx, rect.cy, ringR, 0, Math.PI * 2);
            ctx.moveTo(rect.cx - ringR * 1.4, rect.cy);
            ctx.lineTo(rect.cx + ringR * 1.4, rect.cy);
            ctx.moveTo(rect.cx, rect.cy - ringR * 1.4);
            ctx.lineTo(rect.cx, rect.cy + ringR * 1.4);
            ctx.stroke();
            ctx.restore();
            return;
        }

        // 情況 B：尚未上傳相片時的預設經典立靶 (紅白同心圓靶 / 戰術胸環靶)
        if (rect.shape === 'rect') {
            const left = rect.cx - rect.w / 2;
            const top = rect.cy - rect.h / 2;
            ctx.fillStyle = '#f5f0e6';
            ctx.strokeStyle = '#2d3436';
            ctx.lineWidth = 4 * s;
            ctx.fillRect(left, top, rect.w, rect.h);
            ctx.strokeRect(left, top, rect.w, rect.h);

            // 戰術人形剪影與同心計分環
            ctx.fillStyle = '#1e272e';
            ctx.beginPath();
            ctx.arc(rect.cx, rect.cy - rect.h * 0.22, rect.w * 0.18, 0, Math.PI * 2);
            ctx.fill();
            ctx.beginPath();
            ctx.roundRect(rect.cx - rect.w * 0.34, rect.cy - rect.h * 0.05, rect.w * 0.68, rect.h * 0.48, 12 * s);
            ctx.fill();

            const rings = [0.28, 0.18, 0.08];
            rings.forEach((ratio, idx) => {
                ctx.strokeStyle = idx === 2 ? '#ff3838' : 'rgba(255,255,255,0.6)';
                ctx.fillStyle = idx === 2 ? '#ff3838' : 'transparent';
                ctx.lineWidth = 2 * s;
                ctx.beginPath();
                ctx.arc(rect.cx, rect.cy + rect.h * 0.12, rect.w * ratio, 0, Math.PI * 2);
                if (idx === 2) ctx.fill();
                ctx.stroke();
            });
        } else {
            // 經典紅白同心圓飛盤/立牌靶
            const colors = ['#d63031', '#ffffff', '#d63031', '#ffffff', '#ffdd59'];
            const radii = [1.0, 0.78, 0.56, 0.34, 0.16];
            for (let i = 0; i < radii.length; i++) {
                ctx.fillStyle = colors[i];
                ctx.beginPath();
                ctx.arc(rect.cx, rect.cy, rect.r * radii[i], 0, Math.PI * 2);
                ctx.fill();
            }
            ctx.strokeStyle = '#222';
            ctx.lineWidth = 3 * s;
            ctx.beginPath();
            ctx.arc(rect.cx, rect.cy, rect.r, 0, Math.PI * 2);
            ctx.stroke();
        }
    }

    drawDecals(ctx) {
        for (let hole of this.bulletHoles) {
            ctx.save();
            ctx.translate(hole.x, hole.y);
            ctx.fillStyle = '#111';
            ctx.beginPath();
            ctx.arc(0, 0, hole.radius, 0, Math.PI * 2);
            ctx.fill();
            ctx.strokeStyle = 'rgba(255,255,255,0.6)';
            ctx.lineWidth = 1.2;
            ctx.stroke();
            ctx.restore();
        }
        for (let splat of this.splats) {
            ctx.save();
            ctx.translate(splat.x, splat.y);
            ctx.fillStyle = splat.color;
            ctx.beginPath();
            ctx.arc(0, 0, splat.radius, 0, Math.PI * 2);
            ctx.fill();
            ctx.restore();
        }
    }
}

// ============================================================================
// 3. 氣球靶 (Balloon Target - 射到就破掉、可印上自訂相片、支援多排漂浮)
// ============================================================================
const BALLOON_PALETTE = [
    '#ff2a55', // 鮮紅
    '#00d2ff', // 亮藍
    '#ffcc00', // 亮黃
    '#ff5e00', // 亮橘
    '#b53cff', // 亮紫
    '#2ecc71', // 翠綠
    '#ff4da6'  // 桃粉
];

class BalloonTarget {
    constructor(x, y, scale = 1.0, customImage = null, isCustomFull = false, row = 0, colorIndex = null) {
        this.targetCategory = 'balloon';
        this.row = row;
        this.x = x;
        this.y = y; // 氣球綁繩底部錨點
        this.baseX = x;
        this.baseY = y;
        this.baseScale = scale;
        this.scale = scale;

        this.customImage = customImage;
        this.isCustomFull = isCustomFull;
        this.customScale = 1.0;
        this.customOffsetX = 0;
        this.customOffsetY = 0;
        this.customShape = 'circle';
        this.headFrameScale = 1.0;

        const cIdx = colorIndex !== null ? colorIndex % BALLOON_PALETTE.length : Math.floor(Math.random() * BALLOON_PALETTE.length);
        this.color = BALLOON_PALETTE[cIdx];

        // 漂浮擺動參數
        this.bobTime = Math.random() * Math.PI * 2;
        this.bobSpeed = 2.0 + Math.random() * 1.2;
        this.swayOffsetX = 0;
        this.swayOffsetY = 0;

        // 爆破與重生充氣狀態
        this.isPopped = false;
        this.respawnTimer = 0;
        this.inflateScale = 1.0; // 重生時由小變大充氣動畫

        this.updateDimensions();
    }

    updateDimensions() {
        const s = this.scale * Math.max(0.8, Math.min((this.headFrameScale || 1.0) * 0.9, 2.2));
        this.radiusX = 48 * s;
        this.radiusY = 58 * s;
        this.stringLength = 85 * this.scale;
    }

    setScale(newScale) {
        this.scale = newScale;
        this.updateDimensions();
    }

    getBalloonCenter() {
        return {
            x: this.x + this.swayOffsetX,
            y: this.y - this.stringLength - this.radiusY * this.inflateScale + this.swayOffsetY
        };
    }

    update(dt) {
        this.updateDimensions();
        this.bobTime += dt * this.bobSpeed;
        this.swayOffsetX = Math.sin(this.bobTime) * 10 * this.scale;
        this.swayOffsetY = Math.cos(this.bobTime * 1.5) * 6 * this.scale;

        if (this.isPopped) {
            this.respawnTimer -= dt;
            if (this.respawnTimer <= 0) {
                this.isPopped = false;
                this.inflateScale = 0.15;
                this.color = BALLOON_PALETTE[Math.floor(Math.random() * BALLOON_PALETTE.length)];
            }
        } else if (this.inflateScale < 1.0) {
            this.inflateScale = Math.min(1.0, this.inflateScale + dt * 4.5);
        }
    }

    respawn() {
        this.isPopped = false;
        this.respawnTimer = 0;
        this.inflateScale = 1.0;
    }

    hitTest(hitX, hitY) {
        if (this.isPopped) return null;
        const center = this.getBalloonCenter();
        const rx = this.radiusX * this.inflateScale * 1.08;
        const ry = this.radiusY * this.inflateScale * 1.08;

        const normX = (hitX - center.x) / rx;
        const normY = (hitY - center.y) / ry;
        const distSq = normX * normX + normY * normY;

        if (distSq <= 1.0) {
            const isCenter = distSq <= 0.35;
            return {
                part: 'balloon',
                localX: hitX - center.x,
                localY: hitY - center.y,
                balloonCenterX: center.x,
                balloonCenterY: center.y,
                crit: isCenter,
                multiplier: isCenter ? 2.0 : 1.0
            };
        }
        return null;
    }

    applyImpulse(impactLocalX, impactLocalY, force, damage, isTomato = false, hitData = null) {
        if (this.isPopped) return;
        this.isPopped = true;
        this.respawnTimer = 2.2 + Math.random() * 0.8;
        if (window.soundFX) window.soundFX.playBalloonPop();
    }

    draw(ctx, isPreview = false) {
        ctx.save();
        const s = this.scale;
        const bx = isPreview ? this.x : (this.x + this.swayOffsetX);
        const by = isPreview
            ? (this.y - this.stringLength - this.radiusY)
            : (this.y - this.stringLength - this.radiusY * this.inflateScale + this.swayOffsetY);

        // 1. 若已射破：只繪製底部斷掉垂落的殘留棉線
        if (this.isPopped && !isPreview) {
            ctx.strokeStyle = 'rgba(220, 220, 220, 0.55)';
            ctx.lineWidth = 1.5 * s;
            ctx.beginPath();
            ctx.moveTo(this.x, this.y);
            ctx.quadraticCurveTo(this.x + 8 * s, this.y - 18 * s, this.x - 4 * s, this.y - 32 * s);
            ctx.stroke();
            ctx.restore();
            return;
        }

        const rx = this.radiusX * this.inflateScale;
        const ry = this.radiusY * this.inflateScale;

        // 2. 繪製氣球棉線 (從地面/軌道錨點連到氣球底端吹嘴)
        ctx.strokeStyle = 'rgba(240, 240, 240, 0.75)';
        ctx.lineWidth = 1.8 * s;
        ctx.beginPath();
        ctx.moveTo(this.x, this.y);
        ctx.quadraticCurveTo(
            (this.x + bx) / 2 + Math.sin(this.bobTime * 1.2) * 8 * s,
            (this.y + by + ry) / 2,
            bx,
            by + ry + 5 * s
        );
        ctx.stroke();

        // 3. 氣球底端吹嘴結 (小三角錐)
        ctx.fillStyle = this.color;
        ctx.beginPath();
        ctx.moveTo(bx, by + ry - 1 * s);
        ctx.lineTo(bx - 6 * s, by + ry + 7 * s);
        ctx.lineTo(bx + 6 * s, by + ry + 7 * s);
        ctx.closePath();
        ctx.fill();

        // 4. 氣球本體 (立體光澤橢圓)
        ctx.save();
        ctx.beginPath();
        ctx.ellipse(bx, by, rx, ry, 0, 0, Math.PI * 2);

        const grad = ctx.createRadialGradient(
            bx - rx * 0.32,
            by - ry * 0.32,
            rx * 0.08,
            bx,
            by,
            ry * 1.05
        );
        grad.addColorStop(0, '#ffffff');
        grad.addColorStop(0.22, this.color);
        grad.addColorStop(0.85, this.color);
        grad.addColorStop(1, 'rgba(15, 15, 25, 0.85)');
        ctx.fillStyle = grad;
        ctx.fill();

        // 若有上傳自訂相片，將相片印在氣球表面上！
        if (this.customImage) {
            ctx.clip();
            const aspect = this.customImage.width / this.customImage.height;
            let baseSize = Math.max(rx, ry) * 2.05;
            let drawW = baseSize * this.customScale;
            let drawH = baseSize * this.customScale;
            if (aspect > 1) drawW = drawH * aspect;
            else drawH = drawW / aspect;

            const photoX = bx + this.customOffsetX * s;
            const photoY = by + this.customOffsetY * s;

            ctx.globalAlpha = 0.88;
            ctx.drawImage(this.customImage, photoX - drawW / 2, photoY - drawH / 2, drawW, drawH);

            // 疊加氣球邊緣立體內陰影與反光
            const innerShade = ctx.createRadialGradient(bx - rx * 0.25, by - ry * 0.25, rx * 0.2, bx, by, ry);
            innerShade.addColorStop(0, 'rgba(255,255,255,0.18)');
            innerShade.addColorStop(0.7, 'rgba(0,0,0,0)');
            innerShade.addColorStop(1, 'rgba(0,0,0,0.45)');
            ctx.globalAlpha = 1.0;
            ctx.fillStyle = innerShade;
            ctx.fillRect(bx - rx, by - ry, rx * 2, ry * 2);
        }
        ctx.restore();

        // 5. 氣球左上角高光亮斑 (讓氣球看起來Q彈晶瑩)
        ctx.save();
        ctx.fillStyle = 'rgba(255, 255, 255, 0.55)';
        ctx.beginPath();
        ctx.ellipse(bx - rx * 0.35, by - ry * 0.35, rx * 0.16, ry * 0.26, Math.PI / 6, 0, Math.PI * 2);
        ctx.fill();
        ctx.restore();

        // 外框微光
        ctx.strokeStyle = isPreview ? '#00e5ff' : 'rgba(255, 255, 255, 0.25)';
        ctx.lineWidth = (isPreview ? 2.5 : 1.2) * s;
        ctx.beginPath();
        ctx.ellipse(bx, by, rx, ry, 0, 0, Math.PI * 2);
        ctx.stroke();

        ctx.restore();
    }
}

window.CrucifiedDummy = CrucifiedDummy;
window.KnockdownPhotoTarget = KnockdownPhotoTarget;
window.BalloonTarget = BalloonTarget;

