document.addEventListener("DOMContentLoaded", () => {
  const startScene = document.getElementById("start-scene");
  const canvasScene = document.getElementById("canvas-scene");
  const startBtn = document.getElementById("start-btn");
  const backBtn = document.getElementById("back-btn");
  const canvas = document.getElementById("canvas");
  const errorMessage = document.getElementById("error-message");
  const ctx = canvas.getContext("2d");

  let animationId = null;
  // フィルタ後に描画へ渡す角度 (連続値)
  let alpha = 0,
    beta = 0,
    gamma = 0;
  // 生値 & 内部状態
  let rawAlpha = 0,
    rawBeta = 0,
    rawGamma = 0;
  let prevRawAlpha = null; // unwrap 判定用 (0-360 周回検出)
  let contAlpha = 0; // アンラップ後の連続 alpha
  const SMOOTHING = 0.15; // ローパス係数 (0<k<=1) 大きいほど追従性↑ / 小さいほど安定↑

  // シーン切り替え
  function showStartScene() {
    startScene.classList.remove("hidden");
    canvasScene.classList.add("hidden");
    if (animationId) {
      cancelAnimationFrame(animationId);
      animationId = null;
    }
  }

  function showCanvasScene() {
    startScene.classList.add("hidden");
    canvasScene.classList.remove("hidden");
    checkDeviceOrientationSupport();
  }

  // DeviceOrientation APIのサポートチェック
  async function checkDeviceOrientationSupport() {
    // DeviceOrientationEventの存在チェック
    if (!window.DeviceOrientationEvent) {
      showError("DeviceOrientation APIがサポートされていません");
      return;
    }

    // デスクトップブラウザの検出
    const userAgent = navigator.userAgent.toLowerCase();
    const isMobile =
      /android|webos|iphone|ipad|ipod|blackberry|iemobile|opera mini/i.test(
        userAgent
      );

    if (!isMobile) {
      showError("このデモはモバイルデバイスでのみ動作します");
      return;
    }

    // iOS 13+の権限要求
    if (typeof DeviceOrientationEvent.requestPermission === "function") {
      try {
        const permission = await DeviceOrientationEvent.requestPermission();
        if (permission === "granted") {
          startOrientationListening();
        } else {
          showError("権限が拒否されました");
        }
      } catch (error) {
        showError("権限の要求に失敗しました");
      }
    } else {
      // iOS 13未満またはAndroidの場合
      // タイムアウト付きでテスト
      testDeviceOrientationSupport();
    }
  }

  // DeviceOrientation APIの実際の動作テスト
  function testDeviceOrientationSupport() {
    let testTimeout;
    let hasReceivedEvent = false;

    const testHandler = (event) => {
      hasReceivedEvent = true;
      clearTimeout(testTimeout);
      window.removeEventListener("deviceorientation", testHandler);
      startOrientationListening();
    };

    window.addEventListener("deviceorientation", testHandler);

    // 3秒待ってもイベントが来ない場合はエラー
    testTimeout = setTimeout(() => {
      window.removeEventListener("deviceorientation", testHandler);
      if (!hasReceivedEvent) {
        showError("DeviceOrientation APIが利用できません");
      }
    }, 3000);
  }

  function startOrientationListening() {
    window.addEventListener("deviceorientation", handleOrientation);
    startAnimation();
  }

  function handleOrientation(event) {
    rawAlpha = event.alpha ?? 0;
    rawBeta = event.beta ?? 0;
    rawGamma = event.gamma ?? 0;

    // alpha の 0↔360 ラップを補正 (最短差分)
    if (prevRawAlpha == null) {
      contAlpha = rawAlpha;
    } else {
      let delta = rawAlpha - prevRawAlpha; // 範囲 [-360,360]
      if (delta > 180) delta -= 360;
      else if (delta < -180) delta += 360;
      contAlpha += delta; // 連続値
    }
    prevRawAlpha = rawAlpha;

    // ローパス (指数移動平均)
    alpha += (contAlpha - alpha) * SMOOTHING;
    beta += (rawBeta - beta) * SMOOTHING;
    gamma += (rawGamma - gamma) * SMOOTHING;
  }

  function showError(
    message = "DeviceOrientation APIがサポートされていません"
  ) {
    errorMessage.textContent = message;
    errorMessage.classList.remove("hidden");

    // エラーの場合でも静的な立方体を表示
    startStaticCubeAnimation();
  }

  // 静的な立方体のアニメーション
  function startStaticCubeAnimation() {
    let rotationTime = 0;

    function animateStatic() {
      // 自動回転で立方体を表示 (正しい軸定義に従う)
      rotationTime += 0.01;
      const a = Math.sin(rotationTime) * 60; // Z軸回転 (コンパス方向)
      const b = Math.cos(rotationTime * 0.7) * 30; // X軸回転 (前後傾き)
      const g = Math.sin(rotationTime * 0.5) * 20; // Y軸回転 (左右傾き)
      alpha = a;
      beta = b;
      gamma = g; // フィルタ不要の擬似値

      drawCube();
      animationId = requestAnimationFrame(animateStatic);
    }

    animateStatic();
  }

  // 3D立方体の描画
  function drawCube() {
    const centerX = canvas.width / 2;
    const centerY = canvas.height / 2;
    const size = 80;

    // キャンバスをクリア
    ctx.clearRect(0, 0, canvas.width, canvas.height);

    // --- クォータニオンベースに変更してジッター/ギンバルロック感を低減 ---
    const signYaw = -1; // alpha (Z)
    const signPitch = 1; // beta (X) ここを +1 にすることで見た目の方向を反転
    const signRoll = -1; // gamma (Y)

    const radA = (signYaw * (alpha || 0) * Math.PI) / 180; // Z (yaw)
    const radB = (signPitch * (beta || 0) * Math.PI) / 180; // X (pitch)
    const radG = (signRoll * (gamma || 0) * Math.PI) / 180; // Y (roll)

    // 各軸クォータニオン: q = [x,y,z,w]
    function quatAxis(x, y, z, ang) {
      const h = ang * 0.5;
      const s = Math.sin(h);
      return [x * s, y * s, z * s, Math.cos(h)];
    }
    // 乗算 q1*q2
    function quatMul(a, b) {
      return [
        a[3] * b[0] + a[0] * b[3] + a[1] * b[2] - a[2] * b[1],
        a[3] * b[1] - a[0] * b[2] + a[1] * b[3] + a[2] * b[0],
        a[3] * b[2] + a[0] * b[1] - a[1] * b[0] + a[2] * b[3],
        a[3] * b[3] - a[0] * b[0] - a[1] * b[1] - a[2] * b[2],
      ];
    }
    // 正規化
    function quatNorm(q) {
      const len = Math.hypot(q[0], q[1], q[2], q[3]);
      if (!len) return [0, 0, 0, 1];
      return [q[0] / len, q[1] / len, q[2] / len, q[3] / len];
    }

    const qZ = quatAxis(0, 0, 1, radA);
    const qX = quatAxis(1, 0, 0, radB);
    const qY = quatAxis(0, 1, 0, radG);
    // intrinsic Z->X->Y : R = Rz * Rx * Ry => quaternion同順で右積
    let q = quatMul(quatMul(qZ, qX), qY);
    q = quatNorm(q);
    // ワールド固定表示: 逆回転 = 共役を使用 (単位クォータニオンの逆)
    const qConj = [-q[0], -q[1], -q[2], q[3]];

    // クォータニオン -> 回転行列 (右手系)
    const x = qConj[0],
      y = qConj[1],
      z = qConj[2],
      w = qConj[3];
    const xx = x * x,
      yy = y * y,
      zz = z * z;
    const xy = x * y,
      xz = x * z,
      yz = y * z;
    const wx = w * x,
      wy = w * y,
      wz = w * z;
    const m00 = 1 - 2 * (yy + zz);
    const m01 = 2 * (xy - wz);
    const m02 = 2 * (xz + wy);
    const m10 = 2 * (xy + wz);
    const m11 = 1 - 2 * (xx + zz);
    const m12 = 2 * (yz - wx);
    const m20 = 2 * (xz - wy);
    const m21 = 2 * (yz + wx);
    const m22 = 1 - 2 * (xx + yy);

    // 立方体の頂点定義
    const vertices = [
      [-1, -1, -1],
      [1, -1, -1],
      [1, 1, -1],
      [-1, 1, -1], // 背面
      [-1, -1, 1],
      [1, -1, 1],
      [1, 1, 1],
      [-1, 1, 1], // 前面
    ];

    // 頂点へ適用 (行列は既に逆回転相当)
    const rotatedVertices = vertices.map(([x, y, z]) => [
      x * m00 + y * m01 + z * m02,
      x * m10 + y * m11 + z * m12,
      x * m20 + y * m21 + z * m22,
    ]);

    // 3D -> 2D投影
    const projectedVertices = rotatedVertices.map((vertex) => {
      const perspective = 300;
      const scale = perspective / (perspective + vertex[2] * size);
      return [
        centerX + vertex[0] * size * scale,
        centerY + vertex[1] * size * scale,
        vertex[2], // Z座標も保持
      ];
    });

    // 面
    const faces = [
      [0, 1, 2, 3], // 背面
      [4, 7, 6, 5], // 前面
      [0, 4, 5, 1], // 下面
      [2, 6, 7, 3], // 上面
      [0, 3, 7, 4], // 左面
      [1, 5, 6, 2], // 右面
    ];

    const faceColors = [
      "rgba(255, 100, 100, 0.8)", // 背面 - 赤
      "rgba(100, 255, 100, 0.8)", // 前面 - 緑
      "rgba(100, 100, 255, 0.8)", // 下面 - 青
      "rgba(255, 255, 100, 0.8)", // 上面 - 黄
      "rgba(255, 100, 255, 0.8)", // 左面 - マゼンタ
      "rgba(100, 255, 255, 0.8)", // 右面 - シアン
    ];

    // 面を描画 (Z座標でソート)
    const facesWithDepth = faces.map((face, index) => {
      const avgZ =
        face.reduce((sum, vertexIndex) => {
          return sum + rotatedVertices[vertexIndex][2];
        }, 0) / 4;

      return { face, color: faceColors[index], avgZ };
    });

    // Z座標でソート
    facesWithDepth.sort((a, b) => a.avgZ - b.avgZ);

    // 描画
    facesWithDepth.forEach(({ face, color }) => {
      ctx.fillStyle = color;
      ctx.strokeStyle = "rgba(255, 255, 255, 0.8)";
      ctx.lineWidth = 2;

      ctx.beginPath();
      ctx.moveTo(projectedVertices[face[0]][0], projectedVertices[face[0]][1]);
      for (let i = 1; i < face.length; i++) {
        ctx.lineTo(
          projectedVertices[face[i]][0],
          projectedVertices[face[i]][1]
        );
      }
      ctx.closePath();
      ctx.fill();
      ctx.stroke();
    });
  }

  // アニメーションループ
  function startAnimation() {
    function animate() {
      drawCube();
      animationId = requestAnimationFrame(animate);
    }
    animate();
  }

  // イベントリスナー
  startBtn.addEventListener("click", showCanvasScene);
  backBtn.addEventListener("click", () => {
    window.removeEventListener("deviceorientation", handleOrientation);
    showStartScene();
  });

  // 初期表示
  showStartScene();
});
