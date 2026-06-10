# Arther — Product Overview

**Last updated:** May 2026

---

## What Arther Is

Arther is an AI-native technical documentation platform built specifically for hardware companies. It replaces the fragmented, manual workflow of spreadsheet specs → Word authoring → email review → static PDF export with a single integrated system: a structured product spec database feeds an AI document generator, outputs are refined in a visual block editor, and published as interactive branded web pages — with PDF as an export fallback.

The product is organised around four core modules that build on each other:

```
Product Spec Database  →  AI Document Generator
         ↓                         ↓
  Publishing Portal  ←   Visual Block Editor
```

---

## The Problem

Hardware companies — industrial equipment manufacturers, electronics firms, robotics companies — must produce a continuous stream of technical documents: datasheets, installation manuals, user guides, compliance documentation. The current workflow is broken at every seam.

Product specifications live in spreadsheets or ERPs. Documents are authored manually in Word or InDesign, disconnected from those specs. Review happens over email. Published PDFs are static snapshots that go stale the moment a spec changes. When a spec changes, there is no automated way to detect which documents are affected, which paragraphs contain outdated values, or which customers are currently reading incorrect information.

**The cost of not solving this:** A motor manufacturer with 40 product variants updating a firmware default value must manually hunt through dozens of PDFs to find and correct every affected paragraph. Teams routinely ship installation manuals that are two or three spec cycles out of date. Distributors and customers make purchasing and installation decisions on stale data.

---

## Why No Existing Tool Solves It

Arther occupies an uncontested position at the intersection of four markets that currently require separate tools:

| Layer | Current tools | Their gap |
|---|---|---|
| Structured spec data | PIM systems (Pimcore, Akeneo) | Built for e-commerce product catalogues, not hardware specs or documentation output |
| AI doc generation | DocRock, SpecIQ | No persistent spec database, service-based not self-serve, no editing or publishing layer |
| Technical authoring | MadCap Flare, Paligo | No AI, requires complex DITA/XML authoring, built for large enterprise software companies |
| Interactive publishing | Confluence, Notion | Not hardware-specific, no spec linkage, poor portal publishing capability |

MadCap Flare and Paligo serve enterprise software companies with 50+ dedicated technical writers requiring complex XML infrastructure. DocRock and SpecIQ generate documents from unstructured input with no persistence, editing, or publishing. PIM systems manage e-commerce product data. Knowledge bases serve software help centres.

**The features Arther does not build are as important as the ones it does.** The competitive gap exists precisely because incumbents are weighed down by print prepress, XML authoring, and canvas design tools that hardware documentation teams do not need. Arther's constraint — staying focused on hardware documentation workflows — is a feature, not a limitation.

---

## Who It's For

**Target market:** SMB and mid-market hardware companies — industrial equipment manufacturers, electronics firms, robotics companies — with 1–50 people involved in documentation. Systematically underserved: too complex for general-purpose tools, too cost-sensitive for enterprise CCMS platforms.

**The people who use it:**

**Technical Writers** own document creation and editing. Often the only dedicated documentation person on a hardware team, sometimes an engineer wearing a second hat. They generate documents from AI drafts, edit blocks, manage spec-linked content, run documents through review, and publish to the portal.

**Product Engineers and Spec Owners** own the product specification data. They care about accuracy and need documentation to always reflect what engineering actually built. They create and update spec fields, review the impact of spec changes on published documents, and resolve stale content alerts.

**Reviewers and Approvers** — QA, Legal, Compliance, Marketing — read documents before publication, leave block-level comments, and approve or request changes through the review workflow.

**Workspace Admins** configure the workspace: members, roles, AI provider keys, SMTP settings, portal branding, and external sync connections.

**Portal Visitors** — customers, distributors, OEM partners — consume published documentation. They view interactive documents, download PDFs, and may be captured via gated access for lead tracking.

---

## What the Product Does

### Product Spec Database

A graph-structured product database — Products compose Components (independent, reusable entities), each carrying typed Spec Fields — with git-like version control on every field. Every spec change is immutable and diffable. This is the source of truth for all AI-generated content, and the foundation that makes smart documentation possible.

The spec database is what fundamentally differentiates Arther from every other AI documentation tool. Generating from a structured, version-controlled database is categorically different from generating from a prompt or an uploaded document. It's the difference between a document that was accurate when it was written and a document that *knows* when it's no longer accurate.

### AI Document Generator

Users select a document type (Datasheet, Installation Manual, User Guide, etc.), a product, and a Brand Profile. The AI generates a complete structured draft populated with live spec data — not free-form prose, but a typed block array that enables block-level editing, spec linking, and staleness tracking downstream.

Brand Profiles capture brand voice, tone, colour palette, unit preferences (metric or imperial), and product-specific glossary. Document Quality Standards define structural rules like reading level, section length limits, and terminology preferences. Document types define the default section structure. The combination means the AI generates to a consistent standard without manual prompt engineering for every document.

### Visual Block Editor

A three-panel block editor — outline sidebar, block canvas, properties panel — where technical writers refine AI-generated documents. Supports 20 block types including interactive elements (GIFs, Videos, Accordions, Step Wizards, Hotspot Images, Charts) that render fully on the portal and degrade gracefully to static in PDF export.

The block editor is where the document becomes a finished product. The editorial judgment of the technical writer shapes what the AI generated into something accurate, clear, and on-brand.

### Publishing Portal

A branded public-facing portal where published documents are hosted as live interactive pages. Every published document renders as a rich interactive web experience first — with PDF as a clean fallback for contexts where web access isn't available.

This inverts the conventional model: instead of a PDF being the product and the web being an afterthought, the interactive web page is the product and the PDF is the fallback.

