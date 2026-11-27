import assert from "node:assert/strict";
import { matchServiceFromPage, matchServiceName, matchWords } from "../lib/page-service-match";

const names = ["Fence installation", "Fence repair", "Deck building", "Pergolas", "Patio covers", "Something else"];
const at = (href: string, title = "") => names[matchServiceFromPage(names, { href, title })] ?? null;

assert.deepEqual(matchWords("Fences & Gates"), ["fence", "gate"]);

// The path names the service
assert.equal(at("https://steadfast.example/services/fence-installation/"), "Fence installation");
assert.equal(at("https://steadfast.example/fence-repair"), "Fence repair");
assert.equal(at("https://steadfast.example/pergolas.html"), "Pergolas");
assert.equal(at("https://steadfast.example/patio-cover"), "Patio covers");
assert.equal(at("https://steadfast.example/deck-builders-allen-tx"), "Deck building");
assert.equal(at("https://steadfast.example/fence-installing?utm_source=x#quote"), "Fence installation");

// A page about fences in general names two options equally: pick nothing
assert.equal(at("https://steadfast.example/fences"), null);
// Home and contact pages name nothing
assert.equal(at("https://steadfast.example/"), null);
assert.equal(at("https://steadfast.example/contact", "Contact us | Steadfast Outdoor Living Co."), null);

// No help from the path: the title's first part decides
assert.equal(at("https://steadfast.example/p/123", "Deck Building in Allen, TX | Steadfast Outdoor Living"), "Deck building");
assert.equal(at("https://steadfast.example/p/123", "Steadfast Outdoor Living Co. - Fences, Decks, Pergolas"), null);

// The most specific option wins
assert.equal(["Fence", "Fence repair"][matchServiceFromPage(["Fence", "Fence repair"], { href: "https://x.example/fence-repair" })], "Fence repair");
assert.equal(["Fence", "Fence repair"][matchServiceFromPage(["Fence", "Fence repair"], { href: "https://x.example/fence" })], "Fence");

// A typed value: exact name, then by words; nonsense is nothing
assert.equal(matchServiceName(names, "pergolas"), 3);
assert.equal(matchServiceName(names, "fence-repair"), 1);
assert.equal(matchServiceName(names, "roofing"), -1);
assert.equal(matchServiceName(names, ""), -1);

// Garbage in
assert.equal(matchServiceFromPage(names, { href: "not a url", title: "" }), -1);
assert.equal(matchServiceFromPage([], { href: "https://x.example/fence-repair" }), -1);

console.log("page-service-match: all passed");
