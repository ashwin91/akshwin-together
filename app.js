const qs = (selector, root = document) => root.querySelector(selector);
const qsa = (selector, root = document) => [...root.querySelectorAll(selector)];
const RSVP_PHONE_STORAGE_KEY = "akshwinRsvpPhone";
const RSVP_EVENT_ALIASES = {
  hightea: "evening",
  sangeet: "evening"
};
const GALLERY_ITEMS = [
  {
    src: "assets/images/gallery/gallery-00-undated-img-1262.jpg",
    alt: "Ashwin and Akshata gallery photo 1"
  },
  {
    src: "assets/images/gallery/gallery-01-2024-11-16-175615.jpg",
    alt: "Ashwin and Akshata gallery photo 2"
  },
  {
    src: "assets/images/gallery/gallery-02-2024-11-16-182209.jpg",
    alt: "Ashwin and Akshata gallery photo 3"
  },
  {
    src: "assets/images/gallery/gallery-03-2026-02-27-092747.jpg",
    alt: "Ashwin and Akshata gallery photo 4"
  },
  {
    src: "assets/images/gallery/gallery-04-2026-02-27-115832.jpg",
    alt: "Ashwin and Akshata gallery photo 5"
  },
  {
    src: "assets/images/gallery/gallery-05-2026-02-28-163646.jpg",
    alt: "Ashwin and Akshata gallery photo 6"
  },
  {
    src: "assets/images/gallery/gallery-06-2026-03-02-135324.jpg",
    alt: "Ashwin and Akshata gallery photo 7"
  },
  {
    src: "assets/images/gallery/gallery-07-2026-03-28-085611.jpg",
    alt: "Ashwin and Akshata gallery photo 8"
  }
];

const state = {
  data: null,
  kolamUnlocked: localStorage.getItem("akshwinKolamUnlocked") === "true",
  marigoldUnlocked: localStorage.getItem("akshwinMarigoldUnlocked") === "true",
  opened: false,
  petals: [],
  audio: null,
  lenis: null
};

const palette = {
  ivory: "#F7EFDD",
  cream: "#FCF7EC",
  sage: "#6E7B57",
  deepSage: "#2E3B28",
  blush: "#D8A18E",
  rose: "#C98570",
  marigold: "#D89A38",
  gold: "#B98A38",
  goldBright: "#E4C474",
  maroon: "#7A2E2A",
  ink: "#3A2A20"
};

document.addEventListener("DOMContentLoaded", init);

function isRsvpEditLink() {
  return new URLSearchParams(window.location.search).get("rsvp") === "edit";
}

async function init() {
  state.data = await loadWeddingData();
  if ("scrollRestoration" in history) history.scrollRestoration = "manual";
  window.scrollTo({ top: 0, left: 0, behavior: "instant" });

  hydrateStaticContent();
  renderEvents();
  renderUtilities();
  renderSchema();
  initPetalCanvas();          // ambient motion runs from the very first frame
  initInviteOpener();
  initCalendarActions();
  initCountdown();
  initTempleBells();
  initOurStory();
  initGalleryViewer();
  initReveals();
  initChapterNav();
  initParallax();
  initMotionInteractions();
  initGlobalInteractions();
  initKolamBuilder();
  initMarigoldCatch();
  initEasterEggs();
  initRSVP();
  initSharing();
  registerServiceWorker();
}

/* =====================================================================
   OUR STORY VIDEO
   ===================================================================== */
function initOurStory() {
  const film = qs("#story-film");
  const video = qs("#story-video");
  const playButton = qs("#story-play");
  if (!film || !video || !playButton) return;

  const landscapeSrc = video.dataset.landscapeSrc || "assets/video/our-story-v2.mp4";
  const portraitSrc = video.dataset.portraitSrc || "assets/video/our-story-v2-portrait.mp4";
  const landscapePoster = video.dataset.landscapePoster || "assets/images/our-story-poster-v2.jpg";
  const portraitPoster = video.dataset.portraitPoster || "assets/images/our-story-poster-portrait.png";
  const portraitVideoQuery = window.matchMedia("(orientation: portrait) and (max-width: 920px)");

  const shouldUsePortraitVideo = () => {
    const narrowPortrait = portraitVideoQuery.matches;
    const touchPortrait = window.matchMedia("(pointer: coarse)").matches
      && window.innerHeight > window.innerWidth;
    return narrowPortrait || touchPortrait;
  };

  const setStoryVideoSource = ({ force = false } = {}) => {
    const usePortrait = shouldUsePortraitVideo();
    const nextSrc = usePortrait ? portraitSrc : landscapeSrc;
    const nextPoster = usePortrait ? portraitPoster : landscapePoster;
    if (video.poster !== nextPoster) video.poster = nextPoster;
    if (!force && video.dataset.activeSrc === nextSrc) return;
    video.dataset.activeSrc = nextSrc;
    video.src = nextSrc;
    video.load();
  };

  const requestStoryFullscreen = () => {
    if (!shouldUsePortraitVideo()) return;
    const request = video.requestFullscreen
      || video.webkitRequestFullscreen
      || video.webkitEnterFullscreen;
    try {
      const result = request?.call(video);
      result?.catch?.(() => {});
    } catch {
      /* Fullscreen is best-effort and can be blocked by browser policy. */
    }
  };

  setStoryVideoSource({ force: true });
  video.controls = false;

  const markStarted = () => {
    video.controls = true;
    film.classList.add("has-started");
  };
  const reset = () => {
    video.controls = false;
    film.classList.remove("has-started");
    playButton.querySelector("strong").textContent = "Watch Our Story Again";
    playButton.setAttribute("aria-label", "Watch Our Story again");
  };

  playButton.addEventListener("click", () => {
    setStoryVideoSource({ force: true });
    markStarted();
    const played = video.play();
    requestStoryFullscreen();
    if (played?.catch) {
      played.catch(() => {
        film.classList.remove("has-started");
        video.controls = true;
      });
    }
  });
  video.addEventListener("play", markStarted);
  video.addEventListener("ended", reset);
  video.addEventListener("error", () => {
    video.controls = true;
    film.classList.add("has-error");
  });

  let reflowTimer;
  const keepPlayingVideoVisible = () => {
    window.clearTimeout(reflowTimer);
    reflowTimer = window.setTimeout(() => {
      if (video.paused || video.ended) return;

      const rect = film.getBoundingClientRect();
      const outsideViewport = rect.bottom <= 0 || rect.top >= window.innerHeight;
      if (outsideViewport) {
        film.scrollIntoView({ block: "center", behavior: "auto" });
      }
    }, 180);
  };

  window.addEventListener("orientationchange", keepPlayingVideoVisible, { passive: true });
  window.addEventListener("resize", keepPlayingVideoVisible, { passive: true });
  window.visualViewport?.addEventListener("resize", keepPlayingVideoVisible, { passive: true });
}

function initGalleryViewer() {
  const viewer = qs("#gallery-viewer");
  const image = qs("#gallery-image");
  const counter = qs("#gallery-counter");
  const frame = qs(".gallery-frame");
  const prevButton = qs("#gallery-prev");
  const nextButton = qs("#gallery-next");
  if (!viewer || !image || !counter) return;

  let current = 0;
  let touchStartX = 0;
  let touchStartY = 0;

  const move = (step) => setActive(current + step);
  const normalize = (index) => (index + GALLERY_ITEMS.length) % GALLERY_ITEMS.length;

  const markChanging = () => {
    frame?.classList.add("is-changing");
    window.setTimeout(() => frame?.classList.remove("is-changing"), 170);
  };

  function setActive(index) {
    current = normalize(index);
    const item = GALLERY_ITEMS[current];
    markChanging();
    image.src = item.src;
    image.alt = item.alt;
    counter.textContent = `${current + 1} / ${GALLERY_ITEMS.length}`;
  }

  prevButton?.addEventListener("click", () => move(-1));
  nextButton?.addEventListener("click", () => move(1));

  viewer.addEventListener("keydown", (event) => {
    if (event.key === "ArrowLeft") {
      event.preventDefault();
      move(-1);
    }
    if (event.key === "ArrowRight") {
      event.preventDefault();
      move(1);
    }
  });

  viewer.addEventListener("touchstart", (event) => {
    const touch = event.changedTouches[0];
    touchStartX = touch.clientX;
    touchStartY = touch.clientY;
  }, { passive: true });

  viewer.addEventListener("touchend", (event) => {
    const touch = event.changedTouches[0];
    const dx = touch.clientX - touchStartX;
    const dy = touch.clientY - touchStartY;
    if (Math.abs(dx) > 48 && Math.abs(dx) > Math.abs(dy) * 1.4) move(dx > 0 ? -1 : 1);
  }, { passive: true });

  setActive(0);
}

async function loadWeddingData() {
  try {
    const response = await fetch("data/wedding.json", { cache: "no-store" });
    if (!response.ok) throw new Error("Could not load wedding.json");
    return await response.json();
  } catch (error) {
    showToast("Using embedded details because wedding.json could not be loaded.");
    return {
      siteUrl: location.href,
      rsvpEndpoint: "",
      whatsappPhone: "",
      couple: {
        bride: "Akshata",
        groom: "Ashwin",
        brideParents: "Shilpa & Srikanth",
        groomParents: "Jayanthi & Raghavendran",
        hashtag: "#AkshwinTogether"
      },
      date: "2026-08-16",
      timezone: "America/Los_Angeles",
      venue: {
        name: "Trillium Nursery Farm",
        address: "Redmond, WA 98053",
        city: "Redmond, WA",
        mapQuery: "https://maps.app.goo.gl/aGHehKdAZmqBydkt7"
      },
      copy: {
        parentsLine: "Ashwin, son of Jayanthi & Raghavendran, weds Akshata, daughter of Shilpa & Srikanth",
        muhurthamTitle: "Garden Muhurtham",
        rsvpTitle: "Will you join us?",
        rsvpIntro: "Tell us which moments you will share with us.",
        unlockNote: "You traced the wedding kolam. GOLDENGARLAND is saved on your RSVP.",
        streamNote: "The livestream will appear here just before the muhurtham begins."
      },
      events: [],
      travel: [],
      faq: []
    };
  }
}