### Collaboration and Review

A structured review workflow — comment, approve, publish — designed for hardware documentation teams where clear sign-off is a requirement, not an option. Block-level comments, @mentions, a review request workflow, and a document approval state machine (Draft → In Review → Approved → Published) keep the entire review process inside Arther with no dependency on email.

### Smart Spec Tracking

When a spec field value changes, Arther identifies every document and every block that references that field, surfaces a staleness alert, and offers bulk regeneration with a before/after diff for review.

This is the feature that makes Arther's switching costs real. Without it, Arther is a faster document creation tool. With it, Arther becomes the single living source of truth that prevents documentation debt across an entire hardware product line. No competitor tracks the relationship between spec field changes and published document content.

### Content Reuse

Reusable snippets that propagate changes across all documents that embed them, document templates for common types, and a block library for saving and reusing individual blocks. The key decision for snippets is live transclusion — edits to a snippet propagate to every document that uses it, the same way Confluence Synced Blocks work. This is essential for regulatory boilerplate (safety warnings, warranty clauses, CE compliance statements) that must stay identical across many documents.

### Product Variants

Hardware product families often consist of a base model and variants differentiated by specific spec overrides — a high-torque variant, a hazardous-area-rated variant, a low-noise variant. Arther models this natively: variants inherit all spec fields from a base product but can override individual values. The AI and spec-linked blocks always see the variant's resolved values. The editor provides an internal comparison view where authors can select two variants and compare them side-by-side during authoring and review. On the portal, a variant picker lets visitors navigate between variant-specific pages, each with its own canonical URL.

### External Sync *(post-launch)*

Closes the loop between Arther and the engineering systems — ERPs, PLMs, custom databases — that are the authoritative source of spec data for many hardware companies. When a product changes in the engineering system, Arther's spec database updates automatically, and the documentation pipeline is immediately notified of affected documents.

The target integrations are the systems where hardware companies already live: Arena PLM is planned as the first integration, with Duro, Windchill, PTC, and custom internal databases to follow. External Sync is not part of the v1 build scope — the Spec Database data model reserves the necessary provenance fields for this feature, but the sync infrastructure itself will be built post-launch.

---

## What Arther Deliberately Does Not Build

These are explicitly out of scope. They either pull Arther toward competing in markets where strong incumbents already exist, or serve no genuine need in the hardware documentation workflow.

**Real-time simultaneous co-editing.** The review workflow — comment, approve, publish — is the correct collaboration model for regulated hardware documentation. Concurrent live editing adds architectural complexity without serving the actual workflow.

**Print prepress and CMYK.** Hardware companies do not run offset printing in-house. Screen-quality PDF is sufficient. CMYK, spot colours, bleed/crop marks, and PDF/X are offset-printing requirements.

**DITA XML authoring.** DITA is the authoring format for large enterprise software companies with 50+ dedicated technical writers. The Arther customer has 1–3 people writing docs alongside engineering. DITA adds enormous complexity without serving them.

**ePub export.** Hardware datasheets and installation manuals are not distributed as ebooks.

**AI image generation.** Hardware documentation requires real product photographs. A generative image of a motor controller that looks plausible but is wrong is a safety liability.

**Canvas design tools.** Vector editing, shape drawing, bezier curves, and infinite canvas UI are the interaction model of Figma and Illustrator. Hardware companies have CAD for technical drawings. Arther is a block editor, not a canvas.

**Advanced typography.** OpenType features, variable fonts, and drop caps are for editorial designers. The gap in the market is not "no typographically sophisticated tool for hardware" — it's "no tool connecting specs to documentation."

**Mobile native apps.** Block editing on a phone is a poor experience. The portal is already good on mobile via browser.

**Plugin/extension API.** Plugin ecosystems need scale before third-party investment is rational. Revisit at meaningful user scale.

**SCORM/LMS export.** Training documentation is a different market with a different content model and a different buyer.

**Multi-language document generation.** Hardware documentation has extremely low tolerance for translation errors — a mistranslated safety warning can cause injury. This requires validated quality assurance before building.

---

## Strategic Goals

1. **Reduce time-to-published-document by 70% or more** — from opening a new document to a live portal page, versus the baseline of manual Word authoring with email review.
2. **Eliminate stale documentation at the source** — when any spec field changes, 100% of affected document blocks surface a staleness alert within the same session.
3. **Make hardware documentation interactive by default** — every published document renders as a live web page with PDF as a fallback, not the other way around.
4. **Enable end-to-end review workflows without external tools** — commenting, approval, and review-request flows entirely within Arther.
5. **Support full hardware product families** — variants with delta specs, variant-specific documents, side-by-side portal comparisons.
6. **Bridge engineering and documentation** *(post-launch)* — when an external system owns the spec data, Arther stays in sync automatically. Arena PLM is the first planned integration.

---

## Competitive Threats to Monitor

1. **DocRock productising** — currently service-led but actively building software; could launch self-serve SaaS
2. **Paligo or MadCap adding AI generation from structured data** — both have the customer relationships and domain knowledge
3. **PIM vendors moving into documentation output** — Pimcore and Akeneo have the product data; adding document generation is a natural extension
4. **Adobe connecting InDesign, FrameMaker, and Firefly** — owns the print-to-digital authoring stack and has the AI capability
5. **Customer inertia** — entrenched Word/Excel/InDesign workflows are the biggest adoption barrier, not competing software

---

*This document describes what Arther is, why it exists, and what it's trying to accomplish — independent of implementation detail, sprint planning, or build status. For detailed feature requirements, see the feature design documents. For implementation sequencing, see the Linear workspace.*
