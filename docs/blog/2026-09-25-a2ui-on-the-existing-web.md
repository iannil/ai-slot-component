# A2UI on the existing web: what the protocol doesn't cover

If you have been following the agent-UI space, you have probably seen [A2UI](https://github.com/a2ui-project/a2ui), Google's open protocol for agent-driven user interfaces. It standardizes how an agent *describes* UI: not HTML, not screenshots, but a declarative component tree that a trusted client renders. It is a genuinely good idea, and it arrives at the right moment — as more software is "surfaced" by agents, the industry needs exactly this kind of shared wire format.

This post is not a criticism of A2UI. It is an observation about a boundary. A2UI standardizes what an agent says about UI and how a client renders it. It does not — and, reading the specification carefully, does not intend to — solve how agent-generated UI reaches the *existing* web: the millions of pages that already have content, users, crawlers, and a deployment history. That gap is a different problem, on a different layer. Here we describe that layer, show what it looks like in code, and explain why we built [ai-slot](https://github.com/iannil/ai-slot-component) to *speak* A2UI rather than compete with it.

## What A2UI actually standardizes

A2UI messages are declarative component trees against a trusted catalog. The agent cannot emit arbitrary markup; it selects components the client already knows and trusts, and the client renders them locally. The specification's framing is memorable: components render "safe like data, expressive like code." A malicious or compromised model output cannot smuggle a `<script>` tag past the client, because there is no markup channel at all — only catalog component names, properties, and child references.

On the wire, an A2UI payload is an envelope of `messages`. A typical surface starts with a `createSurface` message (which declares a surface ID and the catalog in use) followed by an `updateComponents` message carrying the component tree as an adjacency list — each component references its children by ID. An official [Basic Catalog](https://a2ui.org/specification/v1_0/catalogs/basic/catalog.json) ships with the spec: `Row`, `Text`, `Button`, `TextField`, `Image`, and so on. Later messages can update components again, bind data-model values, or tear the surface down with `deleteSurface`.

The v1.0 specification's Transport section lists HTTP request-response among its official transports, alongside streaming options. That detail matters for the rest of this post, because HTTP request-response is exactly the transport an ordinary web page already speaks.

## Four things the protocol structurally does not cover

These are not missing features to be filed as bugs. They are outside the protocol's declared scope — the spec describes a pipeline of *generate → transport → parse → render*, and each of the following sits outside one of those stages.

### 1. There is no server-side component

The A2UI specification concerns itself with the message format and the client rendering contract. It defines nothing about what happens *around* the generation: no caching model, no build-time pregeneration of surfaces, no invalidation story when a data source changes after a surface was produced. If your agent endpoint produces a surface for a slot on a page that gets ten thousand visits an hour, the protocol is silent on whether you should regenerate it per request, cache it, or bake it at deploy time. Those decisions exist — they just live below the protocol, and every adopter has to solve them from scratch.

### 2. There is no SEO or crawler story

A2UI UI is client-rendered by design: the client parses messages and renders components at runtime. A crawler that fetches the page sees the transport payload, not rendered content — and for surfaces delivered over streaming transports, not even that. The specification does not define any progressive-enhancement or server-side-rendering mechanism. For the spec's own "Smart Wrapper" approach to embedding agent UI into pages with existing content, the answer for legacy material is isolation: wrap the old content in a sandboxed iframe and render the agent UI around it. That is a sound containment choice — but note what it means for the original page: the legacy content is walled off from the document, and nothing in the protocol addresses what crawlers or AI search engines should see.

### 3. It targets in-app GenUI, not public content pages

A2UI is designed for surfaces inside an application context — the agent session owns the screen, and the UI it produces *is* the experience. There is no concept of a fallback: nothing in the protocol says "if the surface fails to arrive, keep showing what was there before." That constraint makes total sense in an app shell, where there is usually nothing meaningful to fall back to. On the public web it is inverted: the page already has content, that content is load-bearing for SEO and accessibility, and any mechanism that could blank a region of it is a non-starter. Delivering agent UI into such a page requires a guarantee the protocol does not express — the guarantee lives in the delivery layer.

### 4. There is no visitor-level personalization loop

In the A2UI model, UI is driven by an agent conversation. There is no per-slot notion of "this visitor typed a prompt, re-render this one region." On a content page — a product page, a landing page, a doc — the natural interaction is narrower: a visitor wants to adjust or rewrite one slot ("make this heading punchier"), scoped to that slot, without a conversation and without touching the rest of the page. Nothing in the protocol prevents building that, but nothing in it defines it either. It is a lifecycle concern of the delivery layer, not a message-format concern.

## What a delivery layer looks like

At [ai-slot-component](https://github.com/iannil/ai-slot-component) we built that layer and made it protocol-neutral. The core idea: a page author wraps an existing region in a `<ai-slot>` custom element with the original content inside it. A stateless server proxy produces the agent UI; the client re-validates it against a registry the page author declared; and on any failure — timeout, invalid output, rate limit — the original content silently stays. The original markup is never removed from the HTML, so crawlers, no-JS visitors, and AI search engines always see real content.

As of this week, ai-slot consumes A2UI directly. The example below is the entire client-side integration — it accepts an A2UI `messages` payload wherever the slot expects a response:

```ts
import { defineRegistry } from "@ai-slot/registry";
import { createDomRenderer } from "@ai-slot/adapter-dom";
import { configureAiSlot, registerRenderer, registerWireFormat } from "@ai-slot/runtime";
import { a2uiWireFormat, basicCatalogComponentDefs, basicCatalogDomDefs } from "@ai-slot/a2ui";

const registry = defineRegistry({
  components: { ...basicCatalogComponentDefs /* , your brand components */ },
});
registerWireFormat("a2ui", a2uiWireFormat);
registerRenderer("dom", createDomRenderer(basicCatalogDomDefs));
configureAiSlot({ registry });
```

The Basic Catalog is wired in on both sides: `basicCatalogDomDefs` maps catalog components to real DOM elements for rendering, and `basicCatalogComponentDefs` declares their props and slots so the client-side validator can enforce the same discipline the spec intends. The slot's `src` can now point at anything that answers with A2UI — including a fixture straight from the official repository. Here is the official `row-layout` example, which is a complete, valid response body:

```json
{
  "name": "Row Layout",
  "description": "Simple example demonstrating basic catalog components.",
  "messages": [
    {
      "version": "v1.0",
      "createSurface": {
        "surfaceId": "gallery-row-layout",
        "catalogId": "https://a2ui.org/specification/v1_0/catalogs/basic/catalog.json"
      }
    },
    {
      "version": "v1.0",
      "updateComponents": {
        "surfaceId": "gallery-row-layout",
        "components": [
          { "id": "root", "component": "Row", "children": ["left_text", "right_text"], "justify": "spaceBetween", "align": "center" },
          { "id": "left_text", "component": "Text", "text": "Left Content", "variant": "body" },
          { "id": "right_text", "component": "Text", "text": "Right Content", "variant": "caption" }
        ]
      }
    }
  ]
}
```

The client flattens the adjacency list into a tree, applies any name mappings, and renders it as real DOM — while the validator enforces slot declarations. One deliberate detail: catalog components without declared slots (input-style components such as `TextField`) are rejected by the *validation* layer if a payload tries to nest children inside them, not by the DOM layer after the fact. Structurally invalid trees never reach a renderer.

On the production side, a wrapper rewrites an existing ai-slot proxy's responses to A2UI envelopes — the proxy itself is unchanged, and JSON and SSE responses both get the same treatment. So the same page can be fed by a native-JSON endpoint today and an A2UI endpoint tomorrow, with no page changes.

## The comparison, stated precisely

| | A2UI / AG-UI | ai-slot |
|---|---|---|
| Layer | Wire format for agent ↔ in-app UI (Google / CopilotKit) | Delivery layer for public web content slots — speaks A2UI via `@ai-slot/a2ui` |
| Existing pages | Legacy content isolated in sandboxed iframes | Wraps existing HTML in place, zero rewrite |
| SEO & crawlers | Client-rendered; crawlers see nothing (including Googlebot) | Original content always in the HTML — visible to crawlers and AI search |
| Lifecycle | No server-side component (no cache, prewarm or invalidation) | Two-tier TTL, build-time prewarm, invalidation push, rate limiting |

Read that table as "different layers," not "better." AG-UI and A2UI solve the agent-to-application problem, and solve it well. ai-slot solves the agent-to-existing-web problem, which they do not address — and it consumes their formats where they overlap.

## The layer becomes more necessary, not less

Here is the bet, stated plainly: **every success in the A2UI ecosystem makes a delivery layer for the existing web more necessary, not less.** If A2UI-compliant agents proliferate — in IDEs, in assistant products, in enterprise agent platforms — then the number of endpoints that can *say* UI grows, and the number of pages that need a safe, cacheable, crawlable way to *receive* that UI grows with them. A protocol succeeding is the best possible news for the layer beneath it.

That is why ai-slot's posture is compatibility, not competition. We implement A2UI as a wire format via an extension point (`registerWireFormat`), we ship the Basic Catalog bindings, and we round-trip against the official fixtures in our test suite. We have no interest in proposing a rival protocol; we have every interest in making sure that when an A2UI-speaking agent wants to reach a page that already has users and a search ranking, something stands in the gap — keeps the original content in the HTML, validates what arrives, falls back on failure, and caches what should be cached.

A2UI standardizes what agents say about UI. The existing web still needs a way to hear it without breaking. Those are different problems, and both deserve to be solved well.

> Draft — not yet published. Target channels: Hacker News / r/webdev / dev.to.

