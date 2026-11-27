import { CALLER_ROLE_HEADER } from '@camera.ui/rpc';

const CRLF = Buffer.from('\r\n');
const MAX_CONTROL_LINE = 16384;
const VIEWER_LINE = Buffer.from(`${CALLER_ROLE_HEADER}: viewer\r\n`);
const VIEWER_HEADERS = Buffer.concat([Buffer.from('NATS/1.0\r\n'), VIEWER_LINE, CRLF]);
const MIN_HEADERS = Buffer.byteLength('NATS/1.0\r\n\r\n');

export interface NatsSubFirewallHooks {
  forward: (chunk: Buffer) => void;
  close: (reason: string) => void;
  rewriteConnect?: (connect: Record<string, unknown>) => Record<string, unknown>;
}

export class NatsSubFirewall {
  private static readonly RESTRICTED_ROOTS = ['rpc', '_rpc', '_INBOX', 'stream', 'notifications'];

  private buffer: Buffer = Buffer.alloc(0);
  private payloadRemaining = 0;
  private viewerLineAt = 0;
  private closed = false;
  private readonly allowedPrefixes: string[];

  constructor(
    connId: string,
    private readonly hooks: NatsSubFirewallHooks,
    userId?: string,
  ) {
    this.allowedPrefixes = [`rpc.reply.${connId}`, `rpc.cb.${connId}`, `_rpc.cb.${connId}`, `_rpc.iterator.${connId}`, `_INBOX.${connId}`];
    if (userId) {
      this.allowedPrefixes.push(`notifications.user.${userId}`);
    }
  }

  public push(chunk: Buffer): void {
    if (this.closed) {
      return;
    }

    this.buffer = this.buffer.length === 0 ? chunk : Buffer.concat([this.buffer, chunk]);
    this.drain();
  }

  private fail(reason: string): void {
    if (this.closed) {
      return;
    }

    this.closed = true;
    this.hooks.close(reason);
  }

  private drain(): void {
    while (!this.closed && this.buffer.length > 0) {
      if (this.payloadRemaining > 0) {
        if (this.payloadRemaining === this.viewerLineAt) {
          this.hooks.forward(VIEWER_LINE);
          this.viewerLineAt = 0;
        }
        const take = Math.min(this.payloadRemaining - this.viewerLineAt, this.buffer.length);
        this.hooks.forward(this.buffer.subarray(0, take));
        this.buffer = this.buffer.subarray(take);
        this.payloadRemaining -= take;
        continue;
      }

      const newlineIndex = this.buffer.indexOf(0x0a);
      if (newlineIndex === -1) {
        if (this.buffer.length > MAX_CONTROL_LINE) {
          this.fail('control line exceeds limit');
        }
        return;
      }

      const lineBuffer = this.buffer.subarray(0, newlineIndex + 1);
      this.buffer = this.buffer.subarray(newlineIndex + 1);
      this.handleCommand(lineBuffer);
    }
  }

  private handleCommand(lineBuffer: Buffer): void {
    const line = lineBuffer.toString('latin1');
    const trimmed = line.trim();

    if (trimmed.length === 0) {
      this.hooks.forward(lineBuffer);
      return;
    }

    const spaceIndex = trimmed.search(/\s/);
    const verb = (spaceIndex === -1 ? trimmed : trimmed.slice(0, spaceIndex)).toUpperCase();
    const rest = spaceIndex === -1 ? '' : trimmed.slice(spaceIndex + 1).trim();

    switch (verb) {
      case 'CONNECT':
        this.handleConnect(rest, lineBuffer);
        return;
      case 'SUB':
        this.handleSub(rest, lineBuffer);
        return;
      case 'PUB':
      case 'HPUB':
        this.handlePub(verb, rest);
        return;
      case 'UNSUB':
      case 'PING':
      case 'PONG':
        this.hooks.forward(lineBuffer);
        return;
      default:
        // the client protocol has no other verbs
        this.fail(`unexpected NATS verb: ${verb}`);
    }
  }

  private handleConnect(rest: string, lineBuffer: Buffer): void {
    if (!this.hooks.rewriteConnect) {
      this.hooks.forward(lineBuffer);
      return;
    }

    try {
      const parsed = JSON.parse(rest) as Record<string, unknown>;
      // the role header goes on every publish
      const rewritten = { ...this.hooks.rewriteConnect(parsed), headers: true };
      this.hooks.forward(Buffer.from(`CONNECT ${JSON.stringify(rewritten)}\r\n`));
    } catch {
      this.fail('unparseable CONNECT frame');
    }
  }

  private handleSub(rest: string, lineBuffer: Buffer): void {
    // SUB <subject> [queue-group] <sid>
    const subject = rest.split(/\s+/)[0] ?? '';
    if (!this.isSubjectAllowed(subject)) {
      this.fail(`subscribe not permitted: ${subject}`);
      return;
    }

    this.hooks.forward(lineBuffer);
  }

  private handlePub(verb: string, rest: string): void {
    // PUB <subject> [reply] <size>, HPUB <subject> [reply] <header size> <total size>
    const tokens = rest.split(/\s+/).filter((token) => token.length > 0);
    const sizes = tokens.splice(verb === 'HPUB' ? -2 : -1).map(Number);
    if (tokens.length < 1 || tokens.length > 2 || sizes.some((size) => !Number.isInteger(size) || size < 0)) {
      this.fail(`malformed ${verb} frame`);
      return;
    }

    const target = tokens.join(' ');
    if (verb === 'PUB') {
      const [size] = sizes;
      this.hooks.forward(Buffer.from(`HPUB ${target} ${VIEWER_HEADERS.length} ${VIEWER_HEADERS.length + size}\r\n`));
      this.hooks.forward(VIEWER_HEADERS);
      this.payloadRemaining = size + CRLF.length;
      return;
    }

    const [headerSize, totalSize] = sizes;
    if (headerSize < MIN_HEADERS || totalSize < headerSize) {
      this.fail('malformed HPUB frame');
      return;
    }

    this.hooks.forward(Buffer.from(`HPUB ${target} ${headerSize + VIEWER_LINE.length} ${totalSize + VIEWER_LINE.length}\r\n`));
    this.payloadRemaining = totalSize + CRLF.length;
    // before the blank line that ends the client's headers
    this.viewerLineAt = this.payloadRemaining - (headerSize - CRLF.length);
  }

  private isSubjectAllowed(subject: string): boolean {
    const firstToken = subject.split('.', 1)[0];
    if (firstToken === '' || firstToken === '*' || firstToken === '>' || firstToken.startsWith('$')) {
      return false;
    }

    if (!NatsSubFirewall.RESTRICTED_ROOTS.includes(firstToken)) {
      return true;
    }

    return this.allowedPrefixes.some((prefix) => subject === prefix || subject.startsWith(`${prefix}.`));
  }
}
