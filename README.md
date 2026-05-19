# Mock TET — Teacher Eligibility Test CBT Practice Interface

A pixel-faithful replica of the NTA/TET Computer-Based Test (CBT) interface, built as a pure static site hosted on GitHub Pages.

## Purpose

The primary goal is to help candidates practise the **computer interface** of the TET exam — navigation, question palette, timers, mark-for-review workflow, submit confirmation — not just the questions themselves.

## Features

- Realistic CBT layout: section tabs, countdown timer, question palette with colour-coded statuses
- Five question statuses (Not Visited / Not Answered / Answered / Marked / Answered & Marked) with exact NTA colour scheme
- Save & Next, Mark for Review & Next, Clear Response, Back navigation
- Auto-submit on timer expiry
- English-medium questions with one Telugu language subject; EN/हि toggle in the header is a visual placeholder for CBT fidelity
- Section-wise navigation tabs
- Submit confirmation dialog with question count summary
- Result page with score, section breakdown, and question-by-question review
- Session persisted to `sessionStorage` — page refresh restores your position

## Exam Data

Exam papers are stored as JSON files in `exams/`. The `exams/manifest.json` index lists all available papers. New exams are generated via the `/create-mock-test` skill, which writes raw question files under `exams/_raw/<exam-id>/` and then runs `scripts/build_exam.py <exam-id>` to assemble the final JSON and update the manifest.

## Running Locally

Because `fetch()` is used to load JSON, the site requires a local HTTP server (it will not work opened directly as a `file://` URL):

```bash
# Python 3
python3 -m http.server 8080
# then open http://localhost:8080
```

Or use the VS Code Live Server extension.

## GitHub Pages Deployment

1. Push to `main`
2. Go to **Settings → Pages → Source**: select branch `main`, folder `/` (root)
3. The site will be live at `https://<username>.github.io/<repo>/`

No build step required — everything is plain HTML/CSS/JS.
