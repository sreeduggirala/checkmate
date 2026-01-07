import * as vscode from 'vscode';
import { DualAgentPanel } from './panel';

const DEFAULT_WS_URL = 'ws://localhost:9876';

export function activate(context: vscode.ExtensionContext) {
  console.log('DualAgent extension activated');

  const command = vscode.commands.registerCommand('dualagent.openPanel', () => {
    const wsUrl = process.env.DUALAGENT_WS_URL || DEFAULT_WS_URL;
    DualAgentPanel.createOrShow(context.extensionUri, wsUrl);
  });

  context.subscriptions.push(command);
}

export function deactivate() {}
