import WebSocket, { WebSocketServer } from 'ws';
import { ClientMessageSchema, OrchestratorEvent } from '@checkmate/shared';
import { Orchestrator } from './orchestrator';
import { Config } from '@checkmate/shared';

export class DaemonServer {
  private wss: WebSocketServer;
  private orchestrator: Orchestrator | null = null;

  constructor(
    private port: number,
    private config: Config,
    private workspaceRoot: string
  ) {
    this.wss = new WebSocketServer({ port });
    this.setupServer();
  }

  private setupServer() {
    this.wss.on('connection', (ws: WebSocket) => {
      console.log('Client connected');

      // Send welcome message
      this.sendEvent(ws, { type: 'status', message: 'Connected to daemon' });

      // Create orchestrator for this connection
      this.orchestrator = new Orchestrator(
        this.config,
        this.workspaceRoot,
        (event) => this.sendEvent(ws, event)
      );

      ws.on('message', async (data: Buffer) => {
        try {
          const message = JSON.parse(data.toString());
          const parseResult = ClientMessageSchema.safeParse(message);

          if (!parseResult.success) {
            this.sendEvent(ws, {
              type: 'error',
              error: `Invalid message: ${parseResult.error.message}`,
            });
            return;
          }

          const clientMessage = parseResult.data;

          switch (clientMessage.type) {
            case 'run_cycle':
              if (!this.orchestrator) {
                this.sendEvent(ws, { type: 'error', error: 'Orchestrator not initialized' });
                return;
              }
              await this.orchestrator.runCycle(clientMessage.request);
              break;

            case 'apply_patch':
              if (!this.orchestrator) {
                this.sendEvent(ws, { type: 'error', error: 'Orchestrator not initialized' });
                return;
              }
              await this.orchestrator.applyPatch(clientMessage.patch);
              break;

            case 'run_tests':
              if (!this.orchestrator) {
                this.sendEvent(ws, { type: 'error', error: 'Orchestrator not initialized' });
                return;
              }
              await this.orchestrator.runTests();
              break;
          }
        } catch (err) {
          this.sendEvent(ws, {
            type: 'error',
            error: err instanceof Error ? err.message : String(err),
          });
        }
      });

      ws.on('close', () => {
        console.log('Client disconnected');
        this.orchestrator = null;
      });

      ws.on('error', (err) => {
        console.error('WebSocket error:', err);
      });
    });

    this.wss.on('listening', () => {
      console.log(`Daemon listening on ws://localhost:${this.port}`);
    });
  }

  private sendEvent(ws: WebSocket, event: OrchestratorEvent) {
    if (ws.readyState === WebSocket.OPEN) {
      ws.send(JSON.stringify({ event }));
    }
  }

  close() {
    this.wss.close();
  }
}
