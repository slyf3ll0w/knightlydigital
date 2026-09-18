import { toolsForActor } from "../lib/assistant/index";
const t = toolsForActor({ id: "x", companyId: "c", role: "OWNER", name: "n", email: "e" } as never);
const sizes = t.map((x) => [x.decl.name, JSON.stringify(x.decl).length] as const).sort((a, b) => b[1] - a[1]);
console.log("tools", t.length, "total chars", sizes.reduce((s, x) => s + x[1], 0));
console.log(sizes.slice(0, 12).map((x) => x.join(" ")).join("\n"));
console.log("booking:", sizes.find((x) => x[0] === "manage_booking_item"), "settings:", sizes.find((x) => x[0] === "update_company_settings"));
