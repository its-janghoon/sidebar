# Sidebar

**A second opinion on every contract, inside Jira.** Sidebar is an Atlassian Forge app for
in-house legal teams. Sales sends a contract through Jira Service Management; Sidebar shows what
changed between versions, checks every clause against the company playbook in Confluence, and
drafts the wording to send back. A Rovo agent answers the same questions in chat.

Built for Atlassian Codegeist 2026 (Specialized Industries). Open source, MIT.

Demo video: https://youtu.be/VIDEO_ID

## What it does

- **Redline.** Each `.docx` version attached to a request is read and compared paragraph by
  paragraph. Only changed lines are shown, v1 against v2.
- **Review.** Forge LLM reads the changed clauses against the playbook and rates each
  difference HIGH, MEDIUM or LOW, with the other side's text, the playbook position and
  suggested wording. Names and amounts are masked before the model sees them.
- **Reply.** "Reply with this wording" posts a public comment to the requester. "Accept" records
  the decision in an internal note, and accepted clauses drop out of the next redline.
- **Send redline.** One clean redline of the open findings goes to the portal.
- **Ask.** The context panel answers questions such as "What did we agree with Northwind
  before?" from earlier requests with the same counterparty.
- **Rovo agent.** Three actions: check against the playbook, compare versions, find past matters.

The playbook is a normal Confluence page titled `Sidebar Playbook`. Change the page and Sidebar
changes with it; swap it and the same app reviews NDAs, purchase terms or offer letters.

Everything runs on Atlassian (Forge functions, Forge storage, Forge LLM). No data leaves the
Atlassian cloud.

## Layout

| Path | What |
|---|---|
| `app/manifest.yml` | Forge modules: Jira issue panel, issue context panel, Rovo agent and actions, Forge LLM |
| `app/src/` | Resolver and actions: versions, redline, playbook, review, masking, Rovo |
| `app/static/sidebar/` | The panel UI (React, Vite) |
| `app/agent/prompt.txt` | Rovo agent instructions |
| `demo/` | Demo contracts and the script that seeds a Jira site |
| `demo/video/` | How the demo video was made: cards, captions, voice lines, compose |

## Run it

Requirements: Node 24, the [Forge CLI](https://developer.atlassian.com/platform/forge/set-up-forge/),
and a Jira site with Jira Service Management and Confluence.

```sh
npm install
cd app && npm install
cd static/sidebar && npm install && npm run build && cd ../..
npx forge register        # once, gives the app your own id
npx forge deploy
npx forge install          # pick Jira, then your site
```

Create a Confluence page titled `Sidebar Playbook` (see `demo/` for the one used in the demo),
attach a contract `.docx` to a JSM request, and open the Sidebar panel on the issue.

## Credits

Demo contract text: [Common Paper Cloud Service Agreement v3.0](https://commonpaper.com/standards/cloud-service-agreement/)
(CC BY 4.0), edited for the demo. All people and companies in the demo are fictional.

## License

MIT. See [LICENSE](LICENSE).
