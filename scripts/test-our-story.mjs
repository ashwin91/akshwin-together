import fs from "node:fs/promises";

const baseUrl = (process.argv[2] || "http://127.0.0.1:4173").replace(/\/$/, "");
const origin = new URL(baseUrl).origin;
const targets = await (await fetch("http://127.0.0.1:9222/json")).json();
const target = targets.find((item) => item.type === "page");
if (!target) throw new Error("No Chrome page target found");

const socket = new WebSocket(target.webSocketDebuggerUrl);
await new Promise((resolve, reject) => {
  socket.addEventListener("open", resolve, { once: true });
  socket.addEventListener("error", reject, { once: true });
});

let commandId = 0;
const pending = new Map();
socket.addEventListener("message", (event) => {
  const message = JSON.parse(event.data);
  if (!message.id || !pending.has(message.id)) return;
  const { resolve, reject } = pending.get(message.id);
  pending.delete(message.id);
  if (message.error) reject(new Error(message.error.message));
  else resolve(message.result);
});

const send = (method, params = {}) => new Promise((resolve, reject) => {
  const id = ++commandId;
  pending.set(id, { resolve, reject });
  socket.send(JSON.stringify({ id, method, params }));
});
const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
const evaluate = (expression, userGesture = false) => send("Runtime.evaluate", {
  expression,
  awaitPromise: true,
  returnByValue: true,
  userGesture
});
const capture = async (path) => {
  const result = await send("Page.captureScreenshot", {
    format: "png",
    fromSurface: true,
    captureBeyondViewport: false
  });
  await fs.writeFile(path, Buffer.from(result.data, "base64"));
};

await send("Page.enable");
await send("Runtime.enable");
await send("Network.enable");
await send("Network.setCacheDisabled", { cacheDisabled: true });
await send("Storage.clearDataForOrigin", {
  origin,
  storageTypes: "service_workers,cache_storage"
});
await send("Page.addScriptToEvaluateOnNewDocument", {
  source: `
    window.__storyTestErrors = [];
    window.addEventListener("error", (event) => {
      window.__storyTestErrors.push(String(event.error || event.message));
    });
    window.addEventListener("unhandledrejection", (event) => {
      window.__storyTestErrors.push(String(event.reason));
    });
  `
});

const devices = [
  { name: "phone-320x568", width: 320, height: 568, mobile: true },
  { name: "phone-390x844", width: 390, height: 844, mobile: true },
  { name: "phone-landscape-568x320", width: 568, height: 320, mobile: true },
  { name: "phone-landscape-844x390", width: 844, height: 390, mobile: true },
  { name: "tablet-768x1024", width: 768, height: 1024, mobile: true },
  { name: "tablet-landscape-1024x768", width: 1024, height: 768, mobile: true },
  { name: "desktop-1440x900", width: 1440, height: 900, mobile: false }
];

const report = [];
for (const device of devices) {
  await send("Emulation.setDeviceMetricsOverride", {
    width: device.width,
    height: device.height,
    deviceScaleFactor: 1,
    mobile: device.mobile
  });
  await send("Page.navigate", { url: `${baseUrl}/` });
  await wait(1200);
  await evaluate(`
    document.body.classList.remove("pre-open", "entry-playing", "entry-fading");
    document.body.classList.add("invite-open");
    document.querySelector("#experience")?.setAttribute("aria-hidden", "false");
    const overlay = document.querySelector("#invite-overlay");
    if (overlay) overlay.style.display = "none";
    const cinema = document.querySelector("#entry-cinema");
    if (cinema) cinema.style.display = "none";
  `);
  await wait(100);
  await evaluate(`
    document.documentElement.style.scrollBehavior = "auto";
    document.body.style.height = "auto";
    document.body.style.overflowY = "auto";
    const film = document.querySelector("#story-film");
    film?.scrollIntoView({ block: "center", behavior: "auto" });
  `);
  await wait(900);

  const before = await evaluate(`(() => {
    const section = document.querySelector("#story");
    const intro = document.querySelector(".story-intro");
    const film = document.querySelector("#story-film");
    const video = document.querySelector("#story-video");
    const play = document.querySelector("#story-play");
    const caption = film?.querySelector("figcaption");
    const rect = (element) => element?.getBoundingClientRect().toJSON();
    return {
      viewport: { width: innerWidth, height: innerHeight },
      section: rect(section),
      intro: rect(intro),
      film: rect(film),
      video: rect(video),
      play: rect(play),
      caption: rect(caption),
      heading: document.querySelector("#story-title")?.textContent.trim(),
      kicker: document.querySelector(".story-intro .kicker")?.textContent.trim(),
      navLabel: document.querySelector("#chapter-current")?.textContent.trim(),
      videoState: {
        readyState: video?.readyState,
        networkState: video?.networkState,
        duration: video?.duration,
        paused: video?.paused,
        controls: video?.controls,
        poster: video?.getAttribute("poster"),
        source: video?.currentSrc
      },
      overflow: {
        document: document.documentElement.scrollWidth - document.documentElement.clientWidth,
        story: section ? section.scrollWidth - section.clientWidth : null
      },
      storyViolations: section
        ? [...section.querySelectorAll("*")]
          .map((element) => ({ element, rect: element.getBoundingClientRect() }))
          .filter(({ rect: item }) => item.width > 0 && (item.left < -1 || item.right > innerWidth + 1))
          .map(({ element, rect: item }) => ({
            selector: element.id ? "#" + element.id : element.className || element.tagName,
            left: Math.round(item.left),
            right: Math.round(item.right),
            width: Math.round(item.width)
          }))
        : [],
      errors: window.__storyTestErrors
    };
  })()`);

  await capture(`/private/tmp/our-story-${device.name}-poster.png`);
  const playResult = await evaluate(`(async () => {
    document.querySelector("#story-play")?.click();
    await new Promise((resolve) => setTimeout(resolve, 1800));
    const video = document.querySelector("#story-video");
    return {
      paused: video?.paused,
      currentTime: video?.currentTime,
      readyState: video?.readyState,
      ended: video?.ended,
      startedClass: document.querySelector("#story-film")?.classList.contains("has-started"),
      errors: window.__storyTestErrors
    };
  })()`, true);
  await capture(`/private/tmp/our-story-${device.name}-playing.png`);

  report.push({
    device,
    before: before.result.value,
    playing: playResult.result.value
  });
}