function hydrateStaticContent() {
  const { data } = state;
  qsa(".couple-names .name").forEach((element) => renderNameLetters(element, element.dataset.text || element.textContent));
  applyCopy();

  qs("#venue-name").textContent = data.venue.name;
  qs("#venue-address").textContent = data.venue.address;
  qs("#events-venue-name").textContent = data.venue.name;
  qs("#copy-venue").dataset.copy = `${data.venue.name}, ${data.venue.address}`;
  qs("#footer-hashtag").textContent = data.couple.hashtag;
  qs("#rsvp-code").value = state.kolamUnlocked ? "GOLDENGARLAND" : "";
  syncHiddenGallery();
}

function applyCopy() {
  const copy = state.data.copy || {};
  qsa("[data-i18n]").forEach((element) => {
    const key = element.dataset.i18n;
    if (copy[key]) element.textContent = copy[key];
  });
}

function renderNameLetters(element, text) {
  element.textContent = "";
  [...text].forEach((letter, index) => {
    const span = document.createElement("span");
    span.textContent = letter === " " ? " " : letter;
    span.style.setProperty("--letter-index", index);
    span.addEventListener("mouseenter", () => {
      const rect = span.getBoundingClientRect();
      petalBurst(rect.left + rect.width / 2, rect.top + rect.height / 2, 6);
    });
    element.append(span);
  });
}

function renderEvents() {
  const grid = qs("#events-grid");
  const eventArt = {
    muhurtham: { src: "assets/images/procession.png", position: "center 18%" },
    evening: { src: "assets/images/event-sangeet.jpg", position: "center 48%" }
  };

  grid.innerHTML = state.data.events
    .map((event) => {
      const start = new Date(event.start);
      const localStart = formatLocalDateTime(start);
      const timeLabel = event.timeLabel || `${formatVenueTime(start)} PT`;
      const artItems = event.images?.length
        ? event.images
        : [eventArt[event.id] || { src: "assets/images/temple-wide.png", position: "center" }];
      const mediaClass = artItems.length > 1 ? "event-media event-media--duo" : "event-media";

      return `
        <article class="event-card" data-event-id="${event.id}" data-reveal>
          <div class="${mediaClass}">
            ${artItems.map((art) => `
              <img src="${art.src}" alt="${art.alt || `${event.title} illustration`}" loading="lazy" style="object-position:${art.position || "center"}">
            `).join("")}
            <h3 class="event-title">${event.title}</h3>
          </div>
          <div class="event-body">
            <div class="event-meta">
              <span title="Your local time: ${localStart}">
                <strong>Time</strong><em>${timeLabel}</em>
              </span>
              <span><strong>Suggested attire</strong><em>${event.dressCode}</em></span>
            </div>
            <p>${event.note}.</p>
            <p class="event-attire-note">${event.ritual}</p>
            <div class="event-actions">
              <button class="btn primary" type="button" data-ics="${event.id}">Add to calendar</button>
            </div>
          </div>
        </article>
      `;
    })
    .join("");

  qsa("[data-ics]").forEach((button) => button.addEventListener("click", () => downloadIcs(button.dataset.ics)));
  initMotionInteractions(grid);
  observeReveals(grid);
}

function normalizeRsvpEvents(events) {
  const allowed = new Set((state.data?.events || []).map((event) => event.id));
  return [...new Set(
    (Array.isArray(events) ? events : [])
      .map((event) => RSVP_EVENT_ALIASES[event] || event)
      .filter((event) => allowed.has(event))
  )];
}

function renderUtilities() {
  const venueQuery = encodeURIComponent(`${state.data.venue.name}, ${state.data.venue.address}`);
  qs("#map-shell").innerHTML = `
    <iframe loading="lazy" allowfullscreen referrerpolicy="no-referrer-when-downgrade"
      title="Wedding venue map"
      src="https://www.google.com/maps?q=${venueQuery}&output=embed"></iframe>
  `;

  qs("#travel-accordion").innerHTML = state.data.travel
    .map((item, index) => `
      <details ${index === 0 ? "open" : ""}>
        <summary>${item.title}</summary>
        <p>${item.body}</p>
      </details>
    `)
    .join("");

  const faqList = qs("#faq-list");
  if (faqList) {
    faqList.innerHTML = state.data.faq
      .map((item, index) => `
        <details ${index === 0 ? "open" : ""}>
          <summary>${item.question}</summary>
          <p>${item.answer}</p>
        </details>
      `)
      .join("");
  }

  qsa("[data-copy]").forEach((button) => button.addEventListener("click", () => copyText(button.dataset.copy, button)));
}

function renderSchema() {
  const schema = state.data.events.map((event) => ({
    "@context": "https://schema.org",
    "@type": "Event",
    name: `Ashwin & Akshata ${event.title}`,
    startDate: event.start,
    endDate: event.end,
    eventAttendanceMode: "https://schema.org/OfflineEventAttendanceMode",
    eventStatus: "https://schema.org/EventScheduled",
    location: { "@type": "Place", name: state.data.venue.name, address: state.data.venue.address },
    organizer: { "@type": "Person", name: "Ashwin & Akshata" },
    description: event.ritual
  }));
  qs("#event-schema").textContent = JSON.stringify(schema);
}

/* =====================================================================
   FULL-SCREEN INVITATION OPENER — seal breaks, card parts, world opens
   ===================================================================== */
function initInviteOpener() {
  const overlay = qs("#invite-overlay");
  const openBtn = qs("#open-btn");
  const hint = qs("#invite-hint");
  if (!overlay || !openBtn) return;

  if (isRsvpEditLink()) {
    state.opened = true;
    revealSite({ immediate: true });
    return;
  }

  // Press "Open": the seal breaks and the flap folds, then we hand off to the
  // cinematic entry video, which fades into the site.
  const open = () => {
    if (state.opened) return;
    state.opened = true;

    playBellChime();
    petalBurst(innerWidth / 2, innerHeight * 0.5, 40);
    overlay.dataset.stage = "opening";
    openBtn.disabled = true;
    if (hint) hint.textContent = "";

    const toVideo = reduced() ? 120 : 900;
    window.setTimeout(() => {
      petalRain(reduced() ? 0.4 : 3);
      document.body.classList.add("invite-armed"); // dismiss the envelope overlay
      playEntryVideo();
    }, toVideo);
  };

  openBtn.addEventListener("click", open);
}

/* The entry video bridges the opened card and the site reveal.
   We try to play entry.mp4; if it can't play (autoplay blocked, missing,
   reduced motion), we fall back straight to revealing the site. */
function playEntryVideo() {
  const cinema = qs("#entry-cinema");
  const video = qs("#entry-video");
  const skip = qs("#entry-skip");

  if (!cinema || !video || reduced()) {
    revealSite();
    return;
  }

  let finished = false;
  const finish = () => {
    if (finished) return;
    finished = true;
    // Fade the video to black, then swap in the site underneath.
    document.body.classList.add("entry-fading");
    window.setTimeout(() => {
      document.body.classList.remove("entry-playing", "entry-fading");
      cinema.setAttribute("aria-hidden", "true");
      try { video.pause(); } catch (e) { /* noop */ }
      revealSite();
    }, 700);
  };

  cinema.setAttribute("aria-hidden", "false");
  document.body.classList.add("entry-playing");
  video.addEventListener("ended", finish, { once: true });
  video.addEventListener("error", finish, { once: true });
  skip?.addEventListener("click", finish);

  // Safety net: if "ended" never fires (stall, codec quirk), advance anyway.
  // Cap to the clip duration + buffer once metadata is known, else a flat 12s.
  let guard = window.setTimeout(finish, 12000);
  video.addEventListener("loadedmetadata", () => {
    if (finished || !Number.isFinite(video.duration)) return;
    window.clearTimeout(guard);
    guard = window.setTimeout(finish, video.duration * 1000 + 1500);
  }, { once: true });

  try {
    video.currentTime = 0;
    const played = video.play();
    if (played && typeof played.catch === "function") {
      played.catch(() => finish()); // autoplay blocked → skip to the site
    }
  } catch (error) {
    finish();
  }
}

function revealSite({ immediate = false } = {}) {
  document.body.classList.remove("pre-open");
  document.body.classList.add("invite-open");
  if (immediate) {
    document.body.classList.add("invite-armed");
    document.body.classList.remove("entry-playing", "entry-fading");
    const cinema = qs("#entry-cinema");
    const video = qs("#entry-video");
    if (cinema) cinema.setAttribute("aria-hidden", "true");
    try { video?.pause(); } catch (error) { /* noop */ }
  }
  const experience = qs("#experience");
  if (experience) experience.setAttribute("aria-hidden", "false");
  initPremiumEnhancements();

  // The page just became scrollable. Re-check what's in view now, and keep
  // re-checking for a couple of seconds while layout settles (fonts, images).
  revealInView();
  let polls = 0;
  const poll = window.setInterval(() => {
    revealInView();
    if (++polls > 12) window.clearInterval(poll); // ~3s of safety polling
  }, 250);

  // Absolute failsafe: never leave content invisible. If the scroll-reveal
  // mechanism is suppressed (e.g. Lenis intercepting native scroll events),
  // reveal everything outright a few seconds after the site opens.
  window.setTimeout(revealAll, 3500);

  const overlay = qs("#invite-overlay");
  if (immediate) {
    if (overlay) overlay.style.display = "none";
  } else {
    window.setTimeout(() => overlay && (overlay.style.display = "none"), 1000);
  }
}

function initCalendarActions() {
  qs("[data-calendar-all]")?.addEventListener("click", () => downloadIcs("all"));
}

function initCountdown() {
  const countdown = qs("#countdown");
  if (!countdown) return;

  const firstEvent = state.data.events
    .map((event) => new Date(event.start))
    .filter((date) => Number.isFinite(date.getTime()))
    .sort((a, b) => a - b)[0];
  const target = firstEvent || new Date(`${state.data.date}T09:30:00-07:00`);
  const parts = {
    days: qs("#countdown-days"),
    hours: qs("#countdown-hours"),
    minutes: qs("#countdown-minutes"),
    seconds: qs("#countdown-seconds")
  };

  const update = () => {
    const remaining = Math.max(0, target.getTime() - Date.now());
    const totalSeconds = Math.floor(remaining / 1000);
    const values = {
      days: Math.floor(totalSeconds / 86400),
      hours: Math.floor((totalSeconds % 86400) / 3600),
      minutes: Math.floor((totalSeconds % 3600) / 60),
      seconds: totalSeconds % 60
    };

    Object.entries(values).forEach(([key, value]) => {
      if (parts[key]) parts[key].textContent = String(value).padStart(2, "0");
    });

    if (remaining === 0) countdown.setAttribute("aria-label", "The wedding celebration has begun");
  };

  update();
  window.setInterval(update, 1000);
}

