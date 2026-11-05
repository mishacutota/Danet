(() => {
  "use strict";

  /* ---------------- elements ---------------- */
  const coin = document.getElementById("coin");
  const coinInner = coin.querySelector(".coin__inner");
  const answer = document.getElementById("answer");
  const answerText = document.getElementById("answerText");
  const hint = document.getElementById("hint");
  const flipBtn = document.getElementById("flipBtn");
  const soundBtn = document.getElementById("soundBtn");
  const soundIcon = document.getElementById("soundIcon");
  const resetBtn = document.getElementById("resetBtn");
  const questionInput = document.getElementById("question");
  const statYes = document.getElementById("statYes");
  const statNo = document.getElementById("statNo");
  const canvas = document.getElementById("fx");
  const ctx = canvas.getContext("2d", { alpha: true });

  const STORE_KEY = "yesno.v2";

  /* ---------------- device profile ---------------- */
  const isSmall = window.matchMedia("(max-width: 520px)").matches;
  const lowPower = isSmall || (navigator.hardwareConcurrency || 4) <= 4;
  const reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;

  /* ---------------- state ---------------- */
  const state = {
    flipping: false,
    sound: true,
    yes: 0,
    no: 0,
    rotation: 0,
  };

  const HINTS = [
    "Нажми на фишку — судьба решит за тебя",
    "Честные 50 на 50. Всегда",
    "Сомневаешься? Значит, уже знаешь ответ",
    "Фишка не ошибается. Просто бросай",
    "Один тап — и никаких сомнений",
  ];

  /* ---------------- persistence ---------------- */
  function load() {
    try {
      const raw = localStorage.getItem(STORE_KEY);
      if (!raw) return;
      const data = JSON.parse(raw);
      if (typeof data.yes === "number") state.yes = data.yes;
      if (typeof data.no === "number") state.no = data.no;
      if (typeof data.sound === "boolean") state.sound = data.sound;
    } catch (e) {
      /* ignore corrupted storage */
    }
  }

  function save() {
    try {
      localStorage.setItem(
        STORE_KEY,
        JSON.stringify({ yes: state.yes, no: state.no, sound: state.sound })
      );
    } catch (e) {
      /* storage may be unavailable */
    }
  }

  function renderStats() {
    statYes.textContent = state.yes;
    statNo.textContent = state.no;
  }

  function renderSound() {
    soundIcon.textContent = state.sound ? "🔊" : "🔇";
    soundBtn.setAttribute("aria-pressed", String(state.sound));
  }

  /* ---------------- audio (WebAudio, no assets) ---------------- */
  let audioCtx = null;

  function ensureAudio() {
    if (!state.sound) return null;
    if (!audioCtx) {
      const AC = window.AudioContext || window.webkitAudioContext;
      if (!AC) return null;
      audioCtx = new AC();
    }
    if (audioCtx.state === "suspended") audioCtx.resume();
    return audioCtx;
  }

  function tone(freq, startAt, dur, type, gainValue) {
    const ac = audioCtx;
    if (!ac) return;
    const osc = ac.createOscillator();
    const gain = ac.createGain();
    osc.type = type || "sine";
    osc.frequency.setValueAtTime(freq, startAt);
    gain.gain.setValueAtTime(0.0001, startAt);
    gain.gain.exponentialRampToValueAtTime(gainValue || 0.1, startAt + 0.012);
    gain.gain.exponentialRampToValueAtTime(0.0001, startAt + dur);
    osc.connect(gain).connect(ac.destination);
    osc.start(startAt);
    osc.stop(startAt + dur + 0.02);
  }

  function playWhoosh() {
    const ac = ensureAudio();
    if (!ac) return;
    const now = ac.currentTime;
    const steps = lowPower ? 5 : 7;
    for (let i = 0; i < steps; i++) {
      tone(500 + i * 85, now + i * 0.055, 0.09, "triangle", 0.045);
    }
  }

  function playResult(isYes) {
    const ac = ensureAudio();
    if (!ac) return;
    const now = ac.currentTime;
    if (isYes) {
      [523.25, 659.25, 783.99, 1046.5].forEach((f, i) =>
        tone(f, now + i * 0.075, 0.3, "sine", 0.1)
      );
    } else {
      [392, 311.13, 233.08].forEach((f, i) => tone(f, now + i * 0.09, 0.34, "sine", 0.09));
    }
  }

  function playTick() {
    const ac = ensureAudio();
    if (!ac) return;
    tone(1150, ac.currentTime, 0.045, "square", 0.026);
  }

  /* ---------------- particles: confetti + sparks + shockwave ---------------- */
  let particles = [];
  let rings = [];
  let sparks = [];
  let rafId = null;
  let dpr = 1;
  let vw = window.innerWidth;
  let vh = window.innerHeight;

  const MAX_PARTICLES = lowPower ? 70 : 150;

  function resizeCanvas() {
    vw = window.innerWidth;
    vh = window.innerHeight;
    dpr = Math.min(window.devicePixelRatio || 1, lowPower ? 1.5 : 2);
    canvas.width = Math.floor(vw * dpr);
    canvas.height = Math.floor(vh * dpr);
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  }

  function palette(isYes) {
    return isYes
      ? ["#4ade80", "#a7f3d0", "#f6d68a", "#ffffff", "#22d3ee"]
      : ["#fb7185", "#fda4af", "#f6d68a", "#ffffff", "#a78bfa"];
  }

  /** confetti burst + radial sparks + expanding ring */
  function burst(x, y, isYes) {
    if (reduceMotion) return;

    const colors = palette(isYes);
    const count = lowPower ? 30 : 64;

    if (particles.length + count > MAX_PARTICLES) {
      particles.splice(0, particles.length + count - MAX_PARTICLES);
    }

    for (let i = 0; i < count; i++) {
      const angle = (Math.PI * 2 * i) / count + Math.random() * 0.6;
      const speed = 3 + Math.random() * 7.5;
      particles.push({
        x,
        y,
        vx: Math.cos(angle) * speed,
        vy: Math.sin(angle) * speed - 1.6,
        life: 1,
        decay: 0.014 + Math.random() * 0.014,
        size: 2 + Math.random() * 4.5,
        color: colors[(Math.random() * colors.length) | 0],
        rot: Math.random() * Math.PI,
        vr: (Math.random() - 0.5) * 0.32,
        shape: Math.random() < 0.4 ? "rect" : "circle",
      });
    }

    // fast thin sparks shooting outward
    const sparkCount = lowPower ? 10 : 20;
    for (let i = 0; i < sparkCount; i++) {
      const angle = Math.random() * Math.PI * 2;
      const speed = 7 + Math.random() * 9;
      sparks.push({
        x,
        y,
        vx: Math.cos(angle) * speed,
        vy: Math.sin(angle) * speed,
        life: 1,
        decay: 0.045 + Math.random() * 0.03,
        len: 8 + Math.random() * 14,
        color: colors[(Math.random() * colors.length) | 0],
      });
    }

    // expanding shockwave ring
    rings = [
      {
        x,
        y,
        r: 8,
        vr: 2.6,
        life: 1,
        decay: 0.035,
        color: isYes ? "rgba(74, 222, 128," : "rgba(251, 113, 133,",
      },
    ];

    if (!rafId) rafId = requestAnimationFrame(tick);
  }

  function tick() {
    ctx.clearRect(0, 0, vw, vh);

    // shockwave
    for (let i = rings.length - 1; i >= 0; i--) {
      const r = rings[i];
      r.r += r.vr;
      r.vr *= 0.96;
      r.life -= r.decay;
      if (r.life <= 0) {
        rings.splice(i, 1);
        continue;
      }
      ctx.beginPath();
      ctx.strokeStyle = r.color + (r.life * 0.55).toFixed(3) + ")";
      ctx.lineWidth = 2 * r.life + 0.5;
      ctx.arc(r.x, r.y, r.r, 0, Math.PI * 2);
      ctx.stroke();
    }

    // sparks (motion streaks)
    for (let i = sparks.length - 1; i >= 0; i--) {
      const s = sparks[i];
      s.x += s.vx;
      s.y += s.vy;
      s.vx *= 0.92;
      s.vy *= 0.92;
      s.life -= s.decay;
      if (s.life <= 0) {
        sparks.splice(i, 1);
        continue;
      }
      ctx.globalAlpha = Math.max(0, s.life);
      ctx.strokeStyle = s.color;
      ctx.lineWidth = 1.6;
      ctx.beginPath();
      ctx.moveTo(s.x, s.y);
      ctx.lineTo(s.x - s.vx * (s.len / 10), s.y - s.vy * (s.len / 10));
      ctx.stroke();
    }

    // confetti
    for (let i = particles.length - 1; i >= 0; i--) {
      const p = particles[i];
      p.vy += 0.16;
      p.vx *= 0.985;
      p.vy *= 0.985;
      p.x += p.vx;
      p.y += p.vy;
      p.rot += p.vr;
      p.life -= p.decay;

      if (p.life <= 0) {
        particles.splice(i, 1);
        continue;
      }

      ctx.globalAlpha = Math.max(0, p.life);
      ctx.fillStyle = p.color;
      if (p.shape === "rect") {
        ctx.save();
        ctx.translate(p.x, p.y);
        ctx.rotate(p.rot);
        ctx.fillRect(-p.size / 2, -p.size / 2, p.size, p.size * 0.62);
        ctx.restore();
      } else {
        ctx.beginPath();
        ctx.arc(p.x, p.y, p.size / 2, 0, Math.PI * 2);
        ctx.fill();
      }
    }

    ctx.globalAlpha = 1;

    if (particles.length || sparks.length || rings.length) {
      rafId = requestAnimationFrame(tick);
    } else {
      ctx.clearRect(0, 0, vw, vh);
      rafId = null;
    }
  }

  /* ---------------- flash overlay ---------------- */
  const flash = document.createElement("div");
  flash.className = "flash";
  document.body.appendChild(flash);

  let flashTimer = null;
  function flashResult(isYes) {
    flash.className = "flash is-on " + (isYes ? "flash--yes" : "flash--no");
    clearTimeout(flashTimer);
    flashTimer = setTimeout(() => {
      flash.className = "flash " + (isYes ? "flash--yes" : "flash--no");
    }, 460);
  }

  /* ---------------- coin flip ----------------
     The inner wrapper is rotated by JS; the outer button keeps the idle float.
     Both result faces sit at 180deg and are hidden until the result is known.
  ---------------------------------------------- */

  let hintIndex = 0;

  function setHint(text) {
    hint.style.opacity = "0";
    setTimeout(() => {
      hint.textContent = text;
      hint.style.opacity = "1";
    }, 180);
  }

  function flip() {
    if (state.flipping) return;

    const isYes = Math.random() < 0.5;
    state.flipping = true;

    flipBtn.disabled = true;
    coin.classList.remove("is-yes", "is-no");
    coin.classList.add("is-flipping");
    answer.classList.remove("is-yes", "is-no");
    answerText.textContent = "…";
    answerText.classList.remove("pop");

    const question = questionInput.value.trim();
    setHint(question ? `«${question}»` : "Фишка в воздухе…");

    playWhoosh();

    const spins = (lowPower ? 3 : 4) + Math.floor(Math.random() * 2);
    const base = state.rotation - (state.rotation % 360);
    const target = base + spins * 360 + 180;
    state.rotation = target;

    const duration = reduceMotion ? 700 : lowPower ? 1350 : 1600;
    const start = performance.now();
    let lastTick = 0;
    let frame = 0;

    const anim = (now) => {
      const t = Math.min(1, (now - start) / duration);
      const eased = 1 - Math.pow(1 - t, 3);
      const angle = target * eased;

      // toss up + a little horizontal sway, both on the same transform (one layer, no reflow)
      const toss = Math.sin(Math.PI * t) * 46;
      const sway = Math.sin(t * Math.PI * 2) * 10 * (1 - t);
      const wobble = Math.sin(t * Math.PI * 6) * (1 - t) * 4;

      coinInner.style.transform = `translate3d(${sway}px, ${-toss}px, 0) rotateY(${angle}deg) rotateZ(${wobble}deg)`;

      frame++;
      if (
        t > 0.15 &&
        now - lastTick > (lowPower ? 150 : 110) - t * 70 &&
        frame % (lowPower ? 2 : 1) === 0
      ) {
        lastTick = now;
        playTick();
      }

      if (t < 1) {
        requestAnimationFrame(anim);
      } else {
        coinInner.style.transform = `translate3d(0,0,0) rotateY(${target}deg)`;
        finish(isYes);
      }
    };

    requestAnimationFrame(anim);
  }

  function finish(isYes) {
    state.flipping = false;
    coin.classList.remove("is-flipping");
    coin.classList.add(isYes ? "is-yes" : "is-no");

    answer.classList.add(isYes ? "is-yes" : "is-no");
    answerText.textContent = isYes ? "ДА" : "НЕТ";
    void answerText.offsetWidth;
    answerText.classList.add("pop");

    if (isYes) state.yes += 1;
    else state.no += 1;
    renderStats();
    save();

    playResult(isYes);
    flashResult(isYes);

    const rect = coin.getBoundingClientRect();
    burst(rect.left + rect.width / 2, rect.top + rect.height / 2, isYes);

    if (navigator.vibrate) {
      navigator.vibrate(isYes ? [18, 40, 26] : [26, 50, 18, 50, 26]);
    }

    flipBtn.disabled = false;

    setTimeout(() => {
      if (state.flipping) return;
      hintIndex = (hintIndex + 1) % HINTS.length;
      setHint(HINTS[hintIndex]);
    }, 1600);
  }

  /* ---------------- events ---------------- */
  coin.addEventListener("click", flip);
  flipBtn.addEventListener("click", flip);

  soundBtn.addEventListener("click", () => {
    state.sound = !state.sound;
    renderSound();
    save();
    if (state.sound) playTick();
  });

  resetBtn.addEventListener("click", () => {
    state.yes = 0;
    state.no = 0;
    renderStats();
    save();
    answer.classList.remove("is-yes", "is-no");
    answerText.textContent = "?";
    answerText.classList.remove("pop");
    coin.classList.remove("is-yes", "is-no");
    hintIndex = 0;
    setHint("Статистика сброшена. Начинаем заново");
  });

  questionInput.addEventListener("keydown", (e) => {
    if (e.key === "Enter") {
      e.preventDefault();
      questionInput.blur();
      flip();
    }
  });

  document.addEventListener("keydown", (e) => {
    if (e.code === "Space" && document.activeElement !== questionInput) {
      e.preventDefault();
      flip();
    }
  });

  let resizeTimer = null;
  window.addEventListener(
    "resize",
    () => {
      clearTimeout(resizeTimer);
      resizeTimer = setTimeout(resizeCanvas, 150);
    },
    { passive: true }
  );

  // pause the effect loop when the tab is hidden (saves battery on phones)
  document.addEventListener("visibilitychange", () => {
    if (document.hidden) {
      cancelAnimationFrame(rafId);
      rafId = null;
      particles = [];
      sparks = [];
      rings = [];
      ctx.clearRect(0, 0, vw, vh);
    }
  });

  /* ---------------- init ---------------- */
  load();
  renderStats();
  renderSound();
  resizeCanvas();
  hint.textContent = HINTS[0];
})();
