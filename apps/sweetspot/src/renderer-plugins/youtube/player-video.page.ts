/** Present the existing video element without moving it out of YouTube's controller tree. */
const attribute = "data-sweetspot-skin-video";
let observer: MutationObserver | null = null;
const marked = new Set<Element>();
let togglePlayback: (() => unknown) | undefined;
let skinFullscreen: Element | null = null;
let pictureBorder: HTMLDivElement | null = null;
let videoControls: HTMLDivElement | null = null;
let controlsHideTimer: ReturnType<typeof setTimeout> | undefined;
function hideFullscreenControls() {
  clearTimeout(controlsHideTimer);
  controlsHideTimer = undefined;
  videoControls?.removeAttribute("data-visible");
}
function showFullscreenControls() {
  if (!document.fullscreenElement || !videoControls) return;
  hideFullscreenControls();
  videoControls.setAttribute("data-visible", "");
  controlsHideTimer = setTimeout(hideFullscreenControls, 2000);
}
function updateFullscreenControl() {
  hideFullscreenControls();
  const fullscreen = !!document.fullscreenElement;
  document.documentElement.toggleAttribute("data-sweetspot-video-fullscreen", fullscreen);
  const button = videoControls?.querySelector("button");
  if (button) {
    const label = fullscreen ? "Exit fullscreen" : "Enter fullscreen";
    button.setAttribute("aria-label", label);
    button.setAttribute("aria-pressed", String(fullscreen));
    const tooltip = videoControls?.querySelector("[role=tooltip]");
    if (tooltip) tooltip.textContent = label;
  }
}
function toggleVideoFullscreen() {
  if (document.fullscreenElement) {
    void document.exitFullscreen().catch((error) => console.error("Exit video fullscreen failed", error));
    return;
  }
  const video = document.querySelector("video");
  if (!video) return;
  // YouTube owns and can replace its controller during layout updates. Fullscreen
  // the stable document instead, keeping the original media and controls inside it.
  const surface = document.documentElement;
  skinFullscreen = surface;
  // Keep the button inside the fullscreen surface and request in the user gesture.
  void surface.requestFullscreen().catch((error) => {
    skinFullscreen = null;
    console.error("Video fullscreen failed", error);
  });
}
function updatePictureBorder() {
  if (!pictureBorder) return;
  const video = document.querySelector("video");
  if (!video?.videoWidth || !video.videoHeight || document.fullscreenElement) {
    pictureBorder.hidden = true;
    return;
  }
  // Reserve 3px around the picture plus 4px for Pop's offset ink shadow.
  const availableWidth = Math.max(1, innerWidth - 10);
  const availableHeight = Math.max(1, innerHeight - 10);
  const scale = Math.min(availableWidth / video.videoWidth, availableHeight / video.videoHeight);
  const width = video.videoWidth * scale, height = video.videoHeight * scale;
  pictureBorder.hidden = false;
  Object.assign(pictureBorder.style, {
    left: `${(availableWidth - width) / 2}px`, top: `${(availableHeight - height) / 2}px`,
    width: `${width + 6}px`, height: `${height + 6}px`,
  });
}
let cancelModePause: (() => void) | undefined;
/** Explicit playback commands take priority over a pending Song/Video transition. */
export function cancelSkinVideoModePause() {
  cancelModePause?.();
}
/** Match the display's physical resolution, with an HD floor for compact panes.
 * These dimensions belong to the controller only; the visible video still uses the pane viewport.
 * Leaving YouTube on Auto preserves its bandwidth adaptation and explicit user quality choices.
 */
