import sharp from "sharp";
// composite on a colored background to eyeball the cutout quality
await sharp({ create: { width: 1260, height: 320, channels: 4, background: "#F9FAFB" } })
  .composite([
    { input: "public/streamflaire-hub-logo.png", top: 30, left: 30 },
    { input: "public/streamflaire-hub-mark.png", top: 170, left: 30 },
  ]).png().toFile("C:/Users/DAVIDL~1/AppData/Local/Temp/.playwright-mcp/logo-check.png");
console.log("ok");
