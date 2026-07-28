# Design Labs — copy a look, paste it into your code

Three browser tools for designing the look of your app, then **copying that design as a code** you can hand to an AI (Claude in VS Code, Cursor, etc.) to apply to your own project. No screenshots needed — every code is self-describing.

## The labs (live)

| Lab | What you design | Link |
|---|---|---|
| **Schedule Lab** | Graph color, background, card style, your day's tasks | https://patron-rowan4.vercel.app/schedule-lab.html |
| **Graph Lab** | Energy-curve style — color, line width, glow, animation, backdrop | https://patron-rowan4.vercel.app/graph-lab.html |
| **Text Lab** | Title/heading entrance animations, font, size, speed | https://patron-rowan4.vercel.app/text-lab.html |

> These are single self-contained `.html` files — open them by double-clicking, or host them anywhere (GitHub Pages / Netlify / Vercel).

## How to copy a design

- **Graph Lab / Text Lab:** every box has its own **`copy`** link (top-right, next to `replay`). Click it on the exact design you like — it copies *that* one.
- **Schedule Lab:** set your colors/cards/tasks, then click **🎨 Copy theme code**.

## What you get (example)

A plain-English line **plus** JSON — both describe the look exactly:

```
GRAPH DESIGN — "06 · dotted line" · mint (#6EE7B7), line 3, glow on, smooth, draw animation, speed 1x, backdrop none
{"lab":"graph","variant":"06 · dotted line","color":"#6EE7B7","line":3,"glow":true,"smooth":true,"animate":"draw","speed":1,"backdrop":"none"}
```

## Use it in VS Code (paste + ask an AI to change your code)

1. Click **copy** on the design you want.
2. In VS Code, open the file with your chart/title and paste this to Claude/Cursor:

   > Here's a design I picked: `<paste the copied code>`
   > Change my [graph / title] to match it.

3. The AI reads the values and edits your code — no screenshot required.

## Schedule Lab is special — it applies automatically

The **🎨 Copy theme code** gives a `PEAK-THEME:…` string. In the Peak app, open **🎨 Import a creator theme** (under the schedule), paste it, and **Apply** — the graph color, background, card style (and optionally the tasks) change instantly and stick. Great for sharing a look with subscribers who run their own copy.
