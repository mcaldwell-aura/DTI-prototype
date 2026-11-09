#!/usr/bin/env node
// Usage: node extract-pages.js [input.html] [outDir]
const fs = require("fs");
const path = require("path");
const zlib = require("zlib");

const input = process.argv[2] || path.join(__dirname, "index.html");
const outDir = process.argv[3] || path.join(__dirname, "pages");
const html = fs.readFileSync(input, "utf8");

function readIsland(type) {
  const re = new RegExp(
    `<script[^>]*type="${type.replace(/\//g, "\\/")}"[^>]*>([\\s\\S]*?)<\\/script>`,
    "i",
  );
  const m = html.match(re);
  return m ? JSON.parse(m[1]) : null;
}

const manifest = readIsland("__bundler/manifest");
const pageOrder = readIsland("__bundler/page_order") || [];
if (!manifest) throw new Error("No __bundler/manifest found in " + input);
if (!pageOrder.length)
  throw new Error("No __bundler/page_order found in " + input);

function decode(entry) {
  const bytes = Buffer.from(entry.data, "base64");
  return (entry.compressed ? zlib.gunzipSync(bytes) : bytes).toString("utf8");
}

const pageLinks = {
  "Queue.dc.html": "02-start-a-test.html",
  "WalkIn.dc.html": "03-start-walk-in-test.html",
  "CheckIn.dc.html": "04-verify-customer.html",
  "PreTest.dc.html": "05-pre-test-checks.html",
  "RouteSelect.dc.html": "06-select-route.html",
  "ReportError.dc.html": "07-road-test.html",
  "Review.dc.html": "08-review-and-submit.html",
  "RouteMap.dc.html": "09-route-map.html",
  "PortalDashboard.dc.html": "10-dashboard.html",
  "PortalTestDetail.dc.html": "11-test-detail.html",
  "PortalUsers.dc.html": "12-users.html",
  "PortalRoutes.dc.html": "13-routes.html",
  "PortalDevices.dc.html": "14-devices-and-evidence.html",
  "PortalReports.dc.html": "15-reports.html",
};

function fitScreen(template, size, file) {
  if ((template.match(/<x-dc\b/gi) || []).length !== 1 || !size) {
    console.warn(
      `${file}: no clear screen root or design dimensions; not scaled`,
    );
    return template;
  }
  const { width, height } = size;
  const fit = `
<style id="screen-fit-style">
html, body { margin: 0; width: 100%; height: 100%; overflow: hidden; background: #e5e7eb; }
body > x-dc, body > #dc-root { display: block; position: absolute; width: ${width}px; height: ${height}px; transform-origin: top left; }
</style>
<script id="screen-fit-script">
(() => {
  function fit() {
    const root = document.querySelector("body > #dc-root, body > x-dc");
    if (!root) return;
    const scale = Math.max(0, Math.min((window.innerWidth - 32) / ${width}, (window.innerHeight - 32) / ${height}));
    root.style.transform = "scale(" + scale + ")";
    root.style.left = (window.innerWidth - ${width} * scale) / 2 + "px";
    root.style.top = (window.innerHeight - ${height} * scale) / 2 + "px";
  }
  window.addEventListener("resize", fit);
  new MutationObserver(fit).observe(document.body, { childList: true });
  fit();
})();
</script>
`;
  return template.replace(/<\/body\s*>/i, (closing) => fit + closing);
}

const boardTemplate = readIsland("__bundler/template");
const pageSizes = new Map();
for (const frame of boardTemplate.match(/<iframe\b[^>]*>/gi) || []) {
  const uuid = frame.match(/\bsrc="about:blank#([0-9a-f-]{36})/i);
  const width = frame.match(/\bwidth="(\d+)"/i);
  const height = frame.match(/\bheight="(\d+)"/i);
  if (uuid && width && height) {
    pageSizes.set(uuid[1], {
      width: Number(width[1]),
      height: Number(height[1]),
    });
  }
}

function rewriteTemplate(text, size, file) {
  const island =
    /(<script\b[^>]*\btype="__bundler\/template"[^>]*>)([\s\S]*?)(<\/script\s*>)/i;
  if (!island.test(text)) throw new Error("Missing __bundler/template");
  return text.replace(island, (match, opening, json, closing) => {
    const template = JSON.parse(json).replace(
      /(?:\.\/)?\b[A-Za-z][A-Za-z0-9]*\.dc\.html\b/g,
      (name) => pageLinks[name.replace(/^\.\//, "")] || name,
    );
    return (
      opening +
      JSON.stringify(fitScreen(template, size, file)).replace(/</g, "\\u003c") +
      closing
    );
  });
}

function slugify(s) {
  return s
    .replace(/<[^>]*>/g, "")
    .replace(/&[a-z#0-9]+;/gi, " ")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 60);
}

function pageName(text) {
  const title = text.match(/<title[^>]*>([\s\S]*?)<\/title>/i);
  const heading = text.match(/<h1[^>]*>([\s\S]*?)<\/h1>/i);
  // Titles look like "DTI Examiner – Sign in"; keep only the screen name.
  const name = ((title && title[1]) || (heading && heading[1]) || "")
    .split(/\s+[–—-]\s+/)
    .pop();
  return slugify(name) || "page";
}

fs.mkdirSync(outDir, { recursive: true });
const pad = Math.max(2, String(pageOrder.length).length);

pageOrder.forEach((uuid, i) => {
  const entry = manifest[uuid];
  if (!entry) {
    console.warn(`Skipping ${uuid}: not in manifest`);
    return;
  }
  const text = decode(entry);
  const file = `${String(i + 1).padStart(pad, "0")}-${pageName(text)}.html`;
  fs.writeFileSync(
    path.join(outDir, file),
    rewriteTemplate(text, pageSizes.get(uuid), file),
  );
  console.log(`${file}  <- ${uuid}`);
});