function updateVideoQualitySize() {
  const root = document.documentElement;
  root.style.setProperty(
    "--sweetspot-video-quality-width",
    `${Math.max(1920, Math.round(window.screen.width * window.devicePixelRatio))}px`,
  );
  root.style.setProperty(
    "--sweetspot-video-quality-height",
    `${Math.max(1080, Math.round(window.screen.height * window.devicePixelRatio))}px`,
  );
}
function isSkinVideoClick(event: MouseEvent) {
  if (event.composedPath().some(node => node instanceof Element && node.closest("[data-sweetspot-video-controls]"))) return false;
  return (
    !!togglePlayback &&
    event.button === 0 &&
    // Programmatic Song/Video button clicks are mode changes, not pane gestures.
    (event.isTrusted ||
      (event.target instanceof Element && event.target.matches("video"))) &&
    document.documentElement.hasAttribute("data-sweetspot-skin-video-active") &&
    // The native view contains only the video pane. YouTube's overlay ancestors
    // and letterbox margins can receive a gesture instead of the video itself.
    !!document.querySelector("video")
  );
}
function interceptPointer(event: MouseEvent) {
  if (event.composedPath().some(node => node instanceof Element && node.closest("[data-sweetspot-video-controls]"))) {
    // Do not let YouTube's controller treat our button as a playback gesture.
    event.stopImmediatePropagation();
    return;
  }
  if (!isSkinVideoClick(event)) return;
  event.stopImmediatePropagation();
}
function clickVideo(event: MouseEvent) {
  if (!isSkinVideoClick(event)) return;
  event.preventDefault();
  event.stopImmediatePropagation();
  if (event.detail > 1) return;
  cancelSkinVideoModePause();
  Promise.resolve()
    .then(() => togglePlayback?.())
    .catch((error) => console.error("Video playback toggle failed", error));
}
function fullscreenKey(event: KeyboardEvent) {
  if (event.key === "Escape") videoControls?.removeAttribute("data-tooltip-open");
  if (event.key !== "Escape" || !skinFullscreen || document.fullscreenElement !== skinFullscreen)
    return;
  event.preventDefault();
  event.stopImmediatePropagation();
  void document
    .exitFullscreen()
    .catch((error) => console.error("Exit video fullscreen failed", error));
}
export function setSkinVideoPresentation(enabled: boolean, toggle?: () => unknown, pictureFrame = false) {
  hideFullscreenControls();
  window.removeEventListener("mousemove", showFullscreenControls);
  document.removeEventListener("mouseleave", hideFullscreenControls);
  document.removeEventListener("fullscreenchange", updateFullscreenControl);
  videoControls?.remove();
  videoControls = null;
  document.documentElement.toggleAttribute("data-sweetspot-picture-frame", enabled && pictureFrame);
  window.removeEventListener("resize", updatePictureBorder);
  document.removeEventListener("loadedmetadata", updatePictureBorder, true);
  document.removeEventListener("resize", updatePictureBorder, true);
  document.removeEventListener("fullscreenchange", updatePictureBorder);
  pictureBorder?.remove();
  pictureBorder = null;
  window.removeEventListener("resize", updateVideoQualitySize);
  observer?.disconnect();
  observer = null;
  window.removeEventListener("keydown", fullscreenKey, true);
  window.removeEventListener("click", clickVideo, true);
  window.removeEventListener("pointerdown", interceptPointer, true);
  window.removeEventListener("mousedown", interceptPointer, true);
  window.removeEventListener("mouseup", interceptPointer, true);
  togglePlayback = enabled ? toggle : undefined;
  if (togglePlayback) {
    window.addEventListener("keydown", fullscreenKey, true);
    window.addEventListener("click", clickVideo, true);
    window.addEventListener("pointerdown", interceptPointer, true);
    window.addEventListener("mousedown", interceptPointer, true);
    window.addEventListener("mouseup", interceptPointer, true);
  }

  for (const el of marked) el.removeAttribute(attribute);
  marked.clear();
  // Root scoping makes presentation reversible even during Chromium stylesheet cleanup.
  document.documentElement.toggleAttribute("data-sweetspot-skin-video-active", enabled);
  if (!enabled) {
    if (skinFullscreen && document.fullscreenElement === skinFullscreen)
      void document.exitFullscreen().catch(() => {});
    skinFullscreen = null;
    document.documentElement.removeAttribute("data-sweetspot-video-fullscreen");
    document.documentElement.style.removeProperty("--sweetspot-video-quality-width");
    document.documentElement.style.removeProperty("--sweetspot-video-quality-height");
    return { available: true };
  }
  updateVideoQualitySize();
  window.addEventListener("resize", updateVideoQualitySize);
  function mark() {
    const video = document.querySelector("video");
    if (!video) return;
    let el: Element | null = video;
    // Ancestors can be display:none even when the video itself has a size.
    while (el && el !== document.body) {
      el.setAttribute(attribute, el === video ? "media" : "ancestor");
      marked.add(el);
      el = el.parentElement;
    }
  }
  mark();
  videoControls = document.createElement("div");
  videoControls.setAttribute("data-sweetspot-video-controls", "");
  videoControls.setAttribute("role", "group");
  videoControls.setAttribute("aria-label", "Video controls");
  const fullscreenButton = document.createElement("button");
  fullscreenButton.type = "button";
  // Avoid the platform's native light button bezel, including before view CSS arrives.
  fullscreenButton.style.appearance = "none";
  fullscreenButton.style.background = "rgba(0, 0, 0, 0.5)";
  fullscreenButton.style.color = "white";
  // YouTube requires TrustedHTML for HTML sinks. Build the icon with DOM APIs
  // so opening the video also works under its Trusted Types policy.
  const fullscreenIcon = document.createElementNS("http://www.w3.org/2000/svg", "svg");
  fullscreenIcon.setAttribute("viewBox", "0 0 24 24");
  fullscreenIcon.setAttribute("width", "20");
  fullscreenIcon.setAttribute("height", "20");
  fullscreenIcon.setAttribute("aria-hidden", "true");
  const fullscreenPath = document.createElementNS("http://www.w3.org/2000/svg", "path");
  fullscreenPath.setAttribute("d", "M8 3H3v5m13-5h5v5M3 16v5h5m13-5v5h-5");
  fullscreenPath.setAttribute("fill", "none");
  fullscreenPath.setAttribute("stroke", "currentColor");
  fullscreenPath.setAttribute("stroke-width", "2");
  fullscreenPath.setAttribute("stroke-linecap", "round");
  fullscreenPath.setAttribute("stroke-linejoin", "round");
  fullscreenIcon.append(fullscreenPath);
  fullscreenButton.append(fullscreenIcon);
  fullscreenButton.addEventListener("click", event => {
    event.preventDefault();
    event.stopPropagation();
    toggleVideoFullscreen();
  });
  const fullscreenTooltip = document.createElement("span");
  fullscreenTooltip.id = "sweetspot-fullscreen-tooltip";
  fullscreenTooltip.setAttribute("role", "tooltip");
  fullscreenButton.setAttribute("aria-describedby", fullscreenTooltip.id);
  fullscreenButton.addEventListener("pointerenter", () => videoControls?.setAttribute("data-tooltip-open", ""));
  fullscreenButton.addEventListener("pointerleave", () => videoControls?.removeAttribute("data-tooltip-open"));
  fullscreenButton.addEventListener("focus", () => videoControls?.setAttribute("data-tooltip-open", ""));
  fullscreenButton.addEventListener("blur", () => videoControls?.removeAttribute("data-tooltip-open"));
  fullscreenButton.addEventListener("click", () => videoControls?.removeAttribute("data-tooltip-open"));
  videoControls.append(fullscreenButton, fullscreenTooltip);
  document.body.append(videoControls);
  document.addEventListener("fullscreenchange", updateFullscreenControl);
  window.addEventListener("mousemove", showFullscreenControls, { passive: true });
  document.addEventListener("mouseleave", hideFullscreenControls);
  updateFullscreenControl();
  if (pictureFrame) {
    pictureBorder = document.createElement("div");
    pictureBorder.setAttribute("data-sweetspot-video-frame", "");
    pictureBorder.setAttribute("aria-hidden", "true");
    document.body.append(pictureBorder);
    window.addEventListener("resize", updatePictureBorder);
    document.addEventListener("loadedmetadata", updatePictureBorder, true);
    document.addEventListener("resize", updatePictureBorder, true);
    document.addEventListener("fullscreenchange", updatePictureBorder);
    updatePictureBorder();
  }
  observer = new MutationObserver(() => { mark(); updatePictureBorder(); });
  observer.observe(document.body, { childList: true, subtree: true });
  return { available: !!document.querySelector("video") };
}
export function requestSkinVideoMode(
  enabled = true,
  playback?: { isPlaying: () => boolean; pause: () => void },
) {
  const toggle = document.querySelector("ytmusic-av-toggle");
  const button = toggle?.querySelector<HTMLElement>(
    enabled
      ? '.video-button, [video-mode], [aria-label="Video"]'
      : '.song-button, .audio-button, [audio-mode], [aria-label="Song"], [aria-label="Audio"]',
  );
  if (button && !button.hasAttribute("disabled") && button.getAttribute("aria-pressed") !== "true") {
    const paused = playback
      ? !playback.isPlaying()
      : document.querySelector("video")?.paused === true;
    cancelSkinVideoModePause();
    if (paused) {
      // YouTube's Song/Video switch can start the replacement media asynchronously.
      // Listen on the document so replacing the video element also preserves pause.
      const preservePause = (event?: Event) => {
        if (event && !(event.target instanceof HTMLMediaElement)) return;
        playback?.pause();
        document.querySelectorAll("video, audio").forEach((media) =>
          (media as HTMLMediaElement).pause(),
        );
      };
      const userPlaybackIntent = (event: Event) => {
        if (event.isTrusted) cancelSkinVideoModePause();
      };
      const timer = setTimeout(() => cancelSkinVideoModePause(), 5000);
      cancelModePause = () => {
        clearTimeout(timer);
        document.removeEventListener("play", preservePause, true);
        window.removeEventListener("pointerdown", userPlaybackIntent, true);
        window.removeEventListener("keydown", userPlaybackIntent, true);
        cancelModePause = undefined;
      };
      document.addEventListener("play", preservePause, true);
      window.addEventListener("pointerdown", userPlaybackIntent, true);
      window.addEventListener("keydown", userPlaybackIntent, true);
      button.click();
      preservePause();
    } else {
      button.click();
    }
  }
  return { available: !!button };
}
