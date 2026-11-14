# Devpost submission (Codegeist 2026)

Every field of the Devpost form, ready to paste. Devpost rules we follow: gallery images are
3:2 with the content in the middle, captions are 140 characters or less, no third-party marks
in the video or the gallery, and no markdown tables in the description.

## Project name

Sidebar

## Elevator pitch (200 characters max)

A second opinion on every contract, inside Jira. Sidebar redlines each version, checks every clause against your Confluence playbook and drafts the reply.

## Thumbnail and gallery

- Thumbnail: `docs/img/thumb.jpg`
- Gallery, in order (1500x1000, from the demo video), with captions:
  1. `docs/img/gallery-1.jpg`: Version two of a contract. One number changed on page four: 30 days became 10.
  2. `docs/img/gallery-2.jpg`: Sidebar reads the contract against the Confluence playbook. Three clauses break it.
  3. `docs/img/gallery-3.jpg`: The redline from v1 to v2: what they fixed, what they did not, and what they hid.
  4. `docs/img/gallery-4.jpg`: The Sidebar Rovo agent finds what was agreed with this counterparty before.
  5. `docs/img/gallery-5.jpg`: Accepted clauses drop out. The requester gets one clean redline in the portal.
  6. `docs/img/gallery-6.jpg`: How it works: JSM, Confluence, Forge LLM and a Rovo agent. Runs on Atlassian.

## Video demo link

https://youtu.be/KvgarPwIzac (YouTube, public, 2:42, English and Korean subtitles)

## Category

Specialized Industries

## Bonus prize

Rovo Agent

## Repository

https://github.com/its-janghoon/sidebar (public, MIT)

## Try it out links

- Installation link: https://developer.atlassian.com/console/install/114441bd-06b3-4587-8d4e-e7eb548f70e3?signature=AYABeMAAjDQ%2B2B4%2FJvELESTwruYAAAADAAdhd3Mta21zAEthcm46YXdzOmttczp1cy13ZXN0LTI6NzA5NTg3ODM1MjQzOmtleS83MDVlZDY3MC1mNTdjLTQxYjUtOWY5Yi1lM2YyZGNjMTQ2ZTcAuAECAQB4CxqLTo9l4lqXuFjNim1xJM%2Bp%2F3TVP9xHS2BrU5DRRucBwReXbA%2BK%2FNmxyWCo9dwdyQAAAH4wfAYJKoZIhvcNAQcGoG8wbQIBADBoBgkqhkiG9w0BBwEwHgYJYIZIAWUDBAEuMBEEDDl%2Ft2nawqiifrqVNAIBEIA7wYoOj6b5jhFkpezWwuCrgfNa9cqDvFFG6bcWh0TiplWWksIXCHp5uaadOC57GpKOBs45DJnTvV4XrrwAB2F3cy1rbXMAS2Fybjphd3M6a21zOmV1LXdlc3QtMTo3MDk1ODc4MzUyNDM6a2V5LzQ2MzBjZTZiLTAwYzMtNGRlMi04NzdiLTYyN2UyMDYwZTVjYwC4AQICAHi9bVMAkme4qVQX1fQHo6ePw3H40A7cGfz7yrmSfBWMXgEVU5P4lutbA4odKS2f1alwAAAAfjB8BgkqhkiG9w0BBwagbzBtAgEAMGgGCSqGSIb3DQEHATAeBglghkgBZQMEAS4wEQQMaeHJTQwULGO77k%2BzAgEQgDuGXudd0FlxKTS8J6FwAP80wgAThBLaJRMfX67vj6yD7%2Fp4OvdGxkiWbi8IKdpzYM%2Fn6TsohzFTEgq%2BrgAHYXdzLWttcwBLYXJuOmF3czprbXM6dXMtZWFzdC0xOjcwOTU4NzgzNTI0MzprZXkvNmMxMjBiYTAtNGNkNS00OTg1LWI4MmUtNDBhMDQ5NTJjYzU3ALgBAgIAeDYASx0XCjkny4iLV6vz%2BKtEGSGT6kdt0QRpkn6D%2FlVEAXI484TTtPKwSWjbqAHU6DMAAAB%2BMHwGCSqGSIb3DQEHBqBvMG0CAQAwaAYJKoZIhvcNAQcBMB4GCWCGSAFlAwQBLjARBAx2hnGFQ1ahSlzl7XwCARCAO9mGKzh67Bl69fDVc2RKxWYAqQu24UVhSsv%2BLkE3XprE7CPlGK24RObHEo6PuBw8xQGntW3ayKSujyxbAgAAAAAMAAAQAAAAAAAAAAAAAAAAAGcaQ7bmNDxlbfNcP77vewb%2F%2F%2F%2F%2FAAAAAQAAAAAAAAAAAAAAAQAAADIYcqEsBJ1h%2BacZss%2FDRf0gtNwpxchEcXBGksq%2BscOJGjqugHDQ%2FnOjx%2FEQw1wzL60K%2BVw1Qcg1vvZgzYGjmsks%2Bmc%3D&product=jira&product=confluence
- Repository: https://github.com/its-janghoon/sidebar

