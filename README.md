# LaTeX Dollar Pair

Type `$` in a writable editor whose language mode is **LaTeX**. This is the
default mode for `.tex` files in VS Code.

| Before | After |
| --- | --- |
| `|` | `$|$` |
| Newly inserted `$|$` | `$$|$$` |
| `$x|$` | `$x$|` |
| Selected `x + y` | `$x + y$|` |

The vertical bar represents the cursor. A selection takes priority over skipping.
Each cursor is handled independently, and a wrapped selection leaves its cursor
after the closing dollar. Press Dollar again immediately inside a newly inserted empty pair to create
display math. Typing text or moving the cursor clears that shortcut. Before an
existing closing dollar, a press skips one character, so it takes two presses
to move past both closing dollars of a display pair.

Press **Backspace** inside a newly inserted empty inline pair (`$|$`) to delete
both dollars. This follows `editor.autoClosingDelete`: `auto` applies to a fresh
pair, `always` also applies between existing dollars, and `never` uses normal
Backspace behavior.

## Source and testing

Open this folder in desktop VS Code and press **F5** to launch an Extension
Development Host with a temporary profile. The project has no runtime
dependencies or build step. `package.json` declares the commands, shortcuts, and
setting. `extension.js` registers the commands and applies the edits.

1. Open a scratch `.tex` file in the development window. Confirm **LaTeX** in the
   status bar. Press Dollar, type `x`, and press Dollar again. Expect `$x$` with
   the cursor after the closing dollar.
2. On a blank line, press Dollar twice. Expect four dollars with the cursor
   in the middle.
3. Try skipping a pre-existing dollar, wrapping a selection, and using two
   cursors where one inserts while the other skips. Check that Undo reverses
   the insertion and that skipping leaves the text unchanged.
4. On a blank line, press Dollar and then Backspace. Expect the line to be empty.
5. Try Dollar in a plain text file and with the shortcut setting disabled.
   Both should use the editor's normal typing behavior.

## Shortcut and settings

The default rule uses `shift+4`, the US keyboard chord for Dollar. VS Code
dispatches key combinations according to its keyboard layout mapping. For
another layout or a shortcut conflict, open **Preferences: Open Keyboard
Shortcuts**, find **LaTeX Dollar Pair: Insert or Skip Dollar**, and record the
chord VS Code detects when you type Dollar. Keep the same **When** condition,
and remove the default rule if your new chord differs. **Developer: Toggle
Keyboard Shortcuts Troubleshooting** shows which rule won. Check for prior
snippet or LaTeX extension bindings if a different command wins.

Set `"latexDollarPair.enabled": false` in User or Workspace Settings to disable
the shortcut. The command remains available from the Command Palette in a
LaTeX editor for testing. A plain-text edit inserts the two dollar signs and
places the cursor explicitly, so there is no snippet placeholder or Tab stop.
The shortcut has its own toggle and is independent of `editor.autoClosingBrackets`
and `editor.autoSurround`. For a literal dollar, use Paste or disable the shortcut.