await send("Emulation.setDeviceMetricsOverride", {
  width: 390,
  height: 844,
  deviceScaleFactor: 1,
  mobile: true,
  screenOrientation: { type: "portraitPrimary", angle: 0 }
});
await send("Page.navigate", { url: `${baseUrl}/` });
await wait(1200);
await evaluate(`
  document.body.classList.remove("pre-open", "entry-playing", "entry-fading");
  document.body.classList.add("invite-open");
  document.querySelector("#experience")?.setAttribute("aria-hidden", "false");
  const overlay = document.querySelector("#invite-overlay");
  if (overlay) overlay.style.display = "none";
  const cinema = document.querySelector("#entry-cinema");
  if (cinema) cinema.style.display = "none";
`);
await wait(100);
await evaluate(`
  document.documentElement.style.scrollBehavior = "auto";
  document.body.style.height = "auto";
  document.body.style.overflowY = "auto";
  const film = document.querySelector("#story-film");
  film?.scrollIntoView({ block: "center", behavior: "auto" });
  document.querySelector("#story-play")?.click();
`, true);
await wait(1400);
const rotationBefore = await evaluate(`(() => {
  const video = document.querySelector("#story-video");
  const film = document.querySelector("#story-film");
  return {
    viewport: { width: innerWidth, height: innerHeight },
    currentTime: video.currentTime,
    paused: video.paused,
    readyState: video.readyState,
    film: film.getBoundingClientRect().toJSON(),
    controls: video.controls,
    errors: window.__storyTestErrors
  };
})()`);
await send("Emulation.setDeviceMetricsOverride", {
  width: 844,
  height: 390,
  deviceScaleFactor: 1,
  mobile: true,
  screenOrientation: { type: "landscapePrimary", angle: 90 }
});
// CDP changes the viewport but does not emit the event sent by real mobile browsers.
await evaluate(`window.dispatchEvent(new Event("orientationchange"))`);
await wait(1200);
const rotationAfter = await evaluate(`(() => {
  const video = document.querySelector("#story-video");
  const film = document.querySelector("#story-film");
  const rect = film.getBoundingClientRect();
  return {
    viewport: { width: innerWidth, height: innerHeight },
    currentTime: video.currentTime,
    paused: video.paused,
    readyState: video.readyState,
    film: rect.toJSON(),
    controls: video.controls,
    documentOverflow: document.documentElement.scrollWidth - document.documentElement.clientWidth,
    filmVisible: rect.bottom > 0 && rect.top < innerHeight,
    playbackContinued: !video.paused && video.currentTime > ${rotationBefore.result.value.currentTime},
    errors: window.__storyTestErrors
  };
})()`);
await capture("/private/tmp/our-story-rotation-playing.png");
report.push({
  device: { name: "live-rotation-390x844-to-844x390" },
  before: rotationBefore.result.value,
  after: rotationAfter.result.value
});

await fs.writeFile(
  "/private/tmp/our-story-responsive-report.json",
  JSON.stringify(report, null, 2)
);
console.log(JSON.stringify(report, null, 2));
socket.close();