## Built with

atlassian-forge, forge-llm, forge-kvs, rovo, rovo-agent, jira, jira-service-management,
confluence, custom-ui, react, vite, javascript, node.js, amazon-polly, playwright, ffmpeg

## About the project

### Inspiration

In-house legal teams already take contract requests in Jira Service Management. The review
itself still happens somewhere else: a Word file, a playbook in someone's head, and a hunt
through old email for what was agreed with this customer last year. The other side sends
version two, and the one number they changed on page four is the one nobody catches.

### What it does

Sidebar is a Forge app that gives an in-house legal team a second opinion on every contract,
inside Jira.

- **Redline.** Every `.docx` attached to a request becomes a version. Sidebar compares the
  versions paragraph by paragraph and shows only what changed.
- **Review.** Forge LLM checks the changed clauses against the company playbook and rates each
  difference HIGH, MEDIUM or LOW, with their text, the playbook position and suggested wording.
- **Reply.** "Reply with this wording" posts a public comment to the requester in the portal.
  "Accept" records the decision in an internal note.
- **Send redline.** Accepted clauses drop out, and the requester gets one clean redline.
- **Ask.** The context panel answers questions like "What did we agree with Northwind before?"
  from earlier requests with the same counterparty.
- **Rovo agent.** The Sidebar agent has three actions: check against the playbook, compare
  versions, and find past matters, so the same answers work in Rovo chat.

The playbook is a normal Confluence page. Change the page and Sidebar changes with it. Swap it,
and the same app reviews NDAs, purchase terms, offer letters, security questionnaires, vendor
and partner deals.

### How we built it

- **Forge, end to end.** A Jira issue panel and an issue context panel (Custom UI, React),
  resolver functions, Forge KVS for versions and decisions, Forge LLM for the review, and a
  Rovo agent with three actions. No outside servers, so the app is eligible for Runs on
  Atlassian.
- **Word files in a function.** `.docx` attachments are unzipped and read inside a Forge
  function, so no container is needed.
- **Masking.** Party names, emails, phone numbers, bank numbers and amounts are replaced with
  placeholders such as `[PARTY_1]` before any text goes to the model, and put back in the answer.
- **The playbook as data.** Each clause on the Confluence page is a heading with Match, Risk,
  Standard, Allowed, Fallback and Red flags lines. If a model call fails, Sidebar checks the
  same playbook by rule (its red flags), so the panel still answers.
- **Demo.** The video was recorded on a real Jira site with Playwright and OBS, voiced with
  Amazon Polly and cut with ffmpeg.

### Challenges we ran into

- One Forge app cannot hold Jira and Bitbucket permissions together, so versions live in the
  app's own storage instead of a Bitbucket repository.
