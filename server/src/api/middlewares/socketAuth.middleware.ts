// https://github.com/Thream/socketio-jwt
import jwt from 'jsonwebtoken';

import type { Algorithm } from 'jsonwebtoken';
import type { Socket } from 'socket.io';

export class UnauthorizedError extends Error {
  inner: { message: string };
  data: { message: string; code: string; type: 'UnauthorizedError' };

  constructor(code: string, error: { message: string }) {
    super(error.message);

    this.name = 'UnauthorizedError';
    this.inner = error;
    this.data = {
      message: this.message,
      code,
      type: 'UnauthorizedError',
    };

    Object.setPrototypeOf(this, UnauthorizedError.prototype);
  }
}

export function isUnauthorizedError(error: unknown): error is UnauthorizedError {
  return (
    typeof error === 'object' &&
    error != null &&
    'data' in error &&
    typeof error.data === 'object' &&
    error.data != null &&
    'type' in error.data &&
    error.data.type === 'UnauthorizedError'
  );
}

declare module 'socket.io' {
  interface Socket extends ExtendedSocket {}
}

interface ExtendedSocket {
  encodedToken?: string;
  decodedToken?: any;
  user?: any;
}

type SocketIOMiddleware = (socket: Socket, next: (error?: UnauthorizedError) => void) => void;

interface CompleteDecodedToken {
  header: {
    alg: Algorithm;
    [key: string]: any;
  };
  payload: any;
}

type SecretCallback = (decodedToken: CompleteDecodedToken) => Promise<string> | string;

export interface AuthorizeOptions {
  secret: string | SecretCallback;
  algorithms?: Algorithm[];
  onAuthentication?: (decodedToken: any) => Promise<any>;
  resolveOpaqueToken?: (token: string) => any | undefined;
}

export function authorize(options: AuthorizeOptions): SocketIOMiddleware {
  const { secret, algorithms = ['HS256'], onAuthentication, resolveOpaqueToken } = options;

  return async (socket, next) => {
    let encodedToken: string | null = null;
    let token: string | null = null;

    if (socket.handshake.auth) {
      token = socket.handshake.auth.token;
    } else {
      token = socket.handshake.headers.authorization ?? null;
    }

    if (token != null) {
      const tokenSplitted = token.split(' ');

      if (tokenSplitted.length !== 2 || tokenSplitted[0] !== 'Bearer') {
        return next(
          new UnauthorizedError('credentials_bad_format', {
            message: 'Format is Authorization: Bearer [token]',
          }),
        );
      }

      encodedToken = tokenSplitted[1];
    }

    if (encodedToken == null) {
      return next(
        new UnauthorizedError('credentials_required', {
          message: 'no token provided',
        }),
      );
    }

    socket.encodedToken = encodedToken;

    if (resolveOpaqueToken) {
      const opaquePayload = resolveOpaqueToken(encodedToken);
      if (opaquePayload) {
        socket.decodedToken = opaquePayload;

        if (onAuthentication != null) {
          try {
            socket.user = await onAuthentication(opaquePayload);
          } catch (error: any) {
            return next(error);
          }
        }

        return next();
      }
    }

    let keySecret: string | null = null;
    let decodedToken: any = null;

    if (typeof secret === 'string') {
      keySecret = secret;
    } else {
      const completeDecodedToken = jwt.decode(encodedToken, { complete: true });

      keySecret = await secret(completeDecodedToken as CompleteDecodedToken);
    }

    try {
      decodedToken = jwt.verify(encodedToken, keySecret, { algorithms });
    } catch {
      return next(
        new UnauthorizedError('invalid_token', {
          message: 'Unauthorized: Token is missing or invalid Bearer',
        }),
      );
    }

    socket.decodedToken = decodedToken;

    if (onAuthentication != null) {
      try {
        socket.user = await onAuthentication(decodedToken);
      } catch (error: any) {
        return next(error);
      }
    }

    return next();
  };
}
