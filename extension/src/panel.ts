import * as vscode from 'vscode';
import WebSocket from 'ws';
import { ClientMessage, OrchestratorEvent } from '@checkmate/shared';

export class CheckmatePanel {
  public static currentPanel: CheckmatePanel | undefined;
  private readonly _panel: vscode.WebviewPanel;
  private _disposables: vscode.Disposable[] = [];
  private ws: WebSocket | null = null;
  private wsUrl: string;

  private constructor(panel: vscode.WebviewPanel, extensionUri: vscode.Uri, wsUrl: string) {
    this._panel = panel;
    this.wsUrl = wsUrl;

    // Set webview content
    this._panel.webview.options = {
      enableScripts: true,
    };
    this._update();

    // Handle panel disposal
    this._panel.onDidDispose(() => this.dispose(), null, this._disposables);

    // Handle messages from webview
    this._panel.webview.onDidReceiveMessage(
      (message) => {
        this._handleWebviewMessage(message);
      },
      null,
      this._disposables
    );

    // Connect to daemon
    this._connectToDaemon();
  }

  public static createOrShow(extensionUri: vscode.Uri, wsUrl: string) {
    const column = vscode.window.activeTextEditor
      ? vscode.window.activeTextEditor.viewColumn
      : undefined;

    // If panel exists, show it
    if (CheckmatePanel.currentPanel) {
      CheckmatePanel.currentPanel._panel.reveal(column);
      return;
    }

    // Create new panel
    const panel = vscode.window.createWebviewPanel(
      'checkmate',
      'Checkmate',
      column || vscode.ViewColumn.One,
      {
        enableScripts: true,
      }
    );

    CheckmatePanel.currentPanel = new CheckmatePanel(panel, extensionUri, wsUrl);
  }

  private _connectToDaemon() {
    try {
      this.ws = new WebSocket(this.wsUrl);

      this.ws.on('open', () => {
        this._addMessage('system', 'Connected to daemon');
      });

      this.ws.on('message', (data: Buffer) => {
        try {
          const { event } = JSON.parse(data.toString()) as { event: OrchestratorEvent };
          this._handleDaemonEvent(event);
        } catch (err) {
          this._addMessage('error', `Failed to parse daemon message: ${err}`);
        }
      });

      this.ws.on('error', (err) => {
        this._addMessage('error', `WebSocket error: ${err.message}`);
      });

      this.ws.on('close', () => {
        this._addMessage('system', 'Disconnected from daemon');
      });
    } catch (err) {
      this._addMessage('error', `Failed to connect to daemon: ${err}`);
    }
  }

  private _handleDaemonEvent(event: OrchestratorEvent) {
    switch (event.type) {
      case 'status':
        this._addMessage('status', event.message);
        break;
      case 'stream_chunk':
        this._appendToLastMessage(event.role, event.chunk);
        break;
      case 'patch_ready':
        this._addMessage('patch', event.patch);
        break;
      case 'tests_output':
        const testMsg = `Exit code: ${event.exitCode}\n\nStdout:\n${event.stdout}\n\nStderr:\n${event.stderr}`;
        this._addMessage('tests', testMsg);
        break;
      case 'review_ready':
        const criticalIssues = event.review.issues.filter(i => i.severity === 'critical');
        const majorIssues = event.review.issues.filter(i => i.severity === 'major');
        const minorIssues = event.review.issues.filter(i => i.severity === 'minor');
        const reviewMsg = `Verdict: ${event.review.verdict}\n\nCritical Issues: ${criticalIssues.length}\n${criticalIssues.map((i) => `- ${i.description}`).join('\n')}\n\nMajor Issues: ${majorIssues.length}\n${majorIssues.map((i) => `- ${i.description}`).join('\n')}\n\nMinor Issues: ${minorIssues.length}\n${minorIssues.map((i) => `- ${i.description}`).join('\n')}\n\n${event.review.extra_tests && event.review.extra_tests.length > 0 ? `\nSuggested Tests:\n${event.review.extra_tests.map((t) => `- ${t}`).join('\n')}` : ''}\n\n${event.review.stopping ? `Reasoning: ${event.review.stopping}` : ''}`;
        this._addMessage('review', reviewMsg);
        break;
      case 'cycle_complete':
        this._addMessage(
          event.success ? 'success' : 'warning',
          `${event.message} (${event.iterations} iterations)`
        );
        break;
      case 'error':
        this._addMessage('error', event.error);
        break;
    }
  }

  private _handleWebviewMessage(message: any) {
    switch (message.command) {
      case 'run_cycle':
        this._sendToWS({ type: 'run_cycle', request: message.request });
        this._addMessage('user', message.request);
        break;
      case 'apply_patch':
        this._sendToWS({ type: 'apply_patch', patch: message.patch });
        break;
      case 'run_tests':
        this._sendToWS({ type: 'run_tests' });
        break;
    }
  }

  private _sendToWS(message: ClientMessage) {
    if (this.ws && this.ws.readyState === WebSocket.OPEN) {
      this.ws.send(JSON.stringify(message));
    } else {
      this._addMessage('error', 'Not connected to daemon');
    }
  }

  private _addMessage(type: string, content: string) {
    this._panel.webview.postMessage({
      command: 'addMessage',
      type,
      content,
    });
  }

  private _appendToLastMessage(role: string, chunk: string) {
    this._panel.webview.postMessage({
      command: 'appendMessage',
      role,
      chunk,
    });
  }

  private _update() {
    this._panel.webview.html = this._getHtmlForWebview();
  }