- Forge functions have a short time limit, so the review sends only the changed clauses to the
  model in one call, and the panel shows progress until it finishes.
- The app reads the playbook as the app and falls back to the viewing user, so it works with
  restricted Confluence spaces.

### Accomplishments that we're proud of

- The demo catches the change it was built to catch: a payment dispute window cut from 30 days
  to 10 inside an otherwise "fixed" version two.
- Accepted clauses really drop out of the next redline, so the requester gets one clean list.
- The whole review runs on Atlassian, with names and amounts masked before the model sees them.

### What we learned

A playbook written as a normal Confluence page is easier for a legal team to own than any
settings screen, and it makes the same engine useful for every team that reviews documents.

### What's next for Sidebar

- Playbook templates for NDAs, purchase terms and offer letters.
- Clause history across all matters with a counterparty, not only the last one.
- A Marketplace listing.

## Testing instructions (private field)

1. Install Sidebar on your site with the installation link above, once for **Jira** and once for
   **Confluence** (Sidebar reads the playbook page from Confluence). The site needs Jira, Jira
   Service Management and Confluence.
2. In Confluence, create a page titled **Sidebar Playbook** and paste the contents of
   [demo/playbook.md](https://github.com/its-janghoon/sidebar/blob/main/demo/playbook.md).
3. In any Jira Service Management project, create a request and attach
   [Northwind_CSA_v1.docx](https://github.com/its-janghoon/sidebar/raw/main/demo/out/Northwind_CSA_v1.docx).
   Open the request and expand the **Sidebar** panel: it reviews v1.
4. Attach [Northwind_CSA_v2.docx](https://github.com/its-janghoon/sidebar/raw/main/demo/out/Northwind_CSA_v2.docx)
   to the same request. Sidebar shows the redline and flags the 30 to 10 day change.
5. Try "Reply with this wording", "Accept" and "Send redline", the Ask box in the right-hand
   Sidebar panel, and the **Sidebar** agent in Rovo chat.

## Additional info (for judges)

- Submitter type: Individual. Country: Korea, Republic of. Province: N/A. Organization: N/A.
- Started: November 13, 2026. New project.
- App ID: `114441bd-06b3-4587-8d4e-e7eb548f70e3`

### How the project meets the main technology requirement

Sidebar is built entirely on Forge and runs on Atlassian:

- **Jira Service Management**: the requester sends the contract through the portal; Sidebar posts replies and the final redline back to the request as public comments.
- **Jira**: an issue panel (versions, redline, findings, decisions) and an issue context panel (verdict and Ask box), both Custom UI with resolver functions. Attachments are read as contract versions; decisions are recorded as internal notes.
- **Confluence**: the playbook is a normal Confluence page that Sidebar reads and parses into clauses.
- **Rovo**: the Sidebar agent with three actions (check against the playbook, compare versions, find past matters).
- **Forge platform**: Forge LLM for the clause review, Forge KVS for versions and decisions, and no outside servers, so the app is eligible for Runs on Atlassian.

### Why this category

Sidebar is built for one industry workflow: in-house legal teams reviewing customer contracts. Its playbook, findings and redlines follow how legal teams already work, so it fits Specialized Industries (legal).

### Experience building with Forge

What worked well: Custom UI with resolvers made the panel feel native, Forge LLM let the review stay on Atlassian without managing keys, and Rovo actions were easy to add on top of the same resolver functions. What we struggled with: one app cannot hold Jira and Bitbucket permissions together, so versions moved into Forge storage; the function time limit shaped how much text we can send to the model at once; and Forge logs arrive late, which slows debugging. What we would improve: a way to combine Bitbucket and Jira scopes in one app, longer function limits for LLM calls, and faster log streaming in `forge logs`.

### AI tools used

Kiro (Kiro CLI and Kiro Crew) for planning, code, testing on a live site and the demo video. Forge LLM inside the app. Amazon Polly for the video voice.
