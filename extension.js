const vscode = require('vscode');

function activate(context) {
  let pending = Promise.resolve();
  const freshPairs = new WeakMap();
  const documentPairs = new WeakMap();

  function queueEdit(edit) {
    return () => {
      const editor = vscode.window.activeTextEditor;
      if (!editor || editor.document.languageId !== 'latex') {
        return;
      }

      // Read the selections after the preceding shortcut has finished.
      const next = pending.then(() => {
        if (vscode.window.activeTextEditor === editor) {
          return edit(editor);
        }
      });
      pending = next.catch(() => {});
      return next;
    };
  }

  context.subscriptions.push(
    vscode.workspace.onDidChangeTextDocument(({ document, contentChanges }) => {
      const pairs = documentPairs.get(document);
      if (!pairs || contentChanges.length === 0) {
        return;
      }

      // Change offsets refer to the old document. Apply them from right to left.
      const changes = [...contentChanges].sort((a, b) => b.rangeOffset - a.rangeOffset);
      const remaining = [];
      for (const pair of pairs) {
        const open = moveDelimiter(pair.open, changes);
        const close = moveDelimiter(pair.close, changes);
        if (open !== undefined && close !== undefined) {
          remaining.push({ open, close });
        }
      }
      documentPairs.set(document, remaining);
    }),
    vscode.window.onDidChangeTextEditorSelection(({ textEditor, kind }) => {
      if (kind === vscode.TextEditorSelectionChangeKind.Keyboard ||
          kind === vscode.TextEditorSelectionChangeKind.Mouse) {
        freshPairs.delete(textEditor);
      }
    }),
    vscode.commands.registerCommand('latexDollarPair.insertOrSkip', queueEdit((editor) => insertOrSkip(editor, freshPairs, documentPairs))),
    vscode.commands.registerCommand('latexDollarPair.deletePairLeft', queueEdit((editor) => deletePairLeft(editor, documentPairs)))
  );
}

function moveDelimiter(offset, changes) {
  for (const { rangeOffset, rangeLength, text } of changes) {
    if (offset < rangeOffset) {
      continue;
    }
    if (offset < rangeOffset + rangeLength) {
      return undefined;
    }
    offset += text.length - rangeLength;
  }
  return offset;
}

function deletePairLeft(editor, documentPairs) {
  const document = editor.document;
  const strategy = vscode.workspace.getConfiguration('editor', document).get('autoClosingDelete');
  const emptyPairCenters = new Set(
    (documentPairs.get(document) ?? [])
      .filter(({ open, close }) => open + 1 === close)
      .map(({ close }) => close)
  );
  const originalSelections = editor.selections;
  const selections = originalSelections.map((selection) => {
    if (!selection.isEmpty) {
      return selection;
    }

    const { line, character } = selection.active;
    const text = document.lineAt(line).text;
    const tracked = emptyPairCenters.has(document.offsetAt(selection.active));
    if (strategy !== 'never' && (strategy === 'always' || tracked) &&
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

async function insertOrSkip(editor, freshPairs, documentPairs) {
  const document = editor.document;
  const previous = freshPairs.get(editor);
  freshPairs.delete(editor);
  const previousOffsets = previous?.version === document.version ? previous.offsets : undefined;
  const operations = editor.selections.map((selection, index) => {
    const start = document.offsetAt(selection.start);
    const nextCharacter = document.lineAt(selection.active.line).text[selection.active.character];
    const promote = selection.isEmpty && nextCharacter === '$' && previousOffsets?.has(start);
    const skip = selection.isEmpty && nextCharacter === '$' && !promote;
    const insertsEmptyPair = selection.isEmpty && !skip;
    const replacement = skip ? undefined : '$' + document.getText(selection) + '$';
    return {
      index,
      selection,
      start,
      replacement,
      insertsEmptyPair,
      promote,
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

  const pairs = documentPairs.get(document) ?? [];
  const offsets = new Set();
  for (const { index, insertsEmptyPair, promote } of operations) {
    if (insertsEmptyPair) {
      const close = destinations[index];
      pairs.push({ open: close - 1, close });
      if (!promote) {
        offsets.add(close);
      }
    }
  }
  if (pairs.length > 0) {
    documentPairs.set(document, pairs);
  }
  if (offsets.size > 0) {
    freshPairs.set(editor, { version: document.version, offsets });
  }

  editor.selections = destinations.map((offset) => {
    const position = document.positionAt(offset);
    return new vscode.Selection(position, position);
  });
}

module.exports = { activate };