  private _getHtmlForWebview(): string {
    return `<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Checkmate</title>
    <style>
        body {
            padding: 10px;
            font-family: var(--vscode-font-family);
            color: var(--vscode-foreground);
            background-color: var(--vscode-editor-background);
        }
        #controls {
            margin-bottom: 20px;
            display: flex;
            gap: 10px;
            flex-wrap: wrap;
        }
        button {
            padding: 8px 16px;
            background-color: var(--vscode-button-background);
            color: var(--vscode-button-foreground);
            border: none;
            cursor: pointer;
        }
        button:hover {
            background-color: var(--vscode-button-hoverBackground);
        }
        #requestInput {
            width: 100%;
            padding: 8px;
            margin-bottom: 10px;
            background-color: var(--vscode-input-background);
            color: var(--vscode-input-foreground);
            border: 1px solid var(--vscode-input-border);
        }
        #messages {
            border: 1px solid var(--vscode-panel-border);
            padding: 10px;
            max-height: 600px;
            overflow-y: auto;
        }
        .message {
            margin-bottom: 10px;
            padding: 8px;
            border-left: 3px solid;
        }
        .message.user { border-color: #0078d4; background: rgba(0, 120, 212, 0.1); }
        .message.status { border-color: #888; background: rgba(136, 136, 136, 0.1); }
        .message.builder { border-color: #16825d; background: rgba(22, 130, 93, 0.1); }
        .message.reviewer { border-color: #8e44ad; background: rgba(142, 68, 173, 0.1); }
        .message.patch { border-color: #f39c12; background: rgba(243, 156, 18, 0.1); }
        .message.tests { border-color: #3498db; background: rgba(52, 152, 219, 0.1); }
        .message.review { border-color: #9b59b6; background: rgba(155, 89, 182, 0.1); }
        .message.success { border-color: #27ae60; background: rgba(39, 174, 96, 0.1); }
        .message.warning { border-color: #f39c12; background: rgba(243, 156, 18, 0.1); }
        .message.error { border-color: #e74c3c; background: rgba(231, 76, 60, 0.1); }
        .message.system { border-color: #95a5a6; background: rgba(149, 165, 166, 0.1); }
        .message-type {
            font-weight: bold;
            margin-bottom: 4px;
            text-transform: uppercase;
            font-size: 0.85em;
        }
        .message-content {
            white-space: pre-wrap;
            font-family: var(--vscode-editor-font-family);
            font-size: 0.95em;
        }
    </style>
</head>
<body>
    <div id="controls">
        <input type="text" id="requestInput" placeholder="Enter your request (e.g., 'Add a function to validate email addresses')">
        <button id="runCycleBtn">Run Cycle</button>
        <button id="runTestsBtn">Run Tests</button>
    </div>
    <div id="messages"></div>

    <script>
        const vscode = acquireVsCodeApi();
        const messagesDiv = document.getElementById('messages');
        const requestInput = document.getElementById('requestInput');

        let lastMessageElement = null;
        let lastMessageRole = null;

        document.getElementById('runCycleBtn').addEventListener('click', () => {
            const request = requestInput.value.trim();
            if (request) {
                vscode.postMessage({ command: 'run_cycle', request });
                requestInput.value = '';
            }
        });

        document.getElementById('runTestsBtn').addEventListener('click', () => {
            vscode.postMessage({ command: 'run_tests' });
        });

        requestInput.addEventListener('keypress', (e) => {
            if (e.key === 'Enter') {
                document.getElementById('runCycleBtn').click();
            }
        });

        window.addEventListener('message', (event) => {
            const message = event.data;

            if (message.command === 'addMessage') {
                lastMessageElement = null;
                lastMessageRole = null;

                const msgDiv = document.createElement('div');
                msgDiv.className = 'message ' + message.type;

                const typeDiv = document.createElement('div');
                typeDiv.className = 'message-type';
                typeDiv.textContent = message.type;

                const contentDiv = document.createElement('div');
                contentDiv.className = 'message-content';
                contentDiv.textContent = message.content;

                msgDiv.appendChild(typeDiv);
                msgDiv.appendChild(contentDiv);
                messagesDiv.appendChild(msgDiv);
                messagesDiv.scrollTop = messagesDiv.scrollHeight;
            } else if (message.command === 'appendMessage') {
                if (lastMessageRole !== message.role) {
                    lastMessageElement = null;
                    lastMessageRole = message.role;

                    const msgDiv = document.createElement('div');
                    msgDiv.className = 'message ' + message.role;

                    const typeDiv = document.createElement('div');
                    typeDiv.className = 'message-type';
                    typeDiv.textContent = message.role;

                    const contentDiv = document.createElement('div');
                    contentDiv.className = 'message-content';
                    contentDiv.textContent = '';

                    msgDiv.appendChild(typeDiv);
                    msgDiv.appendChild(contentDiv);
                    messagesDiv.appendChild(msgDiv);

                    lastMessageElement = contentDiv;
                }

                if (lastMessageElement) {
                    lastMessageElement.textContent += message.chunk;
                    messagesDiv.scrollTop = messagesDiv.scrollHeight;
                }
            }
        });
    </script>
</body>
</html>`;
  }

  public dispose() {
    CheckmatePanel.currentPanel = undefined;

    if (this.ws) {
      this.ws.close();
    }

    this._panel.dispose();

    while (this._disposables.length) {
      const disposable = this._disposables.pop();
      if (disposable) {
        disposable.dispose();
      }
    }
  }
}
