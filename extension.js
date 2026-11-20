const vscode = require('vscode');

function activate(context) {
  let pending = Promise.resolve();
  const freshPairs = new WeakMap();

  function queueEdit(edit) {
    return () => {
      const editor = vscode.window.activeTextEditor;
      if (!editor || editor.document.languageId !== 'latex') {
        return;
      }

      // Read the selections after the preceding shortcut has finished.
      const next = pending.then(() => {
        if (vscode.window.activeTextEditor === editor) {
          return edit(editor, freshPairs);
        }
      });
      pending = next.catch(() => {});
      return next;
    };
  }

  context.subscriptions.push(
    vscode.window.onDidChangeTextEditorSelection(({ textEditor, kind }) => {
      if (kind === vscode.TextEditorSelectionChangeKind.Keyboard ||
          kind === vscode.TextEditorSelectionChangeKind.Mouse) {
        freshPairs.delete(textEditor);
      }
    }),
    vscode.commands.registerCommand('latexDollarPair.insertOrSkip', queueEdit(insertOrSkip)),
    vscode.commands.registerCommand('latexDollarPair.deletePairLeft', queueEdit(deletePairLeft))
  );
}

function deletePairLeft(editor, freshPairs) {
  const document = editor.document;
  const strategy = vscode.workspace.getConfiguration('editor', document).get('autoClosingDelete');
  const fresh = freshPairs.get(editor);
  const originalSelections = editor.selections;
  const selections = originalSelections.map((selection) => {
    if (!selection.isEmpty) {
      return selection;
    }

    const { line, character } = selection.active;
    const text = document.lineAt(line).text;
    const autoInserted = fresh?.version === document.version &&
      fresh.offsets.has(document.offsetAt(selection.active));
    if (strategy !== 'never' && (strategy === 'always' || autoInserted) &&
        text[character - 1] === '$' && text[character] === '$') {
      return new vscode.Selection(line, character - 1, line, character + 1);
    }
    return selection;
  });

  if (selections.some((selection, index) => selection !== originalSelections[index])) {
    editor.selections = selections;
  }
  return vscode.commands.executeCommand('deleteLeft');
}

async function insertOrSkip(editor, freshPairs) {
  const document = editor.document;
  const previous = freshPairs.get(editor);
  freshPairs.delete(editor);
  const eligibleOffsets = previous?.version === document.version ? previous.offsets : new Set();
  const operations = editor.selections.map((selection, index) => {
    const start = document.offsetAt(selection.start);
    const nextCharacter = document.lineAt(selection.active.line).text[selection.active.character];
    const promote = selection.isEmpty && nextCharacter === '$' && eligibleOffsets.has(start);
    const skip = selection.isEmpty && nextCharacter === '$' && !promote;
    const createsInlinePair = selection.isEmpty && nextCharacter !== '$';
    const replacement = skip ? undefined : '$' + document.getText(selection) + '$';
    return {
      index,
      selection,
      start,
      replacement,
      createsInlinePair,
      advance: skip || selection.isEmpty ? 1 : replacement.length
    };
  });

  operations.sort((a, b) => a.start - b.start);
  const destinations = [];
  let addedCharacters = 0;
  for (const operation of operations) {
    destinations[operation.index] = operation.start + addedCharacters + operation.advance;
    if (operation.replacement !== undefined) {
      addedCharacters += 2;
    }
  }

  const edits = operations.filter((operation) => operation.replacement !== undefined);
  if (edits.length > 0) {
    const applied = await editor.edit((builder) => {
      for (const { selection, replacement } of edits) {
        builder.replace(selection, replacement);
      }
    });
    if (!applied) {
      return;
    }
  }

  const insertedOffsets = operations
    .filter((operation) => operation.createsInlinePair)
    .map((operation) => destinations[operation.index]);
  if (insertedOffsets.length > 0) {
    freshPairs.set(editor, { version: document.version, offsets: new Set(insertedOffsets) });
  }

  editor.selections = destinations.map((offset) => {
    const position = document.positionAt(offset);
    return new vscode.Selection(position, position);
  });
}

module.exports = { activate };
