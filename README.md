# Block Studio

A browser-based 3D block-building workspace with synchronized front, right, and top views.

## Run locally

```sh
npm install
npm run dev
```

Open the local URL printed by Vite. To create a production build, run `npm run build`.

## Features

- Rotate, pan, and zoom the 3D workspace.
- Add blocks next to the selected block, extend a block by double-clicking one of its faces, or move and delete individual blocks.
- Generate a connected random block model by entering a block count from 1 to 500.
- Inspect synchronized front, right, and top orthographic views.
- Optionally show the three-view panel; select a block or grid position in the front view to highlight its corresponding projections.
- Browse starter, stairs, and tower examples; undo or redo edits.
- Save the current model in the browser's local storage.
