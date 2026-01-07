import * as vscode from 'vscode';
import { CheckmatePanel } from './panel';

const DEFAULT_WS_URL = 'ws://localhost:9876';

export function activate(context: vscode.ExtensionContext) {
  console.log('Checkmate extension activated');

  const command = vscode.commands.registerCommand('checkmate.openPanel', () => {
    const wsUrl = process.env.CHECKMATE_WS_URL || DEFAULT_WS_URL;
    CheckmatePanel.createOrShow(context.extensionUri, wsUrl);
  });

  context.subscriptions.push(command);
}

export function deactivate() {}