/* =====================================================================
   AMBIENT PETAL CANVAS (always animating)
   ===================================================================== */
function initPetalCanvas() {
  const canvas = qs("#petal-canvas");
  const ctx = canvas.getContext("2d");
  const dpr = Math.min(window.devicePixelRatio || 1, 2);
  let driftClock = 0;

  const resize = () => {
    canvas.width = Math.floor(innerWidth * dpr);
    canvas.height = Math.floor(innerHeight * dpr);
    canvas.style.width = `${innerWidth}px`;
    canvas.style.height = `${innerHeight}px`;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  };
  window.addEventListener("resize", resize, { passive: true });
  resize();

  const draw = () => {
    ctx.clearRect(0, 0, innerWidth, innerHeight);

    // Gentle ambient drift once the world is open — never fully static.
    if (state.opened && !reduced()) {
      driftClock += 1;
      if (driftClock % 240 === 0 && state.petals.length < 12) {
        petalBurst(Math.random() * innerWidth, -16, 1, true);
      }
    }

    state.petals = state.petals.filter((petal) => petal.life > 0 && petal.y < innerHeight + 80);
    state.petals.forEach((petal) => {
      petal.life -= 1;
      petal.x += petal.vx + Math.sin(petal.life * 0.05) * 0.6;
      petal.y += petal.vy;
      petal.rotation += petal.spin;
      ctx.save();
      ctx.translate(petal.x, petal.y);
      ctx.rotate(petal.rotation);
      ctx.fillStyle = petal.color;
      ctx.globalAlpha = Math.max(0, Math.min(1, petal.life / 80)) * (petal.ambient ? 0.7 : 1);
      ctx.beginPath();
      ctx.ellipse(0, 0, petal.size * 0.55, petal.size, 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.restore();
    });
    requestAnimationFrame(draw);
  };
  draw();
}

function petalBurst(x = innerWidth / 2, y = innerHeight / 2, count = 24, ambient = false) {
  if (reduced()) return;
  const colors = [palette.blush, palette.marigold, palette.goldBright, palette.cream, palette.rose];
  for (let i = 0; i < count && state.petals.length < 160; i += 1) {
    const angle = ambient ? Math.PI / 2 + (Math.random() - 0.5) : Math.random() * Math.PI * 2;
    const power = ambient ? 0.4 + Math.random() * 0.8 : 1.2 + Math.random() * 3.8;
    state.petals.push({
      x, y,
      vx: Math.cos(angle) * power,
      vy: ambient ? 0.6 + Math.random() * 0.8 : Math.sin(angle) * power + 1.2,
      size: 5 + Math.random() * 9,
      rotation: Math.random() * Math.PI,
      spin: -0.08 + Math.random() * 0.16,
      color: colors[Math.floor(Math.random() * colors.length)],
      life: ambient ? 220 + Math.random() * 120 : 70 + Math.random() * 50,
      ambient
    });
  }
}

function petalRain(seconds = 3) {
  if (reduced()) return;
  const started = performance.now();
  const drop = () => {
    for (let i = 0; i < 6 && state.petals.length < 160; i += 1) petalBurst(Math.random() * innerWidth, -20, 2);
    if (performance.now() - started < seconds * 1000) requestAnimationFrame(drop);
  };
  drop();
}

/* =====================================================================
   REVEALS
   ===================================================================== */
let revealObserver = null;
function initReveals() {
  // Opt into hide-then-reveal only now that JS is running and can guarantee a
  // reveal. (CSS keeps content visible until this class is present.)
  document.documentElement.classList.add("js-reveal");

  revealObserver = new IntersectionObserver(
    (entries) => {
      entries.forEach((entry) => {
        if (entry.isIntersecting) {
          entry.target.classList.add("is-visible");
          revealObserver.unobserve(entry.target);
        }
      });
    },
    // threshold 0 = reveal as soon as any pixel enters. The old 0.14 threshold
    // never triggered for elements taller than ~85% of the viewport (e.g. the
    // big event cards), which left them stuck invisible.
    { threshold: 0, rootMargin: "0px 0px -8% 0px" }
  );
  observeReveals(document);

  // Belt-and-braces: also reveal anything already in view on scroll, in case the
  // observer's first callback is missed during the intro/video handoff.
  window.addEventListener("scroll", revealInView, { passive: true });
}

function observeReveals(root) {
  if (!revealObserver) return;
  qsa("[data-reveal]:not(.is-visible)", root).forEach((el) => revealObserver.observe(el));
}

function revealInView() {
  qsa("[data-reveal]:not(.is-visible)").forEach((el) => {
    const rect = el.getBoundingClientRect();
    // Reveal anything whose top has entered the lower viewport, OR that is
    // already straddling/above the fold (tall cards, items scrolled past).
    if (rect.top < innerHeight && rect.bottom > 0) el.classList.add("is-visible");
  });
}

// Failsafe — reveal every remaining element no matter where it sits.
function revealAll() {
  qsa("[data-reveal]:not(.is-visible)").forEach((el) => el.classList.add("is-visible"));
}

/* =====================================================================
   CHAPTER NAVIGATION
   ===================================================================== */
function initChapterNav() {
  const nav = qs("#chapter-nav");
  const toggle = qs("#chapter-toggle");
  const panel = qs("#chapter-panel");
  const closeButton = qs("#chapter-close");
  const current = qs("#chapter-current");
  if (!nav || !toggle || !panel || !current) return;

  const links = qsa(".chapter-links a", nav);
  const chapters = links
    .map((link) => ({
      link,
      label: link.dataset.chapterLabel,
      section: qs(link.getAttribute("href"))
    }))
    .filter((chapter) => chapter.section);

  const setOpen = (open) => {
    nav.classList.toggle("is-open", open);
    document.body.classList.toggle("chapter-nav-open", open);
    toggle.setAttribute("aria-expanded", String(open));
    panel.setAttribute("aria-hidden", String(!open));
  };

  const updateCurrent = () => {
    const marker = window.scrollY + innerHeight * 0.32;
    let active = chapters[0];
    chapters.forEach((chapter) => {
      if (
        chapter.section.offsetTop <= marker
        && (!active || chapter.section.offsetTop >= active.section.offsetTop)
      ) {
        active = chapter;
      }
    });
    if (!active) return;
    current.textContent = active.label;
    chapters.forEach((chapter) => {
      if (chapter === active) chapter.link.setAttribute("aria-current", "location");
      else chapter.link.removeAttribute("aria-current");
    });
  };

  let ticking = false;
  const queueUpdate = () => {
    if (ticking) return;
    ticking = true;
    requestAnimationFrame(() => {
      updateCurrent();
      ticking = false;
    });
  };

  toggle.addEventListener("click", () => setOpen(!nav.classList.contains("is-open")));
  closeButton?.addEventListener("click", () => {
    setOpen(false);
    toggle.focus();
  });
  links.forEach((link) => link.addEventListener("click", () => setOpen(false)));
  document.addEventListener("pointerdown", (event) => {
    if (nav.classList.contains("is-open") && !nav.contains(event.target)) setOpen(false);
  });
  document.addEventListener("keydown", (event) => {
    if (event.key !== "Escape" || !nav.classList.contains("is-open")) return;
    setOpen(false);
    toggle.focus();
  });
  window.addEventListener("scroll", queueUpdate, { passive: true });
  updateCurrent();
}

/* =====================================================================
   PARALLAX + scroll progress
   ===================================================================== */
function initParallax() {
  let ticking = false;
  const layers = qsa("[data-speed]");
  const hero = qs("#hero");

  const update = () => {
    const scrollTop = window.scrollY || document.documentElement.scrollTop;
    const max = document.documentElement.scrollHeight - innerHeight;
    const progress = max > 0 ? scrollTop / max : 0;
    document.documentElement.style.setProperty("--scroll-progress", progress.toFixed(3));
    if (hero) {
      const revealGameAt = Math.max(120, hero.offsetHeight - innerHeight * 0.25);
      document.body.classList.toggle("hero-active", scrollTop < revealGameAt);
    }

    layers.forEach((layer) => {
      const speed = Number(layer.dataset.speed);
      const rect = layer.getBoundingClientRect();
      const offset = (rect.top + rect.height / 2 - innerHeight / 2) * speed * -0.4;
      layer.style.transform = `translate3d(0, ${offset.toFixed(1)}px, 0)`;
    });
    ticking = false;
  };

  window.addEventListener("scroll", () => {
    if (!ticking) { requestAnimationFrame(update); ticking = true; }
  }, { passive: true });
  update();
}

/* =====================================================================
   PREMIUM ENHANCEMENTS — GSAP scrub + Lenis smooth scroll
   ===================================================================== */
async function initPremiumEnhancements() {
  if (reduced()) return;

  if (window.gsap && window.ScrollTrigger) {
    const { gsap, ScrollTrigger } = window;
    gsap.registerPlugin(ScrollTrigger);

    // Scrub headings and kickers as each act enters.
    gsap.utils.toArray(".act-heading, .split-copy, .procession-copy").forEach((block) => {
      gsap.from(block.querySelectorAll("h2, .kicker, p, .lineage-detail"), {
        y: 40, opacity: 0, duration: 0.9, ease: "power3.out", stagger: 0.08,
        scrollTrigger: { trigger: block, start: "top 82%", once: true }
      });
    });

    // Photographic acts get their scroll parallax from the [data-speed]
    // container handler in initParallax(); the inner <img> keeps its own
    // ambient Ken-Burns drift via CSS, so the two never fight over transform.

    // Hero name letters draw upward on load. clearProps so a missed/aborted
    // tween can never strand a letter at opacity 0 (the names must stay visible).
    gsap.from(".couple-names .name span", {
      yPercent: 120, opacity: 0, duration: 0.9, ease: "power4.out", stagger: 0.04, delay: 0.2,
      clearProps: "transform,opacity"
    });

    // NOTE: event cards are revealed by the [data-reveal] IntersectionObserver
    // (see initReveals). We must NOT also animate them with gsap.from(opacity)
    // here — gsap writes an inline opacity:0 that outranks the .is-visible class,
    // which would leave the cards stuck invisible if the ScrollTrigger misfires.
  }

  try {
    const module = await import("https://cdn.jsdelivr.net/npm/lenis@1.3.13/+esm");
    const Lenis = module.default || module.Lenis;
    if (!Lenis) return;
    const lenis = new Lenis({ duration: 1.1, smoothWheel: true, touchMultiplier: 1.4, lerp: 0.1 });
    state.lenis = lenis;
    const raf = (time) => { lenis.raf(time); requestAnimationFrame(raf); };
    requestAnimationFrame(raf);
    if (window.ScrollTrigger) lenis.on("scroll", window.ScrollTrigger.update);
    // Lenis can swallow native scroll events, which would starve the reveal
    // observer/fallback — so drive reveals directly off Lenis's own scroll.
    lenis.on("scroll", revealInView);
    // Anchor links route through Lenis for smooth in-page jumps.
    qsa('a[href^="#"]').forEach((link) => {
      link.addEventListener("click", (event) => {
        const target = qs(link.getAttribute("href"));
        if (target) { event.preventDefault(); lenis.scrollTo(target, { offset: 0 }); }
      });
    });
  } catch (error) {
    // Smooth scroll is a progressive enhancement; native scroll remains.
  }
}

/* =====================================================================
   MOTION INTERACTIONS — magnetic buttons + tilt cards (pointer devices)
   ===================================================================== */
function initMotionInteractions(root = document) {
  qsa(".btn", root).forEach((button) => {
    if (button.dataset.boundMagnet) return;
    button.dataset.boundMagnet = "true";
    button.addEventListener("pointermove", (event) => {
      if (reduced() || event.pointerType === "touch") return;
      const rect = button.getBoundingClientRect();
      const x = event.clientX - rect.left - rect.width / 2;
      const y = event.clientY - rect.top - rect.height / 2;
      button.style.setProperty("--mag-x", `${Math.max(-18, Math.min(18, x * 0.22))}px`);
      button.style.setProperty("--mag-y", `${Math.max(-18, Math.min(18, y * 0.22))}px`);
    });
    button.addEventListener("pointerleave", () => {
      button.style.setProperty("--mag-x", "0px");
      button.style.setProperty("--mag-y", "0px");
    });
  });

  qsa(".tilt-card", root).forEach((card) => {
    if (card.dataset.boundTilt) return;
    card.dataset.boundTilt = "true";
    card.addEventListener("pointermove", (event) => {
      if (reduced() || event.pointerType === "touch") return;
      const rect = card.getBoundingClientRect();
      const x = (event.clientX - rect.left) / rect.width;
      const y = (event.clientY - rect.top) / rect.height;
      card.style.setProperty("--tilt-y", `${(x - 0.5) * 8}deg`);
      card.style.setProperty("--tilt-x", `${(0.5 - y) * 7}deg`);
    });
    card.addEventListener("pointerleave", () => {
      card.style.setProperty("--tilt-x", "0deg");
      card.style.setProperty("--tilt-y", "0deg");
    });
  });
}

function initGlobalInteractions() {
  if (initGlobalInteractions.bound) return;
  initGlobalInteractions.bound = true;

  const cursor = qs(".cursor-dot");
  window.addEventListener("pointermove", (event) => {
    if (event.pointerType === "touch") return;
    cursor.style.transform = `translate(${event.clientX}px, ${event.clientY}px) translate(-50%, -50%)`;
  }, { passive: true });

  const ampersand = qs(".ampersand");
  if (ampersand) {
    const bloom = () => {
      const rect = ampersand.getBoundingClientRect();
      petalBurst(rect.left + rect.width / 2, rect.top + rect.height / 2, 20);
    };
    ampersand.addEventListener("mouseenter", bloom);
    ampersand.addEventListener("focus", bloom);
  }

}

/* =====================================================================
   KOLAM BUILDER — genuinely hidden gallery until solved
   ===================================================================== */
function initKolamBuilder() {
  const svg = qs("#kolam-svg");
  if (!svg) return;
  const dotsGroup = qs("#kolam-dots");
  const linesGroup = qs("#kolam-lines");
  const guideGroup = qs("#kolam-guide");
  const progress = qs("#kolam-progress");
  const positions = [
    [80, 80], [160, 80], [240, 80],
    [80, 160], [160, 160], [240, 160],
    [80, 240], [160, 240], [240, 240]
  ];
  const target = [0, 1, 2, 4, 6, 7, 8, 4, 0, 3, 6, 4, 2, 5, 8];
  let path = [];
  let drawing = false;
  let lastHintAt = 0;

  drawKolamGuide(target, positions, guideGroup);

  positions.forEach(([x, y], index) => {
    const dot = document.createElementNS("http://www.w3.org/2000/svg", "circle");
    dot.setAttribute("cx", x);
    dot.setAttribute("cy", y);
    dot.setAttribute("r", "12");
    dot.setAttribute("class", "kolam-dot");
    dot.setAttribute("data-dot", index);
    dotsGroup.append(dot);
  });

  const syncDots = () => {
    const nextDot = target[path.length];
    qsa(".kolam-dot", dotsGroup).forEach((dot) => {
      const index = Number(dot.dataset.dot);
      dot.classList.toggle("active", path.includes(index));
      dot.classList.toggle("next", index === nextDot);
    });
    if (progress) {
      progress.textContent = `${Math.max(0, path.length - 1)} / ${target.length - 1} lines`;
    }
  };

  const addDot = (index) => {
    if (index === null || path[path.length - 1] === index) return;
    const expected = target[path.length];
    if (index !== expected) {
      const now = performance.now();
      if (now - lastHintAt > 1200) {
        showToast(path.length ? "Follow the glowing dot to finish the kolam." : "Start with the glowing dot.");
        lastHintAt = now;
      }
      return;
    }
    path.push(index);
    drawKolamPath(path, positions, linesGroup);
    syncDots();
    if (samePath(path, target)) unlockKolam();
  };

  const nearestDot = (event) => {
    const point = svg.createSVGPoint();
    point.x = event.clientX;
    point.y = event.clientY;
    const svgPoint = point.matrixTransform(svg.getScreenCTM().inverse());
    let best = null;
    let bestDistance = Infinity;
    positions.forEach(([x, y], index) => {
      const distance = Math.hypot(svgPoint.x - x, svgPoint.y - y);
      if (distance < bestDistance) { bestDistance = distance; best = index; }
    });
    return bestDistance < 48 ? best : null;
  };

  svg.addEventListener("pointerdown", (event) => {
    drawing = true;
    svg.setPointerCapture(event.pointerId);
    addDot(nearestDot(event));
  });
  svg.addEventListener("pointermove", (event) => { if (drawing) addDot(nearestDot(event)); });
  svg.addEventListener("pointerup", () => {
    drawing = false;
    if (path.length > 1 && path.length < target.length) {
      showToast("Nice start - keep tracing the glowing dot.");
    }
  });

  qs("#kolam-reset").addEventListener("click", () => {
    path = [];
    drawKolamPath(path, positions, linesGroup);
    syncDots();
  });

  qs("#kolam-solve").addEventListener("click", () => {
    path = [...target];
    drawKolamPath(path, positions, linesGroup);
    syncDots();
    unlockKolam();
  });

  if (state.kolamUnlocked) {
    path = [...target];
    drawKolamPath(path, positions, linesGroup);
  }
  syncDots();
}

function drawKolamGuide(path, positions, group) {
  if (!group) return;
  group.innerHTML = "";
  const guide = document.createElementNS("http://www.w3.org/2000/svg", "polyline");
  guide.setAttribute("points", path.map((index) => positions[index].join(",")).join(" "));
  guide.setAttribute("class", "kolam-guide-line");
  group.append(guide);

  [[160, 112, 34, 82, 0], [160, 208, 34, 82, 0], [112, 160, 34, 82, 90], [208, 160, 34, 82, 90]].forEach(([cx, cy, rx, ry, rotate]) => {
    const petal = document.createElementNS("http://www.w3.org/2000/svg", "ellipse");
    petal.setAttribute("cx", cx);
    petal.setAttribute("cy", cy);
    petal.setAttribute("rx", rx);
    petal.setAttribute("ry", ry);
    petal.setAttribute("transform", `rotate(${rotate} ${cx} ${cy})`);
    petal.setAttribute("class", "kolam-guide-petal");
    group.append(petal);
  });
}

function drawKolamPath(path, positions, group) {
  group.innerHTML = "";
  if (path.length < 2) return;
  const polyline = document.createElementNS("http://www.w3.org/2000/svg", "polyline");
  polyline.setAttribute("points", path.map((index) => positions[index].join(",")).join(" "));
  polyline.setAttribute("class", "kolam-line");
  group.append(polyline);
}

function samePath(a, b) {
  return a.length === b.length && a.every((value, index) => value === b[index]);
}

function unlockKolam() {
  if (!state.kolamUnlocked) {
    showToast("Hidden gallery unlocked. RSVP code GOLDENGARLAND saved.");
    petalRain(3);
  }
  state.kolamUnlocked = true;
  localStorage.setItem("akshwinKolamUnlocked", "true");
  qs("#rsvp-code").value = "GOLDENGARLAND";
  syncHiddenGallery();
}

function syncHiddenGallery() {
  const gallery = qs("#hidden-gallery");
  if (!gallery) return;
  const locked = qs("#gallery-locked");
  const revealed = qs("#gallery-revealed");
  if (state.kolamUnlocked) {
    gallery.classList.remove("is-locked");
    gallery.classList.add("is-unlocked");
    if (locked) locked.hidden = true;
    if (revealed) revealed.hidden = false;
  } else {
    gallery.classList.add("is-locked");
    gallery.classList.remove("is-unlocked");
    if (locked) locked.hidden = false;
    if (revealed) revealed.hidden = true;
  }
}

/* =====================================================================
   MARIGOLD CATCH
   ===================================================================== */
function initMarigoldCatch() {
  const dialog = qs("#game-dialog");
  const startButton = qs("#game-start");
  const accessibleWinButton = qs("#game-accessible-win");
  const canvas = qs("#game-canvas");
  const ctx = canvas.getContext("2d");
  const scoreEl = qs("#game-score");
  const timeEl = qs("#game-time");
  const note = qs("#secret-note");
  const actions = qs(".game-dialog-actions", dialog);
  let running = false;
  let score = 0;
  let timeLeft = 30;
  let playerX = canvas.width / 2;
  let petals = [];
  let lastDrop = 0;
  let startedAt = 0;

  if (state.marigoldUnlocked) {
    note.classList.add("show");
    ensureWallpaperButton();
  }

  const openGame = () => {
    if (typeof dialog.showModal === "function") dialog.showModal();
    else dialog.setAttribute("open", "");
    dialog.scrollTop = 0;
    drawGame();
  };
  qsa("[data-open-game]").forEach((btn) => btn.addEventListener("click", openGame));
  dialog.addEventListener("close", () => { running = false; });

  startButton.addEventListener("click", () => {
    running = true; score = 0; timeLeft = 30; petals = [];
    startedAt = performance.now();
    scoreEl.textContent = "0 caught";
    timeEl.textContent = "30s";
    requestAnimationFrame(gameLoop);
  });

  accessibleWinButton.addEventListener("click", unlockMarigold);

  canvas.addEventListener("pointermove", (event) => {
    const rect = canvas.getBoundingClientRect();
    playerX = ((event.clientX - rect.left) / rect.width) * canvas.width;
  });

  canvas.addEventListener("keydown", (event) => {
    if (event.key === "ArrowLeft") { event.preventDefault(); playerX = Math.max(44, playerX - 34); drawGame(); }
    if (event.key === "ArrowRight") { event.preventDefault(); playerX = Math.min(canvas.width - 44, playerX + 34); drawGame(); }
  });

  function gameLoop(now) {
    if (!running) return;
    const elapsed = (now - startedAt) / 1000;
    timeLeft = Math.max(0, 30 - Math.floor(elapsed));
    timeEl.textContent = `${timeLeft}s`;

    if (now - lastDrop > 420) {
      petals.push({ x: 28 + Math.random() * (canvas.width - 56), y: -20, vy: 2 + Math.random() * 2.4, size: 12 + Math.random() * 10, spin: Math.random() * Math.PI });
      lastDrop = now;
    }

    petals.forEach((petal) => {
      petal.y += petal.vy;
      petal.spin += 0.08;
      if (petal.y > canvas.height - 66 && Math.abs(petal.x - playerX) < 46 && !petal.caught) {
        petal.caught = true;
        score += 1;
        scoreEl.textContent = `${score} caught`;
        petalBurst(innerWidth - 80, innerHeight - 60, 5);
      }
    });
    petals = petals.filter((petal) => !petal.caught && petal.y < canvas.height + 30);

    drawGame();

    if (score >= 20) { running = false; unlockMarigold(); return; }
    if (timeLeft <= 0) { running = false; showToast(score >= 20 ? "Marigold wallpaper unlocked." : "So close. Try again for 20 petals."); return; }
    requestAnimationFrame(gameLoop);
  }

  function drawGame() {
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    const gradient = ctx.createLinearGradient(0, 0, 0, canvas.height);
    gradient.addColorStop(0, palette.cream);
    gradient.addColorStop(1, "rgba(110,123,87,0.28)");
    ctx.fillStyle = gradient;
    ctx.fillRect(0, 0, canvas.width, canvas.height);

    ctx.fillStyle = "rgba(46,59,40,0.14)";
    for (let i = 0; i < 9; i += 1) {
      ctx.beginPath();
      ctx.arc(36 + i * 46, canvas.height - 36, 34, 0, Math.PI * 2);
      ctx.fill();
    }

    petals.forEach((petal) => {
      ctx.save();
      ctx.translate(petal.x, petal.y);
      ctx.rotate(petal.spin);
      ctx.fillStyle = Math.random() > 0.45 ? palette.marigold : palette.blush;
      ctx.beginPath();
      ctx.ellipse(0, 0, petal.size * 0.55, petal.size, 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.restore();
    });

    ctx.fillStyle = palette.gold;
    ctx.beginPath();
    ctx.roundRect(playerX - 44, canvas.height - 46, 88, 18, 8);
    ctx.fill();
    ctx.fillStyle = palette.deepSage;
    ctx.font = "16px serif";
    ctx.fillText("A&A", playerX - 14, canvas.height - 54);
  }

  function unlockMarigold() {
    state.marigoldUnlocked = true;
    localStorage.setItem("akshwinMarigoldUnlocked", "true");
    note.classList.add("show");
    showToast("Secret note and wallpaper unlocked.");
    petalRain(4);
    ensureWallpaperButton();
  }

  function ensureWallpaperButton() {
    let download = qs("#wallpaper-download");
    if (!download) {
      download = document.createElement("button");
      download.id = "wallpaper-download";
      download.type = "button";
      download.className = "btn primary";
      download.textContent = "Download Wallpaper";
      (actions || note).append(download);
      download.addEventListener("click", downloadWallpaper);
      initMotionInteractions(dialog);
    }
  }
}

/* =====================================================================
   EASTER EGGS
   ===================================================================== */
function initEasterEggs() {
  const konami = ["ArrowUp", "ArrowUp", "ArrowDown", "ArrowDown", "ArrowLeft", "ArrowRight", "ArrowLeft", "ArrowRight", "b", "a"];
  let konamiIndex = 0;
  let typed = "";

  window.addEventListener("keydown", (event) => {
    const key = event.key.length === 1 ? event.key.toLowerCase() : event.key;
    const expected = konami[konamiIndex];
    if (key === expected || event.key === expected) {
      konamiIndex += 1;
      if (konamiIndex === konami.length) {
        petalRain(10);
        showToast("Family blessings: may joy arrive from every direction.");
        konamiIndex = 0;
      }
    } else {
      konamiIndex = 0;
    }

    if (event.key.length === 1) {
      typed = (typed + event.key).slice(-7).toUpperCase();
      if (typed === "AKSHATA") {
        document.body.classList.add("akshata-glow");
        showToast("Garden gate coordinates: jasmine left, marigold right.");
        window.setTimeout(() => document.body.classList.remove("akshata-glow"), 2800);
      }
    }
  });
}

/* =====================================================================
   RSVP
   ===================================================================== */
function initRSVP() {
  const form = qs("#rsvp-form");
  const lookupInput = qs("#rsvp-lookup-phone");
  const lookupCountry = qs("#rsvp-lookup-country");
  const lookupButton = qs("#rsvp-lookup-button");
  const lookupBody = qs("#rsvp-lookup-body");
  const lookupShell = qs(".rsvp-lookup", form);
  const lookupCompact = qs(".rsvp-lookup-compact", form);
  const lookupTitle = qs("#rsvp-lookup-title");
  const lookupNote = qs("#rsvp-lookup-note");
  const showLookupButton = qs("#rsvp-show-lookup");
  const status = qs("#rsvp-status");
  const summary = qs("#rsvp-summary");
  const confirmation = qs("#rsvp-confirmation");
  const eventsFieldset = qs(".rsvp-events-fieldset", form);
  const roomFieldset = qs(".room-request-fieldset", form);
  const submitButton = qs("#rsvp-submit");
  let loadedPhone = "";
  const getRecordPhone = (record) => record.phone || record.whatsapp || "";
  form.dataset.editing = "true";

  const syncLookupShell = () => {
    if (!lookupShell) return;
    const hasCompact = lookupCompact && !lookupCompact.hidden;
    const hasBody = lookupBody && !lookupBody.hidden;
    const hasStatus = Boolean(status?.textContent.trim());
    const hasSummary = summary && !summary.hidden && summary.childNodes.length > 0;
    lookupShell.hidden = !(hasCompact || hasBody || hasStatus || hasSummary);
  };

  const setStatus = (message, tone = "") => {
    status.textContent = message;
    if (tone) status.dataset.tone = tone;
    else delete status.dataset.tone;
    syncLookupShell();
  };

  const setMode = (mode) => {
    form.dataset.rsvpMode = mode;
    submitButton.textContent = mode === "update" ? "Update RSVP" : "Send RSVP";
  };

  const clearSummary = () => {
    summary.hidden = true;
    summary.replaceChildren();
    syncLookupShell();
  };

  const clearConfirmation = () => {
    if (confirmation.hidden) return;
    confirmation.hidden = true;
    confirmation.replaceChildren();
  };

  const setEditing = (editing) => {
    form.dataset.editing = String(editing);
  };

  const setLookupOpen = (open) => {
    if (!lookupBody || !showLookupButton) return;
    lookupBody.hidden = !open;
    showLookupButton.textContent = open
      ? "Hide Lookup"
      : loadedPhone
        ? "Retrieve another RSVP"
        : "Retrieve RSVP";
    showLookupButton.setAttribute("aria-expanded", String(open));
    syncLookupShell();
  };

  const setLookupAvailable = (available, variant = loadedPhone ? "another" : "initial") => {
    if (!showLookupButton || !lookupCompact) return;
    const another = variant === "another";
    if (lookupTitle) lookupTitle.textContent = another ? "Need a different RSVP?" : "Already replied?";
    if (lookupNote) {
      lookupNote.textContent = another
        ? "Retrieve another RSVP only if you need to switch to a different phone number."
        : "Enter the same phone number to retrieve and edit your RSVP.";
    }
    lookupCompact.hidden = !available;
    showLookupButton.hidden = !available;
    if (!available) setLookupOpen(false);
    else setLookupOpen(false);
    syncLookupShell();
  };

  const getResponseStatus = (record) => {
    const attending = Array.isArray(record.attending) ? record.attending : [];
    return record.rsvpStatus === "declined" || attending.length === 0 ? "declined" : "attending";
  };

  const setAttendanceState = (value) => {
    const declined = value === "declined";
    eventsFieldset.dataset.disabled = String(declined);
    if (roomFieldset) roomFieldset.dataset.disabled = String(declined);
    qsa('input[name="events"]', eventsFieldset).forEach((checkbox) => {
      checkbox.disabled = declined;
      if (declined) checkbox.checked = false;
    });
  };

  const applyPhoneToForm = (value) => {
    const parsed = parseStoredPhone(value);
    const countryField = form.elements.namedItem("countryCode");
    if (countryField) countryField.value = parsed.countryCode;
    form.elements.namedItem("phone").value = parsed.local;
  };

  const applyPhoneToLookup = (value) => {
    const parsed = parseStoredPhone(value);
    lookupCountry.value = parsed.countryCode;
    lookupInput.value = parsed.local;
  };

  const rememberPhone = (value) => {
    const normalized = normalizeRsvpPhone(value);
    if (normalized) localStorage.setItem(RSVP_PHONE_STORAGE_KEY, normalized);
  };

  const forgetPhone = () => {
    localStorage.removeItem(RSVP_PHONE_STORAGE_KEY);
  };

  const renderSummary = (record) => {
    const attending = normalizeRsvpEvents(record.attending);
    const responseStatus = getResponseStatus(record);
    const eventTitles = attending
      .map((id) => state.data.events.find((event) => event.id === id)?.title || id)
      .join(", ");
    const guestCount = Number(record.guestCount || 1);
    const updatedAt = record.updatedAt || record.submittedAt || "";
    const heading = document.createElement("strong");
    heading.textContent = responseStatus === "attending"
      ? "You are celebrating with us"
      : "We will miss you";

    const details = document.createElement("span");
    details.textContent = responseStatus === "attending"
      ? `${record.name || "Guest"} · ${guestCount} guest${guestCount === 1 ? "" : "s"} · ${eventTitles}`
      : `${record.name || "Guest"} · Unable to attend`;

    const meta = document.createElement("small");
    const updatedDate = updatedAt ? new Date(updatedAt) : null;
    meta.textContent = updatedDate && !Number.isNaN(updatedDate.getTime())
      ? `Last updated ${updatedDate.toLocaleString()}`
      : "Loaded from the RSVP sheet";

    const editButton = document.createElement("button");
    editButton.className = "btn primary rsvp-edit-toggle";
    editButton.type = "button";
    editButton.textContent = "Edit RSVP";
    editButton.addEventListener("click", () => {
      clearConfirmation();
      setEditing(true);
      setLookupAvailable(true, "another");
      setStatus("Edit your RSVP below, then select Update RSVP.", "success");
      form.elements.namedItem("name")?.focus();
    });

    summary.replaceChildren(heading, details, meta, editButton);
    summary.hidden = false;
    syncLookupShell();
  };

  const renderConfirmation = (record, action = "saved") => {
    const attending = normalizeRsvpEvents(record.attending);
    const responseStatus = getResponseStatus(record);
    const eventTitles = attending
      .map((id) => state.data.events.find((event) => event.id === id)?.title || id)
      .join(", ");
    const guestCount = Number(record.guestCount || 1);

    const kicker = document.createElement("div");
    kicker.className = "kicker";
    const kickerText = document.createElement("span");
    kickerText.textContent = action === "updated" ? "RSVP updated" : "RSVP received";
    kicker.append(kickerText);

    const heading = document.createElement("h3");
    heading.textContent = responseStatus === "attending"
      ? "We cannot wait to celebrate together!"
      : "We would have loved to have you with us.";

    const message = document.createElement("p");
    message.textContent = responseStatus === "attending"
      ? "Your place is saved. We are already looking forward to the laughter, blessings, music, and memories we will share."
      : "Thank you for letting us know. You will be missed, and we will carry your love and good wishes with us throughout the celebration.";

    const details = document.createElement("dl");
    const rows = [
      ["Name", record.name || "Guest"],
      ["Response", responseStatus === "attending" ? "Joyfully attending" : "Unable to attend"]
    ];
    if (responseStatus === "attending") {
      rows.push(
        ["Guests", String(guestCount)],
        ["Events", eventTitles || "Wedding celebration"]
      );
    }
    rows.forEach(([label, value]) => {
      const term = document.createElement("dt");
      term.textContent = label;
      const description = document.createElement("dd");
      description.textContent = value;
      details.append(term, description);
    });

    const actions = document.createElement("div");
    actions.className = "confirmation-actions";
    const editButton = document.createElement("button");
    editButton.className = "btn primary";
    editButton.type = "button";
    editButton.textContent = "Edit RSVP";
    editButton.addEventListener("click", () => {
      clearConfirmation();
      setEditing(true);
      setLookupAvailable(true, "another");
      setStatus("Edit your RSVP below, then select Update RSVP.", "success");
      form.elements.namedItem("name")?.focus();
    });
    const calendarButton = document.createElement("button");
    calendarButton.className = "btn primary";
    calendarButton.type = "button";
    calendarButton.textContent = "Add to Calendar";
    calendarButton.addEventListener("click", () => downloadIcs("all"));
    actions.append(editButton, calendarButton);

    confirmation.replaceChildren(kicker, heading, message, details, actions);
    confirmation.hidden = false;
    confirmation.scrollIntoView({ behavior: "smooth", block: "center" });
  };

  const populateForm = (record) => {
    const setValue = (name, value) => {
      const field = form.elements.namedItem(name);
      if (field) field.value = value == null ? "" : value;
    };
    const attending = normalizeRsvpEvents(record.attending);
    const responseStatus = getResponseStatus(record);

    setValue("name", record.name);
    applyPhoneToForm(getRecordPhone(record));
    setValue("email", record.email);
    setValue("side", record.side);
    setValue("guestCount", record.guestCount || 1);
    setValue("song", record.song);
    const responseField = form.elements.namedItem("rsvpStatus");
    if (responseField) responseField.value = responseStatus;
    qsa('input[name="events"]', form).forEach((checkbox) => {
      checkbox.checked = attending.includes(checkbox.value);
    });
    setAttendanceState(responseStatus);
    qs("#rsvp-code").value = record.code || (state.kolamUnlocked ? "GOLDENGARLAND" : "");
  };

  const loadRsvp = async ({ auto = false } = {}) => {
    const phoneValidation = validatePhoneNumber(lookupCountry.value, lookupInput.value);
    const phone = phoneValidation.value;
    const normalized = normalizeRsvpPhone(phone);
    lookupInput.setCustomValidity(phoneValidation.error);
    if (phoneValidation.error) {
      if (!auto) {
        lookupInput.reportValidity();
        setStatus(phoneValidation.error, "error");
      }
      return;
    }

    lookupButton.disabled = true;
    setStatus(auto ? "Checking your saved RSVP..." : "Looking for your RSVP...");
    try {
      let result;
      try {
        result = await fetchRsvpJson(`/api/rsvp?phone=${encodeURIComponent(normalized)}`);
      } catch (error) {
        if (!shouldUseLocalRsvp(error)) throw error;
        result = findLocalRsvp(normalized);
      }

      if (!result.found) {
        if (!auto) {
          form.reset();
          applyPhoneToLookup(phone);
          applyPhoneToForm(phone);
          qs("#rsvp-code").value = state.kolamUnlocked ? "GOLDENGARLAND" : "";
          setAttendanceState("attending");
          setStatus("No RSVP found. Complete the form to create one.", "error");
        } else {
          setStatus("");
        }
        loadedPhone = "";
        forgetPhone();
        clearSummary();
        clearConfirmation();
        setMode("create");
        setEditing(true);
        setLookupAvailable(true, "initial");
        return;
      }

      populateForm(result.record);
      clearConfirmation();
      loadedPhone = normalized;
      applyPhoneToLookup(getRecordPhone(result.record) || normalized);
      rememberPhone(getRecordPhone(result.record) || normalized);
      renderSummary(result.record);
      setMode("update");
      setEditing(false);
      setLookupAvailable(false);
      setStatus(auto ? "Your saved RSVP was loaded." : "RSVP loaded. Make any changes and select Update RSVP.", "success");
    } catch (error) {
      if (!auto) setStatus(error.message || "The RSVP could not be retrieved.", "error");
      else setStatus("");
    } finally {
      lookupButton.disabled = false;
    }
  };

  lookupButton.addEventListener("click", loadRsvp);
  showLookupButton?.addEventListener("click", () => {
    const willOpen = lookupBody?.hidden !== false;
    setLookupOpen(willOpen);
    if (willOpen) lookupInput.focus();
  });
  lookupInput.addEventListener("keydown", (event) => {
    if (event.key === "Enter") {
      event.preventDefault();
      loadRsvp();
    }
  });
  lookupInput.addEventListener("input", () => lookupInput.setCustomValidity(""));
  lookupCountry.addEventListener("change", () => lookupInput.setCustomValidity(""));

  const params = new URLSearchParams(window.location.search);
  if (params.get("rsvp") === "edit") {
    const phoneFromLink = params.get("phone") || "";
    if (phoneFromLink) applyPhoneToLookup(phoneFromLink);
    setLookupAvailable(true, phoneFromLink ? "another" : "initial");
    setLookupOpen(true);
    window.setTimeout(() => {
      qs("#rsvp")?.scrollIntoView({ behavior: "smooth", block: "start" });
      if (phoneFromLink) loadRsvp();
      else lookupInput.focus();
    }, 350);
  }

  qsa('input[name="rsvpStatus"]', form).forEach((radio) => {
    radio.addEventListener("change", () => {
      setAttendanceState(radio.value);
      clearConfirmation();
    });
  });

  form.addEventListener("submit", async (event) => {
    event.preventDefault();
    const formData = new FormData(form);
    const rsvpStatus = String(formData.get("rsvpStatus") || "attending");
    const attending = rsvpStatus === "declined" ? [] : normalizeRsvpEvents(formData.getAll("events"));
    const roomNights = [];
    const phoneValidation = validatePhoneNumber(
      String(formData.get("countryCode") || "+1"),
      String(formData.get("phone") || "")
    );
    const email = String(formData.get("email") || "").trim();
    const phoneField = form.elements.namedItem("phone");
    const emailField = form.elements.namedItem("email");
    phoneField.setCustomValidity(phoneValidation.error);
    emailField.setCustomValidity(isValidEmail(email) ? "" : "Please enter a valid email address.");
    if (phoneValidation.error) {
      phoneField.reportValidity();
      showToast(phoneValidation.error);
      return;
    }
    if (!isValidEmail(email)) {
      emailField.reportValidity();
      showToast("Please enter a valid email address.");
      return;
    }
    const payload = {
      name: String(formData.get("name") || "").trim(),
      phone: phoneValidation.value,
      email,
      side: String(formData.get("side") || ""),
      rsvpStatus,
      attending,
      roomNights,
      guestCount: Number(formData.get("guestCount") || 1),
      song: String(formData.get("song") || "").trim(),
      code: String(formData.get("code") || ""),
      originalPhone: loadedPhone,
      submittedAt: new Date().toISOString()
    };

    const missing = [];
    if (!payload.name) missing.push("name");
    if (!phoneValidation.value) missing.push("phone number");
    if (!payload.email) missing.push("email");
    if (!payload.side) missing.push("side");
    if (rsvpStatus === "attending" && !attending.length) missing.push("at least one event");
    if (missing.length) { showToast(`Please add ${missing.join(", ")}.`); return; }
    try {
      submitButton.disabled = true;
      setStatus(form.dataset.rsvpMode === "update" ? "Updating your RSVP..." : "Saving your RSVP...");
      let result;
      try {
        result = await fetchRsvpJson("/api/rsvp", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(payload)
        });
      } catch (error) {
        if (!shouldUseLocalRsvp(error)) throw error;
        result = saveLocalRsvp(payload);
      }

      const action = result.action === "updated" ? "updated" : "saved";
      const record = { ...payload, ...(result.record || {}) };
      populateForm(record);
      loadedPhone = normalizeRsvpPhone(getRecordPhone(record) || payload.phone);
      applyPhoneToLookup(getRecordPhone(record) || payload.phone);
      rememberPhone(getRecordPhone(record) || payload.phone);
      clearSummary();
      setMode("update");
      setEditing(false);
      setLookupAvailable(false);
      setStatus("");
      showToast(`RSVP ${action}.`);
      if (rsvpStatus === "attending") petalRain(7);
      renderConfirmation(record, action);
    } catch (error) {
      setStatus(error.message || "RSVP could not be saved.", "error");
      showToast("RSVP could not be saved. Please try again.");
    } finally {
      submitButton.disabled = false;
    }
  });

  const openedFromEmailEdit = isRsvpEditLink();
  const rememberedPhone = localStorage.getItem(RSVP_PHONE_STORAGE_KEY);
  if (rememberedPhone && !openedFromEmailEdit) {
    applyPhoneToLookup(rememberedPhone);
    window.setTimeout(() => loadRsvp({ auto: true }), 250);
  } else {
    clearSummary();
  }
  setLookupAvailable(true, "initial");
  setLookupOpen(false);
  setAttendanceState("attending");
  form.elements.namedItem("phone").addEventListener("input", (event) => event.target.setCustomValidity(""));
  form.elements.namedItem("countryCode").addEventListener("change", () => form.elements.namedItem("phone").setCustomValidity(""));
  form.elements.namedItem("email").addEventListener("input", (event) => event.target.setCustomValidity(""));
}

function normalizeRsvpPhone(value) {
  return String(value || "").replace(/\D/g, "");
}

function parseStoredPhone(value) {
  const raw = String(value || "").trim();
  const digits = normalizeRsvpPhone(raw);
  if (raw.startsWith("+91") || (digits.length > 10 && digits.startsWith("91"))) {
    return { countryCode: "+91", local: digits.replace(/^91/, "") };
  }
  if (raw.startsWith("+1") || (digits.length > 10 && digits.startsWith("1"))) {
    return { countryCode: "+1", local: digits.replace(/^1/, "") };
  }
  return { countryCode: "+1", local: digits };
}

function validatePhoneNumber(countryCode, localValue) {
  let digits = normalizeRsvpPhone(localValue);
  if (countryCode === "+1") {
    if (digits.length === 11 && digits.startsWith("1")) digits = digits.slice(1);
    if (digits.length !== 10) {
      return { value: "", error: "Please enter a 10-digit US phone number." };
    }
    if (digits[0] === "0" || digits[0] === "1") {
      return { value: "", error: "US phone numbers cannot start with 0 or 1." };
    }
    return { value: `+1${digits}`, error: "" };
  }

  if (countryCode === "+91") {
    if (digits.length === 12 && digits.startsWith("91")) digits = digits.slice(2);
    if (digits.length !== 10) {
      return { value: "", error: "Please enter a 10-digit India phone number." };
    }
    if (!/^[6-9]/.test(digits)) {
      return { value: "", error: "India mobile numbers should start with 6, 7, 8, or 9." };
    }
    return { value: `+91${digits}`, error: "" };
  }

  return { value: "", error: "Please choose USA +1 or India +91." };
}

function isValidEmail(value) {
  const email = String(value || "").trim();
  return email.length <= 160 && /^[A-Za-z0-9.!#$%&'*+/=?^_`{|}~-]+@[A-Za-z0-9](?:[A-Za-z0-9-]{0,61}[A-Za-z0-9])?(?:\.[A-Za-z0-9](?:[A-Za-z0-9-]{0,61}[A-Za-z0-9])?)+$/.test(email);
}

async function fetchRsvpJson(url, options) {
  const response = await fetch(url, options);
  let result;
  try {
    result = await response.json();
  } catch (error) {
    result = {};
  }

  if (!response.ok || result.ok === false) {
    const requestError = new Error(result.error || "The RSVP service is unavailable.");
    requestError.code = result.code || "";
    requestError.status = response.status;
    throw requestError;
  }
  return result;
}

function shouldUseLocalRsvp(error) {
  const localHosts = new Set(["localhost", "127.0.0.1", "::1"]);
  return error.code === "endpoint_not_configured" || localHosts.has(location.hostname);
}

function readLocalRsvps() {
  try {
    const saved = JSON.parse(localStorage.getItem("akshwinRsvps") || "[]");
    return Array.isArray(saved) ? saved : [];
  } catch (error) {
    return [];
  }
}

function findLocalRsvp(phone) {
  const saved = readLocalRsvps();
  const record = [...saved].reverse().find((item) => normalizeRsvpPhone(item.phone || item.whatsapp) === phone);
  return record ? { ok: true, found: true, record } : { ok: true, found: false };
}

function saveLocalRsvp(payload) {
  const saved = readLocalRsvps();
  const currentPhone = normalizeRsvpPhone(payload.phone);
  const originalPhone = normalizeRsvpPhone(payload.originalPhone) || currentPhone;
  const index = saved.findIndex((item) => normalizeRsvpPhone(item.phone || item.whatsapp) === originalPhone);
  const duplicateIndex = saved.findIndex((item) => normalizeRsvpPhone(item.phone || item.whatsapp) === currentPhone);
  if (duplicateIndex >= 0 && duplicateIndex !== index) {
    throw new Error("That phone number is already linked to another RSVP.");
  }
  const now = new Date().toISOString();
  let record;
  let action;

  if (index >= 0) {
    action = "updated";
    record = {
      ...saved[index],
      ...payload,
      submittedAt: saved[index].submittedAt || payload.submittedAt,
      updatedAt: now
    };
    saved[index] = record;
  } else {
    action = "created";
    record = { ...payload, updatedAt: now };
    saved.push(record);
  }

  localStorage.setItem("akshwinRsvps", JSON.stringify(saved));
  return { ok: true, action, record };
}

/* =====================================================================
   SHARING + CALENDAR + WALLPAPER
   ===================================================================== */
function initSharing() {
  const shareText = () => {
    const siteUrl = state.data.siteUrl || location.href;
    const shareUrl = siteUrl.endsWith("/") ? siteUrl : `${siteUrl}/`;
    return [
      "We’re so excited to share our wedding invitation with you 🥰",
      "",
      "Everything is here — our story, wedding timeline, venue details, and RSVP:",
      "",
      shareUrl,
      "",
      "Please take a look and RSVP on the website when you get a chance 🙏",
      "",
      "We’re really counting on having you there with us. Your presence would make the day even more special ❤️"
    ].join("\n");
  };

  qs("#share-whatsapp").addEventListener("click", () => {
    window.open(`https://wa.me/?text=${encodeURIComponent(shareText())}`, "_blank", "noopener");
  });
  qs("#share-telegram").addEventListener("click", () => {
    window.open(`https://t.me/share/url?url=${encodeURIComponent(state.data.siteUrl || location.href)}&text=${encodeURIComponent(shareText())}`, "_blank", "noopener");
  });
  qs("#download-qr").addEventListener("click", () => {
    const qrUrl = `https://api.qrserver.com/v1/create-qr-code/?size=900x900&format=png&data=${encodeURIComponent(shareText())}`;
    const link = document.createElement("a");
    link.href = qrUrl;
    link.download = "akshwin-together-invitation-qr.png";
    link.target = "_blank";
    link.rel = "noreferrer";
    link.click();
    showToast("Invitation QR PNG opened for download.");
  });
}

function downloadIcs(eventId) {
  const selectedEvents = eventId === "all" ? state.data.events : [state.data.events.find((item) => item.id === eventId) || state.data.events[0]];
  if (!selectedEvents.length || !selectedEvents[0]) return;
  const calendarName = eventId === "all" ? "all-events" : selectedEvents[0].id;
  const eventBlocks = selectedEvents
    .map((event) => {
      const title = `Ashwin & Akshata - ${event.title}`;
      return [
        "BEGIN:VEVENT",
        `UID:${event.id}@akshwin-together`,
        `DTSTAMP:${toIcsDate(new Date())}`,
        `DTSTART:${toIcsDate(new Date(event.start))}`,
        `DTEND:${toIcsDate(new Date(event.end))}`,
        `SUMMARY:${escapeIcs(title)}`,
        `DESCRIPTION:${escapeIcs(`${event.note}. Suggested attire: ${event.dressCode}`)}`,
        `LOCATION:${escapeIcs(`${state.data.venue.name}, ${state.data.venue.address}`)}`,
        "END:VEVENT"
      ].join("\r\n");
    })
    .join("\r\n");

  const body = ["BEGIN:VCALENDAR", "VERSION:2.0", "PRODID:-//AkshwinTogether//Wedding//EN", eventBlocks, "END:VCALENDAR"].join("\r\n");
  const blob = new Blob([body], { type: "text/calendar;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = `${calendarName}-ashwin-akshata.ics`;
  link.click();
  URL.revokeObjectURL(url);
  showToast(eventId === "all" ? "All wedding events calendar file downloaded." : `${selectedEvents[0].title} calendar file downloaded.`);
}

async function downloadWallpaper() {
  const canvas = document.createElement("canvas");
  canvas.width = 1080;
  canvas.height = 1920;
  const ctx = canvas.getContext("2d");

  const [procession, logo, marigold] = await Promise.all([
    loadCanvasImage("assets/images/procession.png"),
    loadCanvasImage("logo.png"),
    loadCanvasImage("assets/svg/marigold-cluster.svg")
  ]);

  const base = ctx.createLinearGradient(0, 0, canvas.width, canvas.height);
  base.addColorStop(0, palette.cream);
  base.addColorStop(0.45, palette.ivory);
  base.addColorStop(1, "#E9D9B4");
  ctx.fillStyle = base;
  ctx.fillRect(0, 0, canvas.width, canvas.height);

  if (procession) {
    drawCoverImage(ctx, procession, 0, 0, canvas.width, canvas.height);
    ctx.fillStyle = "rgba(252, 247, 236, 0.72)";
    ctx.fillRect(0, 0, canvas.width, canvas.height);
  }

  const glow = ctx.createRadialGradient(540, 720, 90, 540, 720, 760);
  glow.addColorStop(0, "rgba(228,196,116,0.52)");
  glow.addColorStop(0.42, "rgba(216,161,142,0.20)");
  glow.addColorStop(1, "rgba(110,123,87,0)");
  ctx.fillStyle = glow;
  ctx.fillRect(0, 0, canvas.width, canvas.height);

  ctx.strokeStyle = "rgba(185, 138, 56, 0.76)";
  ctx.lineWidth = 7;
  ctx.strokeRect(74, 74, canvas.width - 148, canvas.height - 148);
  ctx.strokeStyle = "rgba(122, 46, 42, 0.22)";
  ctx.lineWidth = 2;
  ctx.strokeRect(104, 104, canvas.width - 208, canvas.height - 208);

  for (let i = 0; i < 7; i += 1) {
    const y = 156 + i * 260;
    ctx.strokeStyle = i % 2 === 0 ? "rgba(185, 138, 56, 0.18)" : "rgba(122, 46, 42, 0.12)";
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.moveTo(120, y);
    ctx.bezierCurveTo(330, y + 70, 750, y - 70, 960, y);
    ctx.stroke();
  }

  if (marigold) {
    drawDecorImage(ctx, marigold, 46, 42, 190, -10, 0.9);
    drawDecorImage(ctx, marigold, 846, 42, 190, 12, 0.9);
    drawDecorImage(ctx, marigold, 54, 1680, 210, -18, 0.86);
    drawDecorImage(ctx, marigold, 814, 1680, 210, 16, 0.86);
  }

  if (logo) {
    ctx.save();
    ctx.beginPath();
    ctx.arc(540, 510, 160, 0, Math.PI * 2);
    ctx.fillStyle = "rgba(252, 247, 236, 0.86)";
    ctx.fill();
    ctx.strokeStyle = "rgba(185, 138, 56, 0.58)";
    ctx.lineWidth = 5;
    ctx.stroke();
    ctx.clip();
    ctx.drawImage(logo, 404, 374, 272, 272);
    ctx.restore();
  }

  ctx.fillStyle = palette.deepSage;
  ctx.font = "92px Georgia";
  ctx.textAlign = "center";
  ctx.fillText("Ashwin & Akshata", canvas.width / 2, 810);
  ctx.fillStyle = palette.gold;
  ctx.font = "48px Georgia";
  ctx.fillText("August 16, 2026", canvas.width / 2, 900);
  ctx.fillStyle = palette.maroon;
  ctx.font = "42px Georgia";
  ctx.fillText("Trillium Nursery Farm", canvas.width / 2, 980);

  ctx.fillStyle = "rgba(46, 59, 40, 0.82)";
  ctx.font = "38px Georgia";
  wrapCanvasText(ctx, "May this little garden bring the wedding joy back to your phone screen.", canvas.width / 2, 1134, 700, 54);

  ctx.fillStyle = palette.deepSage;
  ctx.font = "34px Georgia";
  ctx.fillText("#AkshwinTogether", canvas.width / 2, 1488);

  for (let i = 0; i < 90; i += 1) {
    ctx.save();
    ctx.translate(Math.random() * canvas.width, Math.random() * canvas.height);
    ctx.rotate(Math.random() * Math.PI);
    ctx.fillStyle = i % 3 === 0 ? palette.blush : i % 3 === 1 ? palette.marigold : palette.gold;
    ctx.globalAlpha = 0.46;
    ctx.beginPath();
    ctx.ellipse(0, 0, 9, 20, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
  }

  const link = document.createElement("a");
  link.download = "akshwin-together-wallpaper.png";
  link.href = canvas.toDataURL("image/png");
  link.click();
}

function loadCanvasImage(src) {
  return new Promise((resolve) => {
    const image = new Image();
    image.onload = () => resolve(image);
    image.onerror = () => resolve(null);
    image.src = src;
  });
}

function drawCoverImage(ctx, image, x, y, width, height) {
  const scale = Math.max(width / image.naturalWidth, height / image.naturalHeight);
  const drawWidth = image.naturalWidth * scale;
  const drawHeight = image.naturalHeight * scale;
  ctx.drawImage(image, x + (width - drawWidth) / 2, y + (height - drawHeight) / 2, drawWidth, drawHeight);
}

function drawDecorImage(ctx, image, x, y, size, rotation, alpha) {
  ctx.save();
  ctx.globalAlpha = alpha;
  ctx.translate(x + size / 2, y + size / 2);
  ctx.rotate((rotation * Math.PI) / 180);
  ctx.drawImage(image, -size / 2, -size / 2, size, size);
  ctx.restore();
}

function wrapCanvasText(ctx, text, x, y, maxWidth, lineHeight) {
  const words = text.split(" ");
  let line = "";
  words.forEach((word, index) => {
    const testLine = `${line}${word} `;
    if (ctx.measureText(testLine).width > maxWidth && index > 0) {
      ctx.fillText(line.trim(), x, y);
      line = `${word} `;
      y += lineHeight;
    } else {
      line = testLine;
    }
  });
  ctx.fillText(line.trim(), x, y);
}

/* =====================================================================
   UTILITIES
   ===================================================================== */
function copyText(text, origin) {
  const value = text || "";
  const finish = () => {
    const rect = origin.getBoundingClientRect();
    petalBurst(rect.left + rect.width / 2, rect.top + rect.height / 2, 18);
    showToast("Copied.");
  };
  if (navigator.clipboard) navigator.clipboard.writeText(value).then(finish).catch(finish);
  else finish();
}

/* =====================================================================
   RINGABLE TEMPLE BELLS — tap to swing + chime + petals
   ===================================================================== */
function initTempleBells() {
  qsa(".temple-bell").forEach((bell) => {
    bell.addEventListener("click", async () => {
      // restart the swing animation cleanly even on rapid taps
      bell.classList.remove("is-ringing");
      void bell.offsetWidth; // reflow so the animation can replay
      bell.classList.add("is-ringing");
      bell.addEventListener("animationend", () => bell.classList.remove("is-ringing"), { once: true });

      await playBellChime();
      const rect = bell.getBoundingClientRect();
      petalBurst(rect.left + rect.width / 2, rect.top + rect.height, 10);
    });
  });
}

/* A resonant single bell strike with a couple of harmonics. */
async function playBellChime() {
  try {
    const AudioContext = window.AudioContext || window.webkitAudioContext;
    if (!AudioContext) return;
    state.audio = state.audio || new AudioContext();
    if (state.audio.state !== "running") await state.audio.resume();
    if (state.audio.state !== "running") return;

    const now = state.audio.currentTime + 0.015;
    // fundamental + inharmonic overtones give a bronze, bell-like timbre
    [
      { f: 587.33, g: 0.12, d: 1.8 },
      { f: 880.0, g: 0.07, d: 1.4 },
      { f: 1174.66, g: 0.045, d: 1.1 },
      { f: 1567.98, g: 0.03, d: 0.8 }
    ].forEach(({ f, g, d }) => {
      const osc = state.audio.createOscillator();
      const gain = state.audio.createGain();
      osc.frequency.value = f;
      osc.type = "sine";
      gain.gain.setValueAtTime(0.0001, now);
      gain.gain.exponentialRampToValueAtTime(g, now + 0.008);
      gain.gain.exponentialRampToValueAtTime(0.0001, now + d);
      osc.connect(gain).connect(state.audio.destination);
      osc.start(now);
      osc.stop(now + d + 0.1);
    });
  } catch (error) {
    // Audio is optional and may be blocked by browser settings.
  }
}

function showToast(message) {
  const toast = qs("#toast");
  toast.textContent = message;
  toast.classList.add("show");
  window.clearTimeout(showToast.timer);
  showToast.timer = window.setTimeout(() => toast.classList.remove("show"), 3200);
}

function formatVenueTime(date) {
  // The wedding is in Redmond, WA — all program times are Pacific.
  return new Intl.DateTimeFormat("en-US", { timeZone: "America/Los_Angeles", hour: "numeric", minute: "2-digit" }).format(date);
}

function formatLocalDateTime(date) {
  return new Intl.DateTimeFormat(undefined, { weekday: "short", month: "short", day: "numeric", hour: "numeric", minute: "2-digit", timeZoneName: "short" }).format(date);
}

function toIcsDate(date) {
  return date.toISOString().replace(/[-:]/g, "").replace(/\.\d{3}/, "");
}

function escapeIcs(text) {
  return String(text).replace(/\\/g, "\\\\").replace(/,/g, "\\,").replace(/;/g, "\\;").replace(/\n/g, "\\n");
}

function reduced() {
  return window.matchMedia("(prefers-reduced-motion: reduce)").matches;
}

function registerServiceWorker() {
  const localHosts = new Set(["localhost", "127.0.0.1", "::1"]);
  if ("serviceWorker" in navigator && location.protocol !== "file:" && !localHosts.has(location.hostname)) {
    navigator.serviceWorker.register("sw.js").catch(() => {});
  }
}
