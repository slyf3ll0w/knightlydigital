/*
 * WorkBench website forms — the embed loader.
 *
 *   <div data-workbench-form="your-slug" data-path="item-or-estimate/tool"></div><script src="https://workbenchfsm.com/embed.js" async></script>
 *
 * Turns every [data-workbench-form] placeholder into an iframe of
 * /embed/<slug>[/<path>], sizes it to the form (the frame posts
 * "jobflow:height"), and hands the form the host page's look (font, text
 * color, background, button color + roundness) as "workbench:style" so it
 * fits the site. data-match="off" keeps the saved look for that placement.
 * Safe to include more than once; placeholders added later are picked up
 * by calling window.WorkBenchEmbed.scan().
 */
(function () {
  "use strict";
  if (window.WorkBenchEmbed) {
    window.WorkBenchEmbed.scan();
    return;
  }

  var script = document.currentScript;
  if (!script) {
    var all = document.querySelectorAll('script[src*="/embed.js"]');
    script = all[all.length - 1];
  }
  var ORIGIN;
  try {
    ORIGIN = new URL(script.src, location.href).origin;
  } catch (e) {
    return;
  }

  var frames = []; // { iframe, el, match }

  // ── color helpers ──
  function parse(c) {
    var m = /^rgba?\(\s*([\d.]+)[\s,]+([\d.]+)[\s,]+([\d.]+)\s*(?:[,/]\s*([\d.]+)(%?))?\s*\)$/.exec(String(c || "").trim());
    if (!m) return null;
    var a = m[4] === undefined ? 1 : parseFloat(m[4]) / (m[5] ? 100 : 1);
    return { r: +m[1], g: +m[2], b: +m[3], a: a };
  }
  function lum(c) {
    function ch(v) {
      v = v / 255;
      return v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4);
    }
    return 0.2126 * ch(c.r) + 0.7152 * ch(c.g) + 0.0722 * ch(c.b);
  }
  // A brand color: opaque, saturated enough, not white/grey/near-black
  function colorful(c) {
    if (!c || c.a < 0.5) return false;
    var max = Math.max(c.r, c.g, c.b);
    var min = Math.min(c.r, c.g, c.b);
    if (max - min < 28) return false;
    var l = lum(c);
    return l > 0.01 && l < 0.85;
  }
  function visible(el) {
    if (!el.getClientRects().length) return false;
    var s = getComputedStyle(el);
    return s.visibility !== "hidden" && s.display !== "none" && parseFloat(s.opacity) > 0.2;
  }

  function background(el) {
    for (var n = el; n && n.nodeType === 1; n = n.parentElement) {
      var c = parse(getComputedStyle(n).backgroundColor);
      if (c && c.a >= 0.5) return getComputedStyle(n).backgroundColor;
    }
    return "rgb(255, 255, 255)";
  }

  function sample(el) {
    var host = el.parentElement || document.body;
    var hs = getComputedStyle(host);
    var style = {
      type: "workbench:style",
      font: hs.fontFamily,
      fontSize: hs.fontSize,
      color: hs.color,
      background: background(host),
    };
    var h = document.querySelector("h1, h2");
    if (h) style.headingFont = getComputedStyle(h).fontFamily;

    var cands = document.querySelectorAll('button, .btn, [class*="button"], [class*="btn"], input[type="submit"], a[class*="cta"]');
    var radiusFrom = null;
    for (var i = 0; i < cands.length && i < 60; i++) {
      var b = cands[i];
      if (el.contains(b) || !visible(b)) continue;
      var bs = getComputedStyle(b);
      if (!radiusFrom && parse(bs.backgroundColor) && parse(bs.backgroundColor).a >= 0.5) radiusFrom = bs;
      if (colorful(parse(bs.backgroundColor))) {
        style.accent = bs.backgroundColor;
        style.accentText = bs.color;
        radiusFrom = bs;
        break;
      }
      if (!style.accent && colorful(parse(bs.borderTopColor)) && parseFloat(bs.borderTopWidth) >= 1) {
        style.accent = bs.borderTopColor; // outline button: keep looking for a solid one
        if (!radiusFrom) radiusFrom = bs;
      }
    }
    if (!style.accent) {
      var links = document.querySelectorAll("a[href]");
      for (var j = 0; j < links.length && j < 60; j++) {
        if (el.contains(links[j]) || !visible(links[j])) continue;
        var lc = getComputedStyle(links[j]).color;
        if (colorful(parse(lc))) {
          style.accent = lc;
          break;
        }
      }
    }
    if (radiusFrom) style.radius = radiusFrom.borderTopLeftRadius;
    return style;
  }

  function post(f, msg) {
    if (f.iframe.contentWindow) f.iframe.contentWindow.postMessage(msg, ORIGIN);
  }
  function sendStyle(f) {
    if (f.match) post(f, sample(f.el));
    post(f, { type: "jobflow:page", href: location.href });
  }

  function mount(el) {
    if (el.getAttribute("data-workbench-ready")) return;
    var slug = (el.getAttribute("data-workbench-form") || "").replace(/[^a-zA-Z0-9_-]/g, "");
    if (!slug) return;
    el.setAttribute("data-workbench-ready", "1");
    var path = (el.getAttribute("data-path") || "")
      .split("/")
      .map(function (p) {
        return p.replace(/[^a-zA-Z0-9_-]/g, "");
      })
      .filter(Boolean)
      .join("/");
    var match = !/^(off|0|false|no)$/i.test(el.getAttribute("data-match") || "");
    var src = ORIGIN + "/embed/" + slug + (path ? "/" + path : "");
    if (match) {
      // Pick the form's theme up front from the site's ground (no light→dark flash)
      var g = parse(background(el.parentElement || document.body));
      src += "?theme=" + (g && lum(g) < 0.179 ? "dark" : "light");
    } else {
      src += "?match=0";
    }

    var f = document.createElement("iframe");
    f.src = src;
    f.title = el.getAttribute("data-title") || "Book online";
    f.setAttribute("loading", "lazy");
    f.setAttribute("allowtransparency", "true");
    f.style.cssText = "display:block;width:100%;border:0;height:640px;background:transparent;color-scheme:light;";
    var entry = { iframe: f, el: el, match: match };
    frames.push(entry);
    f.addEventListener("load", function () {
      sendStyle(entry);
    });
    el.appendChild(f);
  }

  function scan() {
    var els = document.querySelectorAll("[data-workbench-form]");
    for (var i = 0; i < els.length; i++) mount(els[i]);
  }

  window.addEventListener("message", function (e) {
    if (e.origin !== ORIGIN) return;
    var d = e.data;
    if (!d || typeof d !== "object") return;
    for (var i = 0; i < frames.length; i++) {
      var f = frames[i];
      if (e.source !== f.iframe.contentWindow) continue;
      if (d.type === "jobflow:height" && typeof d.height === "number" && d.height > 0) {
        f.iframe.style.height = Math.min(Math.ceil(d.height), 20000) + "px";
      } else if (d.type === "workbench:style-request") {
        sendStyle(f);
      }
      return;
    }
  });

  window.WorkBenchEmbed = { scan: scan };
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", scan);
  else scan();
})();
