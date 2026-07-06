const CRLF = Buffer.from('\r\n');
const MAX_CONTROL_LINE = 16384;

export interface NatsSubFirewallHooks {
  forward: (chunk: Buffer) => void;
  close: (reason: string) => void;
  rewriteConnect?: (connect: Record<string, unknown>) => Record<string, unknown>;
}

export class NatsSubFirewall {
  private static readonly RESTRICTED_ROOTS = ['rpc', '_rpc', '_INBOX', 'stream'];

  private buffer: Buffer = Buffer.alloc(0);
  private payloadRemaining = 0;
  private closed = false;
  private readonly allowedPrefixes: string[];

  constructor(
    connId: string,
    private readonly hooks: NatsSubFirewallHooks,
  ) {
    this.allowedPrefixes = [`rpc.reply.${connId}`, `rpc.cb.${connId}`, `_rpc.cb.${connId}`, `_rpc.iterator.${connId}`, `_INBOX.${connId}`];
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
        const take = Math.min(this.payloadRemaining, this.buffer.length);
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
      // Bare CRLF / keep-alive — forward untouched.
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
        this.handlePub(verb, rest, lineBuffer);
        return;
      case 'UNSUB':
      case 'PING':
      case 'PONG':
        this.hooks.forward(lineBuffer);
        return;
      default:
        // Client->server protocol has no other verbs; anything else is either a
        // malformed frame or an attempt to confuse the parser.
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
      const rewritten = this.hooks.rewriteConnect(parsed);
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

  private handlePub(verb: string, rest: string, lineBuffer: Buffer): void {
    // PUB  <subject> [reply-to] <#payload-bytes>
    // HPUB <subject> [reply-to] <#header-bytes> <#total-bytes>
    const tokens = rest.split(/\s+/).filter((token) => token.length > 0);
    const byteToken = tokens[tokens.length - 1];
    const declaredBytes = Number(byteToken);

    if (!Number.isInteger(declaredBytes) || declaredBytes < 0) {
      this.fail(`malformed ${verb} frame`);
      return;
    }

    this.hooks.forward(lineBuffer);
    // Opaque region on the wire is the declared bytes plus the trailing CRLF.
    this.payloadRemaining = declaredBytes + CRLF.length;
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
